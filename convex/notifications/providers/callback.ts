import { env } from "../../_generated/server";
import type { ProviderId } from "./types";

/** Path of a provider's delivery-status webhook (registered in convex/http.ts). */
export function statusCallbackPath(providerId: ProviderId) {
  return `/sms/${providerId}/status`;
}

/** Full webhook URL; the same string is sent to the provider and used to verify signatures. */
export function statusCallbackUrl(providerId: ProviderId) {
  return `${env.CONVEX_SITE_URL}${statusCallbackPath(providerId)}`;
}
