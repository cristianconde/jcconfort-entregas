import type { Metadata } from "next";
import { MyTasks } from "./my-tasks";

export const metadata: Metadata = { title: "Mis tareas" };

export default function MyTasksPage() {
  return <MyTasks />;
}
