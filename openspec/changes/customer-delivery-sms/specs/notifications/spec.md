# Spec Delta

<!-- Written against the notifications spec as it stands after the change
     add-stage-notifications-provider is archived. -->

## ADDED Requirements

### Requirement: Customer notice status setting
An admin SHALL be able to mark any status of a board as **"Avisar al cliente"** in the board settings, as part of that status's notification rule. A status marked this way MUST have a **message template** of 1–306 characters. The template MAY use these placeholders:
- `{cliente}`: the task's customer name;
- `{llegada}`: the estimated arrival sentence;
- `{empresa}`: the app name.

A new rule marked "Avisar al cliente" SHALL start from this default template: `Hola {cliente}, su pedido está en camino.{llegada} Gracias por su compra. {empresa}`. Unknown placeholders MUST be rejected with an error naming them. A rule that only has "Avisar al cliente" and no team recipients is valid.

#### Scenario: Mark the delivery status
- **WHEN** an admin opens the rule of "En reparto" on board "Entregas Madrid", turns on "Avisar al cliente" and saves the default template
- **THEN** "En reparto" is shown in the board settings as notifying the customer, with that template

#### Scenario: Unknown placeholder
- **WHEN** an admin saves the template "Hola {nombre}, va en camino"
- **THEN** the system rejects it with "Marcador desconocido: {nombre}"

#### Scenario: Customer-only rule
- **WHEN** an admin saves a rule with "Avisar al cliente" on and no assignee, creator or users selected
- **THEN** the rule is saved and no team member is notified by it

### Requirement: Customer notice on status entry
When a user moves a task from another status into a status marked "Avisar al cliente", the app SHALL show a confirmation ("Aviso al cliente") before the move is applied. The confirmation SHALL contain:
- a toggle **"Avisar al cliente"**, on by default when the task has a customer phone and off otherwise;
- the customer phone, prefilled from the task and editable. An edited phone is saved to the task.
- an optional **estimated arrival window**: a start time, an optional end time, and a day that defaults to today;
- the **message**, prefilled by rendering the status template for this task. While the user has not edited the message, it updates as the arrival window changes. Once edited, the user's text is kept.

Confirming SHALL:
- apply the move;
- store the arrival window on the task;
- when the toggle is on, send the message to the customer phone automatically, without further action.

Cancelling MUST leave the task in its previous status, change nothing, and send nothing.

The rules for the message and the window:
- The rendered `{llegada}` MUST read " Llegada estimada: hoy entre las HH:MM y las HH:MM." for a window, or " Llegada estimada: hoy hacia las HH:MM." for a single time. "hoy" becomes "mañana" or the date (for example "el 5 de octubre") for other days. It renders as empty text when no window is given.
- A missing customer name MUST render `{cliente}` as empty, without leaving doubled spaces or a space before punctuation.
- The sent message MUST be normalized to the GSM-7 alphabet and MUST NOT exceed 306 septets (two SMS segments). The confirmation SHALL show the remaining length, and a longer or empty message MUST be rejected.
- Sending MUST require a valid E.164 customer phone.
- The window's end MUST be later than its start, and its day MUST NOT be in the past.

Moving a task within the same status, creating a task directly in the status, moving tasks because their status was deleted, and any move made without this confirmation MUST NOT send a customer message. Each confirmed notice with the toggle on MUST produce exactly one SMS delivery.

#### Scenario: Out for delivery with an arrival window
- **WHEN** Luis drags "Entregar sofá cliente García" (customer María García, +34600111222) into "En reparto" and confirms with the window 10:00–12:00 today and the default message
- **THEN** the task moves to "En reparto" and +34600111222 receives "Hola Maria Garcia, su pedido esta en camino. Llegada estimada: hoy entre las 10:00 y las 12:00. Gracias por su compra. JC Confort Entregas"

#### Scenario: No arrival window
- **WHEN** the user confirms the notice without entering any time
- **THEN** the message is sent without the "Llegada estimada" sentence

#### Scenario: Message customized for this task
- **WHEN** the user edits the prefilled message to add "Llamaremos al portero automático" and confirms
- **THEN** the customer receives the edited text, and the status template is unchanged

#### Scenario: User chooses not to notify
- **WHEN** the user turns off "Avisar al cliente" and confirms with the window 16:00–18:00
- **THEN** the task moves, the window is stored on the task, and no SMS is created

#### Scenario: Task without customer phone
- **WHEN** a task with no customer phone is moved into "En reparto"
- **THEN** the confirmation opens with "Avisar al cliente" off. Turning it on requires entering a valid phone, which is then saved on the task.

#### Scenario: Cancel
- **WHEN** the user cancels the confirmation after dragging the task into "En reparto"
- **THEN** the task returns to its previous status and no message or window is stored

#### Scenario: Message too long
- **WHEN** the edited message is longer than 306 GSM-7 characters
- **THEN** the confirmation cannot be submitted, and the server rejects it with "El mensaje es demasiado largo (máximo 2 SMS)"

#### Scenario: Task created directly in the status
- **WHEN** a member creates a task directly in "En reparto"
- **THEN** no confirmation is shown and no customer message is sent

#### Scenario: Customer SMS disabled globally
- **WHEN** "SMS a clientes" is off in app settings, or the SMS provider is not configured
- **THEN** the confirmation still stores the arrival window, shows that SMS is unavailable with the toggle disabled, and sends nothing

### Requirement: Customer SMS channel with a swappable provider
The system SHALL provide an automatic SMS channel **for customer messages only**. Team members MUST NOT receive SMS for any event: assignments, status changes, stage rules, comments, reminders and overdue alerts are delivered in-app only. Messages MUST be sent without human action once confirmed, through the **active SMS provider**, which is selected by deployment configuration (not by users). The first provider SHALL be Twilio Programmable Messaging. Replacing or adding a provider MUST NOT require changes to customer notices, stage rules, or the UI. If the active provider is not configured (missing credentials), the SMS channel MUST be treated as unavailable: no SMS deliveries are created and everything else continues.

#### Scenario: Assignment no longer texts the assignee
- **WHEN** Ana assigns a task to Luis, who has a phone number
- **THEN** Luis gets the in-app notification and no SMS is created

#### Scenario: Customer notice is sent automatically
- **WHEN** a user confirms a customer notice with "Avisar al cliente" on
- **THEN** the SMS is sent to the customer phone through the active provider without anyone pressing another button

#### Scenario: Provider not configured
- **WHEN** the Twilio credentials are missing from the deployment
- **THEN** no SMS deliveries are created, customer notices are shown as unavailable, and app settings show "Proveedor de SMS sin configurar"

#### Scenario: Switching provider
- **WHEN** the deployment configuration selects a different supported provider
- **THEN** subsequent customer SMS are sent through that provider and no other behavior changes

## MODIFIED Requirements

### Requirement: Stage notification rules
An admin SHALL be able to attach a notification rule to any status of a board. A rule defines its recipients as any combination of: the task's assignee, the task's creator, specific active users, and the task's **customer** ("Avisar al cliente", see "Customer notice status setting"). When a task **enters** a status that has a rule, by being moved into it or by being created in it, the system SHALL notify each team recipient of the rule **in-app** with a stage notification ("«<título>» llegó a <estado>", including who moved it). Customer messages follow "Customer notice on status entry". The acting user MUST NOT be notified about their own action, and each recipient MUST receive at most one notification for that event. The following MUST NOT trigger rules:
- moving a task within the same status;
- re-syncing statuses when the "done" status changes;
- moving tasks because their status was deleted.

Deactivated users named in a rule MUST be skipped. A rule with no team recipient and no customer option is not allowed.

#### Scenario: Task reaches a stage with a rule
- **WHEN** "Hecha" on board "Entregas Madrid" has a rule notifying the creator and user "Oficina", and Luis moves Ana's task into "Hecha"
- **THEN** Ana and Oficina each receive "«<título>» llegó a Hecha (movida por Luis)" in their in-app inbox, and no SMS is sent to them

#### Scenario: Actor is a rule recipient
- **WHEN** the rule notifies the assignee and the assignee moves their own task into that status
- **THEN** the assignee receives no notification for that move

#### Scenario: Task created directly in a rule status
- **WHEN** a member creates a task directly in a status that has a rule
- **THEN** the rule's team recipients are notified as if the task had entered that status, and the customer is not messaged

#### Scenario: Status without a rule
- **WHEN** a task moves into a status that has no rule
- **THEN** only the generic status-change notification is sent (to assignee and creator)

#### Scenario: Rule without recipients
- **WHEN** an admin saves a rule with no recipient type, no users selected and "Avisar al cliente" off
- **THEN** the system rejects it with "Elige al menos un destinatario"

#### Scenario: Removing the status removes its rule
- **WHEN** an admin deletes a status that has a rule
- **THEN** the rule and its customer template are deleted with it, and no notifications or customer messages are sent for the moved tasks

### Requirement: Pluggable delivery channels
Besides in-app, messages SHALL be deliverable through external channels behind a common channel contract. Each external channel is enabled or disabled globally by an admin, and a channel MAY declare itself unavailable (for example, when its provider is not configured). Channels send automatically, without human action once a message is confirmed. Adding or replacing a channel or provider MUST NOT require changes to how notifications or customer notices are created. Each external delivery attempt MUST be recorded with its channel, provider, destination and state.

#### Scenario: Channel disabled globally
- **WHEN** "SMS a clientes" is disabled in app settings
- **THEN** no SMS deliveries are created, and in-app notifications continue

#### Scenario: User has no phone
- **WHEN** a notification is created for a team member with or without a phone number
- **THEN** it appears in their in-app inbox and no SMS delivery is created for them

#### Scenario: In-app always on
- **WHEN** any notification event happens for a team member
- **THEN** it appears in their in-app inbox regardless of external channel settings

### Requirement: SMS delivery log
Admins SHALL have a delivery log page ("Envíos de SMS") listing recent customer messages, newest first, with:
- the customer name;
- the phone;
- the task, with a link;
- the message;
- the state;
- the time;
- the error.

Legacy deliveries to team members, sent before this change, SHALL still be listed with the user's name. Admins SHALL be able to retry a fallida delivery. A retry sends the same message again as a new attempt to the task's **current** customer phone. Members MUST NOT have access to the log.

#### Scenario: Retry a failed delivery
- **WHEN** a customer SMS failed because of an invalid number, a user corrects the customer phone on the task, and an admin presses "Reintentar"
- **THEN** the message is sent to the corrected number and the delivery state updates

#### Scenario: Retry when the task is gone
- **WHEN** an admin presses "Reintentar" on a failed delivery whose task was deleted
- **THEN** the system refuses with "La tarea ya no existe"

#### Scenario: Member opens the log
- **WHEN** a member opens the delivery log page
- **THEN** access is denied

## REMOVED Requirements

### Requirement: SMS channel with a swappable provider
**Reason**: The SMS channel no longer sends to team members, so its "Automatic send on assignment" behavior is gone. It is replaced by "Customer SMS channel with a swappable provider", which keeps the swappable provider and the unconfigured-provider rules and limits SMS to customer notices.
**Migration**: Team events are delivered in-app only. Pending SMS deliveries to team members are marked descartada during deployment. Provider configuration is unchanged.
