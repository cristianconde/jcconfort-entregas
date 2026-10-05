"use client";

import { ConvexError } from "convex/values";
import { NoAccess } from "@/components/no-access";

export default function TaskError({ error }: { error: Error }) {
  const message =
    error instanceof ConvexError && typeof error.data === "string"
      ? error.data
      : "No se pudo cargar la tarea";
  return <NoAccess message={message} />;
}
