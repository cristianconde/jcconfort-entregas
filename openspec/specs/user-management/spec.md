# user-management Specification

## Purpose
Gives admins control over who can use the app, what role each person has, and how each person can be reached for notifications.

## Requirements

### Requirement: Roles
Every user SHALL have exactly one role: `admin` or `member`. Only admins MAY manage users, boards, and app settings. Members MAY work on tasks within boards they belong to.

#### Scenario: Member opens user administration
- **WHEN** a member navigates to the user administration page or calls a user-management operation
- **THEN** the system denies access

### Requirement: Admin creates users
An admin SHALL be able to create a user with name, email, role, optional WhatsApp phone number, and an initial password. Emails MUST be unique (case-insensitive).

#### Scenario: Create a member
- **WHEN** an admin submits a new user with a unique email
- **THEN** the account is created as active, and the new user can sign in with the initial password

#### Scenario: Duplicate email
- **WHEN** an admin submits an email that already belongs to a user (in any letter case)
- **THEN** the system rejects it with "Ya existe un usuario con ese email"

### Requirement: Admin edits users
An admin SHALL be able to change a user's name, role, and phone number, and reset their password.

#### Scenario: Promote to admin
- **WHEN** an admin changes a member's role to admin
- **THEN** that user gains admin permissions on their next request

#### Scenario: Last admin protection
- **WHEN** an admin tries to demote or deactivate the only remaining active admin
- **THEN** the system refuses with "Debe existir al menos un administrador activo"

### Requirement: Deactivate and reactivate users
An admin SHALL be able to deactivate and reactivate users. Users MUST NOT be hard-deleted, so task history and authorship remain intact. Deactivated users MUST NOT be offered as assignees for new assignments.

#### Scenario: Deactivate a user with open tasks
- **WHEN** an admin deactivates a user who is assigned open tasks
- **THEN** the user loses access, their tasks keep them as assignee and are flagged "Asignado a usuario inactivo" in the UI, and they no longer appear in assignee pickers

#### Scenario: Reactivate
- **WHEN** an admin reactivates a user
- **THEN** that user can sign in again and appears in assignee pickers

### Requirement: Phone number format
Phone numbers SHALL be stored in international E.164 format (for example `+34600111222`). The system MUST reject numbers that are not valid E.164.

#### Scenario: Invalid phone
- **WHEN** an admin or user saves a phone number "600 11 12 22" without a country code
- **THEN** the system rejects it and asks for the international format

### Requirement: User list
Admins SHALL see a list of all users with name, email, role, phone, and active status, searchable by name or email.

#### Scenario: Search users
- **WHEN** an admin types "ana" into the user search
- **THEN** the list shows only users whose name or email contains "ana" (case-insensitive)

### Requirement: Own profile and SMS preferences
Every user SHALL be able to view and edit their own name, phone number, and per-channel notification preferences (in-app is always on; SMS can be turned on or off). Users MUST NOT be able to change their own role. The phone number admins manage for a user is the one used for SMS.

#### Scenario: Member disables SMS
- **WHEN** a member turns off SMS notifications in their profile
- **THEN** future notifications for that member are no longer sent by SMS, and still appear in their in-app inbox

#### Scenario: Existing WhatsApp preference carried over
- **WHEN** the change is deployed for a user who had "Avisos por WhatsApp" turned off
- **THEN** that user's "Avisos por SMS" is off
