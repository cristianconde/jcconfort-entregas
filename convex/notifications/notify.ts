import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

type Kind = Doc<"notifications">["kind"];

/**
 * Creates in-app notifications for team members. Runs inside the mutation that
 * caused the event, so they commit (or not) atomically with the change. Team
 * members are never sent SMS: that channel is for customer notices only (see
 * customer.ts).
 *
 * The acting user is never notified about their own action.
 */
export async function notify(
  ctx: MutationCtx,
  args: {
    recipients: (Id<"users"> | undefined)[];
    kind: Kind;
    task: Doc<"tasks">;
    actorId?: Id<"users">;
    text: string;
  },
) {
  const unique = [...new Set(args.recipients.filter((id): id is Id<"users"> => !!id))].filter(
    (id) => id !== args.actorId,
  );
  for (const recipientId of unique) {
    const recipient = await ctx.db.get("users", recipientId);
    if (!recipient || !recipient.isActive) continue;
    await ctx.db.insert("notifications", {
      userId: recipient._id,
      kind: args.kind,
      taskId: args.task._id,
      actorId: args.actorId,
      text: args.text,
    });
  }
}

/**
 * Removes a task's notifications and the legacy deliveries that hang from them
 * (task deletion). Customer deliveries are kept: they are the cost/audit trail.
 */
export async function deleteNotificationsForTask(ctx: MutationCtx, taskId: Id<"tasks">) {
  for await (const notification of ctx.db
    .query("notifications")
    .withIndex("by_taskId", (q) => q.eq("taskId", taskId))) {
    for await (const delivery of ctx.db
      .query("deliveries")
      .withIndex("by_notificationId", (q) => q.eq("notificationId", notification._id))) {
      await ctx.db.delete("deliveries", delivery._id);
    }
    await ctx.db.delete("notifications", notification._id);
  }
}
