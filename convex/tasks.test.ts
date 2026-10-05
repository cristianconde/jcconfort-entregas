import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import { seedBoard, seedUser, setup, setupWithAuth, type TestConvex } from "./test.helpers";

const NOW = Date.UTC(2026, 9, 1, 12);

async function world(t: TestConvex = setup()) {
  const admin = await seedUser(t, { role: "admin", name: "Admin" });
  const ana = await seedUser(t, { name: "Ana" });
  const luis = await seedUser(t, { name: "Luis" });
  const outsider = await seedUser(t, { name: "Fuera" });
  const board = await seedBoard(admin, t, [ana.id, luis.id]);
  return { t, admin, ana, luis, outsider, ...board };
}

describe("create", () => {
  test("minimal task: first status, unassigned, media, no deadline, creator recorded", async () => {
    const { t, ana, boardId, statuses } = await world();
    const taskId = await ana.as.mutation(api.tasks.create, {
      boardId,
      title: "  Entregar sofá cliente García ",
    });
    const task = await t.run((ctx) => ctx.db.get("tasks", taskId));
    expect(task).toMatchObject({
      title: "Entregar sofá cliente García",
      statusId: statuses["Pendiente"],
      priority: "media",
      creatorId: ana.id,
      isOpen: true,
    });
    expect(task?.assigneeId).toBeUndefined();
    expect(task?.deadlineAt).toBeUndefined();
    const activity = await ana.as.query(api.tasks.activity, { taskId });
    expect(activity).toMatchObject([{ kind: "created", actorName: "Ana" }]);
  });

  test("empty title is rejected", async () => {
    const { ana, boardId } = await world();
    await expect(ana.as.mutation(api.tasks.create, { boardId, title: "   " })).rejects.toThrow(
      "El título es obligatorio",
    );
  });

  test("non-members cannot create tasks", async () => {
    const { outsider, boardId } = await world();
    await expect(outsider.as.mutation(api.tasks.create, { boardId, title: "X" })).rejects.toThrow(
      "No tienes acceso a este tablero",
    );
  });

  test("date-only deadline ends at 23:59:59.999 Madrid time", async () => {
    const { t, ana, boardId } = await world();
    const taskId = await ana.as.mutation(api.tasks.create, {
      boardId,
      title: "Con fecha",
      deadline: { date: "2026-10-05" },
    });
    const task = await t.run((ctx) => ctx.db.get("tasks", taskId));
    expect(task?.deadlineAt).toBe(Date.UTC(2026, 9, 5, 21, 59, 59, 999));
    expect(task?.deadlineHasTime).toBe(false);
  });
});

describe("assign", () => {
  test("assign to an active member, then unassign; both are logged", async () => {
    const { ana, luis, boardId } = await world();
    const taskId = await ana.as.mutation(api.tasks.create, { boardId, title: "T" });
    await ana.as.mutation(api.tasks.assign, { taskId, assigneeId: luis.id });
    await ana.as.mutation(api.tasks.assign, { taskId, assigneeId: null });
    const activity = await ana.as.query(api.tasks.activity, { taskId });
    expect(activity.slice(0, 2).map((a) => [a.kind, a.from, a.to])).toEqual([
      ["assignee", "Luis", undefined],
      ["assignee", undefined, "Luis"],
    ]);
  });

  test("cannot assign to a non-member or a deactivated user", async () => {
    const { t, admin, ana, luis, outsider, boardId } = await world(setupWithAuth());
    const taskId = await ana.as.mutation(api.tasks.create, { boardId, title: "T" });
    await expect(
      ana.as.mutation(api.tasks.assign, { taskId, assigneeId: outsider.id }),
    ).rejects.toThrow("miembros activos");
    await admin.as.mutation(api.users.setActive, { userId: luis.id, isActive: false });
    await expect(ana.as.mutation(api.tasks.assign, { taskId, assigneeId: luis.id })).rejects.toThrow(
      "miembros activos",
    );
    void t;
  });
});

describe("move and edit", () => {
  test("moving into done sets completedAt; moving out clears it; status change logged", async () => {
    const { t, ana, boardId, statuses } = await world();
    const taskId = await ana.as.mutation(api.tasks.create, { boardId, title: "T" });
    await ana.as.mutation(api.tasks.move, { taskId, statusId: statuses["Hecha"]!, order: 1 });
    let task = await t.run((ctx) => ctx.db.get("tasks", taskId));
    expect(task?.isOpen).toBe(false);
    expect(task?.completedAt).toBeTypeOf("number");
    await ana.as.mutation(api.tasks.move, { taskId, statusId: statuses["Pendiente"]!, order: 1 });
    task = await t.run((ctx) => ctx.db.get("tasks", taskId));
    expect(task?.isOpen).toBe(true);
    expect(task?.completedAt).toBeUndefined();
    const [latest] = await ana.as.query(api.tasks.activity, { taskId });
    expect(latest).toMatchObject({
      kind: "status",
      actorName: "Ana",
      from: "Hecha",
      to: "Pendiente",
    });
  });

  test("editing fields logs each change; changing the deadline resets reminder markers", async () => {
    const { t, ana, boardId } = await world();
    const taskId = await ana.as.mutation(api.tasks.create, {
      boardId,
      title: "T",
      deadline: { date: "2026-10-05" },
    });
    await t.run((ctx) =>
      ctx.db.patch("tasks", taskId, { reminderSentFor: 1, overdueSentFor: 1 }),
    );
    await ana.as.mutation(api.tasks.update, {
      taskId,
      title: "T2",
      priority: "urgente",
      deadline: { date: "2026-10-07", time: "10:00" },
    });
    const task = await t.run((ctx) => ctx.db.get("tasks", taskId));
    expect(task).toMatchObject({ title: "T2", priority: "urgente", deadlineHasTime: true });
    expect(task?.reminderSentFor).toBeUndefined();
    expect(task?.overdueSentFor).toBeUndefined();
    const kinds = (await ana.as.query(api.tasks.activity, { taskId })).map((a) => a.kind);
    expect(kinds).toEqual(expect.arrayContaining(["title", "priority", "deadline", "created"]));

    await ana.as.mutation(api.tasks.update, { taskId, deadline: null });
    expect((await t.run((ctx) => ctx.db.get("tasks", taskId)))?.deadlineAt).toBeUndefined();
  });
});

describe("customer contact", () => {
  test("create stores the name trimmed and the phone in E.164; both show on the task", async () => {
    const { ana, boardId } = await world();
    const taskId = await ana.as.mutation(api.tasks.create, {
      boardId,
      title: "Entregar sofá cliente García",
      customerName: "  María García ",
      customerPhone: "+34 600 11 12 22",
    });
    const { task } = await ana.as.query(api.tasks.get, { taskId, now: NOW });
    expect(task).toMatchObject({ customerName: "María García", customerPhone: "+34600111222" });
    const [card] = await ana.as.query(api.tasks.listForBoard, { boardId, now: NOW });
    expect(card).toMatchObject({ customerName: "María García", customerPhone: "+34600111222" });
  });

  test("a minimal task has no customer", async () => {
    const { ana, boardId } = await world();
    const taskId = await ana.as.mutation(api.tasks.create, { boardId, title: "T" });
    const { task } = await ana.as.query(api.tasks.get, { taskId, now: NOW });
    expect(task.customerName).toBeUndefined();
    expect(task.customerPhone).toBeUndefined();
  });

  test("an invalid phone is rejected and the stored value is unchanged", async () => {
    const { t, ana, boardId } = await world();
    const message = "El teléfono debe estar en formato internacional, por ejemplo +34600111222";
    await expect(
      ana.as.mutation(api.tasks.create, { boardId, title: "T", customerPhone: "600111222" }),
    ).rejects.toThrow(message);
    const taskId = await ana.as.mutation(api.tasks.create, {
      boardId,
      title: "T",
      customerPhone: "+34600111222",
    });
    await expect(
      ana.as.mutation(api.tasks.update, { taskId, customerPhone: "600111222" }),
    ).rejects.toThrow(message);
    expect((await t.run((ctx) => ctx.db.get("tasks", taskId)))?.customerPhone).toBe("+34600111222");
  });

  test("editing and clearing are logged; an unchanged value is not", async () => {
    const { t, ana, luis, boardId } = await world();
    const taskId = await ana.as.mutation(api.tasks.create, { boardId, title: "T" });
    await luis.as.mutation(api.tasks.update, {
      taskId,
      customerName: "María García",
      customerPhone: "+34 600 111 222",
    });
    await luis.as.mutation(api.tasks.update, { taskId, customerPhone: "+34600111222" });
    await luis.as.mutation(api.tasks.update, { taskId, customerPhone: "" });
    const stored = await t.run((ctx) => ctx.db.get("tasks", taskId));
    expect(stored?.customerName).toBe("María García");
    expect(stored?.customerPhone).toBeUndefined();
    await luis.as.mutation(api.tasks.update, { taskId, customerName: "" });
    expect((await t.run((ctx) => ctx.db.get("tasks", taskId)))?.customerName).toBeUndefined();

    const entries = (await ana.as.query(api.tasks.activity, { taskId }))
      .filter((a) => a.kind === "customer")
      .map((a) => [a.actorName, a.from, a.to]);
    expect(entries).toEqual([
      ["Luis", "María García", undefined],
      ["Luis", "María García · +34600111222", "María García"],
      ["Luis", undefined, "María García · +34600111222"],
    ]);
  });

  test("the name admits at most 80 characters", async () => {
    const { ana, boardId } = await world();
    await expect(
      ana.as.mutation(api.tasks.create, { boardId, title: "T", customerName: "a".repeat(81) }),
    ).rejects.toThrow("80 caracteres");
  });

  test("customer data is only visible to users who can see the task", async () => {
    const { ana, outsider, boardId } = await world();
    const taskId = await ana.as.mutation(api.tasks.create, {
      boardId,
      title: "T",
      customerPhone: "+34600111222",
    });
    await expect(outsider.as.query(api.tasks.get, { taskId, now: NOW })).rejects.toThrow("acceso");
    await expect(outsider.as.query(api.tasks.listForBoard, { boardId, now: NOW })).rejects.toThrow(
      "acceso",
    );
  });
});

describe("delete", () => {
  test("only the creator or an admin can delete", async () => {
    const { t, admin, ana, luis, boardId } = await world();
    const taskId = await ana.as.mutation(api.tasks.create, { boardId, title: "T" });
    await expect(luis.as.mutation(api.tasks.remove, { taskId })).rejects.toThrow(
      "Solo quien creó la tarea",
    );
    await ana.as.mutation(api.tasks.remove, { taskId });
    expect(await t.run((ctx) => ctx.db.get("tasks", taskId))).toBeNull();
    const other = await luis.as.mutation(api.tasks.create, { boardId, title: "T" });
    await admin.as.mutation(api.tasks.remove, { taskId: other });
    expect(await t.run((ctx) => ctx.db.query("activity").collect())).toHaveLength(0);
  });
});

describe("archived boards are read-only", () => {
  test("creating, editing, moving and commenting are refused", async () => {
    const { admin, ana, boardId, statuses } = await world();
    const taskId = await ana.as.mutation(api.tasks.create, { boardId, title: "T" });
    await admin.as.mutation(api.boards.setArchived, { boardId, isArchived: true });
    const refused = "archivado";
    await expect(ana.as.mutation(api.tasks.create, { boardId, title: "X" })).rejects.toThrow(refused);
    await expect(ana.as.mutation(api.tasks.update, { taskId, title: "X" })).rejects.toThrow(refused);
    await expect(
      ana.as.mutation(api.tasks.move, { taskId, statusId: statuses["Hecha"]!, order: 1 }),
    ).rejects.toThrow(refused);
    await expect(ana.as.mutation(api.comments.add, { taskId, body: "Hola" })).rejects.toThrow(
      refused,
    );
    // Still readable.
    await expect(ana.as.query(api.tasks.get, { taskId, now: NOW })).resolves.toBeTruthy();
  });
});

describe("queries", () => {
  async function filterWorld() {
    const w = await world();
    const { ana, luis, boardId } = w;
    const mk = (title: string, extra: Record<string, unknown> = {}) =>
      ana.as.mutation(api.tasks.create, { boardId, title, ...extra });
    await mk("Montar armario", { assigneeId: ana.id, priority: "alta" });
    await mk("Entregar sofá", { assigneeId: luis.id, deadline: { date: "2026-09-01" } });
    await mk("Recoger colchón");
    return w;
  }

  test("filters: mine, assignee, unassigned, priority, overdue, search", async () => {
    const { ana, luis, boardId } = await filterWorld();
    const titles = async (args: Record<string, unknown>) =>
      (await ana.as.query(api.tasks.listForBoard, { boardId, now: NOW, ...args }))
        .map((t) => t.title)
        .sort();
    expect(await titles({})).toHaveLength(3);
    expect(await titles({ mine: true })).toEqual(["Montar armario"]);
    expect(await titles({ assigneeId: luis.id })).toEqual(["Entregar sofá"]);
    expect(await titles({ unassigned: true })).toEqual(["Recoger colchón"]);
    expect(await titles({ priority: "alta" })).toEqual(["Montar armario"]);
    expect(await titles({ overdue: true })).toEqual(["Entregar sofá"]);
    expect(await titles({ search: "sofá" })).toEqual(["Entregar sofá"]);
  });

  test("overdue flag and inactive assignee are exposed on cards", async () => {
    const { t, admin, luis, boardId } = await filterWorld();
    void t;
    await admin.as.mutation(api.users.update, { userId: luis.id, name: "Luis", role: "member" });
    const cards = await admin.as.query(api.tasks.listForBoard, { boardId, now: NOW });
    const sofa = cards.find((c) => c.title === "Entregar sofá");
    expect(sofa).toMatchObject({ isOverdue: true, assignee: { name: "Luis", isActive: true } });
  });

  test("myOpen lists open tasks across boards, soonest deadline first, no deadline last", async () => {
    const t = setup();
    const admin = await seedUser(t, { role: "admin" });
    const ana = await seedUser(t, { name: "Ana" });
    const b1 = await seedBoard(admin, t, [ana.id]);
    const b2 = await seedBoard(admin, t, [ana.id]);
    await ana.as.mutation(api.tasks.create, {
      boardId: b1.boardId,
      title: "Sin fecha",
      assigneeId: ana.id,
    });
    await ana.as.mutation(api.tasks.create, {
      boardId: b2.boardId,
      title: "Tarde",
      assigneeId: ana.id,
      deadline: { date: "2026-12-01" },
    });
    await ana.as.mutation(api.tasks.create, {
      boardId: b1.boardId,
      title: "Pronto",
      assigneeId: ana.id,
      deadline: { date: "2026-10-02" },
    });
    const done = await ana.as.mutation(api.tasks.create, {
      boardId: b1.boardId,
      title: "Hecha",
      assigneeId: ana.id,
    });
    await ana.as.mutation(api.tasks.move, {
      taskId: done,
      statusId: b1.statuses["Hecha"]!,
      order: 1,
    });
    const rows = await ana.as.query(api.tasks.myOpen, { now: NOW });
    expect(rows.map((r) => r.task.title)).toEqual(["Pronto", "Tarde", "Sin fecha"]);
    expect(rows[0]).toMatchObject({ boardName: "Entregas Madrid", statusName: "Pendiente" });
  });
});
