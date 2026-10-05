import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation } from "./_generated/server";
import { formatDeadline } from "./lib/deadline";
import { getSettings } from "./lib/settings";
import { notify } from "./notifications/notify";

const HOUR = 3_600_000;
const BATCH = 200;

/**
 * Sends one "deadline soon" reminder and one overdue alert per task and
 * deadline value. `reminderSentFor` / `overdueSentFor` store the deadline a
 * message was sent for, so editing the deadline naturally re-arms them.
 * Runs from crons.ts; continues itself when there are more than BATCH tasks.
 */
export const run = internalMutation({
  args: { cursor: v.optional(v.union(v.string(), v.null())), now: v.optional(v.number()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const now = args.now ?? Date.now();
    const settings = await getSettings(ctx);
    const horizon = now + settings.reminderLeadHours * HOUR;

    const page = await ctx.db
      .query("tasks")
      .withIndex("by_isOpen_and_deadlineAt", (q) =>
        q.eq("isOpen", true).gte("deadlineAt", 0).lte("deadlineAt", horizon),
      )
      .paginate({ numItems: BATCH, cursor: args.cursor ?? null });

    for (const task of page.page) {
      if (!task.assigneeId || task.deadlineAt === undefined) continue;
      const deadline = formatDeadline(task.deadlineAt, task.deadlineHasTime, settings.timezone);

      if (task.deadlineAt < now) {
        if (task.overdueSentFor === task.deadlineAt) continue;
        await notify(ctx, {
          recipients: [task.assigneeId],
          kind: "overdue",
          task,
          text: `La tarea «${task.title}» está vencida desde el ${deadline}`,
        });
        // An overdue task no longer needs the "soon" reminder either.
        await ctx.db.patch("tasks", task._id, {
          overdueSentFor: task.deadlineAt,
          reminderSentFor: task.deadlineAt,
        });
      } else if (task.reminderSentFor !== task.deadlineAt) {
        await notify(ctx, {
          recipients: [task.assigneeId],
          kind: "deadline_soon",
          task,
          text: `Recordatorio: «${task.title}» vence el ${deadline}`,
        });
        await ctx.db.patch("tasks", task._id, { reminderSentFor: task.deadlineAt });
      }
    }

    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, internal.reminders.run, {
        cursor: page.continueCursor,
        now,
      });
    }
    return null;
  },
});
