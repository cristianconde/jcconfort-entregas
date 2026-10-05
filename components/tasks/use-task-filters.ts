"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";
import type { Id } from "@/convex/_generated/dataModel";
import type { Priority } from "@/lib/labels";

export type TaskFilters = {
  mine: boolean;
  assigneeId?: Id<"users">;
  unassigned: boolean;
  priority?: Priority;
  overdue: boolean;
  search: string;
};

export type BoardViewMode = "kanban" | "list";

/**
 * Board filters, view mode and the open task live in the URL search params so
 * a filtered view (or a task) can be shared by link.
 */
export function useBoardUrlState() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const filters: TaskFilters = {
    mine: params.get("mine") === "1",
    assigneeId: (params.get("assignee") as Id<"users"> | null) ?? undefined,
    unassigned: params.get("unassigned") === "1",
    priority: (params.get("priority") as Priority | null) ?? undefined,
    overdue: params.get("overdue") === "1",
    search: params.get("q") ?? "",
  };
  const view: BoardViewMode = params.get("view") === "list" ? "list" : "kanban";
  const openTaskId = (params.get("task") as Id<"tasks"> | null) ?? null;

  const update = useCallback(
    (changes: Record<string, string | null>) => {
      const next = new URLSearchParams(params.toString());
      for (const [key, value] of Object.entries(changes)) {
        if (value === null || value === "") next.delete(key);
        else next.set(key, value);
      }
      const query = next.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [params, pathname, router],
  );

  const activeFilterCount =
    Number(filters.mine) +
    Number(Boolean(filters.assigneeId)) +
    Number(filters.unassigned) +
    Number(Boolean(filters.priority)) +
    Number(filters.overdue) +
    Number(Boolean(filters.search));

  return { filters, view, openTaskId, update, activeFilterCount };
}
