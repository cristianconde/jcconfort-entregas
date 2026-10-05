import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { notify } from "./notify";

export async function ruleForStatus(ctx: QueryCtx, statusId: Id<"boardStatuses">) {
  return await ctx.db
    .query("statusRules")
    .withIndex("by_statusId", (q) => q.eq("statusId", statusId))
    .unique();
}

/**
 * A task entered `status` (moved into it, or created in it). Recipients of the
 * status' rule get a stage notification; on a move, the assignee and creator
 * who are not rule recipients get the generic status change instead, so no one
 * hears about the same event twice (design §5).
 */
export async function notifyStatusEntry(
  ctx: MutationCtx,
  args: {
    task: Doc<"tasks">;
    status: Doc<"boardStatuses">;
    actor: Doc<"users">;
    via: "move" | "create";
  },
) {
  const { task, status, actor, via } = args;
  const rule = await ruleForStatus(ctx, status._id);
  const ruleRecipients = new Set<Id<"users">>(rule?.userIds ?? []);
  if (rule?.notifyAssignee && task.assigneeId) ruleRecipients.add(task.assigneeId);
  if (rule?.notifyCreator) ruleRecipients.add(task.creatorId);

  await notify(ctx, {
    recipients: [...ruleRecipients],
    kind: "stage_reached",
    task,
    actorId: actor._id,
    text: `«${task.title}» llegó a ${status.name} (${via === "move" ? "movida" : "creada"} por ${actor.name})`,
  });
  if (via === "move") {
    await notify(ctx, {
      recipients: [task.assigneeId, task.creatorId].filter((id) => !id || !ruleRecipients.has(id)),
      kind: "status_changed",
      task,
      actorId: actor._id,
      text: `${actor.name} cambió el estado de «${task.title}» a ${status.name}`,
    });
  }
}
