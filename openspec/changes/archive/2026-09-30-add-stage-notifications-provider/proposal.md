# Proposal

## Why

Today the team only hears about progress when someone happens to open the app, and the external channel (WhatsApp `wa.me` links) needs a person to press "send" every time — reminders pile up in an admin queue and are easy to miss. We want messages that go out on their own, and specifically to tell the right people when a task **reaches a meaningful stage** (e.g. "Hecha" → tell the office so they can invoice, "Bloqueada" → tell the manager). The sending service must be swappable: Twilio SMS now, possibly another provider later, without touching the rest of the app.

## What Changes

- Add **stage notification rules** per board status: an admin marks a status (e.g. "Hecha") so that when a task enters it, chosen recipients are notified — any combination of *assignee*, *creator* and *specific users*. The stage message replaces the generic "status changed" notification for those recipients.
- Add an **automatic SMS channel** that sends through a **pluggable SMS provider**. The first provider is **Twilio Programmable Messaging** (SMS). The active provider is selected by deployment configuration; adding another provider is one adapter file plus configuration, with no changes to how notifications are created.
- **Every** external notification (assignment, status change, stage rule, comment, deadline reminder, overdue alert) is delivered by SMS when enabled; in-app notifications stay always on.
- Record each SMS delivery with state **pendiente → enviada → entregada / fallida** (with the provider's error), update it from the provider's delivery-status webhook, and retry transient failures automatically.
- Replace the admin "Envíos pendientes de WhatsApp" page with an **SMS delivery log** (recent sends, state, error, "Reintentar" for failed ones) and show in app settings whether the provider is configured.
- **BREAKING**: remove the WhatsApp click-to-send (`wa.me`) channel — the "Avisar por WhatsApp" offer and the WhatsApp admin queue go away. The user preference "Avisos por WhatsApp" becomes "Avisos por SMS" and the app setting toggle becomes "SMS". Existing preferences and settings are migrated; pending WhatsApp deliveries are discarded.

## Capabilities

### New Capabilities
<!-- None: stage rules and the SMS channel extend the existing notifications capability. -->

### Modified Capabilities
- `notifications`: add stage notification rules; the status-change event yields to a matching stage rule; the pluggable channel contract gains automatic sending with delivery states from the provider; new SMS channel with a swappable provider (Twilio first); **remove** the WhatsApp click-to-send channel.
- `user-management`: the per-channel preference becomes SMS on/off instead of WhatsApp.
- `app-settings`: the enabled external channels are SMS (default on) and settings show whether the SMS provider is configured.

## Impact

- **Code**: `convex/notifications/*` (channel registry, `notify`, new `sms` channel + `providers/` with a Twilio adapter, delivery sending action, status webhook), `convex/schema.ts` (stage rules table, delivery states, user/setting fields), `convex/boards.ts` (rule CRUD), `convex/http.ts` (Twilio status callback route), board settings UI, profile/user dialogs, admin settings, new `/admin/envios` page; removal of `components/whatsapp-offers.tsx`, `app/(app)/admin/whatsapp/*`, `convex/notifications/whatsappLink.ts`.
- **Dependencies**: none new. Twilio is called over its REST API with `fetch` (no Node SDK needed); retries use Convex's scheduler.
- **Configuration**: new Convex env vars `SMS_PROVIDER` (default `twilio`), `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM` (sender number or Messaging Service SID).
- **External systems**: a Twilio account with an SMS-capable sender. Each SMS has a per-message cost; trial accounts can only send to verified numbers.
- **Data**: one-off migration of `users.whatsappEnabled` → `smsEnabled`, `settings.enabledChannels`, and pending WhatsApp deliveries.
- **Non-goals**: WhatsApp via Twilio (needs Meta-approved templates), email, per-user subscriptions to specific boards/statuses, per-event SMS preferences, inbound SMS replies.
