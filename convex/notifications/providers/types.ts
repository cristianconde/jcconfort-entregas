import type { Infer } from "convex/values";
import type { providerIdValidator } from "../../schema";

export type ProviderId = Infer<typeof providerIdValidator>;

export type SendResult =
  // `delivered`: the provider already knows the final state (no status callback will come).
  | { ok: true; providerMessageId: string; delivered?: boolean }
  | { ok: false; retryable: boolean; error: string };

export type StatusUpdate = {
  providerMessageId: string;
  state: "sent" | "delivered" | "failed";
  error?: string;
};

/**
 * The swappable SMS transport (see design §1). Everything vendor-specific —
 * credentials, the send API and the delivery-status webhook — lives behind it.
 */
export interface SmsProvider {
  id: ProviderId;
  /** Shown in app settings, e.g. "Twilio". */
  label: string;
  /** True when the required env vars are present. */
  isConfigured(): boolean;
  send(msg: { to: string; body: string; statusCallbackUrl: string }): Promise<SendResult>;
  /** Authenticates and parses a delivery-status callback; "invalid" when it doesn't verify. */
  parseStatusCallback(req: Request): Promise<StatusUpdate | "invalid">;
}
