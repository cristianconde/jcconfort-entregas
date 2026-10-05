import type { Id } from "@/convex/_generated/dataModel";
import { BoardView } from "./board-view";

export default async function BoardPage(props: PageProps<"/boards/[boardId]">) {
  const { boardId } = await props.params;
  return <BoardView boardId={boardId as Id<"boards">} />;
}
