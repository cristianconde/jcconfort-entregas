# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

JC Confort's own team: a furniture, mattress and sofa retailer that delivers and assembles what it sells.

- **Office / coordination staff:** create boards and tasks, assign work, track deadlines and stages, and act on stage notices (for example «Hecha» → invoice the customer). Administrators among them manage users, settings, which stages notify the customer, and the SMS log.
- **Warehouse / workshop staff:** prepare orders and update the tasks assigned to them. They mostly use their phones in the middle of physical work.

Everyone is a colleague with an account created by an administrator. There is no public sign-up. Customers never use the app: their only contact with it is the SMS that tells them their order is on its way.

## Product Purpose

A lightweight shared task board (Trello-style) that coordinates deliveries and the work around them. Everyone can see what is pending, who has it, what is blocked and what is late, and the right people are told automatically when a task changes hands, changes stage, gets a comment, or is approaching or past its deadline. Success means nothing slips between the office and the warehouse, and nobody has to phone around to learn the state of an order.

## Positioning

Built for one small, non-technical team, not as a general project-management suite. It is deliberately simple: boards with their own statuses, one assignee, a priority, a deadline and comments. The team is notified in-app, always. SMS is reserved for the customer: when a task enters a stage marked «Avisar al cliente» (for example «En reparto»), the person moving it confirms a text to the customer with an optional estimated arrival window. Stage rules («when a task reaches X, notify Y») encode the business handoffs directly.

The app is internal today, but it may later be offered to other small businesses. The app name is configurable in Ajustes, and future work should not hard-wire JC Confort into places a reseller would need to change.

## Operating Context

- Mostly used on phones, often between physical tasks in the warehouse or workshop. Coordination and admin also happen on desktop.
- Views: Kanban board (drag and drop by mouse, touch or keyboard) and list view with URL-shareable filters (*Mis tareas*, person, *Sin asignar*, priority, *Vencidas*, search); a cross-board *Mis tareas* page; task detail with comments and history; notification inbox; profile; admin (Usuarios, Ajustes, Envíos de SMS).
- Deadlines are interpreted in the app time zone (default `Europe/Madrid`). A date without a time is due at 23:59.
- Arrival windows («Llegada: hoy 10:00–12:00») are a day plus local times in the app time zone, shown on the task card and detail while the task is open.
- Customer SMS goes through Twilio and is written without accents to stay within GSM-7 (at most 2 segments). Each SMS costs money.

## Capabilities and Constraints

- Roles: **Administrador** (manages users, boards, settings and the SMS log, and sees every board) and **Miembro** (sees boards they belong to; creates, assigns, moves and comments tasks; deletes only their own tasks).
- Users are deactivated, never deleted, and at least one active administrator must always exist. First-run setup happens at `/setup`.
- Tasks carry an optional customer (name and phone in E.164) and the estimated arrival window from the last customer notice. There is no customer address book: the contact lives on the task.
- Customer SMS is sent only after an explicit confirmation («Aviso al cliente») when a task is moved into a status whose rule has «Avisar al cliente»; never on creation, same-status moves or bulk moves. The message comes from the status template (`{cliente}`, `{llegada}`, `{empresa}`), can be edited per task and is capped at 306 GSM-7 characters. «SMS a clientes» in Ajustes switches it off globally.
- Team members never receive SMS; their phone number is contact data only. There is no per-user notification preference.
- Customer consent for delivery texts is the business's responsibility; the channel is transactional and must not gain marketing features. No two-way SMS, tracking links or scheduled sends.
- Priorities: Baja, Media, Alta, Urgente. Default statuses: Pendiente, En progreso, Bloqueada, Hecha (one status per board is marked "done").
- Stack: Next.js 16 App Router, Convex (data, realtime, crons), Better Auth (email and password), Tailwind CSS 4, shadcn/ui on Base UI. All authorization happens in Convex functions.
- Terminology is fixed in Spanish (Spain): tablero, tarea, estado, asignar, fecha límite, vencida, aviso, cliente, llegada, Avisar al cliente, Envíos de SMS.

## Brand Commitments

- **Spanish (Spain) only.** No other languages are planned.
- **JC Confort logo and brand colors are binding**: royal blue `#0d409b` (framed "JC" serif monogram) and red `#e00420` (the «CONFORT» band). The logo file is `public/brand/logo.png`; a reseller would swap that single file. Never redraw or recolor the logo.
- The app name comes from settings (`settings.appName`) and must stay configurable.

## Evidence on Hand

- Brand: the JC Confort logo lives at `public/brand/logo.png` (the badge cropped from a 447px JPEG supplied by the owner; a vector original is still wanted) and as the app icon at `app/icon.png`. Brand colors taken from it: blue `#0d409b`, red `#e00420`.
- There are no testimonials or metrics in the repo.
- Product behavior is specified in `openspec/specs/` (auth, boards, tasks, notifications, user-management, app-settings) and summarized in `README.md`.
- Do not fabricate usage figures, customer quotes or claims about other businesses using the product.

## Product Principles

1. **Obvious without training.** Every action must be understandable by someone who is not comfortable with apps. Use plain Spanish labels, visible actions and no hidden gestures as the only path.
2. **Phone first, in the middle of work.** Short sessions, one-handed use and large targets. The most common actions (see my tasks, change status, comment) must be reachable in a couple of taps.
3. **State at a glance.** Overdue, blocked, unassigned and urgent must be unmistakable without opening a task.
4. **Tell the right person, not everyone.** Notifications are targeted and nobody is told about their own actions. SMS costs money and a customer's attention: it is always confirmed by a person, never automatic.
5. **Small and focused.** Resist becoming a general PM tool. New features must serve the delivery workflow of a small team.

## Accessibility & Inclusion

- Users include older staff with low tech confidence. Aim for large, readable type, high contrast (WCAG AA minimum, AAA for body text where feasible), generous touch targets, clear text labels next to icons, and forgiving flows (confirmations on destructive actions, easy undo where possible).
- Keyboard-accessible drag and drop is already supported and must be preserved.
