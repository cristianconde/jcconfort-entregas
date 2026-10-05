import { env } from "../../_generated/server";
import { statusCallbackUrl } from "./callback";
import type { SendResult, SmsProvider, StatusUpdate } from "./types";

// Beyond this we give up waiting; the outcome is then unknown (design §2).
const SEND_TIMEOUT_MS = 20_000;

function credentials() {
  const accountSid = env.TWILIO_ACCOUNT_SID;
  const authToken = env.TWILIO_AUTH_TOKEN;
  const from = env.TWILIO_FROM;
  if (!accountSid || !authToken || !from) return null;
  return { accountSid, authToken, from };
}

async function readJson(res: Response): Promise<Record<string, unknown>> {
  try {
    const data: unknown = await res.json();
    return data && typeof data === "object" ? (data as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function twilioError(status: number, data: Record<string, unknown>) {
  const message = typeof data.message === "string" ? data.message : `Error HTTP ${status}`;
  return data.code !== undefined ? `${message} (código ${String(data.code)})` : message;
}

/** Classifies a Messages API response: only 429/5xx mean "not accepted, try again". */
export async function classifyResponse(res: Response): Promise<SendResult> {
  const data = await readJson(res);
  if (res.ok) {
    if (typeof data.sid === "string") return { ok: true, providerMessageId: data.sid };
    return { ok: false, retryable: false, error: "Resultado desconocido: respuesta sin identificador" };
  }
  const retryable = res.status === 429 || res.status >= 500;
  return { ok: false, retryable, error: twilioError(res.status, data) };
}

async function hmacSha1Base64(key: string, data: string) {
  const encoder = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(key),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(data)));
  return btoa(String.fromCharCode(...signature));
}

function constantTimeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Twilio request signature: base64(HMAC-SHA1(authToken, url + each POST param
 * as key+value, sorted by key)). https://www.twilio.com/docs/usage/security
 */
export async function twilioSignature(authToken: string, url: string, params: URLSearchParams) {
  const sorted = [...params.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return await hmacSha1Base64(authToken, url + sorted.map(([key, value]) => key + value).join(""));
}

export async function isValidTwilioSignature(
  authToken: string,
  url: string,
  params: URLSearchParams,
  signature: string,
) {
  return constantTimeEqual(await twilioSignature(authToken, url, params), signature);
}

/** Maps Twilio's MessageStatus to our delivery states. */
export function mapTwilioStatus(status: string, errorCode: string | null): Omit<StatusUpdate, "providerMessageId"> {
  switch (status) {
    case "delivered":
    case "read":
      return { state: "delivered" };
    case "undelivered":
    case "failed":
    case "canceled":
      return {
        state: "failed",
        error: errorCode ? `No entregado (código ${errorCode})` : "No entregado",
      };
    default:
      // queued, accepted, scheduled, sending, sent…
      return { state: "sent" };
  }
}

/** Twilio Programmable Messaging over its REST API (no SDK, default runtime). */
export const twilioProvider: SmsProvider = {
  id: "twilio",
  label: "Twilio",
  isConfigured() {
    return credentials() !== null;
  },
  async send({ to, body, statusCallbackUrl: callback }) {
    const creds = credentials();
    if (!creds) return { ok: false, retryable: false, error: "Twilio no está configurado" };
    const form = new URLSearchParams({ To: to, Body: body, StatusCallback: callback });
    // A Messaging Service SID lets Twilio pick the sender (and sender ID rules).
    form.set(creds.from.startsWith("MG") ? "MessagingServiceSid" : "From", creds.from);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), SEND_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${creds.accountSid}/Messages.json`,
        {
          method: "POST",
          headers: {
            Authorization: `Basic ${btoa(`${creds.accountSid}:${creds.authToken}`)}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: form.toString(),
          signal: controller.signal,
        },
      );
    } catch {
      // Twilio may have accepted it; retrying could send the SMS twice.
      return {
        ok: false,
        retryable: false,
        error: "Resultado desconocido: no hubo respuesta de Twilio",
      };
    } finally {
      clearTimeout(timer);
    }
    return await classifyResponse(res);
  },
  async parseStatusCallback(req) {
    const authToken = env.TWILIO_AUTH_TOKEN;
    const signature = req.headers.get("X-Twilio-Signature");
    if (!authToken || !signature) return "invalid";
    const params = new URLSearchParams(await req.text());
    const url = statusCallbackUrl("twilio");
    if (!(await isValidTwilioSignature(authToken, url, params, signature))) return "invalid";
    const providerMessageId = params.get("MessageSid");
    const status = params.get("MessageStatus");
    if (!providerMessageId || !status) return "invalid";
    return { providerMessageId, ...mapTwilioStatus(status, params.get("ErrorCode")) };
  },
};
