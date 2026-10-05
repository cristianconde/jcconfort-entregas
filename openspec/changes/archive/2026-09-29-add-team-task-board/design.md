# Design

## Context

The repo is a bare scaffold: Next.js 16.3 (App Router, React 19.2, Tailwind v4), Convex 1.45 with a provisioned deployment (`CONVEX_DEPLOYMENT`, `NEXT_PUBLIC_CONVEX_URL`, `NEXT_PUBLIC_CONVEX_SITE_URL` in `.env.local`) but no `convex/schema.ts`, no functions, and no Convex provider in `app/layout.tsx`. pnpm is the package manager. Next 16 has breaking changes versus older versions — implementation must consult `node_modules/next/dist/docs/` (e.g. `proxy.ts` replaces `middleware.ts`, async `params`/`cookies()`). Convex code must follow `convex/_generated/ai/guidelines.md`.

Requirements live in `specs/*/spec.md`; motivation in `proposal.md`.

## Goals / Non-Goals

**Goals:**
- One Convex backend that is the single source of truth, with every authorization check done server-side in Convex functions.
- Real-time board and inbox updates through Convex reactive queries (no polling, no custom websockets).
- A notification pipeline where adding an automatic WhatsApp provider later is a new channel file plus a settings toggle.

**Non-Goals:**
- Offline support, optimistic multi-user conflict resolution beyond Convex's transactional last-write-wins.
- Email delivery of notifications.
- Internationalization framework — Spanish strings are written directly (a later i18n pass can extract them).

## Decisions

### 1. Auth: Better Auth on Convex via `@convex-dev/better-auth`
Mount the `betterAuth` component in `convex/convex.config.ts`, create the auth instance in `convex/auth.ts` with `emailAndPassword: { enabled: true, disableSignUp: true }`, register its HTTP routes in `convex/http.ts`, proxy `/api/auth/*` from Next.js to the Convex site URL, and wrap the app in `ConvexBetterAuthProvider`. Add `convex/auth.config.ts` pointing at the Convex site as the JWT issuer so `ctx.auth.getUserIdentity()` works.
- **Why**: user chose Better Auth; the Convex component keeps auth data inside the same deployment and gives JWTs Convex understands.
- **Account creation with sign-up disabled**: use Better Auth's server-side API (admin plugin `createUser` / `setUserPassword`) called from Convex functions that first verify the caller is an app admin. First-run bootstrap uses the same server path, guarded by "no rows in `users`" checked inside the mutation that creates the profile.
- **Alternative considered**: Convex Auth — simpler, but not what the user chose. Clerk — external service, rejected.
- The exact component API (`createClient`, `authComponent.getAuthUser`, Next.js handler helpers) must be verified against the installed package's README at implementation time, since it evolves quickly.

### 2. App-owned `users` profile table, linked to the Better Auth user
Roles, active flag, phone, and notification preferences live in our own `users` table (`authUserId`, `email` (lowercased), `name`, `role`, `isActive`, `phone?`, `whatsappEnabled`), indexed `by_authUserId` and `by_email`. A shared helper `requireUser(ctx)` / `requireAdmin(ctx)` resolves the session identity → profile, and throws if missing or `!isActive`. Every public query/mutation starts with one of these.
- **Why**: keeps domain authorization independent of the auth library's schema, and lets tasks reference `Id<"users">`. Deactivation is enforced by our helper on every call (satisfies "deactivated mid-session"), and additionally by banning in Better Auth so new sign-ins fail with the right message.
- **Alternative**: rely solely on Better Auth admin-plugin `role`/`banned` fields — rejected because those live in component tables that our queries can't index or join cheaply.

### 3. Data model (Convex)
- `settings` — single document (app name, timezone, reminderLeadHours, enabledChannels). Read via helper returning defaults when absent.
- `boards` — name, description, isArchived.
- `boardMembers` — boardId, userId; indexes `by_boardId_and_userId`, `by_userId`. Separate table (not an array on the board) per guidelines.
- `boardStatuses` — boardId, name, order, isDone; index `by_boardId_and_order`. Invariant "exactly one isDone per board" enforced in the status mutations.
- `tasks` — boardId, statusId, title, description, assigneeId?, creatorId, priority, order (fractional, for in-column position), deadlineAt? (UTC ms), deadlineHasTime, completedAt?, isOpen (denormalized `!status.isDone`), reminderSentFor?, overdueSentFor? (deadline value a reminder was sent for). Indexes: `by_boardId_and_statusId_and_order`, `by_assigneeId_and_isOpen_and_deadlineAt`, `by_isOpen_and_deadlineAt`.
- `comments` — taskId, authorId, body, editedAt?; index `by_taskId`.
- `activity` — taskId, actorId, kind, from?, to?; index `by_taskId`.
- `notifications` — userId, kind, taskId, actorId?, text, readAt?; index `by_userId_and_readAt`.
- `deliveries` — notificationId, userId (recipient), channel, state (pending/sent/failed/dismissed), offeredToUserId? (actor or null → admin queue), payload (e.g. wa.me URL), error?; indexes `by_offeredToUserId_and_state`, `by_channel_and_state`.
- **Why `isOpen` denormalized**: reminder cron and "overdue" filters need an index range on open tasks by deadline; status documents can't be joined in an index. Every status move and every board-status `isDone` change updates affected tasks in the same mutation.

### 4. Deadlines stored as absolute UTC timestamps
Client sends a local date (+ optional time); the server converts using the settings timezone into `deadlineAt` (date-only → 23:59:59.999 local). Display converts back with the same timezone. Use `@date-fns/tz` (small, IANA-aware) on both sides; validate timezones with `Intl.supportedValuesOf("timeZone")`.
- **Why**: range queries and cron comparisons become plain number comparisons.
- Queries never call `Date.now()` (guideline): overdue filters/counts take a `now` argument that the client refreshes every minute.

### 5. Notification pipeline with a channel registry
`notify(ctx, { recipients, kind, taskId, actorId })` is a plain helper called inside the same mutation as the triggering change: it drops the actor, inserts `notifications`, then for each registered external channel calls `channel.plan(ctx, recipient, notification, settings)` which may insert a `deliveries` row.

```
interface NotificationChannel {
  id: "whatsapp_link" | ...;             // future: "whatsapp_callmebot", "whatsapp_twilio"
  mode: "manual" | "automatic";
  isEnabledFor(user, settings): boolean; // global toggle + user pref + phone present
  buildPayload(notification, user, appUrl): Payload;
  send?(payload): Promise<Result>;       // automatic channels only, run in an internalAction
}
```
- Manual channels (the `wa.me` channel) store the prefilled URL; the UI shows pending deliveries offered to the current user (toast after the action) or, for system events, in the admin queue. Opening the link calls `markSent`; dismissing calls `dismiss`.
- Automatic channels (future) get `ctx.scheduler.runAfter(0, internal.deliveries.send, { deliveryId })`, which retries idempotently and updates state. The `@convex-dev/workpool` component can be introduced then if rate-limiting is needed.
- **Why**: creation logic never changes when a channel is added — only a new file in the registry and a settings toggle.
- **Alternative**: generating `wa.me` links purely client-side — rejected because system reminders have no client, and we want one record of what was sent.

### 6. Reminder cron
`crons.interval("deadline reminders", { minutes: 15 }, internal.reminders.run)`. The internal mutation reads settings, scans `by_isOpen_and_deadlineAt` for `isOpen = true` and `deadlineAt <= now + lead` in `.take(200)` batches (reschedules itself if more), and for each task with an assignee sends a reminder if `reminderSentFor !== deadlineAt` and overdue alert if `deadlineAt < now && overdueSentFor !== deadlineAt`, then patches the marker. Editing a deadline naturally "resets" because markers are compared to the current value.

### 7. Frontend
- Routes (`app/`): `/login`, `/setup`, `/(app)/boards`, `/(app)/boards/[boardId]`, `/(app)/boards/[boardId]/settings`, `/(app)/tasks/[taskId]` (also opened as a sheet from the board), `/(app)/mis-tareas`, `/(app)/notificaciones`, `/(app)/perfil`, `/(app)/admin/usuarios`, `/(app)/admin/ajustes`, `/(app)/admin/whatsapp`.
- A `proxy.ts` (Next 16's replacement for middleware) redirects unauthenticated requests to `/login` as a UX convenience; real protection is server-side in Convex.
- UI: shadcn/ui components on Tailwind v4, `@dnd-kit/core` + `@dnd-kit/sortable` for Kanban drag-and-drop, `sonner` toasts for the "Avisar por WhatsApp" offer. Mobile-first layout: the team will mostly use phones.
- Filters are URL search params so filtered views are shareable.

### 8. Testing
`vitest` + `convex-test` + `@edge-runtime/vm` for Convex functions, focusing on authorization (member vs admin vs non-member vs deactivated), status invariants, notification fan-out rules, and reminder idempotency. Auth-library internals are mocked via `t.withIdentity(...)` plus seeded `users` rows.

### 9. Implementation notes (verified against installed packages, task 1.4)
- **Next 16.3**: `proxy.ts` (named export `proxy`) replaces `middleware.ts`; it always runs on Node.js and must only do optimistic checks. `params`/`searchParams`/`cookies()`/`headers()` are async-only; use the global `PageProps<'/route'>` / `LayoutProps` helpers. Parallel-route slots need `default.tsx`.
- **shadcn/ui** initialised with the `base-nova` preset, which is built on **Base UI** (`@base-ui/react`), not Radix: composition uses the `render` prop instead of `asChild`.
- **Better Auth pinned to `~1.6.33`** (`@convex-dev/better-auth@0.12.5` peer range is `>=1.6.11 <1.7.0`).
- **Deviation from Decision 1 — no admin plugin, no `disableSignUp`**:
  - `emailAndPassword.disableSignUp` also blocks server-side `auth.api.signUpEmail`, so admins could not create accounts. The component's default schema also lacks the admin plugin's `role`/`banned` fields (would require a local schema install).
  - Instead: sign-up stays technically enabled but is **gated twice**: (1) a Better Auth `hooks.before` rejects `/sign-up/email` whenever it arrives as an HTTP request (server-side `auth.api` calls carry no request); (2) the component's `user.onCreate` **trigger** (runs inside the same transaction as the insert) creates the `users` profile only from a matching `pendingAccounts` row (written by the admin-create or bootstrap action) and **throws otherwise**, rolling back the account.
  - Account creation and password resets run in **actions** (password hashing is CPU-heavy), using `auth.api.signUpEmail` and `(await auth.$context).password.hash` + `internalAdapter.updatePassword`.
  - Deactivation: `databaseHooks.session.create.before` refuses sign-in for inactive profiles with "Tu cuenta está desactivada"; deactivating also deletes the user's sessions; `requireUser` still checks `isActive` on every call.

## Risks / Trade-offs

- [`@convex-dev/better-auth` API churn] → Pin versions; follow the package README for the installed version; isolate auth glue in `convex/auth.ts` and `lib/auth-client.ts`.
- [Two sources of user truth (Better Auth user vs `users` profile) can drift] → Create/update both in one server path; profile is authoritative for role/active; a startup check lists auth users without profiles.
- [`wa.me` links are not automatic — reminders need a human to click] → Admin queue makes pending sends visible; the channel abstraction lets an automatic provider replace it later. Documented in the UI ("Envío manual").
- [Changing the app timezone does not shift existing deadlines] → Deadlines are absolute instants; the settings page warns that existing deadlines keep their instant.
- [Denormalized `isOpen` could go stale] → Only updated through two helpers (`moveTask`, `setDoneStatus`), both covered by tests.
- [Board overview counts scan tasks] → Fine for a small team with bounded `.take()`; if boards grow large, switch to `@convex-dev/aggregate`.

## Migration Plan

Greenfield — no data to migrate. Deploy order: set Convex env vars (`BETTER_AUTH_SECRET`, `SITE_URL`) → `npx convex deploy` → deploy Next.js to Vercel with `NEXT_PUBLIC_CONVEX_URL` / `NEXT_PUBLIC_CONVEX_SITE_URL` → open `/setup` to create the first admin. Rollback: redeploy the previous frontend; the backend has no prior version.

## Open Questions

- Should reminders also go to the task creator, not only the assignee? (Easy to add to the recipient list later without changing the pipeline.)
- Which automatic WhatsApp provider, if any, to add next (CallMeBot vs Twilio) — deferred by the user.
