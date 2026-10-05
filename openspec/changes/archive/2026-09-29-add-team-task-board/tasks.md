# Tasks

## 1. Foundation and tooling

- [x] 1.1 Install runtime deps (`better-auth`, `@convex-dev/better-auth`, `@date-fns/tz`, `date-fns`, `@dnd-kit/core`, `@dnd-kit/sortable`, `sonner`) and dev deps (`vitest`, `convex-test`, `@edge-runtime/vm`) with pnpm; verify `pnpm install` succeeds and `pnpm build` still passes
- [x] 1.2 Initialize shadcn/ui for Tailwind v4 and add base components (button, input, dialog, sheet, dropdown-menu, select, badge, card, textarea, avatar, calendar/popover); verify `pnpm build` passes
- [x] 1.3 Add `vitest.config.ts` with `environment: "edge-runtime"` and a `test` script; verify a trivial `convex/smoke.test.ts` runs green with `pnpm test`
- [x] 1.4 Read the relevant Next 16 docs in `node_modules/next/dist/docs/` (proxy, route handlers, async request APIs) and note any deviations from design.md in design.md; verify notes are committed

## 2. Schema, settings, and authorization helpers

- [x] 2.1 Create `convex/schema.ts` with all tables and indexes from design §3; verify `npx convex dev --once` deploys schema without errors
- [x] 2.2 Implement settings helper (`getSettings` with defaults) plus `settings.get` (public, any signed-in user) and `settings.update` (admin, validates app name length, IANA timezone, lead 1–168, channels); verify with convex-test: defaults on fresh DB, member update refused, invalid timezone rejected, lead-time change persisted (spec: app-settings)
- [x] 2.3 Implement `requireUser` / `requireAdmin` / `requireBoardMember` helpers resolving session identity → active `users` profile; verify with convex-test: no identity → error, deactivated profile → error, member on non-member board → error

## 3. Authentication (Better Auth)

- [x] 3.1 Mount the Better Auth component in `convex/convex.config.ts`, add `convex/auth.config.ts`, `convex/auth.ts` (email+password, sign-up gated per design §9), and route registration in `convex/http.ts`, following the installed package README; set `BETTER_AUTH_SECRET` and `SITE_URL` Convex env vars; verify `npx convex dev --once` deploys and `/api/auth/get-session` responds
- [x] 3.2 Add Next.js `/api/auth/[...all]` route handler, `lib/auth-client.ts`, and wrap `app/layout.tsx` with `ConvexBetterAuthProvider`; set Spanish `lang="es"` and metadata; verify the app boots and the session hook returns null when signed out
- [x] 3.3 Implement first-run bootstrap (`users.bootstrapStatus` query + setup action creating the auth user and admin profile only when `users` is empty) and `/setup` page; verify with convex-test that a second bootstrap is refused, and manually that `/setup` redirects to `/login` once a user exists
- [x] 3.4 Build `/login` page (Spanish copy, generic error "Email o contraseña incorrectos", "Tu cuenta está desactivada" for banned users) and sign-out in the app header; verify manually sign-in/sign-out flow
- [x] 3.5 Add `proxy.ts` redirecting unauthenticated requests to `/login` (excluding `/login`, `/setup`, `/api/auth`); verify opening `/boards` signed out redirects to `/login`
- [x] 3.6 Add password change on `/perfil` requiring current password; verify manually that a wrong current password is rejected and the old password keeps working
- [x] 3.7 Verify sign-up is blocked: a direct POST to the Better Auth sign-up endpoint returns an error and creates no user (document the curl command in `README.md`)

## 4. User management

- [x] 4.1 Implement admin user operations: create (auth user + profile, unique lowercased email, E.164 phone validation), update (name, role, phone), reset password, deactivate/reactivate (profile flag + Better Auth ban/unban), with last-active-admin protection; verify with convex-test: duplicate email rejected, invalid phone rejected, member caller refused, last admin cannot be demoted/deactivated (spec: user-management)
- [x] 4.2 Implement `users.list` (admin, search by name/email, bounded) and `users.me` / `users.updateMe` (name, phone, whatsappEnabled; role not editable); verify with convex-test that `updateMe` ignores/refuses role changes and search is case-insensitive
- [x] 4.3 Build `/admin/usuarios` (table, search, create/edit dialogs, deactivate toggle) and `/perfil` (profile + WhatsApp preference); verify manually as admin and that a member gets "no access" on `/admin/usuarios`
- [x] 4.4 On deactivation, ensure deactivated users are excluded from assignee pickers and their tasks show "Asignado a usuario inactivo"; verify with convex-test on the assignable-members query

## 5. Boards and statuses

- [x] 5.1 Implement board CRUD (admin create with default statuses + creator as member, rename/describe, archive/unarchive) and `boards.listMine` (members: own non-archived; admins: all) with open/overdue counts taking a `now` arg; verify with convex-test: default statuses created, member sees only their boards, counts correct (spec: boards)
- [x] 5.2 Implement membership add/remove; removing a member unassigns their open tasks on that board and logs activity; verify with convex-test
- [x] 5.3 Implement status add/rename/reorder/remove/setDone with invariants (≥1 status, exactly one done, removal requires target status for existing tasks) and keep `tasks.isOpen`/`completedAt` in sync on `setDone`; verify with convex-test for each invariant
- [x] 5.4 Build `/boards` (cards with counts, archived toggle for admins) and `/boards/[boardId]/settings` (details, members, status editor); verify manually and that a member hitting a non-member board sees "No tienes acceso a este tablero"
- [x] 5.5 Enforce read-only archived boards in all task/comment mutations; verify with convex-test that creating a task on an archived board is refused

## 6. Tasks, comments, and activity

- [x] 6.1 Implement task create/update/delete/move (status + fractional `order`), assignment validation (active board member), deadline conversion via settings timezone (date-only → 23:59:59.999 local), `isOpen`/`completedAt` maintenance, and activity entries for every tracked field; verify with convex-test: empty title rejected, non-member assignee rejected, non-creator delete refused, completion sets/clears `completedAt`, date-only deadline boundary in Europe/Madrid, activity entries created (spec: tasks)
- [x] 6.2 Implement board task query with filters (mine, assignee, unassigned, priority, overdue with `now` arg, title search) and `tasks.myOpen` across boards sorted by deadline (nulls last); verify with convex-test for each filter and sort order
- [x] 6.3 Implement comments (add/edit own/delete own or admin, 1–5000 chars) and activity log query; verify with convex-test for permission rules and that comment deletion is logged
- [x] 6.4 Build Kanban view with `@dnd-kit` drag between/within columns, list view, filter bar backed by URL search params, and "Vencida" highlight with a client clock refreshed every minute; verify manually on desktop and mobile width, and that a move in one browser appears live in another
- [x] 6.5 Build task detail sheet/page (edit fields, deadline picker with optional time, assignee picker, comments, activity timeline, delete with confirmation) and `/mis-tareas`; verify manually against spec scenarios

## 7. Notifications and WhatsApp channel

- [x] 7.1 Implement the channel registry and `notify` helper (drops the actor, inserts notifications, plans deliveries per enabled channel) plus the `whatsapp_link` channel building Spanish messages and `https://wa.me/<digits>?text=` URLs; verify with unit tests: message contents/encoding, no delivery when channel disabled globally, user pref off, or phone missing (spec: notifications)
- [x] 7.2 Wire `notify` into assignment, status change, and comment mutations with the correct recipients; verify with convex-test: assignment notifies assignee only, self-assignment creates nothing, status change notifies assignee + creator minus actor
- [x] 7.3 Implement inbox queries/mutations (list newest first, unread count, mark read, mark all read) and delivery mutations (`listOfferedToMe`, `adminQueue`, `markSent`, `dismiss` with ownership/admin checks); verify with convex-test
- [x] 7.4 Implement `convex/crons.ts` (every 15 min) and `reminders.run` internal mutation with batching and `reminderSentFor`/`overdueSentFor` idempotency; verify with convex-test: reminder sent once, re-sent after deadline change, overdue alert once, done tasks skipped, lead time from settings respected
- [x] 7.5 Build inbox UI (bell with live unread badge, `/notificaciones`), post-action "Avisar por WhatsApp" toast for deliveries offered to the current user, and `/admin/whatsapp` pending queue; verify manually that opening a link launches WhatsApp with the prefilled message and marks it sent, and dismiss hides it
- [x] 7.6 Document the channel contract and how to add an automatic provider (CallMeBot/Twilio) in `convex/notifications/README.md`; verify the doc references the actual file/function names

## 8. App settings UI and integration

- [x] 8.1 Build `/admin/ajustes` (app name, timezone select, lead time, channel toggles, timezone-change warning) and show the app name in header/page title; verify manually that renaming updates for other signed-in users live
- [x] 8.2 Replace the create-next-app placeholder home with a redirect to `/boards` (or `/login`) and remove unused template assets; verify `pnpm build` and `pnpm lint` pass
- [x] 8.3 Update `README.md` with setup (env vars, `npx convex dev`, first-run `/setup`), roles, and WhatsApp manual-send behavior; verify a fresh clone following the README reaches the board screen
- [x] 8.4 End-to-end check: as admin create a board and two members; as member A create and assign a task to B with a deadline in 1 hour; confirm B's inbox updates live, A gets the WhatsApp offer, the reminder appears in the admin queue after the cron runs, and moving to "Hecha" stops overdue alerts; verify `pnpm test`, `pnpm lint`, `pnpm build` all pass
