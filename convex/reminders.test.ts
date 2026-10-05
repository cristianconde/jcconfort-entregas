import { expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import { insertTask, seedBoard, seedUser, setup } from "./test.helpers";

const HOUR = 3_600_000;
const NOW = Date.UTC(2026, 9, 1, 10);

async function world() {
  const t = setup();
  const admin = await seedUser(t, { role: "admin" });
  const luis = await seedUser(t, { name: "Luis", phone: "+34600000002" });
  const board = await seedBoard(admin, t, [luis.id]);
  const task = (deadlineAt: number, extra: { isOpen?: boolean; assigneeId?: typeof luis.id } = {}) =>
    insertTask(t, {
      boardId: board.boardId,
      statusId: board.statuses["Pendiente"]!,
      creatorId: admin.id,
      assigneeId: luis.id,
      title: "Entregar sofá",
      deadlineAt,
      ...extra,
    });
  const run = (now: number) => t.mutation(internal.reminders.run, { now });
  const inbox = () => luis.as.query(api.notifications.inbox.list, {});
  return { t, admin, luis, task, run, inbox, ...board };
}

test("reminder is sent once within the lead time", async () => {
  const { task, run, inbox } = await world();
  await task(NOW + 20 * HOUR);
  await run(NOW);
  await run(NOW + HOUR);
  const notifications = await inbox();
  expect(notifications).toHaveLength(1);
  expect(notifications[0]).toMatchObject({ kind: "deadline_soon" });
  expect(notifications[0]!.text).toMatch(/^Recordatorio: «Entregar sofá» vence el 2 oct 2026/);
});

test("tasks outside the lead time are not reminded yet", async () => {
  const { task, run, inbox } = await world();
  await task(NOW + 30 * HOUR);
  await run(NOW);
  expect(await inbox()).toHaveLength(0);
});

test("lead time comes from settings", async () => {
  const { admin, task, run, inbox } = await world();
  await admin.as.mutation(api.settings.update, {
    appName: "X",
    timezone: "Europe/Madrid",
    reminderLeadHours: 48,
    enabledChannels: ["sms"],
  });
  await task(NOW + 30 * HOUR);
  await run(NOW);
  expect(await inbox()).toHaveLength(1);
});

test("moving the deadline re-arms the reminder", async () => {
  const { luis, task, run, inbox } = await world();
  const taskId = await task(NOW + 20 * HOUR);
  await run(NOW);
  await luis.as.mutation(api.tasks.update, { taskId, deadline: { date: "2026-10-03" } });
  await run(NOW);
  expect(await inbox()).toHaveLength(1); // new deadline is outside the lead time
  const newDeadline = Date.UTC(2026, 9, 3, 21, 59, 59, 999);
  await run(newDeadline - 10 * HOUR);
  expect((await inbox()).map((n) => n.kind)).toEqual(["deadline_soon", "deadline_soon"]);
});

test("overdue alert is sent once and replaces the reminder", async () => {
  const { task, run, inbox } = await world();
  await task(NOW - HOUR);
  await run(NOW);
  await run(NOW + HOUR);
  const notifications = await inbox();
  expect(notifications.map((n) => n.kind)).toEqual(["overdue"]);
  expect(notifications[0]!.text).toMatch(/está vencida desde el 1 oct 2026/);
});

test("done or unassigned tasks are skipped", async () => {
  const { t, task, run, inbox } = await world();
  await task(NOW - HOUR, { isOpen: false });
  await task(NOW + HOUR, { assigneeId: undefined });
  await run(NOW);
  expect(await inbox()).toHaveLength(0);
  void t;
});

test("reminders and overdue alerts are in-app only: no SMS", async () => {
  const { t, task, run, inbox } = await world();
  await task(NOW + HOUR);
  await task(NOW - HOUR);
  await run(NOW);
  expect((await inbox()).map((n) => n.kind).sort()).toEqual(["deadline_soon", "overdue"]);
  expect(await t.run((ctx) => ctx.db.query("deliveries").collect())).toHaveLength(0);
});
