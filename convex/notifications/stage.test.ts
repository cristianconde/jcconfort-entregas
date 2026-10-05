import { describe, expect, test } from "vitest";
import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { DEFAULT_CUSTOMER_TEMPLATE } from "../lib/customerMessage";
import { seedBoard, seedUser, setup } from "../test.helpers";

async function world() {
  const t = setup();
  const admin = await seedUser(t, { role: "admin", name: "Admin" });
  const ana = await seedUser(t, { name: "Ana" });
  const luis = await seedUser(t, { name: "Luis" });
  const oficina = await seedUser(t, { name: "Oficina" });
  const board = await seedBoard(admin, t, [ana.id, luis.id]);
  const hecha = board.statuses["Hecha"]!;
  const inbox = async (user: typeof ana) =>
    (await user.as.query(api.notifications.inbox.list, {})).map((n) => `${n.kind}: ${n.text}`);
  return { t, admin, ana, luis, oficina, hecha, inbox, ...board };
}

describe("rule management", () => {
  test("members cannot manage rules", async () => {
    const { ana, hecha, boardId } = await world();
    const rule = { statusId: hecha, notifyAssignee: true, notifyCreator: false, userIds: [] };
    await expect(ana.as.mutation(api.boards.setStatusRule, rule)).rejects.toThrow("administrador");
    await expect(ana.as.query(api.boards.getStatusRules, { boardId })).rejects.toThrow("administrador");
    await expect(ana.as.mutation(api.boards.clearStatusRule, { statusId: hecha })).rejects.toThrow(
      "administrador",
    );
  });

  test("a rule needs a recipient and only active users", async () => {
    const { t, admin, oficina, hecha } = await world();
    await expect(
      admin.as.mutation(api.boards.setStatusRule, {
        statusId: hecha,
        notifyAssignee: false,
        notifyCreator: false,
        userIds: [],
      }),
    ).rejects.toThrow("Elige al menos un destinatario");
    await t.run((ctx) => ctx.db.patch("users", oficina.id, { isActive: false }));
    await expect(
      admin.as.mutation(api.boards.setStatusRule, {
        statusId: hecha,
        notifyAssignee: false,
        notifyCreator: false,
        userIds: [oficina.id],
      }),
    ).rejects.toThrow("Solo puedes elegir usuarios activos");
  });

  test("set replaces, clear removes", async () => {
    const { admin, oficina, hecha, boardId } = await world();
    const set = (notifyCreator: boolean, userIds: Id<"users">[]) =>
      admin.as.mutation(api.boards.setStatusRule, {
        statusId: hecha,
        notifyAssignee: false,
        notifyCreator,
        userIds,
      });
    await set(true, []);
    await set(false, [oficina.id, oficina.id]);
    expect(await admin.as.query(api.boards.getStatusRules, { boardId })).toEqual([
      {
        statusId: hecha,
        notifyAssignee: false,
        notifyCreator: false,
        userIds: [oficina.id],
        notifyCustomer: false,
      },
    ]);
    await admin.as.mutation(api.boards.clearStatusRule, { statusId: hecha });
    expect(await admin.as.query(api.boards.getStatusRules, { boardId })).toEqual([]);
  });

  test("a customer-only rule is valid and starts from the default template", async () => {
    const { admin, ana, hecha, boardId } = await world();
    const rule = { statusId: hecha, notifyAssignee: false, notifyCreator: false, userIds: [] };
    await admin.as.mutation(api.boards.setStatusRule, { ...rule, notifyCustomer: true });
    expect(await admin.as.query(api.boards.getStatusRules, { boardId })).toEqual([
      { ...rule, notifyCustomer: true, customerTemplate: DEFAULT_CUSTOMER_TEMPLATE },
    ]);
    // Board members see which statuses ask for the confirmation, and the template.
    const board = await ana.as.query(api.boards.get, { boardId });
    expect(board.customerSmsAvailable).toBe(true);
    expect(board.statuses.map((s) => [s.name, s.notifiesCustomer, s.customerTemplate])).toEqual([
      ["Pendiente", false, undefined],
      ["En progreso", false, undefined],
      ["Bloqueada", false, undefined],
      ["Hecha", true, DEFAULT_CUSTOMER_TEMPLATE],
    ]);
    // An empty rule is still rejected, also with the customer option explicitly off.
    await expect(
      admin.as.mutation(api.boards.setStatusRule, { ...rule, notifyCustomer: false }),
    ).rejects.toThrow("Elige al menos un destinatario");
    await expect(
      ana.as.mutation(api.boards.setStatusRule, { ...rule, notifyCustomer: true }),
    ).rejects.toThrow("administrador");
  });

  test("the customer template is validated and dropped when the option is turned off", async () => {
    const { admin, hecha, boardId } = await world();
    const rule = { statusId: hecha, notifyAssignee: true, notifyCreator: false, userIds: [] };
    const set = (customerTemplate: string | undefined, notifyCustomer = true) =>
      admin.as.mutation(api.boards.setStatusRule, { ...rule, notifyCustomer, customerTemplate });
    await expect(set("Hola {nombre}, va en camino")).rejects.toThrow("Marcador desconocido: {nombre}");
    await expect(set("a".repeat(307))).rejects.toThrow("entre 1 y 306 caracteres");
    await set("  {empresa}: su pedido va en camino.{llegada} ");
    expect(await admin.as.query(api.boards.getStatusRules, { boardId })).toMatchObject([
      { notifyCustomer: true, customerTemplate: "{empresa}: su pedido va en camino.{llegada}" },
    ]);
    // Empty text falls back to the default.
    await set("   ");
    expect(await admin.as.query(api.boards.getStatusRules, { boardId })).toMatchObject([
      { customerTemplate: DEFAULT_CUSTOMER_TEMPLATE },
    ]);
    await set("ignored", false);
    const [saved] = await admin.as.query(api.boards.getStatusRules, { boardId });
    expect(saved).toMatchObject({ notifyAssignee: true, notifyCustomer: false });
    expect(saved!.customerTemplate).toBeUndefined();
    const board = await admin.as.query(api.boards.get, { boardId });
    expect(board.statuses.every((s) => !s.notifiesCustomer)).toBe(true);
  });

  test("«SMS a clientes» off or no provider is reported to the board", async () => {
    const { admin, boardId } = await world();
    await admin.as.mutation(api.settings.update, {
      appName: "X",
      timezone: "Europe/Madrid",
      reminderLeadHours: 24,
      enabledChannels: [],
    });
    expect((await admin.as.query(api.boards.get, { boardId })).customerSmsAvailable).toBe(false);
  });

  test("removing a status removes its rule and its moved tasks notify no one", async () => {
    const { t, admin, ana, luis, statuses, boardId, inbox } = await world();
    const bloqueada = statuses["Bloqueada"]!;
    const taskId = await ana.as.mutation(api.tasks.create, {
      boardId,
      title: "T",
      assigneeId: luis.id,
      statusId: bloqueada,
    });
    const pendiente = statuses["Pendiente"]!;
    for (const statusId of [bloqueada, pendiente]) {
      await admin.as.mutation(api.boards.setStatusRule, {
        statusId,
        notifyAssignee: true,
        notifyCreator: true,
        userIds: [],
        notifyCustomer: true,
      });
    }
    const before = [await inbox(ana), await inbox(luis)];
    await admin.as.mutation(api.boards.removeStatus, { statusId: bloqueada, moveTasksTo: pendiente });
    expect(await admin.as.query(api.boards.getStatusRules, { boardId })).toMatchObject([
      { statusId: pendiente },
    ]);
    expect(await t.run((ctx) => ctx.db.get("tasks", taskId))).toMatchObject({ statusId: pendiente });
    expect([await inbox(ana), await inbox(luis)]).toEqual(before);
    // The rule and its customer template went with the status; no customer SMS either.
    expect(await t.run((ctx) => ctx.db.query("statusRules").collect())).toHaveLength(1);
    expect(await t.run((ctx) => ctx.db.query("deliveries").collect())).toHaveLength(0);
  });
});

describe("notifications on entering a status", () => {
  async function withRule(w: Awaited<ReturnType<typeof world>>, rule: { notifyAssignee?: boolean; notifyCreator?: boolean; userIds?: Id<"users">[] }) {
    await w.admin.as.mutation(api.boards.setStatusRule, {
      statusId: w.hecha,
      notifyAssignee: rule.notifyAssignee ?? false,
      notifyCreator: rule.notifyCreator ?? false,
      userIds: rule.userIds ?? [],
    });
  }

  test("rule recipients get the stage notification instead of the status change", async () => {
    const w = await world();
    const { admin, ana, luis, oficina, hecha, boardId, inbox } = w;
    await withRule(w, { notifyCreator: true, userIds: [oficina.id] });
    const taskId = await ana.as.mutation(api.tasks.create, { boardId, title: "Sofá" });
    await admin.as.mutation(api.tasks.assign, { taskId, assigneeId: luis.id });
    await admin.as.mutation(api.tasks.move, { taskId, statusId: hecha });

    expect(await inbox(ana)).toEqual(["stage_reached: «Sofá» llegó a Hecha (movida por Admin)"]);
    expect(await inbox(oficina)).toEqual(["stage_reached: «Sofá» llegó a Hecha (movida por Admin)"]);
    // The assignee is not a rule recipient: still gets the generic status change.
    expect(await inbox(luis)).toEqual([
      "status_changed: Admin cambió el estado de «Sofá» a Hecha",
      "assigned: Admin te asignó: Sofá",
    ]);
  });

  test("the actor is never notified, even as a rule recipient", async () => {
    const w = await world();
    const { ana, luis, hecha, boardId, inbox } = w;
    await withRule(w, { notifyAssignee: true });
    const taskId = await ana.as.mutation(api.tasks.create, { boardId, title: "T", assigneeId: luis.id });
    await luis.as.mutation(api.tasks.move, { taskId, statusId: hecha });
    expect(await inbox(luis)).toEqual(["assigned: Ana te asignó: T"]);
    expect(await inbox(ana)).toEqual(["status_changed: Luis cambió el estado de «T» a Hecha"]);
  });

  test("creating a task directly in a rule status notifies the rule recipients", async () => {
    const w = await world();
    const { ana, oficina, hecha, boardId, inbox } = w;
    await withRule(w, { notifyCreator: true, userIds: [oficina.id] });
    await ana.as.mutation(api.tasks.create, { boardId, title: "T", statusId: hecha });
    expect(await inbox(oficina)).toEqual(["stage_reached: «T» llegó a Hecha (creada por Ana)"]);
    // Ana is the creator and the actor.
    expect(await inbox(ana)).toEqual([]);
  });

  test("deactivated rule users are skipped", async () => {
    const w = await world();
    const { t, admin, ana, oficina, hecha, boardId, inbox } = w;
    await withRule(w, { userIds: [oficina.id] });
    await t.run((ctx) => ctx.db.patch("users", oficina.id, { isActive: false }));
    const taskId = await ana.as.mutation(api.tasks.create, { boardId, title: "T" });
    await admin.as.mutation(api.tasks.move, { taskId, statusId: hecha });
    await t.run((ctx) => ctx.db.patch("users", oficina.id, { isActive: true }));
    expect(await inbox(oficina)).toEqual([]);
  });

  test("a status without a rule only sends the status change; same-status moves send nothing", async () => {
    const { admin, ana, luis, statuses, boardId, inbox } = await world();
    const taskId = await ana.as.mutation(api.tasks.create, { boardId, title: "T", assigneeId: luis.id });
    await admin.as.mutation(api.tasks.move, { taskId, statusId: statuses["En progreso"]! });
    await admin.as.mutation(api.tasks.move, { taskId, statusId: statuses["En progreso"]!, order: 1 });
    expect(await inbox(ana)).toEqual(["status_changed: Admin cambió el estado de «T» a En progreso"]);
    expect(await inbox(luis)).toHaveLength(2);
  });

  test("changing the done status does not trigger rules", async () => {
    const w = await world();
    const { admin, ana, oficina, statuses, boardId, inbox } = w;
    const bloqueada = statuses["Bloqueada"]!;
    await admin.as.mutation(api.boards.setStatusRule, {
      statusId: bloqueada,
      notifyAssignee: false,
      notifyCreator: true,
      userIds: [oficina.id],
    });
    await ana.as.mutation(api.tasks.create, { boardId, title: "T", statusId: bloqueada });
    const before = await inbox(oficina);
    await admin.as.mutation(api.boards.setDoneStatus, { statusId: bloqueada });
    expect(await inbox(oficina)).toEqual(before);
  });
});
