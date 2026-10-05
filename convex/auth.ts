import { createClient, type AuthFunctions, type GenericCtx } from "@convex-dev/better-auth";
import { convex } from "@convex-dev/better-auth/plugins";
import { betterAuth } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { ConvexError } from "convex/values";
import { components, internal } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";
import { env } from "./_generated/server";
import authConfig from "./auth.config";

const authFunctions: AuthFunctions = internal.auth;

export const authComponent = createClient<DataModel>(components.betterAuth, {
  authFunctions,
  triggers: {
    user: {
      // Runs in the same transaction as the Better Auth user insert. Accounts
      // can only be created from a pendingAccounts row written by an admin
      // (or by the first-run bootstrap); anything else is rolled back.
      onCreate: async (ctx, authUser) => {
        const email = authUser.email.toLowerCase();
        const pending = await ctx.db
          .query("pendingAccounts")
          .withIndex("by_email", (q) => q.eq("email", email))
          .first();
        if (!pending) {
          throw new ConvexError("El registro público no está permitido");
        }
        if (pending.isBootstrap && (await ctx.db.query("users").first()) !== null) {
          throw new ConvexError("La configuración inicial ya se completó");
        }
        await ctx.db.insert("users", {
          authUserId: authUser._id,
          email,
          name: pending.name,
          role: pending.role,
          isActive: true,
          phone: pending.phone,
        });
        await ctx.db.delete("pendingAccounts", pending._id);
      },
    },
  },
});

export const { onCreate, onUpdate, onDelete } = authComponent.triggersApi();

export const createAuth = (ctx: GenericCtx<DataModel>) =>
  betterAuth({
    baseURL: env.SITE_URL,
    trustedOrigins: [env.SITE_URL],
    secret: env.BETTER_AUTH_SECRET,
    database: authComponent.adapter(ctx),
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: false,
      // Accounts are created server-side by admins; never open a session then.
      autoSignIn: false,
      minPasswordLength: 8,
    },
    hooks: {
      // Public sign-up is disabled: only server-side auth.api calls (which
      // carry no HTTP request) may reach the sign-up endpoint.
      before: createAuthMiddleware(async (hookCtx) => {
        if (hookCtx.path.startsWith("/sign-up") && hookCtx.request) {
          throw new APIError("FORBIDDEN", { message: "El registro público no está permitido" });
        }
      }),
    },
    databaseHooks: {
      session: {
        create: {
          before: async (session) => {
            const profile = await ctx.runQuery(internal.users.getByAuthUserId, {
              authUserId: session.userId,
            });
            if (!profile || !profile.isActive) {
              throw new APIError("FORBIDDEN", { message: "Tu cuenta está desactivada" });
            }
          },
        },
      },
    },
    plugins: [convex({ authConfig })],
  });
