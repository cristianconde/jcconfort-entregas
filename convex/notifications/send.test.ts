import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { internal } from "../_generated/api";
import { seedBoard, seedUser, sendCustomerNotice, setup, type TestConvex } from "../test.helpers";
import { logProvider } from "./providers/log";
import { twilioSignature } from "./providers/twilio";
import type { SendResult } from "./providers/types";

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

/** Creates one pending customer SMS (a confirmed notice by Ana) and returns helpers. */
async function world(results: SendResult[]) {
  const send = vi.spyOn(logProvider, "send");
  for (const result of results) send.mockResolvedValueOnce(result);
  const t = setup();
  const admin = await seedUser(t, { role: "admin" });
  const ana = await seedUser(t, { name: "Ana" });
  const { boardId, statuses } = await seedBoard(admin, t, [ana.id]);
  await sendCustomerNotice(admin, ana, {
    boardId,
    statusId: statuses["En progreso"]!,
    customerPhone: "+34600000002",
  });
  const delivery = async () => (await t.run((ctx) => ctx.db.query("deliveries").collect()))[0]!;
  const runAll = () => t.finishAllScheduledFunctions(vi.runAllTimers);
  return { t, send, delivery, runAll };
}

test("success → sent with the provider's message id", async () => {
  const { send, delivery, runAll } = await world([{ ok: true, providerMessageId: "SM1" }]);
  await runAll();
  expect(send).toHaveBeenCalledTimes(1);
  expect(send.mock.calls[0]![0]).toMatchObject({
    to: "+34600000002",
    statusCallbackUrl: "https://test.convex.site/sms/log/status",
  });
  expect(await delivery()).toMatchObject({
    state: "sent",
    provider: "log",
    providerMessageId: "SM1",
    attempts: 1,
  });
  expect((await delivery()).claimedAt).toBeUndefined();
});

test("the log provider marks it delivered straight away", async () => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  const { delivery, runAll } = await world([]);
  await runAll();
  expect(await delivery()).toMatchObject({ state: "delivered", provider: "log" });
});

test("permanent error → failed, not retried", async () => {
  const { send, delivery, runAll } = await world([
    { ok: false, retryable: false, error: "Número no válido (código 21211)" },
  ]);
  await runAll();
  expect(send).toHaveBeenCalledTimes(1);
  expect(await delivery()).toMatchObject({
    state: "failed",
    error: "Número no válido (código 21211)",
    attempts: 1,
  });
});

test("retryable twice then success → sent after 3 attempts, with backoff", async () => {
  const { t, send, delivery } = await world([
    { ok: false, retryable: true, error: "Too many requests" },
    { ok: false, retryable: true, error: "Service unavailable" },
    { ok: true, providerMessageId: "SM3" },
  ]);
  const after = async (ms: number) => {
    vi.advanceTimersByTime(ms);
    await t.finishInProgressScheduledFunctions();
  };
  await after(0);
  expect(send).toHaveBeenCalledTimes(1);
  expect(await delivery()).toMatchObject({ state: "pending", attempts: 1, error: "Too many requests" });
  // Nothing happens before the 30 s backoff…
  await after(29_000);
  expect(send).toHaveBeenCalledTimes(1);
  await after(1_000);
  expect(send).toHaveBeenCalledTimes(2);
  // …and 2 min for the third attempt.
  await after(119_000);
  expect(send).toHaveBeenCalledTimes(2);
  await after(1_000);
  expect(send).toHaveBeenCalledTimes(3);
  const final = await delivery();
  expect(final).toMatchObject({ state: "sent", providerMessageId: "SM3", attempts: 3 });
  expect(final.error).toBeUndefined();
});

test("retries are capped at 3 attempts", async () => {
  const busy = { ok: false as const, retryable: true, error: "Busy" };
  const { send, delivery, runAll } = await world([busy, busy, busy, busy]);
  await runAll();
  expect(send).toHaveBeenCalledTimes(3);
  expect(await delivery()).toMatchObject({ state: "failed", error: "Busy", attempts: 3 });
});

test("a duplicate deliver for the same delivery sends only once", async () => {
  const { t, send, delivery, runAll } = await world([
    { ok: true, providerMessageId: "SM1" },
    { ok: true, providerMessageId: "SM2" },
  ]);
  const { _id } = await delivery();
  await Promise.all([
    t.action(internal.notifications.send.deliver, { deliveryId: _id }),
    t.action(internal.notifications.send.deliver, { deliveryId: _id }),
  ]);
  await runAll();
  expect(send).toHaveBeenCalledTimes(1);
  expect(await delivery()).toMatchObject({ state: "sent", providerMessageId: "SM1" });
});

describe("status callback", () => {
  const url = "https://test.convex.site/sms/twilio/status";

  async function sentDelivery() {
    const w = await world([{ ok: true, providerMessageId: "SM1" }]);
    await w.runAll();
    return w;
  }

  async function post(t: TestConvex, fields: Record<string, string>, signature?: string) {
    const params = new URLSearchParams(fields);
    return await t.fetch("/sms/twilio/status", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "X-Twilio-Signature": signature ?? (await twilioSignature("test-auth-token", url, params)),
      },
      body: params.toString(),
    });
  }

  test("signed delivered → delivered; a late sent is ignored", async () => {
    const { t, delivery } = await sentDelivery();
    expect((await post(t, { MessageSid: "SM1", MessageStatus: "delivered" })).status).toBe(200);
    expect(await delivery()).toMatchObject({ state: "delivered" });
    await post(t, { MessageSid: "SM1", MessageStatus: "sent" });
    expect(await delivery()).toMatchObject({ state: "delivered" });
  });

  test("undelivered with an error code → failed with the error", async () => {
    const { t, delivery } = await sentDelivery();
    await post(t, { MessageSid: "SM1", MessageStatus: "undelivered", ErrorCode: "30003" });
    expect(await delivery()).toMatchObject({ state: "failed", error: "No entregado (código 30003)" });
  });

  test("bad signature → 403 and no change", async () => {
    const { t, delivery } = await sentDelivery();
    const res = await post(t, { MessageSid: "SM1", MessageStatus: "delivered" }, "Zm9yZ2Vk");
    expect(res.status).toBe(403);
    expect(await delivery()).toMatchObject({ state: "sent" });
  });
});
