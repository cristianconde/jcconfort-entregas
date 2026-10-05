import { v } from "convex/values";
import { internal } from "../_generated/api";
import type { Doc } from "../_generated/dataModel";
import { internalAction, internalMutation } from "../_generated/server";
import { providerIdValidator } from "../schema";
import { statusCallbackUrl } from "./providers/callback";
import { activeProvider, getProvider } from "./providers";
import type { SendResult } from "./providers/types";

export const MAX_ATTEMPTS = 3;
// Wait before attempt 2 and attempt 3.
export const RETRY_BACKOFF_MS = [30_000, 120_000];

const sendResultValidator = v.union(
  v.object({
    ok: v.literal(true),
    providerMessageId: v.string(),
    delivered: v.optional(v.boolean()),
  }),
  v.object({ ok: v.literal(false), retryable: v.boolean(), error: v.string() }),
);

const jobValidator = v.object({
  to: v.string(),
  message: v.string(),
  provider: providerIdValidator,
});

/**
 * Takes a pending delivery for sending. Only one caller can claim it, so a
 * duplicate `deliver` for the same delivery never sends twice. Records the
 * provider that sends it (the active one at this moment).
 */
export const claim = internalMutation({
  args: { deliveryId: v.id("deliveries") },
  returns: v.union(jobValidator, v.null()),
  handler: async (ctx, { deliveryId }) => {
    const delivery = await ctx.db.get("deliveries", deliveryId);
    if (!delivery || delivery.state !== "pending" || delivery.claimedAt !== undefined) return null;
    const provider = activeProvider();
    const fail = (error: string) =>
      ctx.db.patch("deliveries", deliveryId, { state: "failed", error });
    if (!delivery.to) {
      await fail("Falta el teléfono de destino");
      return null;
    }
    if (!provider || !provider.isConfigured()) {
      await fail("Proveedor de SMS sin configurar");
      return null;
    }
    await ctx.db.patch("deliveries", deliveryId, {
      provider: provider.id,
      attempts: (delivery.attempts ?? 0) + 1,
      claimedAt: Date.now(),
    });
    return { to: delivery.to, message: delivery.message, provider: provider.id };
  },
});

/** Stores the outcome of one send attempt and schedules a retry when it makes sense. */
export const record = internalMutation({
  args: { deliveryId: v.id("deliveries"), result: sendResultValidator },
  returns: v.null(),
  handler: async (ctx, { deliveryId, result }) => {
    const delivery = await ctx.db.get("deliveries", deliveryId);
    if (!delivery || delivery.state !== "pending" || delivery.claimedAt === undefined) return null;
    if (result.ok) {
      await ctx.db.patch("deliveries", deliveryId, {
        state: result.delivered ? "delivered" : "sent",
        providerMessageId: result.providerMessageId,
        error: undefined,
        claimedAt: undefined,
      });
      return null;
    }
    const attempts = delivery.attempts ?? 1;
    if (result.retryable && attempts < MAX_ATTEMPTS) {
      await ctx.db.patch("deliveries", deliveryId, { error: result.error, claimedAt: undefined });
      await ctx.scheduler.runAfter(
        RETRY_BACKOFF_MS[attempts - 1] ?? RETRY_BACKOFF_MS.at(-1)!,
        internal.notifications.send.deliver,
        { deliveryId },
      );
      return null;
    }
    await ctx.db.patch("deliveries", deliveryId, {
      state: "failed",
      error: result.error,
      claimedAt: undefined,
    });
    return null;
  },
});

/** Sends one SMS delivery through its provider (scheduled by customer notices and retries). */
export const deliver = internalAction({
  args: { deliveryId: v.id("deliveries") },
  returns: v.null(),
  handler: async (ctx, { deliveryId }) => {
    const job: { to: string; message: string; provider: "twilio" | "log" } | null =
      await ctx.runMutation(internal.notifications.send.claim, { deliveryId });
    if (!job) return null;
    const provider = getProvider(job.provider)!;
    let result: SendResult;
    try {
      result = await provider.send({
        to: job.to,
        body: job.message,
        statusCallbackUrl: statusCallbackUrl(provider.id),
      });
    } catch (error) {
      // Adapters shouldn't throw; if one does, the outcome is unknown: don't retry.
      result = {
        ok: false,
        retryable: false,
        error: `Resultado desconocido: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
    await ctx.runMutation(internal.notifications.send.record, { deliveryId, result });
    return null;
  },
});

// Delivery states only move forward: a late "sent" never overwrites "delivered".
const STATE_RANK: Record<Doc<"deliveries">["state"], number> = {
  pending: 0,
  sent: 1,
  delivered: 2,
  failed: 2,
  dismissed: 3,
};

/** Applies a verified provider status callback to its delivery. */
export const applyStatus = internalMutation({
  args: {
    providerMessageId: v.string(),
    state: v.union(v.literal("sent"), v.literal("delivered"), v.literal("failed")),
    error: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, { providerMessageId, state, error }) => {
    const delivery = await ctx.db
      .query("deliveries")
      .withIndex("by_providerMessageId", (q) => q.eq("providerMessageId", providerMessageId))
      .first();
    if (!delivery || STATE_RANK[state] <= STATE_RANK[delivery.state]) return null;
    await ctx.db.patch("deliveries", delivery._id, {
      state,
      error: state === "failed" ? error : undefined,
    });
    return null;
  },
});
