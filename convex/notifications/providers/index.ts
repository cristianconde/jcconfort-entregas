import { env } from "../../_generated/server";
import { logProvider } from "./log";
import { twilioProvider } from "./twilio";
import type { ProviderId, SmsProvider } from "./types";

export const PROVIDERS: Record<ProviderId, SmsProvider> = {
  twilio: twilioProvider,
  log: logProvider,
};

export function getProvider(id: string): SmsProvider | null {
  return Object.hasOwn(PROVIDERS, id) ? PROVIDERS[id as ProviderId] : null;
}

/** The provider selected by SMS_PROVIDER (default "twilio"); null for an unknown id. */
export function activeProvider(): SmsProvider | null {
  return getProvider(env.SMS_PROVIDER ?? "twilio");
}
