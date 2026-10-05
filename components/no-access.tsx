import { LockIcon } from "lucide-react";

export function NoAccess({ message = "No tienes acceso a esta sección" }: { message?: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 py-16 text-center">
      <LockIcon className="size-10 text-muted-foreground" />
      <p className="text-[1.0625rem] text-muted-foreground">{message}</p>
    </div>
  );
}
