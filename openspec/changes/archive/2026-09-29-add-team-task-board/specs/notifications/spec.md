# Spec Delta

## Purpose

Keeps people informed about the work that concerns them, through an always-available in-app inbox plus external delivery channels (WhatsApp first) that can be extended later.

## ADDED Requirements

### Requirement: Notification events
The system SHALL create a notification for each recipient when:
- a task is assigned to them (recipient: new assignee);
- the status of a task they are assigned to or created changes (recipients: assignee and creator);
- someone comments on a task they are assigned to or created (recipients: assignee and creator);
- a task assigned to them reaches the reminder lead time before its deadline;
- a task assigned to them becomes overdue.
The user who performed an action MUST NOT be notified about their own action.

#### Scenario: Assignment notification
- **WHEN** Ana assigns a task to Luis
- **THEN** Luis receives a notification "Ana te asignó: <título>" and Ana receives none

#### Scenario: Self-assignment
- **WHEN** Luis assigns a task to himself
- **THEN** no notification is created

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
Besides in-app, notifications SHALL be deliverable through external channels behind a common channel contract. Each channel is enabled or disabled globally by an admin and per user by the user's preferences. Adding a new channel MUST NOT require changes to how notifications are created. Each external delivery attempt MUST be recorded with its channel and state (pendiente, enviada, fallida, descartada).

#### Scenario: Channel disabled globally
- **WHEN** the WhatsApp channel is disabled in app settings
- **THEN** no WhatsApp deliveries are created for any user, and in-app notifications continue

#### Scenario: User has no phone
- **WHEN** a notification is created for a user who has WhatsApp enabled but no phone number
- **THEN** no WhatsApp delivery is created and the in-app notification still appears

### Requirement: WhatsApp click-to-send channel
The first external channel SHALL be WhatsApp via click-to-send links (`https://wa.me/<number>?text=<message>`), requiring no WhatsApp/Meta API account. The message MUST be in Spanish and include the task title, the event, the deadline if any, and a link to the task. Deliveries created by a user's action SHALL be offered to that acting user right after the action ("Avisar por WhatsApp"). Deliveries with no acting user (reminders, overdue alerts) SHALL appear in an admin "Envíos pendientes de WhatsApp" queue. Opening a link MUST mark the delivery as enviada; a pending delivery can be dismissed (descartada).

#### Scenario: Offer after assignment
- **WHEN** Ana assigns a task to Luis, who has a phone and WhatsApp enabled
- **THEN** Ana sees an "Avisar por WhatsApp" button that opens WhatsApp with a prefilled message to Luis's number

#### Scenario: Reminder goes to admin queue
- **WHEN** the reminder check creates a reminder for Luis
- **THEN** a pending WhatsApp delivery appears in the admin queue, and opening it launches WhatsApp with the prefilled reminder to Luis

#### Scenario: Dismiss
- **WHEN** a user dismisses the "Avisar por WhatsApp" offer
- **THEN** the delivery is marked descartada and is not offered again
