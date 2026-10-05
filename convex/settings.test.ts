import { afterEach, describe, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import { seedUser, setup } from "./test.helpers";

const valid = {
  appName: "Mi Equipo",
  timezone: "Europe/Madrid",
  reminderLeadHours: 24,
  enabledChannels: ["sms" as const],
};

test("returns defaults on a fresh database", async () => {
  const t = setup();
  const member = await seedUser(t);
  expect(await member.as.query(api.settings.get, {})).toEqual({
    appName: "JC Confort Entregas",
    timezone: "Europe/Madrid",
    reminderLeadHours: 24,
    enabledChannels: ["sms"],
  });
  expect(await t.query(api.settings.publicInfo, {})).toEqual({ appName: "JC Confort Entregas" });
});

test("members cannot update settings", async () => {
  const t = setup();
  const member = await seedUser(t);
  await expect(member.as.mutation(api.settings.update, valid)).rejects.toThrow(
    "No tienes permisos de administrador",
  );
});

test("signed-out callers cannot read full settings", async () => {
  const t = setup();
  await expect(t.query(api.settings.get, {})).rejects.toThrow("No has iniciado sesión");
});

test("invalid timezone is rejected and previous value kept", async () => {
  const t = setup();
  const admin = await seedUser(t, { role: "admin" });
  await admin.as.mutation(api.settings.update, valid);
  await expect(
    admin.as.mutation(api.settings.update, { ...valid, timezone: "Madrid" }),
  ).rejects.toThrow("Zona horaria no válida");
  expect((await admin.as.query(api.settings.get, {})).timezone).toBe("Europe/Madrid");
});

test("admin changes lead time and app name", async () => {
  const t = setup();
  const admin = await seedUser(t, { role: "admin" });
  await admin.as.mutation(api.settings.update, { ...valid, reminderLeadHours: 48 });
  const settings = await admin.as.query(api.settings.get, {});
  expect(settings.reminderLeadHours).toBe(48);
  expect(settings.appName).toBe("Mi Equipo");
});

test("out-of-range values are rejected", async () => {
  const t = setup();
  const admin = await seedUser(t, { role: "admin" });
  await expect(
    admin.as.mutation(api.settings.update, { ...valid, reminderLeadHours: 0 }),
  ).rejects.toThrow("entre 1 y 168");
  await expect(
    admin.as.mutation(api.settings.update, { ...valid, appName: "  " }),
  ).rejects.toThrow("entre 1 y 60");
});

describe("provider status", () => {
  afterEach(() => vi.unstubAllEnvs());

  test("admins see the provider and whether it is configured, never credentials", async () => {
    const t = setup();
    const admin = await seedUser(t, { role: "admin" });
    vi.stubEnv("SMS_PROVIDER", "twilio");
    expect(await admin.as.query(api.settings.providerStatus, {})).toEqual({
      provider: "twilio",
      label: "Twilio",
      configured: true,
    });
    vi.stubEnv("TWILIO_FROM", undefined);
    expect(await admin.as.query(api.settings.providerStatus, {})).toEqual({
      provider: "twilio",
      label: "Twilio",
      configured: false,
    });
    vi.stubEnv("SMS_PROVIDER", undefined);
    expect((await admin.as.query(api.settings.providerStatus, {})).provider).toBe("twilio");
  });

  test("members cannot read it", async () => {
    const t = setup();
    const member = await seedUser(t);
    await expect(member.as.query(api.settings.providerStatus, {})).rejects.toThrow("administrador");
  });
});
