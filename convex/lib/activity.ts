import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

export async function logActivity(
  ctx: MutationCtx,
  entry: {
    taskId: Id<"tasks">;
    actorId: Id<"users">;
    kind: Doc<"activity">["kind"];
    from?: string;
    to?: string;
  },
) {
  await ctx.db.insert("activity", entry);
}
