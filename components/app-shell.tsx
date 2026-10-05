"use client";

import { useConvexAuth, useQuery } from "convex/react";
import {
  BellIcon,
  ClipboardListIcon,
  KanbanSquareIcon,
  LogOutIcon,
  MessageSquareIcon,
  SettingsIcon,
  UserIcon,
  UsersIcon,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { CurrentUserContext } from "@/components/current-user";
import {
  NotificationBell,
  UnreadCount,
  unreadLabel,
  useUnreadCount,
} from "@/components/notification-bell";
import { api } from "@/convex/_generated/api";
import { authClient } from "@/lib/auth-client";
import { initials } from "@/lib/initials";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/boards", label: "Tableros", icon: KanbanSquareIcon },
  { href: "/mis-tareas", label: "Mis tareas", icon: ClipboardListIcon },
];

// Set once we start leaving for /login, so the sign-out click and the
// auth-state effect below don't both trigger a navigation.
let leaving = false;

function goToLogin() {
  if (leaving) return;
  leaving = true;
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- full reload resets the Convex auth token
  window.location.assign("/login");
}

/** Signs out and reloads, so the Convex client starts without the old token. */
export async function signOut() {
  if (leaving) return;
  leaving = true;
  await authClient.signOut();
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- full reload resets the Convex auth token
  window.location.assign("/login");
}

export function AppShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { isLoading: authLoading, isAuthenticated } = useConvexAuth();
  const me = useQuery(api.users.me, isAuthenticated ? {} : "skip");
  const info = useQuery(api.settings.publicInfo, {});

  // Keep the tab title's app-name suffix in sync when an admin renames the app.
  useEffect(() => {
    if (!info) return;
    const [page] = document.title.split(" · ");
    document.title = page && page !== info.appName ? `${page} · ${info.appName}` : info.appName;
  }, [info, pathname]);

  // The account was deactivated (or deleted) mid-session: `me` is only null
  // when the server answered an authenticated request.
  useEffect(() => {
    if (me === null) void signOut();
  }, [me]);

  // The session expired in this tab.
  useEffect(() => {
    if (!authLoading && !isAuthenticated) goToLogin();
  }, [authLoading, isAuthenticated]);

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="sticky top-0 z-40 bg-primary text-primary-foreground shadow-[0_1px_0_rgb(0_0_0/0.2),0_6px_18px_-12px_rgb(14_21_34/0.6)]">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 md:px-6">
          <Link
            href="/boards"
            className="flex min-w-0 items-center gap-3 rounded-md focus-visible:ring-3 focus-visible:ring-white/60 focus-visible:outline-none"
          >
            <span className="flex h-11 shrink-0 items-center rounded-sm bg-white px-1.5 py-1">
              <Image
                src="/brand/logo.png"
                alt=""
                width={241}
                height={356}
                priority
                className="h-full w-auto"
              />
            </span>
            <span className="min-w-0 truncate font-display text-xl leading-none font-bold tracking-[0.02em] uppercase">
              {info?.appName ?? ""}
            </span>
          </Link>
          <nav aria-label="Principal" className="ml-4 hidden h-full items-stretch gap-1 md:flex">
            {NAV.map((item) => {
              const active = pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "relative flex items-center px-3 font-label text-[0.9375rem] font-semibold tracking-[0.06em] whitespace-nowrap uppercase transition-colors focus-visible:bg-white/12 focus-visible:outline-none",
                    active
                      ? "text-primary-foreground after:absolute after:inset-x-3 after:bottom-0 after:h-1 after:rounded-t-sm after:bg-white"
                      : "text-primary-foreground/75 hover:text-primary-foreground",
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <div className="ml-auto flex items-center gap-1">
            {me && (
              <span className="hidden md:inline-flex">
                <NotificationBell />
              </span>
            )}
            {me ? (
              <DropdownMenu>
                <DropdownMenuTrigger
                  aria-label="Menú de usuario"
                  className="rounded-full p-1 outline-none focus-visible:ring-3 focus-visible:ring-white/60"
                >
                  <Avatar className="size-9 ring-2 ring-white/80">
                    <AvatarFallback className="bg-white text-primary">{initials(me.name)}</AvatarFallback>
                  </Avatar>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-64">
                  <DropdownMenuGroup>
                    <DropdownMenuLabel className="normal-case tracking-normal">
                      <div className="truncate font-sans text-base font-semibold text-foreground">{me.name}</div>
                      <div className="truncate font-sans text-sm font-normal">{me.email}</div>
                    </DropdownMenuLabel>
                  </DropdownMenuGroup>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => router.push("/perfil")}>
                    <UserIcon /> Mi perfil
                  </DropdownMenuItem>
                  {me.role === "admin" && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuGroup>
                        <DropdownMenuLabel>Administración</DropdownMenuLabel>
                        <DropdownMenuItem onClick={() => router.push("/admin/usuarios")}>
                          <UsersIcon /> Usuarios
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => router.push("/admin/envios")}>
                          <MessageSquareIcon /> Envíos de SMS
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => router.push("/admin/ajustes")}>
                          <SettingsIcon /> Ajustes
                        </DropdownMenuItem>
                      </DropdownMenuGroup>
                    </>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => void signOut()}>
                    <LogOutIcon /> Cerrar sesión
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <Skeleton className="size-9 rounded-full bg-white/20" />
            )}
          </div>
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col px-4 pt-5 pb-[calc(var(--tabbar-height)+env(safe-area-inset-bottom)+1.5rem)] md:px-6 md:pt-7 md:pb-10">
        {me ? (
          <CurrentUserContext value={me}>{children}</CurrentUserContext>
        ) : (
          <div className="flex flex-col gap-3">
            <Skeleton className="h-9 w-56" />
            <Skeleton className="h-40 w-full" />
          </div>
        )}
      </main>
      {me && <TabBar pathname={pathname} />}
    </div>
  );
}

/** Phone navigation: the four places people go, always under the thumb. */
function TabBar({ pathname }: { pathname: string }) {
  const unread = useUnreadCount();
  const tabs = [
    ...NAV,
    { href: "/notificaciones", label: "Avisos", icon: BellIcon },
    { href: "/perfil", label: "Perfil", icon: UserIcon },
  ];
  return (
    <nav
      aria-label="Principal"
      className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-rule bg-card shadow-[0_-6px_20px_-14px_rgb(14_21_34/0.5)] md:hidden"
    >
      <ul className="grid h-(--tabbar-height) grid-cols-4">
        {tabs.map(({ href, label, icon: Icon }) => {
          const active = pathname.startsWith(href);
          const isInbox = href === "/notificaciones";
          return (
            <li key={href} className="flex">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                aria-label={isInbox ? unreadLabel(unread) : undefined}
                className={cn(
                  "relative flex flex-1 flex-col items-center justify-center gap-1 font-label text-[0.8125rem] font-semibold tracking-[0.04em] uppercase transition-colors focus-visible:bg-accent focus-visible:outline-none",
                  active
                    ? "text-primary before:absolute before:inset-x-5 before:top-0 before:h-1 before:rounded-b-sm before:bg-primary"
                    : "text-muted-foreground active:bg-muted",
                )}
              >
                <span className="relative">
                  <Icon className="size-6" strokeWidth={active ? 2.25 : 1.9} />
                  {isInbox && (
                    <UnreadCount unread={unread} className="absolute -top-1.5 left-4 ring-2 ring-card" />
                  )}
                </span>
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
