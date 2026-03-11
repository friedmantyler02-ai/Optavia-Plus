-- Weekly check-in tracking for clients (scale pics, etc.)
-- Run this migration in your Supabase SQL editor.

CREATE TABLE IF NOT EXISTS client_weekly_checkins (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  coach_id UUID NOT NULL REFERENCES coaches(id) ON DELETE CASCADE,
  check_type TEXT NOT NULL,
  week_start DATE NOT NULL,
  checked_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (client_id, check_type, week_start)
);

-- Index for fast lookups by coach + week
CREATE INDEX IF NOT EXISTS idx_weekly_checkins_coach_week
  ON client_weekly_checkins (coach_id, week_start);

-- RLS: coaches can only see/modify their own rows
ALTER TABLE client_weekly_checkins ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Coaches manage own weekly checkins"
  ON client_weekly_checkins
  FOR ALL
  USING (coach_id = auth.uid())
  WITH CHECK (coach_id = auth.uid());
