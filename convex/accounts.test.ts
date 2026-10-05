import { expect, test } from "vitest";
import { api } from "./_generated/api";
import { setupWithAuth } from "./test.helpers";

test("first bootstrap creates an active admin; second is refused", async () => {
  const t = setupWithAuth();
  expect(await t.query(api.accounts.bootstrapStatus, {})).toEqual({ needsSetup: true });

  await t.action(api.accounts.bootstrap, {
    name: "Ana Admin",
    email: "Ana@Example.com",
    password: "supersecret1",
  });

  const users = await t.run((ctx) => ctx.db.query("users").collect());
  expect(users).toHaveLength(1);
  expect(users[0]).toMatchObject({ email: "ana@example.com", role: "admin", isActive: true });
  expect(await t.run((ctx) => ctx.db.query("pendingAccounts").collect())).toHaveLength(0);
  expect(await t.query(api.accounts.bootstrapStatus, {})).toEqual({ needsSetup: false });

  await expect(
    t.action(api.accounts.bootstrap, {
      name: "Otro",
      email: "otro@example.com",
      password: "supersecret1",
    }),
  ).rejects.toThrow("La configuración inicial ya se completó");
  expect(await t.run((ctx) => ctx.db.query("users").collect())).toHaveLength(1);
});

test("bootstrap validates input", async () => {
  const t = setupWithAuth();
  await expect(
    t.action(api.accounts.bootstrap, { name: "A", email: "no-email", password: "supersecret1" }),
  ).rejects.toThrow("El email no es válido");
  await expect(
    t.action(api.accounts.bootstrap, { name: "A", email: "a@example.com", password: "short" }),
  ).rejects.toThrow("al menos 8 caracteres");
});
