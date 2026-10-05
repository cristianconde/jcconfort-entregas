import type { Metadata } from "next";
import type { Id } from "@/convex/_generated/dataModel";
import { BoardSettings } from "./board-settings";

export const metadata: Metadata = { title: "Ajustes del tablero" };

export default async function BoardSettingsPage(props: PageProps<"/boards/[boardId]/settings">) {
  const { boardId } = await props.params;
  return <BoardSettings boardId={boardId as Id<"boards">} />;
}
