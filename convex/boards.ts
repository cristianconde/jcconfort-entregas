import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { requireAdmin, requireBoardAccess, requireUser } from "./lib/access";
import { logActivity } from "./lib/activity";
import { DEFAULT_CUSTOMER_TEMPLATE, validateTemplate } from "./lib/customerMessage";
import { getSettings } from "./lib/settings";
import { ORDER_STEP, endOfColumnOrder } from "./lib/taskOrder";
import { statusFields } from "./lib/taskState";
import { smsChannel } from "./notifications/channels/sms";
import { ruleForStatus } from "./notifications/stage";

export const DEFAULT_STATUSES = [
  { name: "Pendiente", isDone: false },
  { name: "En progreso", isDone: false },
  { name: "Bloqueada", isDone: false },
  { name: "Hecha", isDone: true },
];

// Upper bound for per-board scans; this is a small-team tool (design: Risks).
const MAX_TASKS_PER_BOARD = 2000;

function requireBoardName(name: string): string {
  const value = name.trim();
  if (value.length < 1 || value.length > 80) {
    throw new ConvexError("El nombre del tablero debe tener entre 1 y 80 caracteres");
  }
  return value;
}

function requireStatusName(name: string): string {
  const value = name.trim();
  if (value.length < 1 || value.length > 40) {
    throw new ConvexError("El nombre del estado debe tener entre 1 y 40 caracteres");
  }
  return value;
}

function cleanDescription(description: string | undefined): string | undefined {
  const value = description?.trim();
  return value ? value.slice(0, 2000) : undefined;
}

async function getStatuses(ctx: QueryCtx, boardId: Id<"boards">) {
  return await ctx.db
    .query("boardStatuses")
    .withIndex("by_boardId_and_order", (q) => q.eq("boardId", boardId))
    .take(50);
}

async function requireStatus(ctx: QueryCtx, statusId: Id<"boardStatuses">) {
  const status = await ctx.db.get("boardStatuses", statusId);
  if (!status) throw new ConvexError("El estado no existe");
  return status;
}

async function tasksInStatus(ctx: QueryCtx, status: Doc<"boardStatuses">) {
  return await ctx.db
    .query("tasks")
    .withIndex("by_boardId_and_statusId_and_order", (q) =>
      q.eq("boardId", status.boardId).eq("statusId", status._id),
    )
    .take(MAX_TASKS_PER_BOARD);
}

/** Re-derives isOpen/completedAt for every task in a status after its isDone changed. */
async function syncTasksWithStatus(ctx: MutationCtx, status: Doc<"boardStatuses">) {
  const now = Date.now();
  for (const task of await tasksInStatus(ctx, status)) {
    await ctx.db.patch("tasks", task._id, statusFields(task, status, now));
  }
}

async function countOpenAndOverdue(ctx: QueryCtx, boardId: Id<"boards">, now: number) {
  const open = await ctx.db
    .query("tasks")
    .withIndex("by_boardId_and_isOpen_and_deadlineAt", (q) =>
      q.eq("boardId", boardId).eq("isOpen", true),
    )
    .take(MAX_TASKS_PER_BOARD);
  const overdue = open.filter((task) => task.deadlineAt !== undefined && task.deadlineAt < now);
  return { openCount: open.length, overdueCount: overdue.length };
}

// ---------------------------------------------------------------------------
// Boards

export const create = mutation({
  args: { name: v.string(), description: v.optional(v.string()) },
  returns: v.id("boards"),
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const boardId = await ctx.db.insert("boards", {
      name: requireBoardName(args.name),
      description: cleanDescription(args.description),
      isArchived: false,
    });
    for (const [order, status] of DEFAULT_STATUSES.entries()) {
      await ctx.db.insert("boardStatuses", { boardId, order, ...status });
    }
    await ctx.db.insert("boardMembers", { boardId, userId: admin._id });
    return boardId;
  },
});

export const update = mutation({
  args: { boardId: v.id("boards"), name: v.string(), description: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    await ctx.db.patch("boards", args.boardId, {
      name: requireBoardName(args.name),
      description: cleanDescription(args.description),
    });
    return null;
  },
});

export const setArchived = mutation({
  args: { boardId: v.id("boards"), isArchived: v.boolean() },
  returns: v.null(),
  handler: async (ctx, { boardId, isArchived }) => {
    await requireAdmin(ctx);
    await ctx.db.patch("boards", boardId, { isArchived });
    return null;
  },
});

const boardSummaryValidator = v.object({
  _id: v.id("boards"),
  name: v.string(),
  description: v.optional(v.string()),
  isArchived: v.boolean(),
  openCount: v.number(),
  overdueCount: v.number(),
});

/**
 * Boards visible to the signed-in user with open/overdue counts. `now` comes
 * from the client (queries must not read the clock).
 */
export const listMine = query({
  args: { now: v.number(), includeArchived: v.optional(v.boolean()) },
  returns: v.array(boardSummaryValidator),
  handler: async (ctx, { now, includeArchived }) => {
    const user = await requireUser(ctx);
    let boards: Doc<"boards">[];
    if (user.role === "admin") {
      boards = includeArchived
        ? await ctx.db.query("boards").take(200)
        : await ctx.db
            .query("boards")
            .withIndex("by_isArchived", (q) => q.eq("isArchived", false))
            .take(200);
    } else {
      const memberships = await ctx.db
        .query("boardMembers")
        .withIndex("by_userId", (q) => q.eq("userId", user._id))
        .take(200);
      const loaded = await Promise.all(memberships.map((m) => ctx.db.get("boards", m.boardId)));
      boards = loaded.filter((b): b is Doc<"boards"> => b !== null && !b.isArchived);
    }
    const summaries = await Promise.all(
      boards.map(async (board) => ({
        _id: board._id,
        name: board.name,
        description: board.description,
        isArchived: board.isArchived,
        ...(await countOpenAndOverdue(ctx, board._id, now)),
      })),
    );
    return summaries.sort(
      (a, b) => Number(a.isArchived) - Number(b.isArchived) || a.name.localeCompare(b.name, "es"),
    );
  },
});

const statusValidator = v.object({
  _id: v.id("boardStatuses"),
  name: v.string(),
  order: v.number(),
  isDone: v.boolean(),
  // "Avisar al cliente": moving a task into this status asks for the customer
  // notice confirmation, prefilled from the template.
  notifiesCustomer: v.boolean(),
  customerTemplate: v.optional(v.string()),
});

const memberValidator = v.object({
  _id: v.id("users"),
  name: v.string(),
  email: v.string(),
  isActive: v.boolean(),
  phone: v.optional(v.string()),
});

/** Board details for the board page: statuses in order and members. */
export const get = query({
  args: { boardId: v.id("boards") },
  returns: v.object({
    board: v.object({
      _id: v.id("boards"),
      name: v.string(),
      description: v.optional(v.string()),
      isArchived: v.boolean(),
    }),
    statuses: v.array(statusValidator),
    members: v.array(memberValidator),
    // False when "SMS a clientes" is off or the SMS provider is not configured.
    customerSmsAvailable: v.boolean(),
  }),
  handler: async (ctx, { boardId }) => {
    const { board } = await requireBoardAccess(ctx, boardId);
    const statuses = await getStatuses(ctx, boardId);
    return {
      board: {
        _id: board._id,
        name: board.name,
        description: board.description,
        isArchived: board.isArchived,
      },
      statuses: await Promise.all(
        statuses.map(async ({ _id, name, order, isDone }) => {
          const rule = await ruleForStatus(ctx, _id);
          const notifiesCustomer = rule?.notifyCustomer ?? false;
          return {
            _id,
            name,
            order,
            isDone,
            notifiesCustomer,
            customerTemplate: notifiesCustomer
              ? (rule?.customerTemplate ?? DEFAULT_CUSTOMER_TEMPLATE)
              : undefined,
          };
        }),
      ),
      members: await listMembers(ctx, boardId),
      customerSmsAvailable: smsChannel.isAvailable(await getSettings(ctx)),
    };
  },
});

async function listMembers(ctx: QueryCtx, boardId: Id<"boards">) {
  const memberships = await ctx.db
    .query("boardMembers")
    .withIndex("by_boardId_and_userId", (q) => q.eq("boardId", boardId))
    .take(200);
  const users = await Promise.all(memberships.map((m) => ctx.db.get("users", m.userId)));
  return users
    .filter((u): u is Doc<"users"> => u !== null)
    .map((u) => ({ _id: u._id, name: u.name, email: u.email, isActive: u.isActive, phone: u.phone }))
    .sort((a, b) => a.name.localeCompare(b.name, "es"));
}

/** Active board members: the only valid choices when assigning a task. */
export const assignableMembers = query({
  args: { boardId: v.id("boards") },
  returns: v.array(v.object({ _id: v.id("users"), name: v.string() })),
  handler: async (ctx, { boardId }) => {
    await requireBoardAccess(ctx, boardId);
    return (await listMembers(ctx, boardId))
      .filter((m) => m.isActive)
      .map(({ _id, name }) => ({ _id, name }));
  },
});

// ---------------------------------------------------------------------------
// Membership

export const addMember = mutation({
  args: { boardId: v.id("boards"), userId: v.id("users") },
  returns: v.null(),
  handler: async (ctx, { boardId, userId }) => {
    await requireAdmin(ctx);
    if (!(await ctx.db.get("boards", boardId))) throw new ConvexError("El tablero no existe");
    const user = await ctx.db.get("users", userId);
    if (!user) throw new ConvexError("El usuario no existe");
    const existing = await ctx.db
      .query("boardMembers")
      .withIndex("by_boardId_and_userId", (q) => q.eq("boardId", boardId).eq("userId", userId))
      .unique();
    if (!existing) await ctx.db.insert("boardMembers", { boardId, userId });
    return null;
  },
});

export const removeMember = mutation({
  args: { boardId: v.id("boards"), userId: v.id("users") },
  returns: v.null(),
  handler: async (ctx, { boardId, userId }) => {
    const admin = await requireAdmin(ctx);
    const membership = await ctx.db
      .query("boardMembers")
      .withIndex("by_boardId_and_userId", (q) => q.eq("boardId", boardId).eq("userId", userId))
      .unique();
    if (!membership) return null;
    await ctx.db.delete("boardMembers", membership._id);

    const user = await ctx.db.get("users", userId);
    const assigned = await ctx.db
      .query("tasks")
      .withIndex("by_boardId_and_assigneeId", (q) =>
        q.eq("boardId", boardId).eq("assigneeId", userId),
      )
      .take(MAX_TASKS_PER_BOARD);
    for (const task of assigned.filter((t) => t.isOpen)) {
      await ctx.db.patch("tasks", task._id, { assigneeId: undefined });
      await logActivity(ctx, {
        taskId: task._id,
        actorId: admin._id,
        kind: "assignee",
        from: user?.name,
      });
    }
    return null;
  },
});

// ---------------------------------------------------------------------------
// Statuses

export const addStatus = mutation({
  args: { boardId: v.id("boards"), name: v.string() },
  returns: v.id("boardStatuses"),
  handler: async (ctx, { boardId, name }) => {
    await requireAdmin(ctx);
    const statuses = await getStatuses(ctx, boardId);
    if (statuses.length >= 12) throw new ConvexError("Un tablero admite como máximo 12 estados");
    // New statuses go right before the done status, the usual spot for a new step.
    const done = statuses.find((s) => s.isDone);
    const statusId = await ctx.db.insert("boardStatuses", {
      boardId,
      name: requireStatusName(name),
      order: statuses.length,
      isDone: false,
    });
    if (done) {
      const ordered = [...statuses.filter((s) => s._id !== done._id).map((s) => s._id), statusId, done._id];
      await applyOrder(ctx, ordered);
    }
    return statusId;
  },
});

export const renameStatus = mutation({
  args: { statusId: v.id("boardStatuses"), name: v.string() },
  returns: v.null(),
  handler: async (ctx, { statusId, name }) => {
    await requireAdmin(ctx);
    await requireStatus(ctx, statusId);
    await ctx.db.patch("boardStatuses", statusId, { name: requireStatusName(name) });
    return null;
  },
});

async function applyOrder(ctx: MutationCtx, orderedIds: Id<"boardStatuses">[]) {
  for (const [order, id] of orderedIds.entries()) {
    await ctx.db.patch("boardStatuses", id, { order });
  }
}

export const reorderStatuses = mutation({
  args: { boardId: v.id("boards"), orderedIds: v.array(v.id("boardStatuses")) },
  returns: v.null(),
  handler: async (ctx, { boardId, orderedIds }) => {
    await requireAdmin(ctx);
    const statuses = await getStatuses(ctx, boardId);
    const current = new Set(statuses.map((s) => s._id));
    if (orderedIds.length !== current.size || !orderedIds.every((id) => current.has(id))) {
      throw new ConvexError("El orden debe incluir todos los estados del tablero");
    }
    await applyOrder(ctx, orderedIds);
    return null;
  },
});

export const setDoneStatus = mutation({
  args: { statusId: v.id("boardStatuses") },
  returns: v.null(),
  handler: async (ctx, { statusId }) => {
    await requireAdmin(ctx);
    const target = await requireStatus(ctx, statusId);
    if (target.isDone) return null;
    for (const status of await getStatuses(ctx, target.boardId)) {
      if (status.isDone) {
        await ctx.db.patch("boardStatuses", status._id, { isDone: false });
        await syncTasksWithStatus(ctx, { ...status, isDone: false });
      }
    }
    await ctx.db.patch("boardStatuses", target._id, { isDone: true });
    await syncTasksWithStatus(ctx, { ...target, isDone: true });
    return null;
  },
});

export const removeStatus = mutation({
  args: {
    statusId: v.id("boardStatuses"),
    moveTasksTo: v.optional(v.id("boardStatuses")),
  },
  returns: v.null(),
  handler: async (ctx, { statusId, moveTasksTo }) => {
    await requireAdmin(ctx);
    const status = await requireStatus(ctx, statusId);
    const statuses = await getStatuses(ctx, status.boardId);
    if (statuses.length <= 1) {
      throw new ConvexError("El tablero debe tener al menos un estado");
    }
    if (status.isDone) {
      throw new ConvexError("Marca otro estado como «hecho» antes de eliminar este");
    }
    const tasks = await tasksInStatus(ctx, status);
    if (tasks.length > 0) {
      if (!moveTasksTo || moveTasksTo === statusId) {
        throw new ConvexError("Elige a qué estado mover las tareas de este estado");
      }
      const target = await requireStatus(ctx, moveTasksTo);
      if (target.boardId !== status.boardId) {
        throw new ConvexError("El estado de destino no pertenece a este tablero");
      }
      const now = Date.now();
      const base = await endOfColumnOrder(ctx, target.boardId, target._id);
      for (const [index, task] of tasks.entries()) {
        await ctx.db.patch("tasks", task._id, {
          statusId: target._id,
          order: base + index * ORDER_STEP,
          ...statusFields(task, target, now),
        });
      }
    }
    // Its stage rule goes with it; the moves above deliberately notify no one.
    const rule = await ruleForStatus(ctx, statusId);
    if (rule) await ctx.db.delete("statusRules", rule._id);
    await ctx.db.delete("boardStatuses", statusId);
    await applyOrder(
      ctx,
      statuses.filter((s) => s._id !== statusId).map((s) => s._id),
    );
    return null;
  },
});

// ---------------------------------------------------------------------------
// Stage notification rules (one per status, see design §5)

const MAX_RULE_USERS = 20;

const statusRuleValidator = v.object({
  statusId: v.id("boardStatuses"),
  notifyAssignee: v.boolean(),
  notifyCreator: v.boolean(),
  userIds: v.array(v.id("users")),
  notifyCustomer: v.optional(v.boolean()),
  // Only used with notifyCustomer; the default template when omitted or empty.
  customerTemplate: v.optional(v.string()),
});

export const getStatusRules = query({
  args: { boardId: v.id("boards") },
  returns: v.array(statusRuleValidator),
  handler: async (ctx, { boardId }) => {
    await requireAdmin(ctx);
    const rules = await Promise.all(
      (await getStatuses(ctx, boardId)).map((status) => ruleForStatus(ctx, status._id)),
    );
    return rules
      .filter((rule) => rule !== null)
      .map((rule) => ({
        statusId: rule.statusId,
        notifyAssignee: rule.notifyAssignee,
        notifyCreator: rule.notifyCreator,
        userIds: rule.userIds,
        notifyCustomer: rule.notifyCustomer ?? false,
        customerTemplate: rule.customerTemplate,
      }));
  },
});

export const setStatusRule = mutation({
  args: statusRuleValidator.fields,
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const status = await requireStatus(ctx, args.statusId);
    const userIds = [...new Set(args.userIds)];
    const notifyCustomer = args.notifyCustomer ?? false;
    if (!args.notifyAssignee && !args.notifyCreator && userIds.length === 0 && !notifyCustomer) {
      throw new ConvexError("Elige al menos un destinatario");
    }
    if (userIds.length > MAX_RULE_USERS) {
      throw new ConvexError(`Elige como máximo ${MAX_RULE_USERS} usuarios`);
    }
    for (const userId of userIds) {
      const user = await ctx.db.get("users", userId);
      if (!user || !user.isActive) throw new ConvexError("Solo puedes elegir usuarios activos");
    }
    const value = {
      boardId: status.boardId,
      statusId: status._id,
      notifyAssignee: args.notifyAssignee,
      notifyCreator: args.notifyCreator,
      userIds,
      notifyCustomer,
      customerTemplate: notifyCustomer
        ? validateTemplate(args.customerTemplate?.trim() || DEFAULT_CUSTOMER_TEMPLATE)
        : undefined,
    };
    const existing = await ruleForStatus(ctx, status._id);
    if (existing) {
      await ctx.db.replace("statusRules", existing._id, value);
    } else {
      await ctx.db.insert("statusRules", value);
    }
    return null;
  },
});

export const clearStatusRule = mutation({
  args: { statusId: v.id("boardStatuses") },
  returns: v.null(),
  handler: async (ctx, { statusId }) => {
    await requireAdmin(ctx);
    const rule = await ruleForStatus(ctx, statusId);
    if (rule) await ctx.db.delete("statusRules", rule._id);
    return null;
  },
});
