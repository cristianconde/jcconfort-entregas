"use client";

import { SearchIcon, XIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Id } from "@/convex/_generated/dataModel";
import { PRIORITY_ITEMS } from "@/lib/labels";
import { cn } from "@/lib/utils";
import type { TaskFilters } from "./use-task-filters";

const ANY = "__any__";

function Toggle({
  pressed,
  onClick,
  children,
}: {
  pressed: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Button
      variant="outline"
      size="sm"
      aria-pressed={pressed}
      onClick={onClick}
      className={cn(
        "h-11 shrink-0 border-rule",
        pressed && "border-ink bg-ink text-ink-foreground hover:bg-ink/90 hover:text-ink-foreground",
      )}
    >
      {children}
    </Button>
  );
}

export function FilterBar({
  filters,
  members,
  activeCount,
  update,
}: {
  filters: TaskFilters;
  members: { _id: Id<"users">; name: string }[];
  activeCount: number;
  update: (changes: Record<string, string | null>) => void;
}) {
  // Debounce the text search so the URL (and query) don't change per keystroke.
  const [search, setSearch] = useState(filters.search);
  useEffect(() => {
    if (search === filters.search) return;
    const id = setTimeout(() => update({ q: search || null }), 300);
    return () => clearTimeout(id);
  }, [search, filters.search, update]);

  const assigneeItems = [
    { value: ANY, label: "Cualquier persona" },
    ...members.map((m) => ({ value: m._id, label: m.name })),
  ];
  const priorityItems = [{ value: ANY, label: "Cualquier prioridad" }, ...PRIORITY_ITEMS];

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
      <div className="relative sm:w-64">
        <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          aria-label="Buscar por título"
          placeholder="Buscar por título"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className="pl-10"
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
      <Toggle pressed={filters.mine} onClick={() => update({ mine: filters.mine ? null : "1" })}>
        Mis tareas
      </Toggle>
      <Toggle
        pressed={filters.unassigned}
        onClick={() => update({ unassigned: filters.unassigned ? null : "1", assignee: null })}
      >
        Sin asignar
      </Toggle>
      <Toggle
        pressed={filters.overdue}
        onClick={() => update({ overdue: filters.overdue ? null : "1" })}
      >
        Vencidas
      </Toggle>
      <Select
        items={assigneeItems}
        value={filters.assigneeId ?? ANY}
        onValueChange={(value) =>
          update({ assignee: value === ANY ? null : String(value), unassigned: null })
        }
      >
        <SelectTrigger size="sm" aria-label="Filtrar por persona" className="h-11! shrink-0 border-[1.5px] border-rule">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {assigneeItems.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        items={priorityItems}
        value={filters.priority ?? ANY}
        onValueChange={(value) => update({ priority: value === ANY ? null : String(value) })}
      >
        <SelectTrigger size="sm" aria-label="Filtrar por prioridad" className="h-11! shrink-0 border-[1.5px] border-rule">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {priorityItems.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {activeCount > 0 && (
        <Button
          variant="ghost"
          size="sm"
          className="h-11 shrink-0 text-primary underline underline-offset-4 hover:bg-accent"
          onClick={() => {
            setSearch("");
            update({ mine: null, assignee: null, unassigned: null, priority: null, overdue: null, q: null });
          }}
        >
          <XIcon /> Quitar filtros
        </Button>
      )}
      </div>
    </div>
  );
}
