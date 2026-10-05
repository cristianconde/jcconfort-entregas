import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { DEFAULT_CUSTOMER_TEMPLATE } from "../lib/customerMessage";
import { seedBoard, seedUser, setup } from "../test.helpers";
import type { CustomerNotice } from "./customer";

// Monday 5 Oct 2026, 09:00 in Madrid.
const NOW = Date.UTC(2026, 9, 5, 7, 0);
const TODAY = "2026-10-05";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

/** A board whose "En progreso" stands in for "En reparto", marked "Avisar al cliente". */
async function world(customer: { customerName?: string; customerPhone?: string } = {
  customerName: "María García",
  customerPhone: "+34600111222",
}) {
  const t = setup();
  const admin = await seedUser(t, { role: "admin", name: "Admin" });
  const luis = await seedUser(t, { name: "Luis", phone: "+34600000002" });
  const ana = await seedUser(t, { name: "Ana", phone: "+34600000001" });
  const { boardId, statuses } = await seedBoard(admin, t, [luis.id, ana.id]);
  const reparto = statuses["En progreso"]!;
  const setRule = (extra: { customerTemplate?: string; notifyCreator?: boolean } = {}) =>
    admin.as.mutation(api.boards.setStatusRule, {
      statusId: reparto,
      notifyAssignee: false,
      notifyCreator: false,
      userIds: [],
      notifyCustomer: true,
      ...extra,
    });
  await setRule();
  const taskId = await ana.as.mutation(api.tasks.create, {
    boardId,
    title: "Entregar sofá cliente García",
    ...customer,
  });
  const deliveries = () => t.run((ctx) => ctx.db.query("deliveries").collect());
  const scheduled = () => t.run((ctx) => ctx.db.system.query("_scheduled_functions").collect());
  const task = async (id: Id<"tasks"> = taskId) => (await t.run((ctx) => ctx.db.get("tasks", id)))!;
  const activity = async () =>
    (await luis.as.query(api.tasks.activity, { taskId })).map((e) => [e.kind, e.from, e.to]);
  const move = (customerNotice?: CustomerNotice) =>
    luis.as.mutation(api.tasks.move, { taskId, statusId: reparto, customerNotice });
  return { t, admin, luis, ana, boardId, statuses, reparto, setRule, taskId, deliveries, scheduled, task, activity, move };
}

describe("customer notice on status entry", () => {
  test("with a window: one delivery to the customer phone with the exact text", async () => {
    const { taskId, move, deliveries, scheduled, task, activity } = await world();
    await move({ send: true, eta: { date: TODAY, from: "10:00", to: "12:00" } });

    const rows = await deliveries();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      recipient: "customer",
      taskId,
      recipientName: "María García",
      channel: "sms",
      state: "pending",
      to: "+34600111222",
      attempts: 0,
      message:
        "Hola Maria Garcia, su pedido esta en camino. Llegada estimada: hoy entre las 10:00 y las 12:00. Gracias por su compra. JC Confort Entregas",
    });
    expect(rows[0]!.userId).toBeUndefined();
    expect(rows[0]!.notificationId).toBeUndefined();
    expect(await scheduled()).toMatchObject([
      { name: "notifications/send:deliver", args: [{ deliveryId: rows[0]!._id }] },
    ]);
    expect(await task()).toMatchObject({ etaDate: TODAY, etaFrom: "10:00", etaTo: "12:00" });
    // The notice is logged after the status change.
    expect(await activity()).toEqual([
      ["customer_notice", "sms", `${TODAY}|10:00|12:00`],
      ["status", "Pendiente", "En progreso"],
      ["created", undefined, undefined],
    ]);
  });

  test("the SMS is sent automatically through the provider", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const { t, move, deliveries } = await world();
    await move({ send: true });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(await deliveries()).toMatchObject([{ state: "delivered", provider: "log" }]);
    vi.restoreAllMocks();
  });

  test("no window: the message has no arrival sentence and the task has no window", async () => {
    const { move, deliveries, task, activity } = await world();
    await move({ send: true });
    expect((await deliveries())[0]!.message).toBe(
      "Hola Maria Garcia, su pedido esta en camino. Gracias por su compra. JC Confort Entregas",
    );
    expect((await task()).etaDate).toBeUndefined();
    expect((await activity())[0]).toEqual(["customer_notice", "sms", undefined]);
  });

  test("toggle off: the window is stored and no SMS is created", async () => {
    const { move, deliveries, scheduled, task, activity } = await world();
    await move({ send: false, eta: { date: TODAY, from: "16:00", to: "18:00" } });
    expect(await deliveries()).toHaveLength(0);
    expect(await scheduled()).toHaveLength(0);
    expect(await task()).toMatchObject({ etaDate: TODAY, etaFrom: "16:00", etaTo: "18:00" });
    expect((await activity())[0]).toEqual(["customer_notice", "sin sms", `${TODAY}|16:00|18:00`]);
  });

  test("an edited message is sent as edited (in GSM-7) and the template is unchanged", async () => {
    const { admin, boardId, reparto, move, deliveries } = await world();
    await move({
      send: true,
      message: "  Hola María, va en camino. Llamaremos al portero automático  ",
    });
    expect((await deliveries())[0]!.message).toBe(
      "Hola Maria, va en camino. Llamaremos al portero automatico",
    );
    const rules = await admin.as.query(api.boards.getStatusRules, { boardId });
    expect(rules).toMatchObject([{ statusId: reparto, customerTemplate: DEFAULT_CUSTOMER_TEMPLATE }]);
  });

  test("the status template is used, with its placeholders", async () => {
    const { setRule, move, deliveries } = await world();
    await setRule({ customerTemplate: "{empresa}: {cliente}, su pedido sale hoy.{llegada}" });
    await move({ send: true, eta: { date: "2026-10-06", from: "09:30" } });
    expect((await deliveries())[0]!.message).toBe(
      "JC Confort Entregas: Maria Garcia, su pedido sale hoy. Llegada estimada: mañana hacia las 09:30.",
    );
  });

  test("too long or empty: rejected, and the task does not move", async () => {
    const { statuses, move, deliveries, task } = await world();
    await expect(move({ send: true, message: "a".repeat(307) })).rejects.toThrow(
      "El mensaje es demasiado largo (máximo 2 SMS)",
    );
    await expect(move({ send: true, message: "   " })).rejects.toThrow("no puede estar vacío");
    expect(await deliveries()).toHaveLength(0);
    expect((await task()).statusId).toBe(statuses["Pendiente"]);
    // 306 septets fit.
    await move({ send: true, message: "a".repeat(306) });
    expect(await deliveries()).toHaveLength(1);
  });

  test("no phone with send on is rejected; entering one saves it on the task", async () => {
    const { move, deliveries, task, activity } = await world({ customerName: "María García" });
    await expect(move({ send: true })).rejects.toThrow("hace falta su teléfono");
    await expect(move({ send: true, phone: "600111222" })).rejects.toThrow("formato internacional");
    expect(await deliveries()).toHaveLength(0);

    await move({ send: true, phone: "+34 600 11 12 22" });
    expect((await task()).customerPhone).toBe("+34600111222");
    expect(await deliveries()).toMatchObject([{ to: "+34600111222" }]);
    expect((await activity()).slice(0, 2)).toEqual([
      ["customer_notice", "sms", undefined],
      ["customer", "María García", "María García · +34600111222"],
    ]);
  });

  test("without a phone and with the toggle off the task just moves", async () => {
    const { reparto, move, deliveries, task } = await world({});
    await move({ send: false });
    expect((await task()).statusId).toBe(reparto);
    expect(await deliveries()).toHaveLength(0);
  });

  test("invalid windows are rejected", async () => {
    const { move, task } = await world();
    await expect(move({ send: false, eta: { date: TODAY, from: "12:00", to: "10:00" } })).rejects.toThrow(
      "posterior",
    );
    await expect(move({ send: false, eta: { date: "2026-10-04", from: "10:00" } })).rejects.toThrow(
      "no puede ser anterior a hoy",
    );
    expect((await task()).etaDate).toBeUndefined();
  });

  test("a second entry replaces the window; one without a window clears it", async () => {
    const { luis, taskId, statuses, move, deliveries, task } = await world();
    const back = () => luis.as.mutation(api.tasks.move, { taskId, statusId: statuses["Pendiente"]! });
    await move({ send: true, eta: { date: TODAY, from: "10:00", to: "12:00" } });
    await back();
    // Leaving the status keeps the window.
    expect(await task()).toMatchObject({ etaFrom: "10:00", etaTo: "12:00" });

    await move({ send: true, eta: { date: TODAY, from: "16:00" } });
    expect(await task()).toMatchObject({ etaDate: TODAY, etaFrom: "16:00" });
    expect((await task()).etaTo).toBeUndefined();
    // Each confirmed notice produced exactly one SMS.
    expect(await deliveries()).toHaveLength(2);

    await back();
    await move({ send: false });
    expect((await task()).etaDate).toBeUndefined();
    expect((await task()).etaFrom).toBeUndefined();
  });

  test("provider unconfigured or «SMS a clientes» off: the window is stored, nothing is sent", async () => {
    const { admin, luis, taskId, statuses, move, deliveries, scheduled, task, activity } = await world();
    vi.stubEnv("SMS_PROVIDER", "twilio");
    vi.stubEnv("TWILIO_AUTH_TOKEN", undefined);
    await move({ send: true, eta: { date: TODAY, from: "10:00", to: "12:00" } });
    vi.unstubAllEnvs();
    expect(await task()).toMatchObject({ etaFrom: "10:00" });
    expect((await activity())[0]).toEqual(["customer_notice", "sin sms", `${TODAY}|10:00|12:00`]);

    await admin.as.mutation(api.settings.update, {
      appName: "JC Confort Entregas",
      timezone: "Europe/Madrid",
      reminderLeadHours: 24,
      enabledChannels: [],
    });
    await luis.as.mutation(api.tasks.move, { taskId, statusId: statuses["Pendiente"]! });
    await move({ send: true, eta: { date: TODAY, from: "16:00" } });
    expect(await task()).toMatchObject({ etaFrom: "16:00" });

    expect(await deliveries()).toHaveLength(0);
    expect(await scheduled()).toHaveLength(0);
  });
});

describe("no customer message without the confirmation", () => {
  test("a move without customerNotice goes ahead and sends nothing", async () => {
    const { reparto, move, deliveries, task, activity } = await world();
    await move();
    expect((await task()).statusId).toBe(reparto);
    expect(await deliveries()).toHaveLength(0);
    expect((await activity()).map((e) => e[0])).toEqual(["status", "created"]);
  });

  test("a task created directly in the status sends nothing, but team recipients are notified", async () => {
    const { ana, luis, boardId, reparto, setRule, deliveries } = await world();
    await setRule({ notifyCreator: true });
    const created = await luis.as.mutation(api.tasks.create, {
      boardId,
      title: "Directa",
      statusId: reparto,
      customerName: "Pedro",
      customerPhone: "+34600333444",
      assigneeId: ana.id,
    });
    expect(created).toBeDefined();
    expect(await deliveries()).toHaveLength(0);
    expect((await ana.as.query(api.notifications.inbox.list, {})).map((n) => n.kind)).toEqual(["assigned"]);
  });

  test("a notice for a status that doesn't notify the customer is rejected", async () => {
    const { luis, taskId, statuses, task } = await world();
    await expect(
      luis.as.mutation(api.tasks.move, {
        taskId,
        statusId: statuses["Hecha"]!,
        customerNotice: { send: true },
      }),
    ).rejects.toThrow("Este estado no avisa al cliente");
    expect((await task()).statusId).toBe(statuses["Pendiente"]);
  });

  test("moving within the same status sends nothing and rejects a notice", async () => {
    const { luis, taskId, reparto, move, deliveries } = await world();
    await move({ send: false });
    await luis.as.mutation(api.tasks.move, { taskId, statusId: reparto, order: 5 });
    await expect(
      luis.as.mutation(api.tasks.move, {
        taskId,
        statusId: reparto,
        order: 6,
        customerNotice: { send: true },
      }),
    ).rejects.toThrow("Este estado no avisa al cliente");
    expect(await deliveries()).toHaveLength(0);
  });

  test("tasks moved because their status was deleted send nothing", async () => {
    const { admin, luis, boardId, statuses, reparto, deliveries, t } = await world();
    const bloqueada = statuses["Bloqueada"]!;
    const taskId = await luis.as.mutation(api.tasks.create, {
      boardId,
      title: "T",
      statusId: bloqueada,
      customerPhone: "+34600333444",
    });
    await admin.as.mutation(api.boards.removeStatus, { statusId: bloqueada, moveTasksTo: reparto });
    expect((await t.run((ctx) => ctx.db.get("tasks", taskId)))!.statusId).toBe(reparto);
    expect(await deliveries()).toHaveLength(0);
  });

  test("team recipients of the rule are notified in-app only", async () => {
    const { ana, setRule, move, deliveries } = await world();
    await setRule({ notifyCreator: true });
    await move({ send: true });
    expect((await ana.as.query(api.notifications.inbox.list, {})).map((n) => n.text)).toEqual([
      "«Entregar sofá cliente García» llegó a En progreso (movida por Luis)",
    ]);
    // Only the customer SMS; none for Ana, who has a phone.
    expect(await deliveries()).toMatchObject([{ recipient: "customer", to: "+34600111222" }]);
  });
});
