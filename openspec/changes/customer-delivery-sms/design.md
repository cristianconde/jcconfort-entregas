# Design

## Context

This change builds on `add-stage-notifications-provider`, which is implemented except for its dev-deployment migration, UI and end-to-end tasks. What exists today:

- **Team notifications.** `notify()` (`convex/notifications/notify.ts`) runs inside the mutation that caused the event. It inserts an in-app notification per recipient, then an SMS `deliveries` row per enabled channel, and schedules `internal.notifications.send.deliver`.
- **Sending.** `send.ts` (claim → provider.send → record, with retries), the Twilio adapter and the status callback depend only on `delivery.to` and `delivery.message`. None of it knows who the recipient is.
- **Stage rules.** `statusRules` holds one row per status (`notifyAssignee`, `notifyCreator`, `userIds`). `notifyStatusEntry()` (`stage.ts`) is called from `tasks.move` and `tasks.create`.
- **Delivery shape.** `deliveries` requires `notificationId` and `userId`. The log (`deliveries.log`) and `retry` resolve the recipient through `userId`.
- **Moving tasks.** The UI calls `tasks.move` from two places: Kanban drag-and-drop (`components/tasks/kanban.tsx`, with an optimistic update) and the estado buttons in `task-detail.tsx`.

## Goals / Non-Goals

**Goals:**
- Reuse the provider, retry and status-callback pipeline unchanged for customer messages.
- Keep the customer message decision (send or not, final text, window) atomic with the move: one mutation, one transaction.
- Keep the server authoritative on template rendering, GSM-7 normalization and length, so a client bug cannot send malformed or oversized SMS.

**Non-Goals:**
- A reusable "contacts" model.
- Per-board SMS senders.
- Localization beyond Spanish.
- Changing how in-app notifications are produced.

## Decisions

### 1. Customer data lives on the task
Add optional fields to `tasks`:
- `customerName`;
- `customerPhone` (E.164, validated with the existing `normalizePhone`);
- the last arrival window: `etaDate` ("YYYY-MM-DD" in the app timezone), `etaFrom` ("HH:mm") and `etaTo` ("HH:mm", optional).

Storing local strings rather than timestamps keeps "hoy entre las 10:00 y las 12:00" exact across DST and lets the UI say "hoy"/"mañana" relative to the app timezone.
*Alternative:* a `customers` table. Rejected for now, because the business enters a customer per delivery and there is no reuse requirement (proposal non-goal).

### 2. "Avisar al cliente" and the template sit on the status rule
Extend `statusRules` with `notifyCustomer: boolean` and `customerTemplate?: string`. The rule dialog in board settings gets the toggle and a textarea with a placeholder legend and the default template. Validation:
- a rule needs at least one of assignee, creator, users or customer;
- the template is 1–306 characters;
- only `{cliente}`, `{llegada}` and `{empresa}` are allowed.

`removeStatus` already deletes the rule. A task can enter more than one customer status, for example "En reparto" and then "Entregado", so a per-board template would not be enough.
*Alternative:* a flag on `boardStatuses`. Rejected, because the rule is already "who hears about entering this status", and the customer is one more recipient.

### 3. The notice is an explicit argument of `tasks.move`
Add an optional `customerNotice` to `tasks.move`:

```ts
{
  send: boolean,
  phone?: string,
  message?: string,
  eta?: { date: string, from: string, to?: string }
}
```

On a status change into a status whose rule has `notifyCustomer`, the move behaves as follows:

- **`customerNotice` absent** (older clients, scripts): the move proceeds and nothing is sent. This is the safe default. Status-deletion bulk moves never pass through here anyway.
- **`customerNotice` present:**
  1. validate the window (end after start, day not in the past) and store it on the task, clearing it when `eta` is absent;
  2. if `phone` differs from the task's phone, normalize and save it, and log the change;
  3. if `send` is true and the channel is available, create the delivery.

  The customer notice is logged as a new activity kind, `customer_notice`, with the window in `to` and "sms" or "sin sms" in `from`. `notifyStatusEntry` still handles team recipients, in-app only.
- **`customerNotice` sent for a status without `notifyCustomer`:** rejected ("Este estado no avisa al cliente"). This catches client/server drift.

The client decides whether to open the dialog by reading `rule.notifyCustomer` from `boards.get` (extend its status payload with `notifiesCustomer`).
*Alternative:* a separate `notifyCustomer` mutation called after the move. Rejected: two transactions can leave a moved task with no notice, or a notice for a move that failed.

### 4. Rendering is shared by client preview and server
Put `renderCustomerMessage({ template, customerName, appName, eta, timezone, now })` and the `{llegada}` sentence builder in `convex/lib/customerMessage.ts`, which is dependency-light like `deadline.ts`. The dialog imports it for the live preview. The server:
- uses the client's edited `message` when present, otherwise renders the template itself;
- then applies `toGsm7` and checks `gsmLength ≤ 306` with the existing helpers from `channels/sms.ts`, moved into the lib so both sides can use them;
- rejects an over-long or empty message; it never silently truncates customer text.

Whitespace cleanup after an empty `{cliente}`: collapse runs of spaces and remove a space before `,.;:!?`.

### 5. Deliveries become destination-first
- **Schema.** Make `deliveries.notificationId` and `userId` optional. Add `taskId?: Id<"tasks">`, `recipient: "user" | "customer"` (optional; absent means legacy "user"), `recipientName?` (snapshot of the customer name) and an index `by_taskId`.
- **Customer notices.** They insert `{ recipient: "customer", taskId, to, recipientName, message, channel: "sms", state: "pending", attempts: 0 }` and schedule `deliver`. `send.ts` needs no change.
- **Log.** `deliveries.log` resolves the name from `recipientName` for customers or through `userId` for legacy rows, and returns `taskId` directly.
- **Retry.** For a customer row, retry re-reads the task (refusing "La tarea ya no existe" if it is gone) and uses its current `customerPhone`. Legacy user rows are no longer retryable: team SMS is gone, and the button is hidden for them.
- **Task deletion.** Customer deliveries are **kept**: they are the cost/audit trail and the log tolerates a missing task. `deleteNotificationsForTask` only deletes deliveries reached through notifications, as today.

### 6. Team SMS is switched off at the source
- **Stop creating team SMS.** `notify()` stops iterating `CHANNELS`: it only inserts in-app notifications.
- **SMS channel.** The channel contract shrinks to `isAvailable()` (provider configured and `settings.enabledChannels` includes `sms`). `buildSmsBody` for team events is deleted. `NotificationChannel.isEnabledFor(user)` goes away with `smsEnabledOf`.
- **Setting label.** `settings.enabledChannels` keeps its shape (`["sms"]` means customer SMS on), so no settings migration is needed. Only the UI label changes to "SMS a clientes".
*Alternative:* keep the per-user channel code dormant behind a flag. Rejected, because dead code with a live-looking contract invites someone to re-enable it.

### 7. UI: one confirmation dialog, two entry points
`CustomerNoticeDialog` (task, target status, template) holds these controls:
- the toggle;
- the phone input;
- the day picker (Hoy / Mañana / fecha);
- two time inputs ("Desde", "Hasta (opcional)");
- the message textarea with a live septet counter ("x / 306"), where the preview re-renders until the user types in it.

Its buttons are "Mover y avisar" (or "Mover" when the toggle is off) and "Cancelar".

- **Kanban.** `onDragEnd` checks `notifiesCustomer` on the target lane. If set, it stores the pending move (`taskId`, `statusId`, `order`) and opens the dialog instead of calling `move`. The optimistic update is applied only on confirm, so cancelling needs no rollback.
- **Estado buttons.** They do the same without an order.
- **Keyboard drag-and-drop** goes through the same `onDragEnd`.
- **Create dialog and task detail.** Both get a "Cliente" block (name and phone).
- **Arrival window.** The pass card shows "Llegada: hoy 10:00–12:00" in its stub when a window exists and the task is open.
- **Settings.** The rule dialog gets the customer section. The profile and user dialogs lose the SMS switch. Admin settings relabel the channel toggle.

### 8. Migration
One idempotent, batched internal migration, `customerSmsV1`:
- unset `users.smsEnabled` (and any leftover `whatsappEnabled`);
- mark pending `deliveries` whose `recipient` is not `customer` as `dismissed`.

Deploy order: widen the schema (new optional fields, optional delivery refs) → deploy code → run the migration → later, narrow the schema by dropping `users.smsEnabled` from the validator.

## Risks / Trade-offs

- **[Cost and accidental sends]** Anyone who can move a task can text a customer. → Mitigations:
  - explicit confirmation on every entry, with an off switch;
  - the global "SMS a clientes" kill switch;
  - every send recorded in the log with the task and the actor (via the activity entry).
- **[Legal/consent]** Transactional SMS to a customer who gave their phone for the delivery is normal practice, but the business owns consent. → Document it in the README, and do not add marketing features.
- **[Customer replies STOP]** → Twilio returns error 21610, a permanent failure. The existing classification marks the delivery fallida with the reason, and it is not retried.
- **[Client/server template drift]** → Shared renderer in `convex/lib`, and the server re-validates.
- **[Optimistic Kanban move vs dialog]** Deferring the move until confirmation means the card snaps back while the dialog is open. → Show the card as "moving" (ghost in the target lane) while the dialog is open. Low effort and avoids a rollback path.
- **[Depends on an unfinished change]** → Finish and archive `add-stage-notifications-provider` first. Its task 7.3 (SMS toggle in profile and user dialogs) and 8.3 (real Twilio test to a team member) are superseded here. Implement 7.3's other parts (provider status line, inbox icon) and redo the Twilio end-to-end test against a customer phone.

## Migration Plan

1. Finish `add-stage-notifications-provider` (its migration and UI tasks), then archive it so the main specs contain the stage rules and the SMS log.
2. Deploy the widened schema and the code from this change. Team SMS stops immediately, and customer notices become available.
3. Run `npx convex run migrations:customerSmsV1` and check its "done" log line.
4. Deploy the narrowed schema (no `users.smsEnabled`).

Rollback before step 4: redeploy the previous code. The new task fields and the delivery refs are optional, so old code ignores them. After step 4, rollback needs a schema re-widen first.

## Open Questions

- Should the pass card show the arrival window after the task is done? Current plan: only while open. This is a display detail and can be tuned after launch.
