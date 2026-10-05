import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import {
  isBoardMember,
  requireBoardAccess,
  requireUser,
  requireWritableBoard,
} from "./lib/access";
import { logActivity } from "./lib/activity";
import { toDeadlineAt } from "./lib/deadline";
import { getSettings } from "./lib/settings";
import { endOfColumnOrder } from "./lib/taskOrder";
import { statusFields } from "./lib/taskState";
import { normalizePhone } from "./lib/validation";
import {
  applyCustomerNotice,
  customerLabel,
  customerNoticeValidator,
} from "./notifications/customer";
import { deleteNotificationsForTask, notify } from "./notifications/notify";
import { notifyStatusEntry, ruleForStatus } from "./notifications/stage";
import { priorityValidator } from "./schema";

const MAX_TASKS_PER_BOARD = 2000;

export const PRIORITY_LABELS: Record<Doc<"tasks">["priority"], string> = {
  baja: "Baja",
  media: "Media",
  alta: "Alta",
  urgente: "Urgente",
};

const deadlineInputValidator = v.object({ date: v.string(), time: v.optional(v.string()) });

function requireTitle(title: string): string {
  const value = title.trim();
  if (value.length === 0) throw new ConvexError("El título es obligatorio");
  if (value.length > 200) throw new ConvexError("El título admite como máximo 200 caracteres");
  return value;
}

function cleanDescription(description: string | undefined): string | undefined {
  const value = description?.trim();
  if (!value) return undefined;
  if (value.length > 10_000) {
    throw new ConvexError("La descripción admite como máximo 10.000 caracteres");
  }
  return value;
}

function cleanCustomerName(name: string | undefined): string | undefined {
  const value = name?.trim();
  if (!value) return undefined;
  if (value.length > 80) {
    throw new ConvexError("El nombre del cliente admite como máximo 80 caracteres");
  }
  return value;
}

async function requireTask(ctx: QueryCtx, taskId: Id<"tasks">) {
  const task = await ctx.db.get("tasks", taskId);
  if (!task) throw new ConvexError("La tarea no existe");
  return task;
}

/** Loads a task the signed-in user may edit (board member, board not archived). */
async function requireWritableTask(ctx: QueryCtx, taskId: Id<"tasks">) {
  const task = await requireTask(ctx, taskId);
  const { user, board } = await requireWritableBoard(ctx, task.boardId);
  return { task, user, board };
}

async function requireBoardStatus(
  ctx: QueryCtx,
  boardId: Id<"boards">,
  statusId: Id<"boardStatuses">,
) {
  const status = await ctx.db.get("boardStatuses", statusId);
  if (!status || status.boardId !== boardId) {
    throw new ConvexError("El estado no pertenece a este tablero");
  }
  return status;
}

/** An assignee must be an active member of the task's board. */
async function requireAssignable(ctx: QueryCtx, boardId: Id<"boards">, userId: Id<"users">) {
  const user = await ctx.db.get("users", userId);
  if (!user || !user.isActive || !(await isBoardMember(ctx, boardId, userId))) {
    throw new ConvexError("Solo puedes asignar la tarea a miembros activos del tablero");
  }
  return user;
}

async function nameOf(ctx: QueryCtx, userId: Id<"users"> | undefined) {
  if (!userId) return undefined;
  return (await ctx.db.get("users", userId))?.name;
}

/** Resets reminder markers when the deadline changes (reminders compare against it). */
function deadlineFields(deadlineAt: number | undefined, deadlineHasTime: boolean) {
  return { deadlineAt, deadlineHasTime, reminderSentFor: undefined, overdueSentFor: undefined };
}

// ---------------------------------------------------------------------------
// Mutations

export const create = mutation({
  args: {
    boardId: v.id("boards"),
    title: v.string(),
    description: v.optional(v.string()),
    assigneeId: v.optional(v.id("users")),
    priority: v.optional(priorityValidator),
    deadline: v.optional(deadlineInputValidator),
    customerName: v.optional(v.string()),
    customerPhone: v.optional(v.string()),
    statusId: v.optional(v.id("boardStatuses")),
  },
  returns: v.id("tasks"),
  handler: async (ctx, args) => {
    const { user } = await requireWritableBoard(ctx, args.boardId);
    const title = requireTitle(args.title);
    const status = args.statusId
      ? await requireBoardStatus(ctx, args.boardId, args.statusId)
      : (
          await ctx.db
            .query("boardStatuses")
            .withIndex("by_boardId_and_order", (q) => q.eq("boardId", args.boardId))
            .first()
        );
    if (!status) throw new ConvexError("El tablero no tiene estados");
    if (args.assigneeId) await requireAssignable(ctx, args.boardId, args.assigneeId);
    const { timezone } = await getSettings(ctx);
    const now = Date.now();

    const taskId = await ctx.db.insert("tasks", {
      boardId: args.boardId,
      statusId: status._id,
      title,
      description: cleanDescription(args.description),
      assigneeId: args.assigneeId,
      creatorId: user._id,
      priority: args.priority ?? "media",
      order: await endOfColumnOrder(ctx, args.boardId, status._id),
      customerName: cleanCustomerName(args.customerName),
      customerPhone: normalizePhone(args.customerPhone),
      ...deadlineFields(
        args.deadline ? toDeadlineAt(args.deadline, timezone) : undefined,
        Boolean(args.deadline?.time),
      ),
      ...statusFields({ completedAt: undefined }, status, now),
    });
    await logActivity(ctx, { taskId, actorId: user._id, kind: "created" });
    const task = (await ctx.db.get("tasks", taskId))!;
    if (args.assigneeId) {
      await notify(ctx, {
        recipients: [args.assigneeId],
        kind: "assigned",
        task,
        actorId: user._id,
        text: `${user.name} te asignó: ${task.title}`,
      });
    }
    // Team recipients of the status' rule are notified; a customer is only ever
    // messaged from the confirmation shown when a task is moved (see `move`).
    await notifyStatusEntry(ctx, { task, status, actor: user, via: "create" });
    return taskId;
  },
});

export const update = mutation({
  args: {
    taskId: v.id("tasks"),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    priority: v.optional(priorityValidator),
    // null clears the deadline; omitted leaves it unchanged.
    deadline: v.optional(v.union(deadlineInputValidator, v.null())),
    // "" clears the field; omitted leaves it unchanged.
    customerName: v.optional(v.string()),
    customerPhone: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { task, user } = await requireWritableTask(ctx, args.taskId);
    const patch: Partial<Doc<"tasks">> = {};
    const log = (kind: Doc<"activity">["kind"], from?: string, to?: string) =>
      logActivity(ctx, { taskId: task._id, actorId: user._id, kind, from, to });

    if (args.title !== undefined) {
      const title = requireTitle(args.title);
      if (title !== task.title) {
        patch.title = title;
        await log("title", task.title, title);
      }
    }
    if (args.description !== undefined) {
      const description = cleanDescription(args.description);
      if (description !== task.description) {
        patch.description = description;
        await log("description");
      }
    }
    if (args.priority !== undefined && args.priority !== task.priority) {
      patch.priority = args.priority;
      await log("priority", PRIORITY_LABELS[task.priority], PRIORITY_LABELS[args.priority]);
    }
    if (args.deadline !== undefined) {
      const { timezone } = await getSettings(ctx);
      const deadlineAt = args.deadline ? toDeadlineAt(args.deadline, timezone) : undefined;
      const hasTime = Boolean(args.deadline?.time);
      if (deadlineAt !== task.deadlineAt || hasTime !== task.deadlineHasTime) {
        Object.assign(patch, deadlineFields(deadlineAt, hasTime));
        // Stored as "<ms>|<hasTime>" so the UI can format it in the app timezone.
        const fmt = (at: number | undefined, withTime: boolean) =>
          at === undefined ? undefined : `${at}|${withTime ? 1 : 0}`;
        await log("deadline", fmt(task.deadlineAt, task.deadlineHasTime), fmt(deadlineAt, hasTime));
      }
    }
    if (args.customerName !== undefined || args.customerPhone !== undefined) {
      const customer = {
        customerName:
          args.customerName !== undefined ? cleanCustomerName(args.customerName) : task.customerName,
        customerPhone:
          args.customerPhone !== undefined ? normalizePhone(args.customerPhone) : task.customerPhone,
      };
      if (
        customer.customerName !== task.customerName ||
        customer.customerPhone !== task.customerPhone
      ) {
        Object.assign(patch, customer);
        await log("customer", customerLabel(task), customerLabel(customer));
      }
    }
    if (Object.keys(patch).length > 0) await ctx.db.patch("tasks", task._id, patch);
    return null;
  },
});

export const assign = mutation({
  args: { taskId: v.id("tasks"), assigneeId: v.union(v.id("users"), v.null()) },
  returns: v.null(),
  handler: async (ctx, { taskId, assigneeId }) => {
    const { task, user } = await requireWritableTask(ctx, taskId);
    const next = assigneeId ?? undefined;
    if (next === task.assigneeId) return null;
    const assignee = next ? await requireAssignable(ctx, task.boardId, next) : null;
    await ctx.db.patch("tasks", task._id, { assigneeId: next });
    await logActivity(ctx, {
      taskId: task._id,
      actorId: user._id,
      kind: "assignee",
      from: await nameOf(ctx, task.assigneeId),
      to: assignee?.name,
    });
    if (assignee) {
      await notify(ctx, {
        recipients: [assignee._id],
        kind: "assigned",
        task,
        actorId: user._id,
        text: `${user.name} te asignó: ${task.title}`,
      });
    }
    return null;
  },
});

/**
 * Moves a task to a status column. `order` is computed by the Kanban between
 * the task's new neighbours (fractional ordering); when omitted the task goes
 * to the end of the column.
 *
 * `customerNotice` is what the user confirmed in "Aviso al cliente" when the
 * task enters a status marked "Avisar al cliente". Without it (older clients,
 * scripts) the move goes ahead and the customer is not messaged.
 */
export const move = mutation({
  args: {
    taskId: v.id("tasks"),
    statusId: v.id("boardStatuses"),
    order: v.optional(v.number()),
    customerNotice: v.optional(customerNoticeValidator),
  },
  returns: v.null(),
  handler: async (ctx, { taskId, statusId, order, customerNotice }) => {
    const { task, user } = await requireWritableTask(ctx, taskId);
    if (order !== undefined && !Number.isFinite(order)) {
      throw new ConvexError("Posición no válida");
    }
    const status = await requireBoardStatus(ctx, task.boardId, statusId);
    const entering = statusId !== task.statusId;
    const rule = customerNotice && entering ? await ruleForStatus(ctx, statusId) : null;
    if (customerNotice && !rule?.notifyCustomer) {
      throw new ConvexError("Este estado no avisa al cliente");
    }
    if (!entering && order === undefined) return null;
    await ctx.db.patch("tasks", task._id, {
      statusId,
      order: order ?? (await endOfColumnOrder(ctx, task.boardId, statusId)),
      ...statusFields(task, status, Date.now()),
    });
    if (entering) {
      const previous = await ctx.db.get("boardStatuses", task.statusId);
      await logActivity(ctx, {
        taskId: task._id,
        actorId: user._id,
        kind: "status",
        from: previous?.name,
        to: status.name,
      });
      await notifyStatusEntry(ctx, { task, status, actor: user, via: "move" });
      if (customerNotice && rule) {
        await applyCustomerNotice(ctx, { task, rule, actor: user, notice: customerNotice });
      }
    }
    return null;
  },
});

async function deleteByTask(
  ctx: MutationCtx,
  table: "comments" | "activity",
  taskId: Id<"tasks">,
) {
  for await (const row of ctx.db.query(table).withIndex("by_taskId", (q) => q.eq("taskId", taskId))) {
    await ctx.db.delete(table, row._id);
  }
}

export const remove = mutation({
  args: { taskId: v.id("tasks") },
  returns: v.null(),
  handler: async (ctx, { taskId }) => {
    const { task, user } = await requireWritableTask(ctx, taskId);
    if (user.role !== "admin" && task.creatorId !== user._id) {
      throw new ConvexError("Solo quien creó la tarea o un administrador puede eliminarla");
    }
    await deleteByTask(ctx, "comments", task._id);
    await deleteByTask(ctx, "activity", task._id);
    await deleteNotificationsForTask(ctx, task._id);
    await ctx.db.delete("tasks", task._id);
    return null;
  },
});

// ---------------------------------------------------------------------------
// Queries

const taskCardValidator = v.object({
  _id: v.id("tasks"),
  _creationTime: v.number(),
  boardId: v.id("boards"),
  statusId: v.id("boardStatuses"),
  title: v.string(),
  priority: priorityValidator,
  order: v.number(),
  deadlineAt: v.optional(v.number()),
  deadlineHasTime: v.boolean(),
  isOpen: v.boolean(),
  isOverdue: v.boolean(),
  creatorId: v.id("users"),
  assignee: v.optional(
    v.object({ _id: v.id("users"), name: v.string(), isActive: v.boolean() }),
  ),
  commentCount: v.number(),
  customerName: v.optional(v.string()),
  customerPhone: v.optional(v.string()),
  etaDate: v.optional(v.string()),
  etaFrom: v.optional(v.string()),
  etaTo: v.optional(v.string()),
});

async function toCard(ctx: QueryCtx, task: Doc<"tasks">, now: number) {
  const assignee = task.assigneeId ? await ctx.db.get("users", task.assigneeId) : null;
  const comments = await ctx.db
    .query("comments")
    .withIndex("by_taskId", (q) => q.eq("taskId", task._id))
    .take(100);
  return {
    _id: task._id,
    _creationTime: task._creationTime,
    boardId: task.boardId,
    statusId: task.statusId,
    title: task.title,
    priority: task.priority,
    order: task.order,
    deadlineAt: task.deadlineAt,
    deadlineHasTime: task.deadlineHasTime,
    isOpen: task.isOpen,
    isOverdue: isOverdue(task, now),
    creatorId: task.creatorId,
    assignee: assignee
      ? { _id: assignee._id, name: assignee.name, isActive: assignee.isActive }
      : undefined,
    commentCount: comments.length,
    customerName: task.customerName,
    customerPhone: task.customerPhone,
    etaDate: task.etaDate,
    etaFrom: task.etaFrom,
    etaTo: task.etaTo,
  };
}

export function isOverdue(task: Pick<Doc<"tasks">, "isOpen" | "deadlineAt">, now: number) {
  return task.isOpen && task.deadlineAt !== undefined && task.deadlineAt < now;
}

/** Tasks of a board for the Kanban and list views, with optional filters. */
export const listForBoard = query({
  args: {
    boardId: v.id("boards"),
    now: v.number(),
    mine: v.optional(v.boolean()),
    assigneeId: v.optional(v.id("users")),
    unassigned: v.optional(v.boolean()),
    priority: v.optional(priorityValidator),
    overdue: v.optional(v.boolean()),
    search: v.optional(v.string()),
  },
  returns: v.array(taskCardValidator),
  handler: async (ctx, args) => {
    const { user } = await requireBoardAccess(ctx, args.boardId);
    const search = args.search?.trim();
    const tasks = search
      ? await ctx.db
          .query("tasks")
          .withSearchIndex("search_title", (q) =>
            q.search("title", search).eq("boardId", args.boardId),
          )
          .take(200)
      : await ctx.db
          .query("tasks")
          .withIndex("by_boardId_and_statusId_and_order", (q) => q.eq("boardId", args.boardId))
          .take(MAX_TASKS_PER_BOARD);

    const filtered = tasks.filter(
      (task) =>
        (!args.mine || task.assigneeId === user._id) &&
        (!args.assigneeId || task.assigneeId === args.assigneeId) &&
        (!args.unassigned || task.assigneeId === undefined) &&
        (!args.priority || task.priority === args.priority) &&
        (!args.overdue || isOverdue(task, args.now)),
    );
    return await Promise.all(filtered.map((task) => toCard(ctx, task, args.now)));
  },
});

/** The signed-in user's open tasks across boards, soonest deadline first. */
export const myOpen = query({
  args: { now: v.number() },
  returns: v.array(
    v.object({
      task: taskCardValidator,
      boardName: v.string(),
      statusName: v.string(),
    }),
  ),
  handler: async (ctx, { now }) => {
    const user = await requireUser(ctx);
    const tasks = await ctx.db
      .query("tasks")
      .withIndex("by_assigneeId_and_isOpen_and_deadlineAt", (q) =>
        q.eq("assigneeId", user._id).eq("isOpen", true),
      )
      .take(500);
    // The index sorts missing deadlines first; the page wants them last.
    const sorted = [
      ...tasks.filter((t) => t.deadlineAt !== undefined),
      ...tasks.filter((t) => t.deadlineAt === undefined),
    ];
    const rows = await Promise.all(
      sorted.map(async (task) => {
        const [board, status] = await Promise.all([
          ctx.db.get("boards", task.boardId),
          ctx.db.get("boardStatuses", task.statusId),
        ]);
        if (!board || board.isArchived) return null;
        if (user.role !== "admin" && !(await isBoardMember(ctx, board._id, user._id))) return null;
        return {
          task: await toCard(ctx, task, now),
          boardName: board.name,
          statusName: status?.name ?? "",
        };
      }),
    );
    return rows.filter((row) => row !== null);
  },
});

/** Full task detail for the task sheet. */
export const get = query({
  args: { taskId: v.id("tasks"), now: v.number() },
  returns: v.object({
    task: v.object({
      ...taskCardValidator.fields,
      description: v.optional(v.string()),
      completedAt: v.optional(v.number()),
      creatorName: v.string(),
    }),
    boardName: v.string(),
    boardArchived: v.boolean(),
    canDelete: v.boolean(),
  }),
  handler: async (ctx, { taskId, now }) => {
    const task = await requireTask(ctx, taskId);
    const { user, board } = await requireBoardAccess(ctx, task.boardId);
    return {
      task: {
        ...(await toCard(ctx, task, now)),
        description: task.description,
        completedAt: task.completedAt,
        creatorName: (await nameOf(ctx, task.creatorId)) ?? "",
      },
      boardName: board.name,
      boardArchived: board.isArchived,
      canDelete: user.role === "admin" || task.creatorId === user._id,
    };
  },
});

export const activity = query({
  args: { taskId: v.id("tasks") },
  returns: v.array(
    v.object({
      _id: v.id("activity"),
      _creationTime: v.number(),
      actorName: v.string(),
      kind: v.string(),
      from: v.optional(v.string()),
      to: v.optional(v.string()),
    }),
  ),
  handler: async (ctx, { taskId }) => {
    const task = await requireTask(ctx, taskId);
    await requireBoardAccess(ctx, task.boardId);
    const entries = await ctx.db
      .query("activity")
      .withIndex("by_taskId", (q) => q.eq("taskId", taskId))
      .order("desc")
      .take(200);
    return await Promise.all(
      entries.map(async (entry) => ({
        _id: entry._id,
        _creationTime: entry._creationTime,
        actorName: (await nameOf(ctx, entry.actorId)) ?? "Alguien",
        kind: entry.kind,
        from: entry.from,
        to: entry.to,
      })),
    );
  },
});
