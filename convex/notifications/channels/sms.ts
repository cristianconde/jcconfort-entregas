import type { DeliveryChannel } from "../channels";
import { activeProvider } from "../providers";

export { gsmLength, SMS_MAX_SEPTETS, toGsm7 } from "../../lib/customerMessage";

/**
 * Automatic SMS to customers through the active provider (Twilio by default).
 * Team members are never sent SMS: their notifications are in-app only.
 */
export const smsChannel: DeliveryChannel = {
  id: "sms",
  label: "SMS",
  isAvailable(settings) {
    return (
      settings.enabledChannels.includes("sms") && (activeProvider()?.isConfigured() ?? false)
    );
  },
};
