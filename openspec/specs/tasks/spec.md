# tasks Specification

## Purpose
Lets team members create, assign, and move work items through a board's statuses, with deadlines, discussion, and a full history of changes.

## Requirements

### Requirement: Create tasks
Any member of a non-archived board SHALL be able to create a task in it with a required title (1–200 characters) and optional description, assignee, priority (Baja, Media, Alta, Urgente; default Media), deadline, and initial status (default: the board's first status). The creator MUST be recorded.

#### Scenario: Create a minimal task
- **WHEN** a member creates a task with only the title "Entregar sofá cliente García"
- **THEN** the task is created in the first status, unassigned, priority Media, with no deadline, and the member as creator

#### Scenario: Empty title
- **WHEN** a user submits a task with an empty or whitespace-only title
- **THEN** the system rejects it with "El título es obligatorio"

### Requirement: Assign tasks
A task SHALL have at most one assignee, who MUST be an active member of the task's board. Any board member SHALL be able to assign, reassign, or unassign a task.

#### Scenario: Assign to a board member
- **WHEN** a member assigns a task to another active member of the same board
- **THEN** the task shows the new assignee and the assignee is notified

#### Scenario: Assign to a non-member
- **WHEN** a user attempts to assign a task to someone who is not a member of the board, or is deactivated
- **THEN** the system rejects the assignment

### Requirement: Edit and move tasks
Board members SHALL be able to edit a task's title, description, priority, deadline, and assignee, and move it between the board's statuses (including by drag-and-drop on the Kanban view). Moving a task into the "done" status MUST record its completion time; moving it out MUST clear it.

#### Scenario: Complete a task
- **WHEN** a member drags a task into the board's "done" status
- **THEN** the task is marked completed with the current time and no longer counts as open or overdue

#### Scenario: Reopen a task
- **WHEN** a completed task is moved back to a non-done status
- **THEN** the completion time is cleared and the task counts as open again

### Requirement: Delete tasks
Only the task's creator or an admin SHALL be able to delete a task. Deletion MUST ask for confirmation.

#### Scenario: Non-creator member tries to delete
- **WHEN** a member who did not create a task tries to delete it
- **THEN** the system refuses

### Requirement: Deadlines and overdue state
A deadline SHALL be a calendar date with optional time, interpreted in the app's configured timezone. A task is overdue when it has a deadline in the past and is not in the "done" status. Overdue tasks MUST be visually highlighted.

#### Scenario: Date-only deadline
- **WHEN** a task has deadline 2026-10-05 with no time
- **THEN** it becomes overdue after 23:59 of 2026-10-05 in the app's timezone

#### Scenario: Overdue highlight
- **WHEN** a task's deadline passes and it is not done
- **THEN** its card shows an "Vencida" indicator

### Requirement: Kanban and list views with filters
Each board SHALL offer a Kanban view (one column per status, in order) and a list view. Both views SHALL support filters: "Mis tareas" (assigned to me), by assignee, "Sin asignar", by priority, and "Vencidas", plus text search on title. Changes by other users MUST appear without a page reload.

#### Scenario: Filter my tasks
- **WHEN** a user activates "Mis tareas"
- **THEN** only tasks assigned to that user are shown

#### Scenario: Real-time update
- **WHEN** another user moves a task while I am viewing the board
- **THEN** the task appears in its new column on my screen without reloading

### Requirement: My tasks across boards
Each user SHALL have a "Mis tareas" page listing their open assigned tasks across all their boards, sorted by deadline (soonest first, tasks without deadline last).

#### Scenario: Cross-board list
- **WHEN** a user assigned tasks on two boards opens "Mis tareas"
- **THEN** tasks from both boards appear, labelled with their board, sorted by deadline

### Requirement: Comments
Board members SHALL be able to add comments (1–5000 characters) to a task. Comment authors SHALL be able to edit or delete their own comments; admins SHALL be able to delete any comment.

#### Scenario: Add a comment
- **WHEN** a member comments on a task
- **THEN** the comment appears with author and time for everyone viewing the task

### Requirement: Activity log
The system SHALL record an activity entry for task creation and for every change to title, description, status, assignee, priority, deadline, and deletion of comments, including the acting user and time. The activity log MUST be read-only.

#### Scenario: Status change logged
- **WHEN** Ana moves a task from "Pendiente" to "En progreso"
- **THEN** the task's activity shows "Ana cambió el estado de Pendiente a En progreso" with the time
