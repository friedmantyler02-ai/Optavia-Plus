-- ============================================================
-- OPTAVIA PLUS — Database Schema
-- ============================================================
-- Run this ENTIRE file in your Supabase SQL Editor:
-- https://supabase.com → Your Project → SQL Editor → New Query
-- Paste everything → Click "Run"
-- ============================================================

-- ============================================
-- 1. COACHES (user profiles)
-- ============================================
-- Every person who signs up gets a row here.
-- Links to Supabase Auth via auth.uid()
CREATE TABLE coaches (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT NOT NULL,
  optavia_id TEXT,
  phone TEXT,
  rank TEXT DEFAULT 'New Coach',
  upline_id UUID REFERENCES coaches(id),
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- 2. CLIENTS
-- ============================================
-- Each client belongs to exactly one coach.
CREATE TABLE clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id UUID NOT NULL REFERENCES coaches(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  status TEXT NOT NULL DEFAULT 'new'
    CHECK (status IN ('new', 'active', 'plateau', 'milestone', 'lapsed', 'archived')),
  plan TEXT DEFAULT 'Optimal 5&1',
  weight_start NUMERIC,
  weight_current NUMERIC,
  notes TEXT,
  start_date DATE DEFAULT CURRENT_DATE,
  last_contact_date TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- 3. TOUCHPOINT SEQUENCES
-- ============================================
-- Predefined sequences a coach can assign to a client.
-- e.g. "New Client Onboarding", "Plateau Support"
CREATE TABLE touchpoint_sequences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  icon TEXT,
  color TEXT,
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- 4. TOUCHPOINT STEPS (template steps in a sequence)
-- ============================================
CREATE TABLE touchpoint_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sequence_id UUID NOT NULL REFERENCES touchpoint_sequences(id) ON DELETE CASCADE,
  day_offset INTEGER NOT NULL DEFAULT 0,
  action_text TEXT NOT NULL,
  action_type TEXT NOT NULL DEFAULT 'text'
    CHECK (action_type IN ('call', 'text', 'email', 'other')),
  sort_order INTEGER NOT NULL DEFAULT 0
);

-- ============================================
-- 5. CLIENT TOUCHPOINTS (assigned sequences + progress)
-- ============================================
CREATE TABLE client_touchpoints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  coach_id UUID NOT NULL REFERENCES coaches(id) ON DELETE CASCADE,
  sequence_id UUID NOT NULL REFERENCES touchpoint_sequences(id),
  started_at TIMESTAMPTZ DEFAULT now(),
  status TEXT DEFAULT 'active'
    CHECK (status IN ('active', 'paused', 'completed'))
);

-- ============================================
-- 6. TOUCHPOINT COMPLETIONS (which steps are done)
-- ============================================
CREATE TABLE touchpoint_completions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_touchpoint_id UUID NOT NULL REFERENCES client_touchpoints(id) ON DELETE CASCADE,
  step_id UUID NOT NULL REFERENCES touchpoint_steps(id),
  completed_at TIMESTAMPTZ DEFAULT now(),
  notes TEXT
);

-- ============================================
-- 7. ACTIVITY LOG
-- ============================================
-- Global activity feed per coach.
CREATE TABLE activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id UUID NOT NULL REFERENCES coaches(id) ON DELETE CASCADE,
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  details TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- INDEXES for performance
-- ============================================
CREATE INDEX idx_clients_coach ON clients(coach_id);
CREATE INDEX idx_clients_status ON clients(coach_id, status);
CREATE INDEX idx_activities_coach ON activities(coach_id);
CREATE INDEX idx_activities_created ON activities(coach_id, created_at DESC);
CREATE INDEX idx_client_touchpoints_client ON client_touchpoints(client_id);
CREATE INDEX idx_client_touchpoints_coach ON client_touchpoints(coach_id);
CREATE INDEX idx_coaches_upline ON coaches(upline_id);

-- ============================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================
-- This is what keeps each coach's data private.
-- Coaches can only see/edit their OWN data.

ALTER TABLE coaches ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_touchpoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE touchpoint_completions ENABLE ROW LEVEL SECURITY;
ALTER TABLE activities ENABLE ROW LEVEL SECURITY;

-- Coaches: can read/update own profile
CREATE POLICY "Coaches can view own profile"
  ON coaches FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Coaches can update own profile"
  ON coaches FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Coaches can insert own profile"
  ON coaches FOR INSERT WITH CHECK (auth.uid() = id);

-- Coaches can also see their downline coaches
CREATE POLICY "Coaches can view downline"
  ON coaches FOR SELECT USING (upline_id = auth.uid());

-- Clients: coach can CRUD their own clients only
CREATE POLICY "Coaches can view own clients"
  ON clients FOR SELECT USING (coach_id = auth.uid());

CREATE POLICY "Coaches can insert own clients"
  ON clients FOR INSERT WITH CHECK (coach_id = auth.uid());

CREATE POLICY "Coaches can update own clients"
  ON clients FOR UPDATE USING (coach_id = auth.uid());

CREATE POLICY "Coaches can delete own clients"
  ON clients FOR DELETE USING (coach_id = auth.uid());

-- Client Touchpoints: coach access only
CREATE POLICY "Coaches can view own touchpoints"
  ON client_touchpoints FOR SELECT USING (coach_id = auth.uid());

CREATE POLICY "Coaches can insert own touchpoints"
  ON client_touchpoints FOR INSERT WITH CHECK (coach_id = auth.uid());

CREATE POLICY "Coaches can update own touchpoints"
  ON client_touchpoints FOR UPDATE USING (coach_id = auth.uid());

CREATE POLICY "Coaches can delete own touchpoints"
  ON client_touchpoints FOR DELETE USING (coach_id = auth.uid());

-- Touchpoint Completions: via join to client_touchpoints
CREATE POLICY "Coaches can view own completions"
  ON touchpoint_completions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM client_touchpoints ct
      WHERE ct.id = touchpoint_completions.client_touchpoint_id
      AND ct.coach_id = auth.uid()
    )
  );

CREATE POLICY "Coaches can insert own completions"
  ON touchpoint_completions FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM client_touchpoints ct
      WHERE ct.id = touchpoint_completions.client_touchpoint_id
      AND ct.coach_id = auth.uid()
    )
  );

-- Activities: coach access only
CREATE POLICY "Coaches can view own activities"
  ON activities FOR SELECT USING (coach_id = auth.uid());

CREATE POLICY "Coaches can insert own activities"
  ON activities FOR INSERT WITH CHECK (coach_id = auth.uid());

-- Touchpoint sequences: everyone can read (they're templates)
ALTER TABLE touchpoint_sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE touchpoint_steps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read sequences"
  ON touchpoint_sequences FOR SELECT USING (true);

CREATE POLICY "Anyone can read steps"
  ON touchpoint_steps FOR SELECT USING (true);

-- ============================================
-- SEED DEFAULT TOUCHPOINT SEQUENCES
-- ============================================
INSERT INTO touchpoint_sequences (id, name, description, icon, color, is_default) VALUES
  ('a1000000-0000-0000-0000-000000000001', 'New Client Onboarding', 'Welcome sequence for brand new clients', '🌱', '#4a7c59', true),
  ('a1000000-0000-0000-0000-000000000002', 'Weekly Check-In', 'Regular weekly touchbase', '💬', '#5b8fa8', true),
  ('a1000000-0000-0000-0000-000000000003', 'Plateau Support', 'Help clients push through stalls', '🏔️', '#c4855c', true),
  ('a1000000-0000-0000-0000-000000000004', 'Milestone Celebration', 'Celebrate big wins', '🎉', '#8b6baf', true),
  ('a1000000-0000-0000-0000-000000000005', 'Lapsed Client Win-Back', 'Re-engage inactive clients', '💛', '#c9a84c', true);

-- Onboarding steps
INSERT INTO touchpoint_steps (sequence_id, day_offset, action_text, action_type, sort_order) VALUES
  ('a1000000-0000-0000-0000-000000000001', 0, 'Welcome call — introduce yourself & set expectations', 'call', 1),
  ('a1000000-0000-0000-0000-000000000001', 1, 'Send welcome text with getting-started tips', 'text', 2),
  ('a1000000-0000-0000-0000-000000000001', 3, 'Check in — how are the first few days going?', 'text', 3),
  ('a1000000-0000-0000-0000-000000000001', 7, 'Week 1 celebration & troubleshooting call', 'call', 4),
  ('a1000000-0000-0000-0000-000000000001', 14, 'Two-week check-in — review progress', 'call', 5),
  ('a1000000-0000-0000-0000-000000000001', 21, 'Encourage & share a success story', 'text', 6),
  ('a1000000-0000-0000-0000-000000000001', 30, 'One-month milestone celebration!', 'call', 7);

-- Weekly check-in steps
INSERT INTO touchpoint_steps (sequence_id, day_offset, action_text, action_type, sort_order) VALUES
  ('a1000000-0000-0000-0000-000000000002', 0, 'Send a friendly check-in text', 'text', 1),
  ('a1000000-0000-0000-0000-000000000002', 2, 'Follow up if no response', 'text', 2);

-- Plateau steps
INSERT INTO touchpoint_steps (sequence_id, day_offset, action_text, action_type, sort_order) VALUES
  ('a1000000-0000-0000-0000-000000000003', 0, 'Empathetic call — acknowledge the frustration', 'call', 1),
  ('a1000000-0000-0000-0000-000000000003', 1, 'Send tips for breaking through a plateau', 'text', 2),
  ('a1000000-0000-0000-0000-000000000003', 3, 'Check in — any changes?', 'text', 3),
  ('a1000000-0000-0000-0000-000000000003', 7, 'Motivational message + success story', 'text', 4),
  ('a1000000-0000-0000-0000-000000000003', 14, 'Follow-up call — reassess plan', 'call', 5);

-- Milestone steps
INSERT INTO touchpoint_steps (sequence_id, day_offset, action_text, action_type, sort_order) VALUES
  ('a1000000-0000-0000-0000-000000000004', 0, 'Congratulations call!', 'call', 1),
  ('a1000000-0000-0000-0000-000000000004', 0, 'Send celebration graphic/message', 'text', 2),
  ('a1000000-0000-0000-0000-000000000004', 1, 'Ask permission to share their story', 'text', 3);

-- Win-back steps
INSERT INTO touchpoint_steps (sequence_id, day_offset, action_text, action_type, sort_order) VALUES
  ('a1000000-0000-0000-0000-000000000005', 0, 'Warm thinking-of-you text — no pressure', 'text', 1),
  ('a1000000-0000-0000-0000-000000000005', 5, 'Share what is new in the program', 'text', 2),
  ('a1000000-0000-0000-0000-000000000005', 14, 'Personal invitation to restart together', 'call', 3),
  ('a1000000-0000-0000-0000-000000000005', 30, 'Final gentle reach-out', 'text', 4);
