# Spec Delta

<!-- Written against the user-management spec as it stands after the change
     add-stage-notifications-provider is archived. -->

## ADDED Requirements

### Requirement: Own profile
Every user SHALL be able to view and edit their own name and phone number. Users MUST NOT be able to change their own role. Team members' notifications are in-app only, so the profile MUST NOT offer notification channel preferences. The user phone number is contact information and MUST NOT be used to send SMS.

#### Scenario: Edit own profile
- **WHEN** a member changes their name and phone in "Mi perfil"
- **THEN** the new values are saved and shown, and no SMS preference is offered

#### Scenario: Member cannot change role
- **WHEN** a member tries to change their own role
- **THEN** the system refuses

## REMOVED Requirements

### Requirement: Own profile and SMS preferences
**Reason**: Team members no longer receive SMS. SMS is reserved for customer notices, so a per-user SMS preference has nothing to control.
**Migration**: The stored per-user SMS preference is cleared during deployment. Pending SMS deliveries to team members are marked descartada. The "Avisos por SMS" switch disappears from "Mi perfil" and from the admin user dialogs. The user phone number is kept.
