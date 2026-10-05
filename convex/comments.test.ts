import { expect, test } from "vitest";
import { api } from "./_generated/api";
import { seedBoard, seedUser, setup } from "./test.helpers";

async function world() {
  const t = setup();
  const admin = await seedUser(t, { role: "admin", name: "Admin" });
  const ana = await seedUser(t, { name: "Ana" });
  const luis = await seedUser(t, { name: "Luis" });
  const { boardId } = await seedBoard(admin, t, [ana.id, luis.id]);
  const taskId = await ana.as.mutation(api.tasks.create, { boardId, title: "T" });
  return { t, admin, ana, luis, taskId };
}

test("members add comments visible to everyone with author and permissions", async () => {
  const { ana, luis, taskId } = await world();
  await ana.as.mutation(api.comments.add, { taskId, body: " Llego a las 10 " });
  const seenByLuis = await luis.as.query(api.comments.list, { taskId });
  expect(seenByLuis).toMatchObject([
    { body: "Llego a las 10", authorName: "Ana", canEdit: false, canDelete: false },
  ]);
});

test("body length is validated", async () => {
  const { ana, taskId } = await world();
  await expect(ana.as.mutation(api.comments.add, { taskId, body: "  " })).rejects.toThrow(
    "entre 1 y 5000",
  );
  await expect(
    ana.as.mutation(api.comments.add, { taskId, body: "x".repeat(5001) }),
  ).rejects.toThrow("entre 1 y 5000");
});

test("only the author edits; author or admin deletes; deletion is logged", async () => {
  const { admin, ana, luis, taskId } = await world();
  const commentId = await ana.as.mutation(api.comments.add, { taskId, body: "Hola" });
  await expect(luis.as.mutation(api.comments.edit, { commentId, body: "X" })).rejects.toThrow(
    "tus propios comentarios",
  );
  await expect(luis.as.mutation(api.comments.remove, { commentId })).rejects.toThrow(
    "tus propios comentarios",
  );
  await ana.as.mutation(api.comments.edit, { commentId, body: "Hola, editado" });
  const [edited] = await ana.as.query(api.comments.list, { taskId });
  expect(edited).toMatchObject({ body: "Hola, editado" });
  expect(edited?.editedAt).toBeTypeOf("number");

  await admin.as.mutation(api.comments.remove, { commentId });
  expect(await ana.as.query(api.comments.list, { taskId })).toHaveLength(0);
  const [latest] = await ana.as.query(api.tasks.activity, { taskId });
  expect(latest).toMatchObject({ kind: "comment_deleted", actorName: "Admin", from: "Ana" });
});
