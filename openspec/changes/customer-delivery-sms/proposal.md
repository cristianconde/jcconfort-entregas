# Proposal

## Why

Automatic SMS currently goes to team members, but the SMS that matters for the business is the one to the **customer**: when a product leaves for delivery, the customer should get a text saying it is on its way and, when known, roughly when it will arrive. Team members already have the in-app inbox, and SMS to them costs money without adding much. So SMS becomes a customer-facing channel, driven by the task and confirmed by the person who moves it.

## What Changes

- Tasks gain an optional **customer** (name and phone in international format), set when the task is created or edited.
- A board status can be marked **"Avisar al cliente"** in the board settings, with a **default message template** for that status. The template supports placeholders for the customer name, the app name and the estimated arrival.
- When a task **enters** such a status, the user sees a **confirmation** before the move completes:
  - a toggle to notify the customer (on by default when the task has a customer phone);
  - the customer phone;
  - an optional **estimated arrival window** ("entre 10:00 y 12:00", or a single time; today unless another day is picked);
  - the message, prefilled from the template and editable for this task only.
  Confirming moves the task and, if the toggle is on, sends the SMS automatically through the existing provider pipeline. Cancelling leaves the task where it was.
- The arrival window is **stored on the task**, shown on the task, and recorded in the activity log together with "Aviso enviado al cliente".
- **BREAKING**: team members no longer receive SMS for any event (assignment, status change, stage rule, comment, reminder, overdue). Those events stay as **in-app notifications only**. The per-user "Avisos por SMS" preference is removed from the profile and user dialogs.
- The **SMS delivery log** now lists customer messages: customer name and phone, task, message, state and error. "Reintentar" resends to the task's current customer phone.
- The global SMS toggle in app settings now switches **SMS to customers** on or off. The provider status line stays.

## Capabilities

### New Capabilities
<!-- None: customer contact data extends tasks; customer SMS extends notifications. -->

### Modified Capabilities
- `notifications`:
  - add customer SMS on status entry, with the "Avisar al cliente" status setting, a message template, a per-move confirmation, an arrival window, and a GSM-7/length limit;
  - stage rules gain the customer option;
  - the SMS channel stops sending to team members;
  - delivery tracking and the log are keyed to customer messages;
  - the "Pluggable delivery channels" requirement drops per-user SMS enablement.
- `tasks`:
  - tasks carry optional customer contact data and the last estimated arrival window;
  - moving into an "Avisar al cliente" status asks for confirmation;
  - the activity log records the customer notice.
- `user-management`: the own-profile requirement loses the SMS preference. The user phone number is kept as contact data but no longer receives SMS.
- `app-settings`: the external-channel toggle becomes "SMS a clientes" (default on).

## Impact

- **Depends on** the in-progress change `add-stage-notifications-provider`. That change supplies the provider layer, the delivery pipeline, the status callbacks, stage rules and the delivery log. It should be finished and archived first, because the deltas here are written against its resulting specs. This change supersedes the parts of its task 7.3 and 8.3 that concern SMS to team members.
- **Code**:
  - `convex/schema.ts`: new task fields; the customer flag and template on `statusRules`; delivery rows keyed by task/customer, with the user and notification references made optional.
  - `convex/tasks.ts`: create/update customer fields; `move` accepts a customer notice.
  - `convex/notifications/`:
    - `notify.ts` stops creating SMS deliveries for users;
    - a new customer-notice module renders the template and creates and schedules the delivery;
    - `deliveries.ts` log and retry change;
    - `send.ts` is unchanged apart from reading the recipient phone from the delivery.
  - `convex/boards.ts`: rule CRUD with the customer option and template.
  - `convex/users.ts`: drop the `smsEnabled` input.
  - UI:
    - new "Cliente" fields in the create dialog and task detail;
    - the "Aviso al cliente" confirmation dialog, used by Kanban drag-and-drop and by the estado buttons;
    - the "Avisar al cliente" option and template editor in the status rule dialog of board settings;
    - the ETA shown on the task pass;
    - `/admin/envios` columns;
    - the SMS toggle removed from the profile and user dialogs.
  - A migration clears `users.smsEnabled` and dismisses pending team SMS deliveries.
- **Dependencies**: none new.
- **External systems**: SMS now goes to customer numbers through the same Twilio account. Every send has a cost, and customers can reply STOP, which the provider reports as a permanent failure.
- **Non-goals**:
  - a customer database or address book (the contact lives on the task);
  - customer replies or two-way SMS;
  - live tracking links;
  - scheduling an SMS for later;
  - sending when a task is *created* directly in a customer status;
  - multiple customer phones per task.
