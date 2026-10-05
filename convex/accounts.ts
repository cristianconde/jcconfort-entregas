import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  action,
  internalMutation,
  internalQuery,
  query,
  type ActionCtx,
} from "./_generated/server";
import { createAuth } from "./auth";
import { roleValidator } from "./schema";
import { normalizeEmail, normalizePhone, requireName, requirePassword } from "./lib/validation";

/** True while no user exists yet: the first-run setup page is available. */
export const bootstrapStatus = query({
  args: {},
  returns: v.object({ needsSetup: v.boolean() }),
  handler: async (ctx) => {
    return { needsSetup: (await ctx.db.query("users").first()) === null };
  },
});

export const preparePendingAccount = internalMutation({
  args: {
    email: v.string(),
    name: v.string(),
    role: roleValidator,
    phone: v.optional(v.string()),
    isBootstrap: v.boolean(),
  },
  returns: v.id("pendingAccounts"),
  handler: async (ctx, args) => {
    if (args.isBootstrap && (await ctx.db.query("users").first()) !== null) {
      throw new ConvexError("La configuración inicial ya se completó");
    }
    const existing = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .unique();
    const pending = await ctx.db
      .query("pendingAccounts")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .first();
    if (existing || pending) {
      throw new ConvexError("Ya existe un usuario con ese email");
    }
    return await ctx.db.insert("pendingAccounts", args);
  },
});

export const discardPendingAccount = internalMutation({
  args: { pendingId: v.id("pendingAccounts") },
  returns: v.null(),
  handler: async (ctx, { pendingId }) => {
    if (await ctx.db.get("pendingAccounts", pendingId)) {
      await ctx.db.delete("pendingAccounts", pendingId);
    }
    return null;
  },
});

export const profileIdByEmail = internalQuery({
  args: { email: v.string() },
  returns: v.union(v.id("users"), v.null()),
  handler: async (ctx, { email }) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", email))
      .unique();
    return user?._id ?? null;
  },
});

/**
 * Creates a Better Auth account plus its `users` profile. The profile itself
 * is written by the user.onCreate trigger from the pending row (design §9).
 */
export async function createAccount(
  ctx: ActionCtx,
  input: {
    email: string;
    name: string;
    password: string;
    role: "admin" | "member";
    phone?: string;
    isBootstrap: boolean;
  },
): Promise<Id<"users">> {
  const email = normalizeEmail(input.email);
  const name = requireName(input.name);
  const password = requirePassword(input.password);
  const phone = normalizePhone(input.phone);

  const pendingId = await ctx.runMutation(internal.accounts.preparePendingAccount, {
    email,
    name,
    role: input.role,
    phone,
    isBootstrap: input.isBootstrap,
  });
  try {
    await createAuth(ctx).api.signUpEmail({ body: { email, name, password } });
  } catch (error) {
    await ctx.runMutation(internal.accounts.discardPendingAccount, { pendingId });
    if (error instanceof ConvexError) throw error;
    throw new ConvexError("No se pudo crear la cuenta");
  }
  const userId = await ctx.runQuery(internal.accounts.profileIdByEmail, { email });
  if (!userId) {
    // Better Auth silently skips duplicate emails when autoSignIn is off.
    await ctx.runMutation(internal.accounts.discardPendingAccount, { pendingId });
    throw new ConvexError("Ya existe un usuario con ese email");
  }
  return userId;
}

/** First-run setup: creates the first account as admin. */
export const bootstrap = action({
  args: { name: v.string(), email: v.string(), password: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    await createAccount(ctx, { ...args, role: "admin", isBootstrap: true });
    return null;
  },
});
