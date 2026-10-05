# Spec Delta

## Purpose

Gives admins one place to configure app-wide behavior such as the app name, timezone, reminder timing, and which notification channels are enabled.

## ADDED Requirements

### Requirement: Admin-only settings
The system SHALL provide an app settings page available only to admins. Members MUST NOT be able to modify settings through the UI or the API (members MAY read non-sensitive values the UI needs, such as app name and timezone).

#### Scenario: Member tries to change settings
- **WHEN** a member calls the update-settings operation
- **THEN** the system refuses the change

### Requirement: Configurable values
The settings SHALL include:
- app name (1–60 characters; default "JC Confort Entregas"), shown in the header and page title;
- timezone (IANA name; default "Europe/Madrid"), used to interpret and display deadlines;
- reminder lead time in hours (1–168; default 24);
- enabled external notification channels (default: WhatsApp enabled).
Invalid values MUST be rejected with a Spanish error message.

#### Scenario: Change reminder lead time
- **WHEN** an admin sets the reminder lead time to 48 hours
- **THEN** subsequent reminder checks use 48 hours

#### Scenario: Invalid timezone
- **WHEN** an admin enters "Madrid" as timezone
- **THEN** the system rejects it and keeps the previous value

#### Scenario: Rename app
- **WHEN** an admin changes the app name
- **THEN** all users see the new name in the header without redeploying

### Requirement: Defaults when unset
If settings have never been saved, the system SHALL behave as if the default values were configured.

#### Scenario: Fresh install
- **WHEN** the app runs for the first time with no saved settings
- **THEN** the app name is "JC Confort Entregas", timezone is Europe/Madrid, lead time is 24 hours, and WhatsApp is enabled
