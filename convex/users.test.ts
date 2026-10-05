import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import { seedUser, setup, setupWithAuth } from "./test.helpers";

const newUser = {
  name: "Luis Técnico",
  email: "luis@example.com",
  password: "supersecret1",
  role: "member" as const,
  phone: "+34 600 111 222",
};

describe("create", () => {
  test("admin creates an active member who can be listed", async () => {
    const t = setupWithAuth();
    const admin = await seedUser(t, { role: "admin" });
    const id = await admin.as.action(api.users.create, newUser);
    const user = await t.run((ctx) => ctx.db.get("users", id));
    expect(user).toMatchObject({
      email: "luis@example.com",
      role: "member",
      isActive: true,
      phone: "+34600111222",
    });
  });

  test("duplicate email (any case) is rejected", async () => {
    const t = setupWithAuth();
    const admin = await seedUser(t, { role: "admin" });
    await admin.as.action(api.users.create, newUser);
    await expect(
      admin.as.action(api.users.create, { ...newUser, email: "LUIS@example.com" }),
    ).rejects.toThrow("Ya existe un usuario con ese email");
  });

  test("invalid phone is rejected", async () => {
    const t = setupWithAuth();
    const admin = await seedUser(t, { role: "admin" });
    await expect(
      admin.as.action(api.users.create, { ...newUser, phone: "600 11 12 22" }),
    ).rejects.toThrow("formato internacional");
  });

  test("members cannot create users", async () => {
    const t = setupWithAuth();
    const member = await seedUser(t);
    await expect(member.as.action(api.users.create, newUser)).rejects.toThrow("administrador");
  });
});

describe("update and activation", () => {
  test("last active admin cannot be demoted or deactivated", async () => {
    const t = setup();
    const admin = await seedUser(t, { role: "admin" });
    await expect(
      admin.as.mutation(api.users.update, { userId: admin.id, name: "A", role: "member" }),
    ).rejects.toThrow("Debe existir al menos un administrador activo");
    await expect(
      admin.as.mutation(api.users.setActive, { userId: admin.id, isActive: false }),
    ).rejects.toThrow("Debe existir al menos un administrador activo");
  });

  test("promote a member, then the original admin may be demoted", async () => {
    const t = setup();
    const admin = await seedUser(t, { role: "admin" });
    const member = await seedUser(t);
    await admin.as.mutation(api.users.update, {
      userId: member.id,
      name: "Nuevo Admin",
      role: "admin",
    });
    await expect(member.as.query(api.users.list, {})).resolves.toBeTruthy();
    await member.as.mutation(api.users.update, { userId: admin.id, name: "Ex", role: "member" });
    await expect(admin.as.query(api.users.list, {})).rejects.toThrow("administrador");
  });

  test("deactivate and reactivate a member", async () => {
    const t = setupWithAuth();
    const admin = await seedUser(t, { role: "admin" });
    const member = await seedUser(t);
    await admin.as.mutation(api.users.setActive, { userId: member.id, isActive: false });
    expect(await member.as.query(api.users.me, {})).toBeNull();
    await admin.as.mutation(api.users.setActive, { userId: member.id, isActive: true });
    expect(await member.as.query(api.users.me, {})).toMatchObject({ _id: member.id });
  });

  test("members cannot update other users", async () => {
    const t = setup();
    const member = await seedUser(t);
    const other = await seedUser(t);
    await expect(
      member.as.mutation(api.users.update, { userId: other.id, name: "X", role: "admin" }),
    ).rejects.toThrow("administrador");
  });
});

describe("list and self-service", () => {
  test("search is case-insensitive on name and email", async () => {
    const t = setup();
    const admin = await seedUser(t, { role: "admin", name: "Zoe", email: "zoe@example.com" });
    await seedUser(t, { name: "Ana García", email: "agarcia@example.com" });
    await seedUser(t, { name: "Pedro", email: "pedro.ana@example.com" });
    await seedUser(t, { name: "Luis", email: "luis@example.com" });
    const result = await admin.as.query(api.users.list, { search: "ANA" });
    expect(result.map((u) => u.name)).toEqual(["Ana García", "Pedro"]);
  });

  test("updateMe edits own profile and cannot change role", async () => {
    const t = setup();
    const member = await seedUser(t);
    await member.as.mutation(api.users.updateMe, {
      name: "Nuevo Nombre",
      phone: "+34600111222",
    });
    expect(await member.as.query(api.users.me, {})).toMatchObject({
      name: "Nuevo Nombre",
      phone: "+34600111222",
      role: "member",
    });
    // Team notifications are in-app only: the profile carries no channel preference.
    expect(Object.keys((await member.as.query(api.users.me, {}))!).sort()).toEqual([
      "_id",
      "email",
      "name",
      "phone",
      "role",
    ]);
    await expect(
      // @ts-expect-error role is not an accepted argument
      member.as.mutation(api.users.updateMe, { name: "X", role: "admin" }),
    ).rejects.toThrow();
  });
});
