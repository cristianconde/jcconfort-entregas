import type { Doc } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";

export type Settings = Omit<Doc<"settings">, "_id" | "_creationTime">;

export const DEFAULT_SETTINGS: Settings = {
  appName: "JC Confort Entregas",
  timezone: "Europe/Madrid",
  reminderLeadHours: 24,
  enabledChannels: ["sms"],
};

export async function getSettingsDoc(ctx: QueryCtx): Promise<Doc<"settings"> | null> {
  return await ctx.db.query("settings").first();
}

export async function getSettings(ctx: QueryCtx): Promise<Settings> {
  const doc = await getSettingsDoc(ctx);
  if (!doc) return DEFAULT_SETTINGS;
  return {
    appName: doc.appName,
    timezone: doc.timezone,
    reminderLeadHours: doc.reminderLeadHours,
    enabledChannels: doc.enabledChannels,
  };
}

export function isValidTimezone(timezone: string): boolean {
  // Only accept IANA "Area/Location" names (plus UTC); Intl throws on unknown ids.
  if (timezone !== "UTC" && !timezone.includes("/")) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}
