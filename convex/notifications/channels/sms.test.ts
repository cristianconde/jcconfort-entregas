import { afterEach, expect, test, vi } from "vitest";
import { DEFAULT_SETTINGS } from "../../lib/settings";
import { smsChannel } from "./sms";

afterEach(() => vi.unstubAllEnvs());

const settings = { ...DEFAULT_SETTINGS, enabledChannels: ["sms" as const] };

test("available only when the active provider is configured", () => {
  vi.stubEnv("SMS_PROVIDER", "twilio");
  expect(smsChannel.isAvailable(settings)).toBe(true);
  vi.stubEnv("TWILIO_AUTH_TOKEN", undefined);
  expect(smsChannel.isAvailable(settings)).toBe(false);
  vi.stubEnv("SMS_PROVIDER", "log");
  expect(smsChannel.isAvailable(settings)).toBe(true);
});

test("unavailable when «SMS a clientes» is switched off", () => {
  vi.stubEnv("SMS_PROVIDER", "log");
  expect(smsChannel.isAvailable({ ...settings, enabledChannels: [] })).toBe(false);
});
