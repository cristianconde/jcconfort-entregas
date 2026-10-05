# Spec Delta

<!-- Written against the app-settings spec as it stands after the change
     add-stage-notifications-provider is archived. -->

## MODIFIED Requirements

### Requirement: Configurable values
The settings SHALL include:
- app name (1–60 characters; default "JC Confort Entregas"), shown in the header and page title, and available to customer message templates as `{empresa}`;
- timezone (IANA name; default "Europe/Madrid"), used to interpret and display deadlines and arrival windows;
- reminder lead time in hours (1–168; default 24);
- "SMS a clientes" on or off (default on): when off, no customer SMS is sent from any board.

The settings page SHALL also show, read-only, whether the SMS provider is configured and which provider is active. Provider credentials are deployment configuration and MUST NOT be editable or visible in the app. Invalid values MUST be rejected with a Spanish error message.

#### Scenario: Change reminder lead time
- **WHEN** an admin sets the reminder lead time to 48 hours
- **THEN** subsequent reminder checks use 48 hours

#### Scenario: Invalid timezone
- **WHEN** an admin enters "Madrid" as timezone
- **THEN** the system rejects it and keeps the previous value

#### Scenario: Rename app
- **WHEN** an admin changes the app name
- **THEN** all users see the new name in the header without redeploying, and new customer messages use it for `{empresa}`

#### Scenario: Provider status shown
- **WHEN** an admin opens app settings on a deployment with Twilio configured
- **THEN** the SMS section shows "Proveedor: Twilio · configurado" and no credentials

#### Scenario: Customer SMS switched off
- **WHEN** an admin turns off "SMS a clientes"
- **THEN** customer notice confirmations still store arrival windows but send no SMS

### Requirement: Defaults when unset
If settings have never been saved, the system SHALL behave as if the default values were configured.

#### Scenario: Fresh install
- **WHEN** the app runs for the first time with no saved settings
- **THEN** the app name is "JC Confort Entregas", timezone is Europe/Madrid, lead time is 24 hours, and "SMS a clientes" is on
