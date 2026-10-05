import { ConvexError, v, type Infer } from "convex/values";
import { internal } from "../_generated/api";
import type { Doc } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { logActivity } from "../lib/activity";
import {
  customerMessageError,
  DEFAULT_CUSTOMER_TEMPLATE,
  etaError,
  renderCustomerMessage,
  toGsm7,
} from "../lib/customerMessage";
import { getSettings } from "../lib/settings";
import { normalizePhone } from "../lib/validation";
import { smsChannel } from "./channels/sms";

/** What the "Aviso al cliente" confirmation sends along with a move. */
export const customerNoticeValidator = v.object({
  send: v.boolean(),
  // Omitted leaves the task's customer phone as it is; "" clears it.
  phone: v.optional(v.string()),
  // The text as edited in the confirmation; omitted renders the status template.
  message: v.optional(v.string()),
  eta: v.optional(v.object({ date: v.string(), from: v.string(), to: v.optional(v.string()) })),
});

export type CustomerNotice = Infer<typeof customerNoticeValidator>;

/** "Nombre · +34600111222", as shown in the task detail and the activity log. */
export function customerLabel(customer: { customerName?: string; customerPhone?: string }) {
  return [customer.customerName, customer.customerPhone].filter(Boolean).join(" · ") || undefined;
}

/**
 * Applies a confirmed customer notice for a task that has just entered a
 * status marked "Avisar al cliente": stores (or clears) the arrival window,
 * saves a corrected phone and, when asked to and SMS is available, creates the
 * customer SMS and schedules its send. Runs inside `tasks.move`, so the move
 * and the notice commit together or not at all (design §3).
 */
export async function applyCustomerNotice(
  ctx: MutationCtx,
  args: {
    task: Doc<"tasks">;
    rule: Doc<"statusRules">;
    actor: Doc<"users">;
    notice: CustomerNotice;
  },
) {
  const { task, rule, actor, notice } = args;
  const settings = await getSettings(ctx);
  const now = Date.now();

  if (notice.eta) {
    const error = etaError(notice.eta, settings.timezone, now);
    if (error) throw new ConvexError(error);
  }
  const patch: Partial<Doc<"tasks">> = {
    etaDate: notice.eta?.date,
    etaFrom: notice.eta?.from,
    etaTo: notice.eta?.to,
  };

  let phone = task.customerPhone;
  if (notice.phone !== undefined) {
    phone = normalizePhone(notice.phone);
    if (phone !== task.customerPhone) {
      patch.customerPhone = phone;
      await logActivity(ctx, {
        taskId: task._id,
        actorId: actor._id,
        kind: "customer",
        from: customerLabel(task),
        to: customerLabel({ customerName: task.customerName, customerPhone: phone }),
      });
    }
  }
  await ctx.db.patch("tasks", task._id, patch);

  let sent = false;
  if (notice.send) {
    if (!phone) throw new ConvexError("Para avisar al cliente hace falta su teléfono");
    // The server has the last word on the text: GSM-7 and at most two segments.
    const message = toGsm7(
      notice.message !== undefined
        ? notice.message.trim()
        : renderCustomerMessage({
            template: rule.customerTemplate ?? DEFAULT_CUSTOMER_TEMPLATE,
            customerName: task.customerName,
            appName: settings.appName,
            eta: notice.eta,
            timezone: settings.timezone,
            now,
          }),
    );
    const error = customerMessageError(message);
    if (error) throw new ConvexError(error);
    // Provider not configured or "SMS a clientes" off: the move and the window
    // are still saved, nothing is sent.
    if (smsChannel.isAvailable(settings)) {
      const deliveryId = await ctx.db.insert("deliveries", {
        recipient: "customer",
        taskId: task._id,
        recipientName: task.customerName,
        channel: smsChannel.id,
        state: "pending",
        to: phone,
        message,
        attempts: 0,
      });
      await ctx.scheduler.runAfter(0, internal.notifications.send.deliver, { deliveryId });
      sent = true;
    }
  }

  await logActivity(ctx, {
    taskId: task._id,
    actorId: actor._id,
    kind: "customer_notice",
    from: sent ? "sms" : "sin sms",
    // "<date>|<from>|<to>", so the UI can word the day relative to the entry.
    to: notice.eta ? [notice.eta.date, notice.eta.from, notice.eta.to ?? ""].join("|") : undefined,
  });
}
