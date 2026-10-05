import type { Doc } from "../_generated/dataModel";
import type { Settings } from "../lib/settings";
import { smsChannel } from "./channels/sms";

/**
 * An external, automatic delivery channel (in-app is always on and not a
 * channel). A channel only says whether it can send right now; what is sent
 * and to whom is decided by whoever creates the delivery (customer notices,
 * see customer.ts), and how it is transported is the job of a provider (see
 * providers/).
 *
 * Adding a channel = a new file implementing this contract + an entry in
 * CHANNELS + its id in `channelIdValidator` (schema) so admins can enable it.
 */
export interface DeliveryChannel {
  id: Exclude<Doc<"deliveries">["channel"], "whatsapp_link">;
  label: string;
  /** True when an admin has it switched on and its provider is configured. */
  isAvailable(settings: Settings): boolean;
}

export const CHANNELS: DeliveryChannel[] = [smsChannel];
