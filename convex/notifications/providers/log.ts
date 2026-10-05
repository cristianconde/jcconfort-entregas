import type { SmsProvider } from "./types";

/**
 * Development/test provider: logs the SMS instead of sending it and reports it
 * delivered straight away. Selected with SMS_PROVIDER=log.
 */
export const logProvider: SmsProvider = {
  id: "log",
  label: "Registro (sin envío real)",
  isConfigured() {
    return true;
  },
  async send({ to, body }) {
    console.log(`[sms:log] to ${to}: ${body}`);
    return { ok: true, providerMessageId: `log_${crypto.randomUUID()}`, delivered: true };
  },
  async parseStatusCallback() {
    return "invalid";
  },
};
