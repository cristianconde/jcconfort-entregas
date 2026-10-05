# Spec Delta

## Purpose

Lets team members securely sign in to the app with email and password, and makes sure only accounts an admin has created can get in.

## ADDED Requirements

### Requirement: Email and password sign-in
The system SHALL authenticate users with an email address and password. Signed-out visitors MUST be redirected to the sign-in page from every page except the sign-in page and the first-run setup page.

#### Scenario: Successful sign-in
- **WHEN** an active user submits a correct email and password
- **THEN** the system starts a session and redirects the user to their board list

#### Scenario: Wrong credentials
- **WHEN** a visitor submits an email/password combination that does not match an active account
- **THEN** the system rejects the attempt with the generic message "Email o contraseña incorrectos" without revealing whether the email exists

#### Scenario: Protected page while signed out
- **WHEN** a signed-out visitor opens any board or task URL
- **THEN** the system redirects them to the sign-in page

### Requirement: No public self sign-up
The system MUST NOT allow visitors to create their own accounts. Accounts SHALL only be created by an admin (see `user-management`) or by the first-run setup.

#### Scenario: Sign-up attempt
- **WHEN** a visitor tries to register a new account through the auth API or any UI
- **THEN** the system rejects the request and no account is created

### Requirement: First-run admin bootstrap
While no users exist, the system SHALL offer a first-run setup page that creates the first account with the admin role. Once any user exists, the setup page MUST be unavailable.

#### Scenario: First user becomes admin
- **WHEN** the system has zero users and someone completes the setup form with name, email, and password
- **THEN** the system creates that account with the admin role and signs them in

#### Scenario: Setup after bootstrap
- **WHEN** at least one user exists and someone opens the setup page or calls its endpoint
- **THEN** the system refuses and redirects to the sign-in page

### Requirement: Deactivated users cannot access the app
The system MUST deny access to users an admin has deactivated, including users who already have an active session.

#### Scenario: Deactivated user signs in
- **WHEN** a deactivated user submits correct credentials
- **THEN** the system rejects the sign-in with the message "Tu cuenta está desactivada"

#### Scenario: User deactivated mid-session
- **WHEN** an admin deactivates a user who is currently signed in
- **THEN** the user's next data request is refused and they are returned to the sign-in page

### Requirement: Sign-out and password change
Signed-in users SHALL be able to sign out and to change their own password by providing their current password.

#### Scenario: Sign-out
- **WHEN** a signed-in user chooses "Cerrar sesión"
- **THEN** the session ends and the user is redirected to the sign-in page

#### Scenario: Password change with wrong current password
- **WHEN** a user submits a password change with an incorrect current password
- **THEN** the system rejects the change and the old password keeps working

### Requirement: Server-side identity
Every data operation MUST determine the acting user from the authenticated session on the server. The system MUST NOT trust a user identifier supplied by the client for authorization.

#### Scenario: Forged user id
- **WHEN** a client calls an operation passing another user's id as the actor
- **THEN** the system ignores it and authorizes the call as the session's user
