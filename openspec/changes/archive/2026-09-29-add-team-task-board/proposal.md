# Proposal

## Why

The JC Confort team coordinates its work (deliveries, installations, follow-ups) informally, so tasks get lost, nobody knows who owns what, and deadlines slip unnoticed. We need a lightweight, Trello/Jira-style board that lets the team create and assign tasks, track their status and deadlines, and get notified — ideally over WhatsApp, which the team already uses — without the weight or cost of a full project-management tool.

The repository is currently a fresh Next.js 16 + Convex scaffold with no domain code, so this change establishes the application's foundation.

## What Changes

- Add authentication with **Better Auth** (email + password) running on Convex via the `@convex-dev/better-auth` component. No public sign-up: accounts are created by an admin; the very first account bootstraps as admin.
- Add two roles: **admin** (manages users, boards, and app settings) and **member** (works on tasks).
- Add **boards** (projects) created and managed by admins; members see boards they belong to.
- Add **tasks** inside a board with title, description, assignee, status, priority, and optional deadline; shown as a Kanban board with filters (mine, by assignee, overdue).
- Add **configurable statuses** per board (default: Pendiente, En progreso, Bloqueada, Hecha), with one status flagged as "done".
- Add task **comments** and an **activity log** (who changed what, when).
- Add **notifications**: an in-app notification inbox is always on; delivery to external channels goes through a **pluggable channel interface**. The first external channel is **WhatsApp click-to-send (`wa.me` links)** — no Meta API, no cost. The design leaves room for automatic channels (CallMeBot, Twilio) later without refactoring.
- Notify on: task assigned to you, status change on a task you own/created, new comment on your task, deadline approaching (configurable lead time), and task overdue.
- Add **app settings** (admin-only): app name, default reminder lead time, enabled notification channels, and timezone.
- All UI copy and notification messages are in **Spanish**.

## Capabilities

### New Capabilities
- `auth`: Sign-in / sign-out with Better Auth email+password, session handling, first-user admin bootstrap, no self sign-up.
- `user-management`: Admin creates, edits, deactivates users, assigns roles, and records each user's WhatsApp phone number and notification preferences.
- `boards`: Admin-managed boards (projects) with membership and a per-board configurable status list.
- `tasks`: Create, edit, assign, move between statuses, set deadlines and priority, comment, and view activity history; Kanban and filtered list views.
- `notifications`: In-app inbox, event-to-notification rules, deadline reminders and overdue alerts, and a pluggable delivery-channel abstraction with a WhatsApp `wa.me` channel.
- `app-settings`: Admin-only global configuration (app name, timezone, reminder lead time, enabled channels).

### Modified Capabilities
<!-- None: no existing specs in openspec/specs/. -->

## Impact

- **Code**: New `convex/` modules (schema, auth, users, boards, tasks, comments, notifications, settings, crons, http) and new Next.js App Router routes/components under `app/`. Replaces the create-next-app placeholder page and metadata.
- **Dependencies**: `better-auth`, `@convex-dev/better-auth`; UI helpers (e.g. shadcn/ui components, drag-and-drop library for Kanban). Dev: `vitest`, `convex-test`, `@edge-runtime/vm`.
- **Configuration**: New Convex env vars (`BETTER_AUTH_SECRET`, `SITE_URL`); `convex/convex.config.ts` mounts the Better Auth component; `convex/auth.config.ts` added.
- **External systems**: None required. WhatsApp delivery in this change uses `wa.me` deep links opened by a human; no Meta/Twilio account.
- **Non-goals**: Multi-tenant organizations, public sign-up, file attachments, subtasks/dependencies, time tracking, native mobile apps, fully automatic WhatsApp sending (deferred to a future channel).
