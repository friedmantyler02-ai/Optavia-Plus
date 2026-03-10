-- Reminders table for calendar custom reminders
CREATE TABLE IF NOT EXISTS reminders (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  coach_id UUID NOT NULL REFERENCES coaches(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  notes TEXT,
  due_date DATE NOT NULL,
  due_time TIME,
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
  is_completed BOOLEAN DEFAULT FALSE,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for coach + date queries
CREATE INDEX idx_reminders_coach_date ON reminders(coach_id, due_date);

-- RLS
ALTER TABLE reminders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Coaches can view own reminders"
  ON reminders FOR SELECT
  USING (auth.uid() = coach_id);

CREATE POLICY "Coaches can insert own reminders"
  ON reminders FOR INSERT
  WITH CHECK (auth.uid() = coach_id);

CREATE POLICY "Coaches can update own reminders"
  ON reminders FOR UPDATE
  USING (auth.uid() = coach_id);

CREATE POLICY "Coaches can delete own reminders"
  ON reminders FOR DELETE
  USING (auth.uid() = coach_id);
