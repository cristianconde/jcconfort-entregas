import { ConvexError } from "convex/values";

/** User-facing (Spanish) message for an error thrown by a Convex function. */
export function errorMessage(error: unknown): string {
  if (error instanceof ConvexError && typeof error.data === "string") return error.data;
  return "Ha ocurrido un error. Inténtalo de nuevo.";
}
