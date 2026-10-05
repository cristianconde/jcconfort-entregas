import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { api } from "../_generated/api";
import { seedBoard, seedUser, sendCustomerNotice, setup } from "../test.helpers";
import { logProvider } from "./providers/log";

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

async function world() {
  const send = vi.spyOn(logProvider, "send");
  const t = setup();
  const admin = await seedUser(t, { role: "admin", name: "Admin" });
  const ana = await seedUser(t, { name: "Ana" });
  const luis = await seedUser(t, { name: "Luis", phone: "+34600000002" });
  const { boardId, statuses } = await seedBoard(admin, t, [ana.id, luis.id]);
  const runAll = () => t.finishAllScheduledFunctions(vi.runAllTimers);
  const notice = (title: string, customerName = "María García") =>
    sendCustomerNotice(admin, ana, { boardId, statusId: statuses["En progreso"]!, title, customerName });
  return { t, send, admin, ana, luis, boardId, statuses, runAll, notice };
}

test("the log lists customer messages newest first, and legacy team rows by user name; members are refused", async () => {
  const { t, send, admin, ana, luis, boardId, runAll, notice } = await world();
  send.mockResolvedValueOnce({ ok: false, retryable: false, error: "Número no válido (código 21211)" });
  send.mockResolvedValueOnce({ ok: true, providerMessageId: "SM2" });
  const taskA = await notice("A");
  await runAll();
  const taskB = await notice("B", "Pedro Ruiz");
  await runAll();
  // Legacy rows: an SMS to a team member and a WhatsApp send, both through a notification.
  const legacyTask = await ana.as.mutation(api.tasks.create, { boardId, title: "Antigua", assigneeId: luis.id });
  await t.run(async (ctx) => {
    const notification = (await ctx.db.query("notifications").first())!;
    const legacy = { notificationId: notification._id, userId: luis.id, state: "sent" as const };
    await ctx.db.insert("deliveries", { ...legacy, channel: "sms", to: "+34600000002", message: "old sms" });
    await ctx.db.insert("deliveries", { ...legacy, channel: "whatsapp_link", message: "old wa" });
  });

  const log = await admin.as.query(api.notifications.deliveries.log, {});
  expect(
    log.map((row) => [row.channelLabel, row.recipient, row.recipientName, row.state, row.taskId]),
  ).toEqual([
    ["WhatsApp (antiguo)", "user", "Luis", "sent", legacyTask],
    ["SMS", "user", "Luis", "sent", legacyTask],
    ["SMS", "customer", "Pedro Ruiz", "sent", taskB],
    ["SMS", "customer", "María García", "failed", taskA],
  ]);
  expect(log[3]).toMatchObject({
    phone: "+34600111222",
    provider: "log",
    taskTitle: "A",
    message: "Hola Maria Garcia, su pedido esta en camino. Gracias por su compra. JC Confort Entregas",
    error: "Número no válido (código 21211)",
  });
  expect(log[1]).toMatchObject({ phone: "+34600000002", taskTitle: "Antigua" });
  await expect(ana.as.query(api.notifications.deliveries.log, {})).rejects.toThrow("administrador");
});

test("retry after correcting the customer phone sends the same message to the new number", async () => {
  const { send, admin, ana, runAll, notice } = await world();
  send.mockResolvedValueOnce({ ok: false, retryable: false, error: "Número no válido" });
  send.mockResolvedValueOnce({ ok: true, providerMessageId: "SM2" });
  const taskId = await notice("A");
  await runAll();
  const [failed] = await admin.as.query(api.notifications.deliveries.log, {});
  await expect(
    ana.as.mutation(api.notifications.deliveries.retry, { deliveryId: failed!._id }),
  ).rejects.toThrow("administrador");

  await ana.as.mutation(api.tasks.update, { taskId, customerPhone: "+34600000009" });
  await admin.as.mutation(api.notifications.deliveries.retry, { deliveryId: failed!._id });
  await runAll();
  expect(send).toHaveBeenCalledTimes(2);
  expect(send.mock.calls[1]![0]).toMatchObject({ to: "+34600000009", body: failed!.message });
  const [retried] = await admin.as.query(api.notifications.deliveries.log, {});
  expect(retried).toMatchObject({ state: "sent", phone: "+34600000009", attempts: 1 });
  expect(retried!.error).toBeUndefined();

  await expect(
    admin.as.mutation(api.notifications.deliveries.retry, { deliveryId: failed!._id }),
  ).rejects.toThrow("Solo se pueden reintentar los SMS fallidos");
});

test("retry is refused when the task is gone, has no phone, or SMS a clientes is off", async () => {
  const { send, admin, ana, runAll, notice } = await world();
  send.mockResolvedValue({ ok: false, retryable: false, error: "Número no válido" });
  const retry = (deliveryId: (typeof log)[number]["_id"]) =>
    admin.as.mutation(api.notifications.deliveries.retry, { deliveryId });
  const gone = await notice("A");
  const noPhone = await notice("B");
  const off = await notice("C");
  await runAll();
  const log = await admin.as.query(api.notifications.deliveries.log, {});
  const deliveryFor = (taskId: typeof gone) => log.find((row) => row.taskId === taskId)!._id;
  const [goneId, noPhoneId, offId] = [deliveryFor(gone), deliveryFor(noPhone), deliveryFor(off)];

  await ana.as.mutation(api.tasks.remove, { taskId: gone });
  await expect(retry(goneId)).rejects.toThrow("La tarea ya no existe");
  // The row is still listed, without a task link.
  const after = await admin.as.query(api.notifications.deliveries.log, {});
  expect(after.find((row) => row._id === goneId)).toMatchObject({ recipientName: "María García" });
  expect(after.find((row) => row._id === goneId)!.taskId).toBeUndefined();

  await ana.as.mutation(api.tasks.update, { taskId: noPhone, customerPhone: "" });
  await expect(retry(noPhoneId)).rejects.toThrow("no tiene teléfono de cliente");

  await admin.as.mutation(api.settings.update, {
    appName: "X",
    timezone: "Europe/Madrid",
    reminderLeadHours: 24,
    enabledChannels: [],
  });
  await expect(retry(offId)).rejects.toThrow("desactivados");
  expect(send).toHaveBeenCalledTimes(3);
});

test("legacy SMS to team members can't be retried", async () => {
  const { t, admin, ana, luis, boardId } = await world();
  await ana.as.mutation(api.tasks.create, { boardId, title: "Antigua", assigneeId: luis.id });
  const deliveryId = await t.run(async (ctx) => {
    const notification = (await ctx.db.query("notifications").first())!;
    return await ctx.db.insert("deliveries", {
      notificationId: notification._id,
      userId: luis.id,
      channel: "sms",
      state: "failed",
      to: "+34600000002",
      message: "old sms",
    });
  });
  await expect(
    admin.as.mutation(api.notifications.deliveries.retry, { deliveryId }),
  ).rejects.toThrow("ya no se pueden reintentar");
});
