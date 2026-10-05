import type { Metadata } from "next";
import type { Id } from "@/convex/_generated/dataModel";
import { TaskPage } from "./task-page";

export const metadata: Metadata = { title: "Tarea" };

export default async function Page(props: PageProps<"/tasks/[taskId]">) {
  const { taskId } = await props.params;
  return <TaskPage taskId={taskId as Id<"tasks">} />;
}
