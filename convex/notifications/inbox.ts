import { ConvexError, v } from "convex/values";
import { mutation, query } from "../_generated/server";
import { requireUser } from "../lib/access";
import { notificationKindValidator } from "../schema";

const UNREAD_CAP = 100;

/** The signed-in user's notifications, newest first. */
export const list = query({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("notifications"),
      _creationTime: v.number(),
      kind: notificationKindValidator,
      text: v.string(),
      taskId: v.id("tasks"),
      isRead: v.boolean(),
    }),
  ),
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const rows = await ctx.db
      .query("notifications")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .order("desc")
      .take(50);
    return rows.map((n) => ({
      _id: n._id,
      _creationTime: n._creationTime,
      kind: n.kind,
      text: n.text,
      taskId: n.taskId,
      isRead: n.readAt !== undefined,
    }));
  },
});

/** Unread count for the badge (capped; the UI shows "99+"). */
export const unreadCount = query({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const unread = await ctx.db
      .query("notifications")
      .withIndex("by_userId_and_readAt", (q) => q.eq("userId", user._id).eq("readAt", undefined))
      .take(UNREAD_CAP);
    return unread.length;
  },
});

export const markRead = mutation({
  args: { notificationId: v.id("notifications") },
  returns: v.null(),
  handler: async (ctx, { notificationId }) => {
    const user = await requireUser(ctx);
    const notification = await ctx.db.get("notifications", notificationId);
    if (!notification || notification.userId !== user._id) {
      throw new ConvexError("La notificación no existe");
    }
    if (notification.readAt === undefined) {
      await ctx.db.patch("notifications", notificationId, { readAt: Date.now() });
    }
    return null;
  },
});

export const markAllRead = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const now = Date.now();
    const unread = await ctx.db
      .query("notifications")
      .withIndex("by_userId_and_readAt", (q) => q.eq("userId", user._id).eq("readAt", undefined))
      .take(1000);
    for (const notification of unread) {
      await ctx.db.patch("notifications", notification._id, { readAt: now });
    }
    return null;
  },
});
