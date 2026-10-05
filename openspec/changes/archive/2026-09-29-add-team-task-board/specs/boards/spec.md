# Spec Delta

## Purpose

Organizes the team's work into separate boards (projects), each with its own members and its own list of task statuses.

## ADDED Requirements

### Requirement: Admin manages boards
An admin SHALL be able to create, rename, describe, archive, and unarchive boards. Archived boards MUST be read-only and hidden from the default board list.

#### Scenario: Create a board
- **WHEN** an admin creates a board named "Entregas Madrid"
- **THEN** the board exists with the default statuses and the admin as a member

#### Scenario: Archived board is read-only
- **WHEN** any user tries to create or edit a task on an archived board
- **THEN** the system refuses the change

### Requirement: Board membership
Each board SHALL have a set of member users managed by admins. Members MUST only see and act on boards they belong to. Admins SHALL be able to see every board.

#### Scenario: Member sees only their boards
- **WHEN** a member opens the board list
- **THEN** only non-archived boards they belong to are listed

#### Scenario: Access to a non-member board
- **WHEN** a member opens the URL of a board they do not belong to
- **THEN** the system shows "No tienes acceso a este tablero" and returns no task data

#### Scenario: Removing a member with assigned tasks
- **WHEN** an admin removes a user from a board where they are assigned open tasks
- **THEN** those tasks become unassigned and each change is recorded in the task's activity log

### Requirement: Configurable statuses per board
Each board SHALL have an ordered list of statuses. New boards MUST start with: "Pendiente", "En progreso", "Bloqueada", "Hecha". Exactly one status per board MUST be marked as the "done" status. Admins SHALL be able to add, rename, reorder, and remove statuses, and change which one is "done".

#### Scenario: Add a status
- **WHEN** an admin adds "En revisión" between "En progreso" and "Hecha"
- **THEN** the board shows a new column in that position

#### Scenario: Remove a status that has tasks
- **WHEN** an admin removes a status that still contains tasks
- **THEN** the system requires the admin to choose another status to move those tasks to before removing it

#### Scenario: Cannot remove the last status or the done status without replacement
- **WHEN** an admin tries to remove the only status, or the "done" status without first marking another as "done"
- **THEN** the system refuses the change

### Requirement: Board list overview
The board list SHALL show, for each visible board, its name, the number of open tasks, and the number of overdue tasks.

#### Scenario: Overview counts
- **WHEN** a board has 5 tasks not in the "done" status, 2 of them past their deadline
- **THEN** the board card shows 5 open and 2 overdue
