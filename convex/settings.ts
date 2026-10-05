import { ConvexError, v } from "convex/values";
import { env, mutation, query } from "./_generated/server";
import { channelIdValidator } from "./schema";
import { requireAdmin, requireUser } from "./lib/access";
import { getSettings, getSettingsDoc, isValidTimezone } from "./lib/settings";
import { getProvider } from "./notifications/providers";

const settingsValidator = v.object({
  appName: v.string(),
  timezone: v.string(),
  reminderLeadHours: v.number(),
  enabledChannels: v.array(channelIdValidator),
});

/** App name only; safe to show before sign-in (login and setup pages). */
export const publicInfo = query({
  args: {},
  returns: v.object({ appName: v.string() }),
  handler: async (ctx) => {
    const { appName } = await getSettings(ctx);
    return { appName };
  },
});

export const get = query({
  args: {},
  returns: settingsValidator,
  handler: async (ctx) => {
    await requireUser(ctx);
    return await getSettings(ctx);
  },
});

export const update = mutation({
  args: settingsValidator.fields,
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const appName = args.appName.trim();
    if (appName.length < 1 || appName.length > 60) {
      throw new ConvexError("El nombre de la aplicación debe tener entre 1 y 60 caracteres");
    }
    if (!isValidTimezone(args.timezone)) {
      throw new ConvexError("Zona horaria no válida. Usa un nombre como Europe/Madrid");
    }
    if (
      !Number.isInteger(args.reminderLeadHours) ||
      args.reminderLeadHours < 1 ||
      args.reminderLeadHours > 168
    ) {
      throw new ConvexError("La antelación del recordatorio debe estar entre 1 y 168 horas");
    }
    const value = {
      appName,
      timezone: args.timezone,
      reminderLeadHours: args.reminderLeadHours,
      enabledChannels: [...new Set(args.enabledChannels)],
    };
    const existing = await getSettingsDoc(ctx);
    if (existing) {
      await ctx.db.replace("settings", existing._id, value);
    } else {
      await ctx.db.insert("settings", value);
    }
    return null;
  },
});

/**
 * Which SMS provider is active and whether its credentials are set. Credentials
 * are deployment configuration (Convex env vars) and are never returned.
 */
export const providerStatus = query({
  args: {},
  returns: v.object({ provider: v.string(), label: v.string(), configured: v.boolean() }),
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const id = env.SMS_PROVIDER ?? "twilio";
    const provider = getProvider(id);
    return {
      provider: id,
      label: provider?.label ?? id,
      configured: provider?.isConfigured() ?? false,
    };
  },
});
