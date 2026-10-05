import { ConvexError, v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { mutation, query, type QueryCtx } from "./_generated/server";
import { requireBoardAccess, requireWritableBoard } from "./lib/access";
import { logActivity } from "./lib/activity";
import { notify } from "./notifications/notify";

function requireBody(body: string): string {
  const value = body.trim();
  if (value.length < 1 || value.length > 5000) {
    throw new ConvexError("El comentario debe tener entre 1 y 5000 caracteres");
  }
  return value;
}

async function requireTask(ctx: QueryCtx, taskId: Id<"tasks">) {
  const task = await ctx.db.get("tasks", taskId);
  if (!task) throw new ConvexError("La tarea no existe");
  return task;
}

async function requireComment(ctx: QueryCtx, commentId: Id<"comments">) {
  const comment = await ctx.db.get("comments", commentId);
  if (!comment) throw new ConvexError("El comentario no existe");
  const task = await requireTask(ctx, comment.taskId);
  const { user } = await requireWritableBoard(ctx, task.boardId);
  return { comment, task, user };
}

export const list = query({
  args: { taskId: v.id("tasks") },
  returns: v.array(
    v.object({
      _id: v.id("comments"),
      _creationTime: v.number(),
      body: v.string(),
      editedAt: v.optional(v.number()),
      authorId: v.id("users"),
      authorName: v.string(),
      canEdit: v.boolean(),
      canDelete: v.boolean(),
    }),
  ),
  handler: async (ctx, { taskId }) => {
    const task = await requireTask(ctx, taskId);
    const { user } = await requireBoardAccess(ctx, task.boardId);
    const comments = await ctx.db
      .query("comments")
      .withIndex("by_taskId", (q) => q.eq("taskId", taskId))
      .take(500);
    return await Promise.all(
      comments.map(async (comment) => {
        const isAuthor = comment.authorId === user._id;
        return {
          _id: comment._id,
          _creationTime: comment._creationTime,
          body: comment.body,
          editedAt: comment.editedAt,
          authorId: comment.authorId,
          authorName: (await ctx.db.get("users", comment.authorId))?.name ?? "Alguien",
          canEdit: isAuthor,
          canDelete: isAuthor || user.role === "admin",
        };
      }),
    );
  },
});

export const add = mutation({
  args: { taskId: v.id("tasks"), body: v.string() },
  returns: v.id("comments"),
  handler: async (ctx, { taskId, body }) => {
    const task = await requireTask(ctx, taskId);
    const { user } = await requireWritableBoard(ctx, task.boardId);
    const commentId = await ctx.db.insert("comments", {
      taskId,
      authorId: user._id,
      body: requireBody(body),
    });
    await notify(ctx, {
      recipients: [task.assigneeId, task.creatorId],
      kind: "commented",
      task,
      actorId: user._id,
      text: `${user.name} comentó en «${task.title}»`,
    });
    return commentId;
  },
});

export const edit = mutation({
  args: { commentId: v.id("comments"), body: v.string() },
  returns: v.null(),
  handler: async (ctx, { commentId, body }) => {
    const { comment, user } = await requireComment(ctx, commentId);
    if (comment.authorId !== user._id) {
      throw new ConvexError("Solo puedes editar tus propios comentarios");
    }
    await ctx.db.patch("comments", commentId, { body: requireBody(body), editedAt: Date.now() });
    return null;
  },
});

export const remove = mutation({
  args: { commentId: v.id("comments") },
  returns: v.null(),
  handler: async (ctx, { commentId }) => {
    const { comment, task, user } = await requireComment(ctx, commentId);
    if (comment.authorId !== user._id && user.role !== "admin") {
      throw new ConvexError("Solo puedes eliminar tus propios comentarios");
    }
    await ctx.db.delete("comments", commentId);
    const author = await ctx.db.get("users", comment.authorId);
    await logActivity(ctx, {
      taskId: task._id,
      actorId: user._id,
      kind: "comment_deleted",
      from: author?.name,
    });
    return null;
  },
});
