import type { Doc } from "../_generated/dataModel";

/**
 * Fields that follow from a task's status: `isOpen` is denormalized from the
 * status' `isDone`, and `completedAt` is set when entering a done status and
 * cleared when leaving it (design §3).
 */
export function statusFields(
  task: Pick<Doc<"tasks">, "completedAt">,
  status: Pick<Doc<"boardStatuses">, "isDone">,
  now: number,
): Pick<Doc<"tasks">, "isOpen" | "completedAt"> {
  if (status.isDone) {
    return { isOpen: false, completedAt: task.completedAt ?? now };
  }
  return { isOpen: true, completedAt: undefined };
}
