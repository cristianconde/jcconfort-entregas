import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import { insertTask, seedBoard, seedUser, setup, setupWithAuth } from "./test.helpers";

const NOW = Date.UTC(2026, 9, 1, 12);
const HOUR = 3_600_000;

describe("boards", () => {
  test("create adds default statuses with one done status and the admin as member", async () => {
    const t = setup();
    const admin = await seedUser(t, { role: "admin" });
    const { boardId } = await seedBoard(admin, t);
    const { statuses, members } = await admin.as.query(api.boards.get, { boardId });
    expect(statuses.map((s) => [s.name, s.isDone])).toEqual([
      ["Pendiente", false],
      ["En progreso", false],
      ["Bloqueada", false],
      ["Hecha", true],
    ]);
    expect(members.map((m) => m._id)).toEqual([admin.id]);
  });

  test("members cannot create boards", async () => {
    const t = setup();
    const member = await seedUser(t);
    await expect(member.as.mutation(api.boards.create, { name: "X" })).rejects.toThrow(
      "administrador",
    );
  });

  test("members see only their non-archived boards; admins see all", async () => {
    const t = setup();
    const admin = await seedUser(t, { role: "admin" });
    const member = await seedUser(t);
    const mine = await seedBoard(admin, t, [member.id]);
    await seedBoard(admin, t);
    const archived = await seedBoard(admin, t, [member.id]);
    await admin.as.mutation(api.boards.setArchived, { boardId: archived.boardId, isArchived: true });

    const memberBoards = await member.as.query(api.boards.listMine, { now: NOW });
    expect(memberBoards.map((b) => b._id)).toEqual([mine.boardId]);
    expect(await admin.as.query(api.boards.listMine, { now: NOW })).toHaveLength(2);
    expect(
      await admin.as.query(api.boards.listMine, { now: NOW, includeArchived: true }),
    ).toHaveLength(3);
  });

  test("non-members get no access to a board", async () => {
    const t = setup();
    const admin = await seedUser(t, { role: "admin" });
    const outsider = await seedUser(t);
    const { boardId } = await seedBoard(admin, t);
    await expect(outsider.as.query(api.boards.get, { boardId })).rejects.toThrow(
      "No tienes acceso a este tablero",
    );
  });

  test("overview counts open and overdue tasks", async () => {
    const t = setup();
    const admin = await seedUser(t, { role: "admin" });
    const { boardId, statuses } = await seedBoard(admin, t);
    const base = { boardId, statusId: statuses["Pendiente"]!, creatorId: admin.id };
    await insertTask(t, { ...base, deadlineAt: NOW - HOUR });
    await insertTask(t, { ...base, deadlineAt: NOW - 2 * HOUR });
    await insertTask(t, { ...base, deadlineAt: NOW + HOUR });
    await insertTask(t, base);
    await insertTask(t, { ...base });
    await insertTask(t, {
      ...base,
      statusId: statuses["Hecha"]!,
      isOpen: false,
      deadlineAt: NOW - HOUR,
    });
    const [board] = await admin.as.query(api.boards.listMine, { now: NOW });
    expect(board).toMatchObject({ openCount: 5, overdueCount: 2 });
  });
});

describe("membership", () => {
  test("removing a member unassigns their open tasks and logs activity", async () => {
    const t = setup();
    const admin = await seedUser(t, { role: "admin" });
    const member = await seedUser(t, { name: "Luis" });
    const { boardId, statuses } = await seedBoard(admin, t, [member.id]);
    const open = await insertTask(t, {
      boardId,
      statusId: statuses["Pendiente"]!,
      creatorId: admin.id,
      assigneeId: member.id,
    });
    const done = await insertTask(t, {
      boardId,
      statusId: statuses["Hecha"]!,
      creatorId: admin.id,
      assigneeId: member.id,
      isOpen: false,
    });
    await admin.as.mutation(api.boards.removeMember, { boardId, userId: member.id });

    const [openTask, doneTask] = await t.run(async (ctx) => [
      await ctx.db.get("tasks", open),
      await ctx.db.get("tasks", done),
    ]);
    expect(openTask?.assigneeId).toBeUndefined();
    expect(doneTask?.assigneeId).toBe(member.id);
    const activity = await t.run((ctx) => ctx.db.query("activity").collect());
    expect(activity).toMatchObject([{ taskId: open, kind: "assignee", from: "Luis" }]);
    await expect(member.as.query(api.boards.get, { boardId })).rejects.toThrow("No tienes acceso");
  });

  test("assignable members excludes deactivated users", async () => {
    const t = setupWithAuth();
    const admin = await seedUser(t, { role: "admin", name: "Admin" });
    const active = await seedUser(t, { name: "Activa" });
    const inactive = await seedUser(t, { name: "Inactivo" });
    const { boardId } = await seedBoard(admin, t, [active.id, inactive.id]);
    await admin.as.mutation(api.users.setActive, { userId: inactive.id, isActive: false });
    const assignable = await active.as.query(api.boards.assignableMembers, { boardId });
    expect(assignable.map((m) => m.name)).toEqual(["Activa", "Admin"]);
  });
});

describe("statuses", () => {
  test("new status is inserted before the done status", async () => {
    const t = setup();
    const admin = await seedUser(t, { role: "admin" });
    const { boardId } = await seedBoard(admin, t);
    await admin.as.mutation(api.boards.addStatus, { boardId, name: "En revisión" });
    const { statuses } = await admin.as.query(api.boards.get, { boardId });
    expect(statuses.map((s) => s.name)).toEqual([
      "Pendiente",
      "En progreso",
      "Bloqueada",
      "En revisión",
      "Hecha",
    ]);
  });

  test("removing a status with tasks requires a target and moves the tasks", async () => {
    const t = setup();
    const admin = await seedUser(t, { role: "admin" });
    const { boardId, statuses } = await seedBoard(admin, t);
    const taskId = await insertTask(t, {
      boardId,
      statusId: statuses["Bloqueada"]!,
      creatorId: admin.id,
    });
    await expect(
      admin.as.mutation(api.boards.removeStatus, { statusId: statuses["Bloqueada"]! }),
    ).rejects.toThrow("Elige a qué estado mover");
    await admin.as.mutation(api.boards.removeStatus, {
      statusId: statuses["Bloqueada"]!,
      moveTasksTo: statuses["Hecha"]!,
    });
    const task = await t.run((ctx) => ctx.db.get("tasks", taskId));
    expect(task).toMatchObject({ statusId: statuses["Hecha"], isOpen: false });
    expect(task?.completedAt).toBeTypeOf("number");
    const { statuses: after } = await admin.as.query(api.boards.get, { boardId });
    expect(after.map((s) => [s.name, s.order])).toEqual([
      ["Pendiente", 0],
      ["En progreso", 1],
      ["Hecha", 2],
    ]);
  });

  test("cannot remove the done status or the last status", async () => {
    const t = setup();
    const admin = await seedUser(t, { role: "admin" });
    const { boardId, statuses } = await seedBoard(admin, t);
    await expect(
      admin.as.mutation(api.boards.removeStatus, { statusId: statuses["Hecha"]! }),
    ).rejects.toThrow("Marca otro estado");
    for (const name of ["Pendiente", "En progreso", "Bloqueada"]) {
      await admin.as.mutation(api.boards.removeStatus, { statusId: statuses[name]! });
    }
    await expect(
      admin.as.mutation(api.boards.removeStatus, { statusId: statuses["Hecha"]! }),
    ).rejects.toThrow("al menos un estado");
    expect((await admin.as.query(api.boards.get, { boardId })).statuses).toHaveLength(1);
  });

  test("changing the done status keeps exactly one done and re-syncs tasks", async () => {
    const t = setup();
    const admin = await seedUser(t, { role: "admin" });
    const { boardId, statuses } = await seedBoard(admin, t);
    const inHecha = await insertTask(t, {
      boardId,
      statusId: statuses["Hecha"]!,
      creatorId: admin.id,
      isOpen: false,
    });
    await t.run((ctx) => ctx.db.patch("tasks", inHecha, { completedAt: 1 }));
    const inBloqueada = await insertTask(t, {
      boardId,
      statusId: statuses["Bloqueada"]!,
      creatorId: admin.id,
    });
    await admin.as.mutation(api.boards.setDoneStatus, { statusId: statuses["Bloqueada"]! });

    const { statuses: after } = await admin.as.query(api.boards.get, { boardId });
    expect(after.filter((s) => s.isDone).map((s) => s.name)).toEqual(["Bloqueada"]);
    const [a, b] = await t.run(async (ctx) => [
      await ctx.db.get("tasks", inHecha),
      await ctx.db.get("tasks", inBloqueada),
    ]);
    expect(a?.isOpen).toBe(true);
    expect(a?.completedAt).toBeUndefined();
    expect(b?.isOpen).toBe(false);
    expect(b?.completedAt).toBeTypeOf("number");
  });

  test("reorder must include every status", async () => {
    const t = setup();
    const admin = await seedUser(t, { role: "admin" });
    const { boardId, statuses } = await seedBoard(admin, t);
    await expect(
      admin.as.mutation(api.boards.reorderStatuses, {
        boardId,
        orderedIds: [statuses["Hecha"]!],
      }),
    ).rejects.toThrow("todos los estados");
    const reversed = Object.values(statuses).reverse();
    await admin.as.mutation(api.boards.reorderStatuses, { boardId, orderedIds: reversed });
    const { statuses: after } = await admin.as.query(api.boards.get, { boardId });
    expect(after.map((s) => s._id)).toEqual(reversed);
  });
});
