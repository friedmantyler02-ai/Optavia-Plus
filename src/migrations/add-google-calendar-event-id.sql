-- Add google_calendar_event_id to reminders table for tracking synced Google Calendar events
ALTER TABLE reminders ADD COLUMN IF NOT EXISTS google_calendar_event_id TEXT;
