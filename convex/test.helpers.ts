/// <reference types="vite/client" />
import betterAuthTest from "@convex-dev/better-auth/test";
import { convexTest } from "convex-test";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

export const modules = import.meta.glob("./**/*.ts");

export function setup() {
  return convexTest(schema, modules);
}

/** Same as setup(), with the Better Auth component registered. */
export function setupWithAuth() {
  const t = setup();
  betterAuthTest.register(t, "betterAuth");
  return t;
}

export type TestConvex = ReturnType<typeof setup>;

let counter = 0;

/** Inserts a `users` profile and returns an identity-scoped client for it. */
export async function seedUser(
  t: TestConvex,
  overrides: Partial<{
    name: string;
    email: string;
    role: "admin" | "member";
    isActive: boolean;
    phone: string;
  }> = {},
) {
  counter += 1;
  const authUserId = `auth_${counter}`;
  const id: Id<"users"> = await t.run(async (ctx) =>
    ctx.db.insert("users", {
      authUserId,
      name: overrides.name ?? `Usuario ${counter}`,
      email: overrides.email ?? `user${counter}@example.com`,
      role: overrides.role ?? "member",
      isActive: overrides.isActive ?? true,
      phone: overrides.phone,
    }),
  );
  return { id, authUserId, as: t.withIdentity({ subject: authUserId }) };
}

/** Creates a board as `admin` and adds `members`; returns its id and statuses by name. */
export async function seedBoard(
  admin: Awaited<ReturnType<typeof seedUser>>,
  t: TestConvex,
  members: Id<"users">[] = [],
) {
  const { api } = await import("./_generated/api");
  const boardId = await admin.as.mutation(api.boards.create, { name: "Entregas Madrid" });
  for (const userId of members) {
    await admin.as.mutation(api.boards.addMember, { boardId, userId });
  }
  const statuses = await t.run((ctx) =>
    ctx.db
      .query("boardStatuses")
      .withIndex("by_boardId_and_order", (q) => q.eq("boardId", boardId))
      .collect(),
  );
  const byName = Object.fromEntries(statuses.map((s) => [s.name, s._id]));
  return { boardId, statuses: byName as Record<string, Id<"boardStatuses">> };
}

/** Inserts a task directly (bypassing mutations) for tests of other modules. */
export async function insertTask(
  t: TestConvex,
  fields: {
    boardId: Id<"boards">;
    statusId: Id<"boardStatuses">;
    creatorId: Id<"users">;
    title?: string;
    assigneeId?: Id<"users">;
    deadlineAt?: number;
    isOpen?: boolean;
  },
) {
  return await t.run((ctx) =>
    ctx.db.insert("tasks", {
      title: fields.title ?? "Tarea",
      priority: "media",
      order: 1024,
      deadlineHasTime: true,
      isOpen: fields.isOpen ?? true,
      ...fields,
    }),
  );
}

type SeededUser = Awaited<ReturnType<typeof seedUser>>;

/**
 * Marks `statusId` as "Avisar al cliente" (customer-only rule, default
 * template) and, as `member`, creates a task with a customer and moves it into
 * that status confirming the notice: one pending customer SMS is created.
 */
export async function sendCustomerNotice(
  admin: SeededUser,
  member: SeededUser,
  args: {
    boardId: Id<"boards">;
    statusId: Id<"boardStatuses">;
    title?: string;
    customerName?: string;
    customerPhone?: string;
  },
) {
  const { api } = await import("./_generated/api");
  await admin.as.mutation(api.boards.setStatusRule, {
    statusId: args.statusId,
    notifyAssignee: false,
    notifyCreator: false,
    userIds: [],
    notifyCustomer: true,
  });
  const taskId = await member.as.mutation(api.tasks.create, {
    boardId: args.boardId,
    title: args.title ?? "Entregar sofá cliente García",
    customerName: args.customerName ?? "María García",
    customerPhone: args.customerPhone ?? "+34600111222",
  });
  await member.as.mutation(api.tasks.move, {
    taskId,
    statusId: args.statusId,
    customerNotice: { send: true },
  });
  return taskId;
}
