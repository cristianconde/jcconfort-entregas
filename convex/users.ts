import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  action,
  internalAction,
  internalQuery,
  mutation,
  query,
  type MutationCtx,
} from "./_generated/server";
import { createAccount } from "./accounts";
import { createAuth } from "./auth";
import { getCurrentUser, requireAdmin, requireUser } from "./lib/access";
import { normalizePhone, requireName, requirePassword } from "./lib/validation";
import { roleValidator } from "./schema";

export const meValidator = v.object({
  _id: v.id("users"),
  name: v.string(),
  email: v.string(),
  role: roleValidator,
  phone: v.optional(v.string()),
});

/**
 * The signed-in user's own profile, or null when signed out, unknown, or
 * deactivated (the client then signs out).
 */
export const me = query({
  args: {},
  returns: v.union(meValidator, v.null()),
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user || !user.isActive) return null;
    return {
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      phone: user.phone,
    };
  },
});

export const updateMe = mutation({
  args: {
    name: v.string(),
    phone: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    // Role is deliberately not accepted here: users cannot change their own role.
    await ctx.db.patch("users", user._id, {
      name: requireName(args.name),
      phone: normalizePhone(args.phone),
    });
    return null;
  },
});

const userRowValidator = v.object({
  _id: v.id("users"),
  _creationTime: v.number(),
  name: v.string(),
  email: v.string(),
  role: roleValidator,
  isActive: v.boolean(),
  phone: v.optional(v.string()),
});

function toRow(user: Doc<"users">) {
  return {
    _id: user._id,
    _creationTime: user._creationTime,
    name: user.name,
    email: user.email,
    role: user.role,
    isActive: user.isActive,
    phone: user.phone,
  };
}

/** Admin user list, optionally filtered by a case-insensitive name/email search. */
export const list = query({
  args: { search: v.optional(v.string()) },
  returns: v.array(userRowValidator),
  handler: async (ctx, { search }) => {
    await requireAdmin(ctx);
    const users = await ctx.db.query("users").take(500);
    const needle = search?.trim().toLowerCase();
    return users
      .filter(
        (u) =>
          !needle || u.name.toLowerCase().includes(needle) || u.email.includes(needle),
      )
      .sort((a, b) => a.name.localeCompare(b.name, "es"))
      .map(toRow);
  },
});

async function assertAnotherActiveAdmin(ctx: MutationCtx, userId: Id<"users">) {
  const admins = await ctx.db
    .query("users")
    .withIndex("by_role_and_isActive", (q) => q.eq("role", "admin").eq("isActive", true))
    .take(2);
  if (!admins.some((admin) => admin._id !== userId)) {
    throw new ConvexError("Debe existir al menos un administrador activo");
  }
}

async function getTarget(ctx: MutationCtx, userId: Id<"users">) {
  const target = await ctx.db.get("users", userId);
  if (!target) throw new ConvexError("El usuario no existe");
  return target;
}

export const update = mutation({
  args: {
    userId: v.id("users"),
    name: v.string(),
    role: roleValidator,
    phone: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const target = await getTarget(ctx, args.userId);
    if (target.role === "admin" && args.role !== "admin" && target.isActive) {
      await assertAnotherActiveAdmin(ctx, target._id);
    }
    await ctx.db.patch("users", target._id, {
      name: requireName(args.name),
      role: args.role,
      phone: normalizePhone(args.phone),
    });
    return null;
  },
});

export const setActive = mutation({
  args: { userId: v.id("users"), isActive: v.boolean() },
  returns: v.null(),
  handler: async (ctx, { userId, isActive }) => {
    await requireAdmin(ctx);
    const target = await getTarget(ctx, userId);
    if (target.isActive === isActive) return null;
    if (!isActive) {
      if (target.role === "admin") await assertAnotherActiveAdmin(ctx, target._id);
      await ctx.scheduler.runAfter(0, internal.users.revokeSessions, {
        authUserId: target.authUserId,
      });
    }
    await ctx.db.patch("users", target._id, { isActive });
    return null;
  },
});

export const revokeSessions = internalAction({
  args: { authUserId: v.string() },
  returns: v.null(),
  handler: async (ctx, { authUserId }) => {
    const authContext = await createAuth(ctx).$context;
    await authContext.internalAdapter.deleteUserSessions(authUserId);
    return null;
  },
});

export const assertAdmin = internalQuery({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    await requireAdmin(ctx);
    return null;
  },
});

export const authUserIdFor = internalQuery({
  args: { userId: v.id("users") },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, { userId }) => {
    return (await ctx.db.get("users", userId))?.authUserId ?? null;
  },
});

export const create = action({
  args: {
    name: v.string(),
    email: v.string(),
    password: v.string(),
    role: roleValidator,
    phone: v.optional(v.string()),
  },
  returns: v.id("users"),
  handler: async (ctx, args): Promise<Id<"users">> => {
    await ctx.runQuery(internal.users.assertAdmin, {});
    return await createAccount(ctx, { ...args, isBootstrap: false });
  },
});

export const resetPassword = action({
  args: { userId: v.id("users"), password: v.string() },
  returns: v.null(),
  handler: async (ctx, { userId, password }) => {
    await ctx.runQuery(internal.users.assertAdmin, {});
    const authUserId = await ctx.runQuery(internal.users.authUserIdFor, { userId });
    if (!authUserId) throw new ConvexError("El usuario no existe");
    const authContext = await createAuth(ctx).$context;
    const hash = await authContext.password.hash(requirePassword(password));
    await authContext.internalAdapter.updatePassword(authUserId, hash);
    return null;
  },
});

export const getByAuthUserId = internalQuery({
  args: { authUserId: v.string() },
  returns: v.union(v.object({ isActive: v.boolean() }), v.null()),
  handler: async (ctx, { authUserId }) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_authUserId", (q) => q.eq("authUserId", authUserId))
      .unique();
    return user ? { isActive: user.isActive } : null;
  },
});
