"use client";

import { useRouter } from "next/navigation";
import { TaskDetail } from "@/components/tasks/task-detail";
import type { Id } from "@/convex/_generated/dataModel";

/** Standalone task page: the target of notification and SMS links. */
export function TaskPage({ taskId }: { taskId: Id<"tasks"> }) {
  const router = useRouter();
  return (
    <div className="-mx-4 -mt-2 sm:mx-auto sm:mt-0 sm:w-full sm:max-w-2xl">
      <TaskDetail taskId={taskId} onDeleted={() => router.replace("/mis-tareas")} />
    </div>
  );
}
