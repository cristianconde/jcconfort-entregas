# notifications Specification

## Purpose
Keeps people informed about the work that concerns them, through an always-available in-app inbox plus external delivery channels (WhatsApp first) that can be extended later.

## Requirements

### Requirement: Notification events
The system SHALL create a notification for each recipient when:
- a task is assigned to them (recipient: new assignee);
- the status of a task they are assigned to or created changes (recipients: assignee and creator), except that recipients of a matching stage notification rule receive the stage notification instead of this one;
- a task enters a status that has a stage notification rule (recipients: as defined by the rule);
- someone comments on a task they are assigned to or created (recipients: assignee and creator);
- a task assigned to them reaches the reminder lead time before its deadline;
- a task assigned to them becomes overdue.
The user who performed an action MUST NOT be notified about their own action, and no recipient MUST receive two notifications for the same event.

#### Scenario: Assignment notification
- **WHEN** Ana assigns a task to Luis
- **THEN** Luis receives a notification "Ana te asignó: <título>" and Ana receives none

#### Scenario: Self-assignment
- **WHEN** Luis assigns a task to himself
- **THEN** no notification is created

#### Scenario: Stage rule replaces the generic status change
- **WHEN** a task created by Ana moves into "Hecha", whose rule notifies the creator
- **THEN** Ana receives only the stage notification, not an additional "cambió el estado" notification

### Requirement: In-app inbox
Every user SHALL have an in-app notification inbox showing their notifications newest first, with an unread count badge in the navigation. Opening a notification MUST mark it read and navigate to the related task. Users SHALL be able to mark all as read. In-app delivery MUST always be on.

#### Scenario: Unread badge updates live
- **WHEN** a user receives a new notification while the app is open
- **THEN** the unread badge increments without reloading

#### Scenario: Mark all as read
- **WHEN** a user chooses "Marcar todo como leído"
- **THEN** the unread count becomes zero

### Requirement: Deadline reminders and overdue alerts
The system SHALL check deadlines periodically (at least every 15 minutes). For each open task with an assignee, it SHALL send one reminder when the deadline is within the configured lead time, and one overdue alert once the deadline passes. Each reminder or alert MUST be sent at most once per task per deadline value; changing the deadline MUST reset them.

#### Scenario: Reminder sent once
- **WHEN** the lead time is 24 hours and a task's deadline is 20 hours away
- **THEN** the assignee receives one reminder, and later checks do not send another

#### Scenario: Deadline moved
- **WHEN** a task already reminded has its deadline moved two days later
- **THEN** a new reminder will be sent when the new deadline enters the lead time

#### Scenario: Completed tasks not reminded
- **WHEN** a task is in the "done" status
- **THEN** no reminder or overdue alert is sent for it

### Requirement: Pluggable delivery channels
Besides in-app, notifications SHALL be deliverable through external channels behind a common channel contract. Each channel is enabled or disabled globally by an admin and per user by the user's preferences, and a channel MAY declare itself unavailable (for example, when its provider is not configured). Channels send automatically, without human action. Adding or replacing a channel or provider MUST NOT require changes to how notifications are created. Each external delivery attempt MUST be recorded with its channel, provider and state.

#### Scenario: Channel disabled globally
- **WHEN** the SMS channel is disabled in app settings
- **THEN** no SMS deliveries are created for any user, and in-app notifications continue

#### Scenario: User has no phone
- **WHEN** a notification is created for a user who has SMS enabled but no phone number
- **THEN** no SMS delivery is created and the in-app notification still appears

### Requirement: Stage notification rules
An admin SHALL be able to attach a notification rule to any status of a board. A rule defines its recipients as any combination of: the task's assignee, the task's creator, and specific active users. When a task **enters** a status that has a rule — by being moved into it or by being created in it — the system SHALL notify each rule recipient with a stage notification ("«<título>» llegó a <estado>", including who moved it). The acting user MUST NOT be notified about their own action, and each recipient MUST receive at most one notification for that event. Moving a task within the same status, re-syncing statuses when the "done" status changes, and moving tasks because their status was deleted MUST NOT trigger rules. Deactivated users named in a rule MUST be skipped. A rule with no recipients selected is not allowed.

#### Scenario: Task reaches a stage with a rule
- **WHEN** "Hecha" on board "Entregas Madrid" has a rule notifying the creator and user "Oficina", and Luis moves Ana's task into "Hecha"
- **THEN** Ana and Oficina each receive "«<título>» llegó a Hecha (movida por Luis)" in-app, and by SMS if they have SMS enabled

#### Scenario: Actor is a rule recipient
- **WHEN** the rule notifies the assignee and the assignee moves their own task into that status
- **THEN** the assignee receives no notification for that move

#### Scenario: Task created directly in a rule status
- **WHEN** a member creates a task directly in a status that has a rule
- **THEN** the rule's recipients are notified as if the task had entered that status

#### Scenario: Status without a rule
- **WHEN** a task moves into a status that has no rule
- **THEN** only the generic status-change notification is sent (to assignee and creator)

#### Scenario: Rule without recipients
- **WHEN** an admin saves a rule with no recipient type and no users selected
- **THEN** the system rejects it with "Elige al menos un destinatario"

#### Scenario: Removing the status removes its rule
- **WHEN** an admin deletes a status that has a rule
- **THEN** the rule is deleted with it and no notifications are sent for the moved tasks

### Requirement: SMS channel with a swappable provider
The system SHALL provide an automatic SMS channel. Messages MUST be sent without human action through the **active SMS provider**, selected by deployment configuration (not by users). The first provider SHALL be Twilio Programmable Messaging. Replacing or adding a provider MUST NOT require changes to how notifications are created, to stage rules, or to the UI. The SMS text MUST be in Spanish, start with the app name, and contain the event, the task title, the deadline when relevant, and a link to the task; it SHOULD fit in two SMS segments. If the active provider is not configured (missing credentials), the SMS channel MUST be treated as unavailable: no SMS deliveries are created and in-app notifications continue.

#### Scenario: Automatic send on assignment
- **WHEN** Ana assigns a task to Luis, who has a phone number and SMS enabled
- **THEN** an SMS is sent to Luis's number through the active provider without anyone pressing a button, and Luis also gets the in-app notification

#### Scenario: Provider not configured
- **WHEN** the Twilio credentials are missing from the deployment
- **THEN** no SMS deliveries are created, in-app notifications still appear, and app settings show "Proveedor de SMS sin configurar"

#### Scenario: Switching provider
- **WHEN** the deployment configuration selects a different supported provider
- **THEN** subsequent SMS are sent through that provider and no other behavior changes

### Requirement: Delivery status tracking and retries
Each external delivery SHALL move through the states **pendiente** (created, not yet accepted by the provider), **enviada** (accepted by the provider), **entregada** (the provider confirmed delivery to the handset) and **fallida** (rejected or undeliverable, with the provider's error message). The system SHALL update states from the provider's delivery-status callbacks, which MUST be authenticated (requests whose signature does not verify are rejected). Transient failures (provider unavailable, rate limited) SHALL be retried automatically with backoff up to 3 attempts; permanent failures (invalid number, recipient opted out) MUST NOT be retried. A message MUST NOT be sent twice for the same delivery.

#### Scenario: Delivery confirmed
- **WHEN** the provider accepts an SMS and later reports it delivered
- **THEN** the delivery shows enviada and then entregada

#### Scenario: Invalid number
- **WHEN** the provider rejects the send because the number is not valid
- **THEN** the delivery is marked fallida with the provider's reason and is not retried

#### Scenario: Provider temporarily unavailable
- **WHEN** the provider returns a server error or rate-limit response
- **THEN** the send is retried automatically, and marked fallida only after the retries are exhausted

#### Scenario: Forged status callback
- **WHEN** a request reaches the status-callback endpoint without a valid provider signature
- **THEN** it is rejected and no delivery changes

### Requirement: SMS delivery log
Admins SHALL have a delivery log page ("Envíos de SMS") listing recent external deliveries newest first with recipient, phone, message, state, time and error. Admins SHALL be able to retry a fallida delivery, which sends it again as a new attempt. Members MUST NOT have access to the log.

#### Scenario: Retry a failed delivery
- **WHEN** an admin presses "Reintentar" on a fallida delivery after fixing the user's phone number
- **THEN** the message is sent again to the current number and the delivery state updates

#### Scenario: Member opens the log
- **WHEN** a member opens the delivery log page
- **THEN** access is denied
