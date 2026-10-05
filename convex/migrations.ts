import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { internalMutation, type MutationCtx } from "./_generated/server";

/**
 * Customer SMS migration (change customer-delivery-sms). SMS became a
 * customer-only channel: team members keep no SMS preference, and whatever was
 * still queued for them is never sent. Run on each deployment once the code
 * that stops SMS to team members is live, and before deploying the schema
 * without `users.smsEnabled`:
 *
 *   npx convex run migrations:customerSmsV1
 *
 * It clears the per-user SMS preference (and any leftover WhatsApp one) and
 * marks pending deliveries to team members as dismissed. Customer deliveries
 * are left alone. It is idempotent and processes BATCH documents per
 * transaction, continuing itself through the scheduler ("customerSmsV1: done"
 * is logged at the end).
 */

const BATCH = 200;
const TABLES = ["users", "deliveries"] as const;
type Table = (typeof TABLES)[number];

// The schema no longer declares the per-user channel preferences, so users are
// typed here as they may still be stored on a deployment that hasn't been
// migrated yet.
type Stored = {
  users: Doc<"users"> & { smsEnabled?: boolean; whatsappEnabled?: boolean };
  deliveries: Doc<"deliveries">;
};

const fixers: { [T in Table]: (doc: Stored[T]) => Partial<Stored[T]> | null } = {
  users: (user) =>
    user.smsEnabled !== undefined || user.whatsappEnabled !== undefined
      ? { smsEnabled: undefined, whatsappEnabled: undefined }
      : null,
  deliveries: (d) =>
    d.state === "pending" && d.recipient !== "customer" ? { state: "dismissed" } : null,
};

async function migrateBatch(ctx: MutationCtx, table: Table, cursor: string | null) {
  const page = await ctx.db.query(table).paginate({ numItems: BATCH, cursor });
  for (const doc of page.page) {
    // Each fixer only ever sees documents of its own table.
    const patch = (fixers[table] as (doc: Doc<Table>) => object | null)(doc);
    if (patch) await ctx.db.patch(table, doc._id, patch as Partial<Doc<Table>>);
  }
  return page;
}

export const customerSmsV1 = internalMutation({
  args: {
    table: v.optional(v.union(...TABLES.map((t) => v.literal(t)))),
    cursor: v.optional(v.union(v.string(), v.null())),
  },
  returns: v.string(),
  handler: async (ctx, { table = "users", cursor = null }) => {
    const page = await migrateBatch(ctx, table, cursor);
    const next = page.isDone ? TABLES[TABLES.indexOf(table) + 1] : table;
    if (!next) {
      console.log("customerSmsV1: done");
      return "customerSmsV1: done";
    }
    await ctx.scheduler.runAfter(0, internal.migrations.customerSmsV1, {
      table: next,
      cursor: page.isDone ? null : page.continueCursor,
    });
    return `customerSmsV1: continuing with ${next}`;
  },
});
