import { convexTest } from "convex-test";
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";
import { insertTask, modules, seedBoard, seedUser, type TestConvex } from "./test.helpers";

// The schema as it was before this migration: today's tables plus the per-user
// channel preferences that have since been dropped.
const legacySchema = defineSchema({
  ...schema.tables,
  users: defineTable({
    ...schema.tables.users.validator.fields,
    smsEnabled: v.optional(v.boolean()),
    whatsappEnabled: v.optional(v.boolean()),
  })
    .index("by_authUserId", ["authUserId"])
    .index("by_email", ["email"])
    .index("by_role_and_isActive", ["role", "isActive"]),
});

const setup = () => convexTest(legacySchema, modules);
// The seeding helpers are typed for the current schema; the legacy one is a superset.
const current = (t: ReturnType<typeof setup>) => t as unknown as TestConvex;

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(console, "log").mockImplementation(() => {});
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const legacyUser = (n: number, prefs: { smsEnabled?: boolean; whatsappEnabled?: boolean }) => ({
  authUserId: `legacy_${n}`,
  email: `legacy${n}@example.com`,
  name: `Legacy ${n}`,
  role: "member" as const,
  isActive: true,
  ...prefs,
});

async function migrate(t: ReturnType<typeof setup>) {
  const result = await t.mutation(internal.migrations.customerSmsV1, {});
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  return result;
}

test("clears SMS preferences and dismisses pending team deliveries; customer ones are untouched; re-running changes nothing", async () => {
  const t = setup();
  const admin = await seedUser(current(t), { role: "admin" });
  const { boardId, statuses } = await seedBoard(admin, current(t));
  const taskId = await insertTask(current(t), {
    boardId,
    statusId: statuses["Pendiente"]!,
    creatorId: admin.id,
  });
  const ids = await t.run(async (ctx) => {
    const on = await ctx.db.insert("users", legacyUser(1, { smsEnabled: true, whatsappEnabled: true }));
    const off = await ctx.db.insert("users", legacyUser(2, { smsEnabled: false }));
    const notificationId = await ctx.db.insert("notifications", {
      userId: on,
      kind: "assigned",
      taskId,
      text: "x",
    });
    const team = { notificationId, userId: on, channel: "sms" as const, message: "m", to: "+34600000002" };
    const customer = {
      recipient: "customer" as const,
      taskId,
      channel: "sms" as const,
      message: "c",
      to: "+34600111222",
    };
    return {
      on,
      off,
      teamPending: await ctx.db.insert("deliveries", { ...team, state: "pending" }),
      teamFailed: await ctx.db.insert("deliveries", { ...team, state: "failed" }),
      teamSent: await ctx.db.insert("deliveries", { ...team, state: "sent" }),
      customerPending: await ctx.db.insert("deliveries", { ...customer, state: "pending" }),
      customerSent: await ctx.db.insert("deliveries", { ...customer, state: "sent" }),
    };
  });
  const snapshot = () =>
    t.run(async (ctx) => ({
      users: await ctx.db.query("users").collect(),
      deliveries: await ctx.db.query("deliveries").collect(),
    }));

  await migrate(t);
  const after = await snapshot();
  expect(after.users).toHaveLength(3);
  for (const user of after.users) {
    expect(user).not.toHaveProperty("smsEnabled");
    expect(user).not.toHaveProperty("whatsappEnabled");
  }
  expect(after.users.find((u) => u._id === ids.on)).toMatchObject({ name: "Legacy 1", isActive: true });
  const state = (id: typeof ids.teamPending) => after.deliveries.find((d) => d._id === id)?.state;
  expect(state(ids.teamPending)).toBe("dismissed");
  expect(state(ids.teamFailed)).toBe("failed");
  expect(state(ids.teamSent)).toBe("sent");
  expect(state(ids.customerPending)).toBe("pending");
  expect(state(ids.customerSent)).toBe("sent");

  await migrate(t);
  expect(await snapshot()).toEqual(after);
});

test("processes more than one batch", async () => {
  const t = setup();
  await t.run(async (ctx) => {
    for (let n = 0; n < 450; n++) {
      await ctx.db.insert("users", legacyUser(n, { smsEnabled: n % 2 === 0 }));
    }
  });
  expect(await migrate(t)).toBe("customerSmsV1: continuing with users");
  const users = await t.run((ctx) => ctx.db.query("users").collect());
  expect(users).toHaveLength(450);
  expect(users.every((u) => !("smsEnabled" in u))).toBe(true);
  expect(console.log).toHaveBeenCalledWith("customerSmsV1: done");
});
