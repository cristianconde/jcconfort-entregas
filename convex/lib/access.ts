import { ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";

/**
 * Resolves the signed-in user's profile from the session identity.
 * Better Auth is the only JWT issuer, so `identity.subject` (the Better Auth
 * user id) uniquely identifies the account.
 */
export async function getCurrentUser(ctx: QueryCtx): Promise<Doc<"users"> | null> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;
  return await ctx.db
    .query("users")
    .withIndex("by_authUserId", (q) => q.eq("authUserId", identity.subject))
    .unique();
}

export async function requireUser(ctx: QueryCtx): Promise<Doc<"users">> {
  const user = await getCurrentUser(ctx);
  if (!user) throw new ConvexError("No has iniciado sesión");
  if (!user.isActive) throw new ConvexError("Tu cuenta está desactivada");
  return user;
}

export async function requireAdmin(ctx: QueryCtx): Promise<Doc<"users">> {
  const user = await requireUser(ctx);
  if (user.role !== "admin") throw new ConvexError("No tienes permisos de administrador");
  return user;
}

export async function isBoardMember(
  ctx: QueryCtx,
  boardId: Id<"boards">,
  userId: Id<"users">,
): Promise<boolean> {
  const membership = await ctx.db
    .query("boardMembers")
    .withIndex("by_boardId_and_userId", (q) => q.eq("boardId", boardId).eq("userId", userId))
    .unique();
  return membership !== null;
}

/**
 * Requires the signed-in user to be able to see the board: admins see every
 * board, members only boards they belong to.
 */
export async function requireBoardAccess(
  ctx: QueryCtx,
  boardId: Id<"boards">,
): Promise<{ user: Doc<"users">; board: Doc<"boards"> }> {
  const user = await requireUser(ctx);
  const board = await ctx.db.get("boards", boardId);
  if (!board) throw new ConvexError("El tablero no existe");
  if (user.role !== "admin" && !(await isBoardMember(ctx, boardId, user._id))) {
    throw new ConvexError("No tienes acceso a este tablero");
  }
  return { user, board };
}

/** Like requireBoardAccess, but also refuses changes on archived boards. */
export async function requireWritableBoard(
  ctx: QueryCtx,
  boardId: Id<"boards">,
): Promise<{ user: Doc<"users">; board: Doc<"boards"> }> {
  const result = await requireBoardAccess(ctx, boardId);
  if (result.board.isArchived) {
    throw new ConvexError("El tablero está archivado y no se puede modificar");
  }
  return result;
}
