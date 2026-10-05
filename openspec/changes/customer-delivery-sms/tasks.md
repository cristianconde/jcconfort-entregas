# Tasks

## 0. Prerequisite

- [x] 0.1 Finish and archive `add-stage-notifications-provider`:
  - do its tasks 5.3, 7.1, 7.2 and 8.2, plus the non-SMS-preference parts of 7.3 (provider status line, `stage_reached` inbox icon);
  - skip the per-user SMS toggle in 7.3, and 8.3 (both are superseded here);
  - archive with `openspec archive add-stage-notifications-provider`.

  Verify: `openspec list --specs` shows the "Stage notification rules" and "SMS delivery log" requirements in `notifications`, and `openspec validate customer-delivery-sms --strict` reports no "Archive would refuse" notice.

## 1. Schema widening

- [x] 1.1 Widen `convex/schema.ts` (design §1, §2, §5):
  - `tasks`: `customerName?`, `customerPhone?`, `etaDate?`, `etaFrom?`, `etaTo?`;
  - `statusRules`: `notifyCustomer` (optional boolean, absent = false), `customerTemplate?`;
  - `deliveries`: `notificationId` and `userId` made optional, plus `taskId?`, `recipient?` (`"user" | "customer"`), `recipientName?` and index `by_taskId`;
  - `activityKindValidator`: add `customer` (contact changed) and `customer_notice`.

  Verify: `npx convex dev --once` deploys against the existing dev data and `pnpm test` still passes.

## 2. Customer message rendering

- [x] 2.1 Create `convex/lib/customerMessage.ts` (design §4):
  - move `toGsm7`/`gsmLength` there from `notifications/channels/sms.ts` and re-export them;
  - add `DEFAULT_CUSTOMER_TEMPLATE`, `validateTemplate` (unknown placeholder → "Marcador desconocido: {x}", 1–306 characters), `arrivalSentence` (hoy/mañana/"el 5 de octubre", window vs single time, empty when there is no window) and `renderCustomerMessage` (placeholder substitution, whitespace cleanup after an empty `{cliente}`, GSM-7).

  Verify with unit tests:
  - the spec's "Out for delivery with an arrival window" text exactly;
  - no window → no sentence;
  - no customer name → no doubled spaces or space before a comma;
  - mañana and a later date;
  - unknown placeholder rejected;
  - a 307-septet message detected as too long.

## 3. Tasks: customer contact

- [x] 3.1 Extend `tasks.create` and `tasks.update` with `customerName` (≤80 characters, trimmed; empty clears it) and `customerPhone` (via `normalizePhone`; empty clears it). Log the `customer` activity on change. Include both fields in `tasks.get` and in the task card validator.

  Verify with convex-test:
  - create with "+34 600 11 12 22" stores "+34600111222";
  - "600111222" is rejected with the E.164 message and the stored value is unchanged;
  - clearing works;
  - an activity entry is written.
- [x] 3.2 Add `customer` and `customer_notice` wording to `describeActivity` in `components/tasks/task-detail.tsx`. Verify with a unit test of `describeActivity`, or by checking the rendered activity manually after 5.1.

## 4. Stage rules: customer option

- [x] 4.1 Extend `boards.setStatusRule` / `getStatusRules` with `notifyCustomer` and `customerTemplate` (validated with `validateTemplate`; default template when turned on without text). Relax "Elige al menos un destinatario" so that a customer-only rule is valid. Expose `notifiesCustomer` and the template per status from `boards.get`.

  Verify with convex-test:
  - a customer-only rule saves;
  - an empty rule is still rejected;
  - an unknown placeholder is rejected with the spec message;
  - deleting the status deletes the rule;
  - a member cannot set rules.

## 5. Customer notice on move

- [x] 5.1 Add an optional `customerNotice` argument to `tasks.move` (design §3):
  - store or clear the window, rejecting an end not after the start and a past day;
  - save a changed phone;
  - render or accept the message and enforce the 306-septet limit;
  - when `send` is on and SMS is available (provider configured and "SMS a clientes" on), insert a customer delivery and schedule `send.deliver`;
  - log `customer_notice`;
  - reject a notice for a status without `notifyCustomer`;
  - send nothing when `customerNotice` is absent;
  - leave `tasks.create`, same-status moves and `removeStatus` bulk moves sending no customer SMS.

  Verify with convex-test, covering every spec scenario of "Customer notice on status entry":
  - with a window, exactly one delivery with the exact body, destined to the customer phone;
  - toggle off → window stored, no delivery;
  - edited message → sent as edited, and the template unchanged;
  - too long → "El mensaje es demasiado largo (máximo 2 SMS)";
  - no phone with `send` on → rejected;
  - created directly in the status → nothing sent;
  - provider unconfigured or setting off → window stored, no delivery;
  - a second entry replaces the window.
- [x] 5.2 Update `deliveries.log` and `deliveries.retry` for customer rows (design §5):
  - the log names customers from `recipientName` and legacy rows through `userId`, and links `taskId`;
  - retry re-reads the task's current `customerPhone`, refuses "La tarea ya no existe", and makes legacy user rows non-retryable;
  - task deletion keeps customer deliveries.

  Verify with convex-test: the log shows both kinds, retry after correcting the phone sends to the new number, retry on a deleted task is refused, and members are denied.

## 6. Stop team SMS

- [x] 6.1 Make `notify()` insert in-app notifications only.
  - Reduce the channel contract to availability (design §6).
  - Delete the team `buildSmsBody` and `smsEnabledOf`.
  - Remove `smsEnabled` from `users.updateMe` and the admin create/update mutations and return types.
  - Keep `settings.enabledChannels` as the customer SMS switch.

  Verify with convex-test: assignment, status change, stage rule, comment, reminder and overdue create in-app notifications and zero deliveries. Update the now-obsolete SMS channel tests. `grep -rn "smsEnabled" convex app components lib` only matches the migration and the schema.
- [x] 6.2 Write the `migrations.customerSmsV1` internal migration (batched, idempotent): unset `users.smsEnabled` and `whatsappEnabled`, and dismiss pending non-customer deliveries.

  Verify with convex-test on seeded rows: the fields are gone, pending user deliveries become `dismissed`, customer deliveries are untouched, and a second run changes nothing.

## 7. UI

- [x] 7.1 Add a "Cliente" block (name and phone, with inline E.164 error) to `create-task-dialog.tsx` and to the task detail pass. Show "Llegada: <día> HH:MM–HH:MM" on the pass stub (`kanban.tsx` `CardBody`) and in the task detail when the task is open and has a window.

  Verify in the browser at 390 and 1440 wide: creating with a customer shows it in the detail, an invalid phone shows the error, and a card with a window shows the arrival line.
- [x] 7.2 Build `components/tasks/customer-notice-dialog.tsx` (design §7):
  - toggle defaulting to on when the task has a phone;
  - phone input;
  - Hoy/Mañana/fecha day picker;
  - "Desde" and "Hasta (opcional)" time inputs;
  - message textarea prefilled from `renderCustomerMessage`, re-rendering until edited, with an "x / 306" counter;
  - "Mover y avisar" / "Mover" / "Cancelar" buttons;
  - the toggle disabled with an explanation when SMS is unavailable.

  Verify in the browser: every control is at least 44px, the counter blocks submitting over 306, and the preview matches the server-rendered SMS in the log.
- [x] 7.3 Route both move entry points through the dialog when the target status `notifiesCustomer`:
  - Kanban `onDragEnd` (pointer, touch and keyboard) keeps a pending move with a ghost card, applies the optimistic move only on confirm, and sends nothing on cancel;
  - the estado buttons in the task detail do the same.

  Verify in the browser with `SMS_PROVIDER=log`:
  - dragging into "En reparto" opens the dialog;
  - cancelling leaves the card in its lane;
  - confirming moves it and a delivery appears in "Envíos de SMS";
  - the estado button does the same;
  - moving within the same lane opens no dialog.
- [x] 7.4 In board settings, add an "Avisar al cliente" switch and template editor to the status rule dialog: placeholder legend, "Restaurar texto por defecto", and the server error shown inline. The status list shows a customer badge next to the bell.

  Verify in the browser: saving a customer-only rule works, an unknown placeholder shows the error, and the badge appears.
- [x] 7.5 Remove the SMS switch from "Mi perfil" and the admin user dialogs. Relabel the admin settings toggle "SMS a clientes". Update the `/admin/envios` columns (Cliente, Teléfono, Tarea link, Mensaje, Estado, Error, Reintentar only on failed customer rows).

  Verify in the browser as admin (log shows customer rows with task links) and as member (log access denied); the profile has no SMS option.

## 8. Documentation

- [x] 8.1 Update the root `README.md` and `convex/notifications/README.md`:
  - customer notices (rule option, template placeholders, confirmation, arrival window);
  - team notifications being in-app only;
  - the `customerSmsV1` migration steps;
  - a note on customer consent and SMS cost;
  - update `PRODUCT.md` Capabilities and Constraints accordingly.

  Verify: every referenced file, function and command exists, and `npx convex run migrations:customerSmsV1` matches the documented name.

## 9. Integration

- [x] 9.1 End-to-end on the dev deployment with `SMS_PROVIDER=log`:
  1. an admin marks "En reparto" as "Avisar al cliente";
  2. a member creates a task with a customer and phone, then drags it to "En reparto" with 10:00–12:00;
  3. the log shows exactly one delivered customer SMS with the expected text;
  4. the assignee and creator got in-app notifications only;
  5. the activity shows the notice;
  6. the card shows the arrival window.

  Run `npx convex run migrations:customerSmsV1`, then narrow the schema (drop `users.smsEnabled`) and deploy. Verify `pnpm test`, `pnpm lint` and `pnpm build` pass.
- [ ] 9.2 With real Twilio credentials and a phone the user controls as the "customer": send one customer notice and confirm it arrives and the log goes `enviada` → `entregada`. If credentials or a test phone are not available, pause and ask the user instead of marking this done.
