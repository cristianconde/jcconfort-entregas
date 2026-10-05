# Design

## Context

Built on the archived `add-team-task-board` change (see its design §3, §5, §9). Relevant current state:

- `convex/notifications/notify.ts` inserts `notifications` and, per entry in `CHANNELS` (`channels.ts`), a `deliveries` row. The only channel, `whatsapp_link` (`whatsappLink.ts`), is `mode: "manual"`: rows carry a `wa.me` `url`, `offeredToUserId` / `isAdminQueue`, and states `pending | sent | failed | dismissed`. `notify.ts` already has a comment marking where automatic channels would be dispatched.
- Status changes are notified from `tasks.move` (recipients assignee + creator); tasks are created by `tasks.create`; statuses are managed in `convex/boards.ts` (`removeStatus`, `setDoneStatus`).
- `users.whatsappEnabled`, `settings.enabledChannels: ["whatsapp_link"]`, and `channelIdValidator` in `convex/schema.ts` encode the WhatsApp choice. UI touching it: `components/whatsapp-offers.tsx`, `app/(app)/admin/whatsapp/*`, profile form, user dialogs, admin settings, app shell menu.
- Typed env vars are declared in `convex/convex.config.ts` (`defineApp({ env })`) and read via `env` from `_generated/server`. `convex/http.ts` hosts Better Auth routes.

Motivation and scope: see proposal.md. Behavior: see `specs/notifications`, `specs/user-management`, `specs/app-settings`.

## Goals / Non-Goals

**Goals:**
- A provider seam narrow enough that swapping Twilio for another SMS vendor touches one adapter file and one env var.
- Never send the same SMS twice for one delivery; retry only when the provider clearly did not accept the message.
- Keep `notify` as the single entry point; stage rules only change *who* gets notified.

**Non-Goals:**
- Multiple simultaneous SMS providers or per-user provider choice.
- Twilio WhatsApp, inbound SMS, per-event SMS preferences.
- Cost controls beyond "users can turn SMS off" (see Risks).

## Decisions

### 1. Two layers: channel (what/who) vs provider (how)
- `NotificationChannel` stays the unit `notify` iterates over, but drops `mode: "manual"`/`url`. New contract:
  ```ts
  interface NotificationChannel {
    id: "sms";
    isAvailable(): boolean;                       // provider configured
    isEnabledFor(recipient, settings): boolean;   // global toggle + user pref + phone
    buildMessage(ctx: NotificationContext): string;
  }
  ```
- `SmsProvider` is the swappable part, in `convex/notifications/providers/`:
  ```ts
  interface SmsProvider {
    id: "twilio" | "log";
    label: string;                                 // shown in settings, e.g. "Twilio"
    isConfigured(): boolean;                       // required env vars present
    send(msg: { to: string; body: string; statusCallbackUrl: string }):
      Promise<{ ok: true; providerMessageId: string }
            | { ok: false; retryable: boolean; error: string }>;
    parseStatusCallback(req: Request): Promise<
      { providerMessageId: string; state: "sent" | "delivered" | "failed"; error?: string } | "invalid">;
  }
  ```
  `providers/index.ts` maps ids → adapters; `activeProvider()` reads `env.SMS_PROVIDER ?? "twilio"`.
- **Why**: the proposal requires Twilio to be replaceable. Channel logic (preferences, message text, stage recipients) is provider-agnostic; only transport + webhook parsing is vendor-specific.
- **`log` provider**: logs the message and immediately reports `delivered`. Used in local dev without a Twilio account and in tests. Selected with `SMS_PROVIDER=log`.
- **Alternative considered**: making each vendor its own channel (`sms_twilio`, `sms_x`) — rejected: user preferences and settings would change whenever the vendor changes.

### 2. Twilio adapter over REST with `fetch`
- `POST https://api.twilio.com/2010-04-01/Accounts/{TWILIO_ACCOUNT_SID}/Messages.json`, HTTP Basic auth (`SID:AUTH_TOKEN`), form body `To`, `Body`, `StatusCallback`, and `From` — or `MessagingServiceSid` when `TWILIO_FROM` starts with `MG`.
- Classification: `201` → ok (`sid`). HTTP `429` / `5xx` → `retryable: true`. `4xx` (e.g. Twilio 21211 invalid "To", 21610 unsubscribed, 21408 region not enabled, 21614 not a mobile number) → `retryable: false`, error = Twilio `message` (+ code). Network errors / timeouts → **not retryable** and marked failed with "Resultado desconocido" — the request may have been accepted, and a retry could duplicate the SMS (goal 2).
- Runs in the default Convex runtime (no `"use node"`), since only `fetch` and Web Crypto are needed.
- **Alternative**: the `twilio` npm SDK — rejected: Node-only (forces `"use node"` actions), large, and adds nothing we need.

### 3. Sending pipeline with explicit claim + scheduler retries
- `notify` (mutation) inserts `deliveries` `{ state: "pending", channel: "sms", provider, to, message, attempts: 0 }` and schedules `internal.notifications.send.deliver({ deliveryId })` with `ctx.scheduler.runAfter(0, …)`, in the same transaction — so a send is scheduled if and only if the notification commits.
- `deliver` (internalAction): `claim` mutation moves the delivery to an internal in-flight marker (`attempts += 1`, `claimedAt`) only if it is `pending`, which makes a duplicate schedule a no-op. It calls `provider.send`, then a `record` mutation sets `sent` + `providerMessageId`, or `failed` + `error`, or — if retryable and `attempts < 3` — back to `pending` and reschedules with backoff 30 s / 2 min.
- **Why not `@convex-dev/workpool`**: its retries re-run an action on throw, which can't distinguish "not accepted" from "timed out after acceptance". Our volume (small team) needs no pooling. Revisit if volume grows.

### 4. Delivery-status webhook
- `http.ts` adds `POST /sms/twilio/status` → `provider.parseStatusCallback`. Twilio signature check: base64(HMAC-SHA1(authToken, fullUrl + concat(sorted form key+value))) compared (constant time) to `X-Twilio-Signature`, via `crypto.subtle`. The URL used is `${env.CONVEX_SITE_URL}/sms/twilio/status`, and the same string is sent as `StatusCallback`.
- Twilio statuses map: `queued|accepted|sending|sent` → `sent`, `delivered` → `delivered`, `undelivered|failed` → `failed` (with `ErrorCode`). An internal mutation looks up the delivery `by_providerMessageId` and only moves states forward (a late `sent` never overwrites `delivered`). Invalid signature → 403, no writes.
- Route path includes the provider id so a future provider gets its own route without breaking Twilio's.

### 5. Stage rules data + evaluation
- New table `statusRules { boardId, statusId, notifyAssignee, notifyCreator, userIds: Id<"users">[] }`, index `by_statusId`. `userIds` capped at 20 (bounded array; one rule per status).
- `boards.setStatusRule` / `boards.clearStatusRule` (admin). Validation: at least one recipient; users must exist and be active. `removeStatus` deletes the status' rule and passes a flag so its bulk task moves do not notify. `setDoneStatus` doesn't move tasks, so it never triggers rules.
- Evaluation helper `notifyStatusEntry(ctx, { task, status, actor })` in `notifications/stage.ts`, called from `tasks.move` (on a status change only) and `tasks.create`:
  1. `ruleRecipients` = rule ? {assignee?, creator?, ...active userIds} : ∅
  2. `notify(kind: "stage_reached", ruleRecipients, text "«t» llegó a S (movida por A)")`
  3. On move only: `notify(kind: "status_changed", {assignee, creator} \ ruleRecipients)`
  `notify` already drops the actor and dedupes; step 3's set difference satisfies "no two notifications for the same event".
- `notificationKindValidator` gains `"stage_reached"`; the inbox shows a flag icon for it.

### 6. SMS text
- `"<AppName>: <event text>. <deadline?> <SITE_URL>/tasks/<id>"`, normalized to the GSM-7 alphabet: á→a, í→i, ó→o, ú→u, «» → " (é, ñ, ü are GSM-7 and are kept). Non-GSM text switches the whole SMS to UCS-2, cutting segments from 153 to 67 chars and doubling cost.
- The task title is truncated with "…" so the body fits 306 chars (2 segments). Pure function `buildSmsBody` in `channels/sms.ts`, unit-tested.

### 7. Migration (widen → migrate → narrow, two deploys)
1. **Deploy A (widen)**: schema accepts both old and new: `users.smsEnabled?` next to `whatsappEnabled?`; `channelIdValidator = "whatsapp_link" | "sms"`; `deliveries` new optional fields plus `"delivered"` state, old fields optional. Code reads `smsEnabled ?? whatsappEnabled ?? true`.
2. Run `npx convex run migrations:smsV1` (internal mutation, batched `take(200)` with self-reschedule): copy `whatsappEnabled` → `smsEnabled`, rewrite settings `enabledChannels` (`whatsapp_link` → `sms`), mark pending `whatsapp_link` deliveries `dismissed`. It is idempotent, so it's safe to re-run.
3. **Deploy B (narrow)**: drop `whatsappEnabled`, `whatsapp_link`, `offeredToUserId`, `isAdminQueue`, `url`, and the `dismissed` state is kept only for historical rows. Remove WhatsApp code and UI.
- Dev deployment first, then prod. Historical WhatsApp deliveries stay (state `sent`/`dismissed`) and show in the log as channel "WhatsApp (antiguo)".

### 8. UI
- Board settings → each status row gets a bell button opening "Avisar al llegar a «S»": checkboxes *Persona asignada* / *Creador*, a user multi-select, and "Quitar regla". The status list shows a bell badge when a rule exists. Adds shadcn `checkbox`.
- `/admin/envios` replaces `/admin/whatsapp`: latest 100 deliveries with state badge, error tooltip, and "Reintentar" on `failed`. The app shell menu gets "Envíos de SMS".
- Profile / user dialogs: "Avisos por SMS" switch and a phone hint mentioning SMS. Admin settings: "SMS" toggle plus the read-only line "Proveedor: Twilio · configurado / sin configurar".

## Risks / Trade-offs

- [SMS cost grows with "SMS for everything"] → Users can switch SMS off; the delivery log makes volume visible. Per-event preferences are a documented follow-up.
- [Twilio trial accounts only reach verified numbers] → The delivery shows Twilio's error (21608) in the log; README documents upgrading or verifying numbers.
- [Spanish regulations / sender ID: some countries need registered sender IDs or a Messaging Service] → `TWILIO_FROM` accepts a Messaging Service SID (`MG…`); documented.
- [Ambiguous timeouts are marked failed but may have been delivered] → The status callback later corrects the state to `delivered` if Twilio sent it (lookup by `providerMessageId` only works if we got the SID; otherwise the admin sees "Resultado desconocido" and decides whether to retry).
- [Webhook URL must match exactly for signature verification] → Built from `CONVEX_SITE_URL` in one place, and the same string is sent as `StatusCallback`.
- [Burst of notifications, e.g. a cron with many reminders] → Sends are individual scheduled actions; Twilio queues excess messages per sender (≈1 msg/s per long code). Acceptable for team size; revisit with workpool if needed.

## Migration Plan

1. `npx convex env set TWILIO_ACCOUNT_SID …`, `TWILIO_AUTH_TOKEN …`, `TWILIO_FROM …` (optionally `SMS_PROVIDER=log` in dev).
2. Deploy A (widened schema + new pipeline, WhatsApp UI already removed but tolerant reads).
3. `npx convex run migrations:smsV1` until it reports done.
4. Deploy B (narrowed schema).
5. In the Twilio console nothing is needed per number: status callbacks are set per message.
**Rollback**: before step 4, redeploy the previous code (the widened data is still readable by it only for fields it knows — `whatsappEnabled` is untouched by the migration, so old code keeps working). After step 4, roll forward only.
