import { ConvexError, v } from "convex/values";
import { internal } from "../_generated/api";
import type { Doc } from "../_generated/dataModel";
import { mutation, query, type QueryCtx } from "../_generated/server";
import { requireAdmin } from "../lib/access";
import { getSettings } from "../lib/settings";
import { deliveryChannelValidator, deliveryStateValidator, providerIdValidator } from "../schema";

const LOG_SIZE = 100;

export const CHANNEL_LABELS: Record<Doc<"deliveries">["channel"], string> = {
  sms: "SMS",
  whatsapp_link: "WhatsApp (antiguo)",
};

const deliveryRowValidator = v.object({
  _id: v.id("deliveries"),
  _creationTime: v.number(),
  channel: deliveryChannelValidator,
  channelLabel: v.string(),
  provider: v.optional(providerIdValidator),
  state: deliveryStateValidator,
  // "user" rows are legacy sends to team members, from before SMS became customer-only.
  recipient: v.union(v.literal("customer"), v.literal("user")),
  recipientName: v.string(),
  phone: v.optional(v.string()),
  message: v.string(),
  error: v.optional(v.string()),
  attempts: v.number(),
  // Absent when the task has been deleted (the delivery is kept as audit trail).
  taskId: v.optional(v.id("tasks")),
  taskTitle: v.optional(v.string()),
});

async function toRow(ctx: QueryCtx, delivery: Doc<"deliveries">) {
  const isCustomer = delivery.recipient === "customer";
  // Legacy rows reach their recipient and task through the notification.
  const [user, notification] = await Promise.all([
    delivery.userId ? ctx.db.get("users", delivery.userId) : null,
    delivery.notificationId ? ctx.db.get("notifications", delivery.notificationId) : null,
  ]);
  const taskId = delivery.taskId ?? notification?.taskId;
  const task = taskId ? await ctx.db.get("tasks", taskId) : null;
  return {
    _id: delivery._id,
    _creationTime: delivery._creationTime,
    channel: delivery.channel,
    channelLabel: CHANNEL_LABELS[delivery.channel],
    provider: delivery.provider,
    state: delivery.state,
    recipient: isCustomer ? ("customer" as const) : ("user" as const),
    recipientName: (isCustomer ? delivery.recipientName : user?.name) ?? "—",
    phone: delivery.to ?? (isCustomer ? undefined : user?.phone),
    message: delivery.message,
    error: delivery.error,
    attempts: delivery.attempts ?? 0,
    taskId: task?._id,
    taskTitle: task?.title,
  };
}

/** Admin delivery log ("Envíos de SMS"): the latest deliveries, newest first. */
export const log = query({
  args: {},
  returns: v.array(deliveryRowValidator),
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const deliveries = await ctx.db.query("deliveries").order("desc").take(LOG_SIZE);
    return await Promise.all(deliveries.map((delivery) => toRow(ctx, delivery)));
  },
});

/**
 * Sends a failed customer SMS again, with the same text, to the task's current
 * customer phone, as a fresh set of attempts.
 */
export const retry = mutation({
  args: { deliveryId: v.id("deliveries") },
  returns: v.null(),
  handler: async (ctx, { deliveryId }) => {
    await requireAdmin(ctx);
    const delivery = await ctx.db.get("deliveries", deliveryId);
    if (!delivery) throw new ConvexError("El envío no existe");
    if (delivery.state !== "failed" || delivery.channel !== "sms") {
      throw new ConvexError("Solo se pueden reintentar los SMS fallidos");
    }
    if (delivery.recipient !== "customer") {
      throw new ConvexError("Los SMS antiguos a miembros del equipo ya no se pueden reintentar");
    }
    const task = delivery.taskId ? await ctx.db.get("tasks", delivery.taskId) : null;
    if (!task) throw new ConvexError("La tarea ya no existe");
    if (!task.customerPhone) throw new ConvexError("La tarea no tiene teléfono de cliente");
    if (!(await getSettings(ctx)).enabledChannels.includes("sms")) {
      throw new ConvexError("Los SMS a clientes están desactivados en Ajustes");
    }
    await ctx.db.patch("deliveries", deliveryId, {
      state: "pending",
      to: task.customerPhone,
      attempts: 0,
      error: undefined,
      claimedAt: undefined,
      providerMessageId: undefined,
    });
    await ctx.scheduler.runAfter(0, internal.notifications.send.deliver, { deliveryId });
    return null;
  },
});
