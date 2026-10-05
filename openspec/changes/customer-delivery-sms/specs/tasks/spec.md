# Spec Delta

## ADDED Requirements

### Requirement: Customer contact on tasks
A task SHALL have optional customer contact data: a customer name (up to 80 characters) and a customer phone in international E.164 format. Board members SHALL be able to set, change or clear them when creating or editing a task, and they MUST be shown in the task detail. An invalid phone MUST be rejected with "El teléfono debe estar en formato internacional, por ejemplo +34600111222". Changes to the customer data MUST be recorded in the activity log. Customer data MUST only be visible to users who can see the task.

#### Scenario: Add customer on creation
- **WHEN** a member creates "Entregar sofá cliente García" with customer "María García" and phone "+34 600 11 12 22"
- **THEN** the task stores the phone as +34600111222 and the detail shows "María García · +34600111222"

#### Scenario: Invalid customer phone
- **WHEN** a member saves the customer phone "600111222" without a country code
- **THEN** the system rejects it and the task keeps its previous customer phone

### Requirement: Estimated arrival window
A task SHALL keep the estimated arrival window from the most recent customer notice confirmation. The window is a day plus a start time and an optional end time, in the app's timezone. It MUST be shown on the task detail and on the task's card, for example "Llegada: hoy 10:00–12:00". A later confirmation MUST replace it. A confirmation without a window MUST clear it.

#### Scenario: Window shown on the card
- **WHEN** a task was moved into "En reparto" with the window 10:00–12:00 today
- **THEN** its card and detail show "Llegada: hoy 10:00–12:00"

#### Scenario: Window replaced
- **WHEN** the same task later re-enters "En reparto" and the notice is confirmed with 16:00 as a single time
- **THEN** the task shows "Llegada: hoy 16:00"

## MODIFIED Requirements

### Requirement: Create tasks
Any member of a non-archived board SHALL be able to create a task in it with a required title (1–200 characters) and these optional fields:
- description;
- assignee;
- priority: Baja, Media, Alta or Urgente (default Media);
- deadline;
- customer name and customer phone;
- initial status (default: the board's first status).

The creator MUST be recorded.

#### Scenario: Create a minimal task
- **WHEN** a member creates a task with only the title "Entregar sofá cliente García"
- **THEN** the task is created in the first status, unassigned, priority Media, with no deadline and no customer, and the member as creator

#### Scenario: Empty title
- **WHEN** a user submits a task with an empty or whitespace-only title
- **THEN** the system rejects it with "El título es obligatorio"

### Requirement: Edit and move tasks
Board members SHALL be able to edit a task's title, description, priority, deadline, assignee and customer contact, and to move it between the board's statuses (including by drag-and-drop on the Kanban view). Moving a task from another status into a status marked "Avisar al cliente" MUST first ask for the customer notice confirmation (see notifications, "Customer notice on status entry"). Cancelling it MUST leave the task in its previous status. Moving a task into the "done" status MUST record its completion time; moving it out MUST clear it.

#### Scenario: Complete a task
- **WHEN** a member drags a task into the board's "done" status
- **THEN** the task is marked completed with the current time and no longer counts as open or overdue

#### Scenario: Reopen a task
- **WHEN** a completed task is moved back to a non-done status
- **THEN** the completion time is cleared and the task counts as open again

#### Scenario: Move into a customer notice status
- **WHEN** a member changes a task's estado to "En reparto", which is marked "Avisar al cliente", using the estado buttons in the task detail
- **THEN** the "Aviso al cliente" confirmation opens, and the task only changes estado once it is confirmed

### Requirement: Activity log
The system SHALL record an activity entry, with the acting user and time, for:
- task creation;
- every change to title, description, status, assignee, priority, deadline and customer contact;
- every customer notice: the arrival window and whether the SMS was sent;
- deletion of comments.

The activity log MUST be read-only.

#### Scenario: Status change logged
- **WHEN** Ana moves a task from "Pendiente" to "En progreso"
- **THEN** the task's activity shows "Ana cambió el estado de Pendiente a En progreso" with the time

#### Scenario: Customer notice logged
- **WHEN** Luis confirms the customer notice with the window 10:00–12:00 and the SMS on
- **THEN** the activity shows "Luis avisó al cliente (llegada hoy 10:00–12:00)" after the status change entry
