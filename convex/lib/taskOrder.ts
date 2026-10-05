import type { Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";

export const ORDER_STEP = 1024;

/** Order value that places a task at the end of a status column. */
export async function endOfColumnOrder(
  ctx: QueryCtx,
  boardId: Id<"boards">,
  statusId: Id<"boardStatuses">,
): Promise<number> {
  const last = await ctx.db
    .query("tasks")
    .withIndex("by_boardId_and_statusId_and_order", (q) =>
      q.eq("boardId", boardId).eq("statusId", statusId),
    )
    .order("desc")
    .first();
  return (last?.order ?? 0) + ORDER_STEP;
}
