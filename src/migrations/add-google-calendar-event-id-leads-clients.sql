-- Add google_calendar_event_id to leads and clients tables for tracking synced Google Calendar events
ALTER TABLE leads ADD COLUMN IF NOT EXISTS google_calendar_event_id TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS google_calendar_event_id TEXT;
