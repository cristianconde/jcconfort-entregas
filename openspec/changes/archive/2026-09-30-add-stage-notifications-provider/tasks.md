# Tasks

## 1. Schema widening and configuration

- [x] 1.1 Widen `convex/schema.ts` per design §7 step 1 (`users.smsEnabled?`, `channelIdValidator` = `whatsapp_link | sms`, deliveries: `provider?`, `to?`, `providerMessageId?`, `attempts?`, `claimedAt?`, state `delivered`, old WhatsApp fields optional; `notificationKindValidator` + `stage_reached`; new `statusRules` table with `by_statusId`; `deliveries.by_providerMessageId`); verify `npx convex dev --once` deploys against existing dev data and all existing tests still pass
- [x] 1.2 Declare optional env vars `SMS_PROVIDER`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM` in `convex/convex.config.ts` and add `TWILIO_*`/`SMS_PROVIDER` test values to `vitest.config.mts`; verify codegen exposes them on `env` and `pnpm test` runs

## 2. Provider layer

- [x] 2.1 Create `convex/notifications/providers/types.ts` (`SmsProvider`), `providers/log.ts`, and `providers/index.ts` (`activeProvider()` from `env.SMS_PROVIDER ?? "twilio"`); verify with unit tests that the right provider is selected and `log.isConfigured()` is always true
- [x] 2.2 Implement `providers/twilio.ts` `send` over REST with `fetch` (Basic auth, `From` vs `MessagingServiceSid` when `TWILIO_FROM` starts with `MG`, `StatusCallback`) and the result classification of design §2; verify with unit tests stubbing `fetch`: 201 → ok+sid, 429/500 → retryable, 400 with code 21211/21610 → not retryable with message, network error → not retryable "Resultado desconocido", `isConfigured` false when any var is missing
- [x] 2.3 Implement Twilio `parseStatusCallback` with HMAC-SHA1 signature validation via `crypto.subtle` and constant-time compare, plus status mapping; verify with a unit test using Twilio's documented signature example and tampered-param / missing-header cases returning `"invalid"`

## 3. SMS channel and sending pipeline

- [x] 3.1 Replace the channel contract in `channels.ts` with design §1 and implement `channels/sms.ts` (`isAvailable` = active provider configured, `isEnabledFor` = settings `sms` + `smsEnabled` + phone, `buildSmsBody` with GSM-7 normalization and 306-char cap by truncating the title); verify unit tests for message content, accent normalization, truncation, and each enable/disable condition (spec: SMS channel, Pluggable delivery channels)
- [x] 3.2 Update `notify.ts` to insert SMS deliveries and schedule `internal.notifications.send.deliver` in the same mutation; skip entirely when the channel is unavailable; verify with convex-test: assignment creates one pending SMS delivery and one scheduled function, none when provider unconfigured / SMS disabled globally / user pref off / no phone, and in-app notification always created
- [x] 3.3 Implement `convex/notifications/send.ts`: `claim` / `record` internal mutations and `deliver` internal action with retries (max 3, backoff 30 s / 2 min) per design §3; verify with convex-test + fake timers and a stubbed provider: success → `sent` with SID, permanent error → `failed` without retry, retryable twice then success → `sent` with `attempts` 3, duplicate `deliver` for the same delivery sends only once
- [x] 3.4 Add `POST /sms/twilio/status` to `convex/http.ts` and the `applyStatus` internal mutation (lookup `by_providerMessageId`, forward-only transitions); verify with convex-test `t.fetch`: valid signed `delivered` → `delivered`, `undelivered` with ErrorCode → `failed` with error, late `sent` after `delivered` ignored, bad signature → 403 and no change

## 4. Stage notification rules

- [x] 4.1 Implement `boards.getStatusRules`, `boards.setStatusRule` (admin; ≥1 recipient, ≤20 active users) and `boards.clearStatusRule`, and delete the rule in `boards.removeStatus`; verify with convex-test: member refused, empty rule rejected with "Elige al menos un destinatario", deactivated user rejected, rule removed with its status
- [x] 4.2 Implement `notifications/stage.ts` `notifyStatusEntry` (design §5) and call it from `tasks.move` (status change only) and `tasks.create`; ensure `removeStatus` bulk moves and `setDoneStatus` do not notify; verify with convex-test the spec scenarios: rule recipients get `stage_reached` and not `status_changed`, non-rule assignee/creator still get `status_changed`, actor excluded, creation into a rule status notifies, inactive rule user skipped, status removal sends nothing

## 5. Migration and WhatsApp removal

- [x] 5.1 Write `convex/migrations.ts` `smsV1` (batched, idempotent) per design §7 step 2; verify with convex-test on seeded legacy rows: `whatsappEnabled:false` → `smsEnabled:false`, settings channel rewritten, pending `whatsapp_link` deliveries → `dismissed`, second run changes nothing
- [x] 5.2 Remove the WhatsApp channel: delete `whatsappLink.ts` (+ test), `offeredToMe`/`adminQueue`/`markSent`/`dismiss`, `components/whatsapp-offers.tsx`, `app/(app)/admin/whatsapp/*`; update `settings` defaults to `["sms"]` and `users` create/updateMe to `smsEnabled`; update existing tests to the new names; verify `pnpm test`, `pnpm lint`, `pnpm build` pass and `grep -ri whatsapp convex app components lib` only matches the migration and legacy-channel label
- [x] 5.3 Run the migration on the dev deployment (`npx convex run migrations:smsV1`), then narrow the schema (design §7 step 3) and deploy; verify `npx convex dev --once` succeeds (schema validation passes on real data) and the app loads

## 6. Delivery log and admin actions

- [x] 6.1 Implement `notifications/deliveries.ts` `log` (admin, latest 100 with recipient name/phone, state, error, channel label incl. "WhatsApp (antiguo)") and `retry` (admin, `failed` only → reset to `pending`, reuse current phone, schedule `deliver`); verify with convex-test: member refused, retry only on failed, retried delivery goes through `deliver`
- [x] 6.2 Add `settings.providerStatus` query (admin; `{ provider label, configured }`, never credentials); verify with convex-test for configured/unconfigured env

## 7. UI

- [x] 7.1 Add shadcn `checkbox`; in board settings add the per-status bell button, rule dialog (assignee/creator checkboxes, active-user multi-select, "Quitar regla") and bell badge; verify manually in the browser that a rule saves, shows its badge, validates empty recipients, and disappears when its status is deleted
- [x] 7.2 Build `/admin/envios` (table with state badges, error tooltip, "Reintentar") and replace the "Envíos de WhatsApp" menu item with "Envíos de SMS"; verify manually as admin with `SMS_PROVIDER=log` that deliveries appear and update live, and that a member gets "no access"
- [x] 7.3 Update profile form, user dialogs and admin settings to SMS wording, the SMS toggle and the read-only provider status line; add the `stage_reached` icon to the inbox; verify manually that toggling SMS in the profile stops new SMS deliveries and that settings show the provider state

## 8. Documentation and end-to-end

- [x] 8.1 Rewrite `convex/notifications/README.md` (channel vs provider, how to add a provider: adapter file + `SMS_PROVIDER` + callback route) and update the root `README.md` (Twilio env vars, Messaging Service SID option, trial-account limitation, `SMS_PROVIDER=log` for dev, migration steps); verify every referenced file and function exists
- [x] 8.2 End-to-end on the dev deployment with `SMS_PROVIDER=log`: admin adds a rule on "Hecha" (creator + a specific user); member A creates a task assigned to B; B moves it to "Hecha"; confirm A and the specific user get `stage_reached` in-app and a delivered SMS in the log, B gets nothing for its own move, and A gets no extra `status_changed`; verify `pnpm test`, `pnpm lint`, `pnpm build` pass
- [ ] 8.3 With real Twilio credentials (requires the user's Twilio account and a verified/allowed phone): send one assignment SMS, confirm it arrives and the log goes `enviada` → `entregada` via the status callback; if credentials are not available, pause and ask the user instead of marking done — **superseded** by `customer-delivery-sms` task 9.2 (team members no longer receive SMS; the real-Twilio test is redone against a customer phone)
