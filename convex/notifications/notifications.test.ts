import { describe, expect, test } from "vitest";
import { api } from "../_generated/api";
import { seedBoard, seedUser, sendCustomerNotice, setup, type TestConvex } from "../test.helpers";

async function world() {
  const t = setup();
  const admin = await seedUser(t, { role: "admin", name: "Admin" });
  const ana = await seedUser(t, { name: "Ana", phone: "+34600000001" });
  const luis = await seedUser(t, { name: "Luis", phone: "+34600000002" });
  const board = await seedBoard(admin, t, [ana.id, luis.id]);
  return { t, admin, ana, luis, ...board };
}

describe("who gets notified", () => {
  test("assignment notifies only the assignee, not the actor", async () => {
    const { ana, luis, boardId } = await world();
    const taskId = await ana.as.mutation(api.tasks.create, { boardId, title: "Entregar sofá" });
    await ana.as.mutation(api.tasks.assign, { taskId, assigneeId: luis.id });
    expect(await luis.as.query(api.notifications.inbox.list, {})).toMatchObject([
      { kind: "assigned", text: "Ana te asignó: Entregar sofá", taskId, isRead: false },
    ]);
    expect(await ana.as.query(api.notifications.inbox.list, {})).toHaveLength(0);
  });

  test("self-assignment creates nothing", async () => {
    const { t, luis, boardId } = await world();
    await luis.as.mutation(api.tasks.create, { boardId, title: "T", assigneeId: luis.id });
    expect(await t.run((ctx) => ctx.db.query("notifications").collect())).toHaveLength(0);
  });

  test("status change notifies assignee and creator, minus the actor", async () => {
    const { admin, ana, luis, boardId, statuses } = await world();
    const taskId = await ana.as.mutation(api.tasks.create, {
      boardId,
      title: "T",
      assigneeId: luis.id,
    });
    await admin.as.mutation(api.tasks.move, { taskId, statusId: statuses["En progreso"]! });
    const [anaInbox, luisInbox] = await Promise.all([
      ana.as.query(api.notifications.inbox.list, {}),
      luis.as.query(api.notifications.inbox.list, {}),
    ]);
    expect(anaInbox.map((n) => n.text)).toEqual(["Admin cambió el estado de «T» a En progreso"]);
    expect(luisInbox.map((n) => n.kind)).toEqual(["status_changed", "assigned"]);

    // When the assignee moves it, only the creator hears about it.
    await luis.as.mutation(api.tasks.move, { taskId, statusId: statuses["Hecha"]! });
    expect(await luis.as.query(api.notifications.inbox.unreadCount, {})).toBe(2);
    expect(await ana.as.query(api.notifications.inbox.unreadCount, {})).toBe(2);
  });

  test("comments notify assignee and creator, minus the author", async () => {
    const { admin, ana, luis, boardId } = await world();
    const taskId = await ana.as.mutation(api.tasks.create, {
      boardId,
      title: "T",
      assigneeId: luis.id,
    });
    await luis.as.mutation(api.comments.add, { taskId, body: "Hecho" });
    expect((await ana.as.query(api.notifications.inbox.list, {}))[0]).toMatchObject({
      kind: "commented",
      text: "Luis comentó en «T»",
    });
    expect(await admin.as.query(api.notifications.inbox.list, {})).toHaveLength(0);
  });
});

describe("team notifications are in-app only", () => {
  const deliveries = (t: TestConvex) => t.run((ctx) => ctx.db.query("deliveries").collect());
  const scheduled = (t: TestConvex) =>
    t.run((ctx) => ctx.db.system.query("_scheduled_functions").collect());

  test("assignment, status change, stage rule and comment create no SMS, even with a phone", async () => {
    const { t, admin, ana, luis, boardId, statuses } = await world();
    await admin.as.mutation(api.boards.setStatusRule, {
      statusId: statuses["Hecha"]!,
      notifyAssignee: true,
      notifyCreator: true,
      userIds: [admin.id],
    });
    const taskId = await ana.as.mutation(api.tasks.create, {
      boardId,
      title: "Sofá",
      assigneeId: luis.id,
    });
    await ana.as.mutation(api.tasks.move, { taskId, statusId: statuses["En progreso"]! });
    await ana.as.mutation(api.tasks.move, { taskId, statusId: statuses["Hecha"]! });
    await ana.as.mutation(api.comments.add, { taskId, body: "Entregado" });

    expect((await luis.as.query(api.notifications.inbox.list, {})).map((n) => n.kind)).toEqual([
      "commented",
      "stage_reached",
      "status_changed",
      "assigned",
    ]);
    expect((await admin.as.query(api.notifications.inbox.list, {})).map((n) => n.kind)).toEqual([
      "stage_reached",
    ]);
    expect(await deliveries(t)).toHaveLength(0);
    expect(await scheduled(t)).toHaveLength(0);
  });

  test("deleting a task removes its notifications and keeps its customer deliveries", async () => {
    const { t, admin, ana, luis, boardId, statuses } = await world();
    const taskId = await sendCustomerNotice(admin, ana, {
      boardId,
      statusId: statuses["En progreso"]!,
    });
    await ana.as.mutation(api.tasks.assign, { taskId, assigneeId: luis.id });
    expect(await luis.as.query(api.notifications.inbox.unreadCount, {})).toBe(1);

    await ana.as.mutation(api.tasks.remove, { taskId });
    expect(await t.run((ctx) => ctx.db.query("notifications").collect())).toHaveLength(0);
    // The customer SMS stays as the cost/audit trail.
    expect(await deliveries(t)).toMatchObject([{ recipient: "customer", taskId }]);
  });
});

describe("inbox", () => {
  test("mark one read, then mark all read; users only touch their own", async () => {
    const { ana, luis, boardId } = await world();
    for (const title of ["A", "B", "C"]) {
      await ana.as.mutation(api.tasks.create, { boardId, title, assigneeId: luis.id });
    }
    const inbox = await luis.as.query(api.notifications.inbox.list, {});
    expect(inbox.map((n) => n.text)).toEqual([
      "Ana te asignó: C",
      "Ana te asignó: B",
      "Ana te asignó: A",
    ]);
    await expect(
      ana.as.mutation(api.notifications.inbox.markRead, { notificationId: inbox[0]!._id }),
    ).rejects.toThrow("no existe");
    await luis.as.mutation(api.notifications.inbox.markRead, { notificationId: inbox[0]!._id });
    expect(await luis.as.query(api.notifications.inbox.unreadCount, {})).toBe(2);
    await luis.as.mutation(api.notifications.inbox.markAllRead, {});
    expect(await luis.as.query(api.notifications.inbox.unreadCount, {})).toBe(0);
  });
});
