import type { Metadata } from "next";
import { BoardList } from "./board-list";

export const metadata: Metadata = { title: "Tableros" };

export default function BoardsPage() {
  return <BoardList />;
}
