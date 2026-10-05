import { expect, test } from "vitest";
import { seedUser, setup } from "../test.helpers";
import { requireAdmin, requireBoardAccess, requireUser, requireWritableBoard } from "./access";

test("no identity is rejected", async () => {
  const t = setup();
  await expect(t.run((ctx) => requireUser(ctx))).rejects.toThrow("No has iniciado sesión");
});

test("identity without a profile is rejected", async () => {
  const t = setup();
  await expect(
    t.withIdentity({ subject: "ghost" }).run((ctx) => requireUser(ctx)),
  ).rejects.toThrow("No has iniciado sesión");
});

test("deactivated profile is rejected", async () => {
  const t = setup();
  const user = await seedUser(t, { isActive: false });
  await expect(user.as.run((ctx) => requireUser(ctx))).rejects.toThrow(
    "Tu cuenta está desactivada",
  );
});

test("members are not admins", async () => {
  const t = setup();
  const member = await seedUser(t);
  const admin = await seedUser(t, { role: "admin" });
  await expect(member.as.run((ctx) => requireAdmin(ctx))).rejects.toThrow("administrador");
  expect((await admin.as.run((ctx) => requireAdmin(ctx)))._id).toBe(admin.id);
});

test("board access: members only on their boards, admins everywhere, archived is read-only", async () => {
  const t = setup();
  const member = await seedUser(t);
  const outsider = await seedUser(t);
  const admin = await seedUser(t, { role: "admin" });
  const boardId = await t.run(async (ctx) => {
    const id = await ctx.db.insert("boards", { name: "B", isArchived: false });
    await ctx.db.insert("boardMembers", { boardId: id, userId: member.id });
    return id;
  });

  await expect(member.as.run((ctx) => requireBoardAccess(ctx, boardId))).resolves.toBeTruthy();
  await expect(admin.as.run((ctx) => requireBoardAccess(ctx, boardId))).resolves.toBeTruthy();
  await expect(outsider.as.run((ctx) => requireBoardAccess(ctx, boardId))).rejects.toThrow(
    "No tienes acceso a este tablero",
  );

  await t.run((ctx) => ctx.db.patch("boards", boardId, { isArchived: true }));
  await expect(member.as.run((ctx) => requireBoardAccess(ctx, boardId))).resolves.toBeTruthy();
  await expect(member.as.run((ctx) => requireWritableBoard(ctx, boardId))).rejects.toThrow(
    "archivado",
  );
});
