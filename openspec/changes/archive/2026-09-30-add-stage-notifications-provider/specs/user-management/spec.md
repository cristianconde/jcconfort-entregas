# Spec Delta

## ADDED Requirements

### Requirement: Own profile and SMS preferences
Every user SHALL be able to view and edit their own name, phone number, and per-channel notification preferences (in-app is always on; SMS can be turned on or off). Users MUST NOT be able to change their own role. The phone number admins manage for a user is the one used for SMS.

#### Scenario: Member disables SMS
- **WHEN** a member turns off SMS notifications in their profile
- **THEN** future notifications for that member are no longer sent by SMS, and still appear in their in-app inbox

#### Scenario: Existing WhatsApp preference carried over
- **WHEN** the change is deployed for a user who had "Avisos por WhatsApp" turned off
- **THEN** that user's "Avisos por SMS" is off

## REMOVED Requirements

### Requirement: Own profile and notification preferences
**Reason**: The WhatsApp preference it describes goes away with the WhatsApp click-to-send channel; replaced by "Own profile and SMS preferences".
**Migration**: Each user's WhatsApp on/off value is copied to the new SMS on/off preference during deployment.
