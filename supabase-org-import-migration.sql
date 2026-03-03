-- ============================================================
-- ORG IMPORT MIGRATION — Run in Supabase SQL Editor
-- ============================================================
-- This adds all the columns, tables, policies, and functions
-- needed by the org import engine.
--
-- Safe to run multiple times (uses IF NOT EXISTS / IF EXISTS).
-- ============================================================

BEGIN;

-- ============================================================
-- 1. COACHES TABLE — support coach stubs
-- ============================================================

-- Remove the FK to auth.users so we can create stub records
-- (stubs are placeholders for coaches found in the CSV who
-- haven't signed up yet — they get random UUIDs not in auth.users)
DO $$
DECLARE
  fk_name TEXT;
BEGIN
  SELECT tc.constraint_name INTO fk_name
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu
    ON tc.constraint_name = kcu.constraint_name
  WHERE tc.table_name = 'coaches'
    AND tc.constraint_type = 'FOREIGN KEY'
    AND kcu.column_name = 'id'
  LIMIT 1;

  IF fk_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE coaches DROP CONSTRAINT %I', fk_name);
    RAISE NOTICE 'Dropped FK constraint: %', fk_name;
  ELSE
    RAISE NOTICE 'No FK on coaches.id found — skipping';
  END IF;
END $$;

-- Auto-generate UUID for stub records (real coaches still set id = auth.uid())
ALTER TABLE coaches ALTER COLUMN id SET DEFAULT gen_random_uuid();

-- Stubs don't have email
ALTER TABLE coaches ALTER COLUMN email DROP NOT NULL;

-- Flag to distinguish stubs from real accounts
ALTER TABLE coaches ADD COLUMN IF NOT EXISTS is_stub BOOLEAN DEFAULT false;

-- Unique constraint on optavia_id for upsert ON CONFLICT
-- (multiple NULLs are allowed by PostgreSQL UNIQUE)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'coaches_optavia_id_key'
  ) THEN
    ALTER TABLE coaches ADD CONSTRAINT coaches_optavia_id_key UNIQUE (optavia_id);
  END IF;
END $$;

-- ============================================================
-- 2. CLIENTS TABLE — add org-import columns
-- ============================================================

-- Make coach_id nullable: imported clients start with NULL coach_id,
-- then get linked via the link_clients_to_coaches RPC.
ALTER TABLE clients ALTER COLUMN coach_id DROP NOT NULL;

-- The optavia_id is the unique key for upsert ON CONFLICT
ALTER TABLE clients ADD COLUMN IF NOT EXISTS optavia_id TEXT;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'clients_optavia_id_key'
  ) THEN
    ALTER TABLE clients ADD CONSTRAINT clients_optavia_id_key UNIQUE (optavia_id);
  END IF;
END $$;

-- Org-sourced columns (never overwrite coach-managed fields)
ALTER TABLE clients ADD COLUMN IF NOT EXISTS country_code TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS level TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS last_order_date TIMESTAMPTZ;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS account_status TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS pqv NUMERIC;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS is_premier_member BOOLEAN;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS original_coach_name TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS original_coach_id TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS global_director TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS presidential_director TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS import_batch_id UUID;

-- ============================================================
-- 3. IMPORT_BATCHES TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS import_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id UUID NOT NULL,
  filename TEXT,
  total_records INTEGER DEFAULT 0,
  new_records INTEGER DEFAULT 0,
  duplicates_skipped INTEGER DEFAULT 0,
  orphaned_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE import_batches ENABLE ROW LEVEL SECURITY;

-- Policies (safe to re-create)
DROP POLICY IF EXISTS "Coaches can insert own batches" ON import_batches;
CREATE POLICY "Coaches can insert own batches"
  ON import_batches FOR INSERT WITH CHECK (coach_id = auth.uid());

DROP POLICY IF EXISTS "Coaches can view own batches" ON import_batches;
CREATE POLICY "Coaches can view own batches"
  ON import_batches FOR SELECT USING (coach_id = auth.uid());

DROP POLICY IF EXISTS "Coaches can update own batches" ON import_batches;
CREATE POLICY "Coaches can update own batches"
  ON import_batches FOR UPDATE USING (coach_id = auth.uid());

-- ============================================================
-- 4. RLS POLICY UPDATES
-- ============================================================

-- COACHES: allow inserting stubs (stubs have is_stub=true, random UUIDs)
DROP POLICY IF EXISTS "Coaches can insert own profile" ON coaches;
CREATE POLICY "Coaches can insert own profile"
  ON coaches FOR INSERT WITH CHECK (
    auth.uid() = id OR is_stub = true
  );

-- COACHES: allow reading stubs (needed by upsertCoachStubs existence check)
DROP POLICY IF EXISTS "Anyone can view coach stubs" ON coaches;
CREATE POLICY "Anyone can view coach stubs"
  ON coaches FOR SELECT USING (is_stub = true);

-- COACHES: allow updating stub names during re-import
DROP POLICY IF EXISTS "Coaches can update stubs" ON coaches;
CREATE POLICY "Coaches can update stubs"
  ON coaches FOR UPDATE USING (is_stub = true);

-- CLIENTS: allow inserting with NULL coach_id (import creates, then links)
DROP POLICY IF EXISTS "Coaches can insert own clients" ON clients;
CREATE POLICY "Coaches can insert own clients"
  ON clients FOR INSERT WITH CHECK (
    coach_id = auth.uid() OR coach_id IS NULL
  );

-- CLIENTS: allow viewing unlinked clients (for upsert .select() return)
DROP POLICY IF EXISTS "Coaches can view own clients" ON clients;
CREATE POLICY "Coaches can view own clients"
  ON clients FOR SELECT USING (
    coach_id = auth.uid() OR coach_id IS NULL
  );

-- CLIENTS: allow updating unlinked clients (for upsert ON CONFLICT UPDATE)
DROP POLICY IF EXISTS "Coaches can update own clients" ON clients;
CREATE POLICY "Coaches can update own clients"
  ON clients FOR UPDATE USING (
    coach_id = auth.uid() OR coach_id IS NULL
  );

-- ============================================================
-- 5. LINK CLIENTS TO COACHES — RPC (SECURITY DEFINER)
-- ============================================================
-- Matches clients.original_coach_id → coaches.optavia_id
-- and sets clients.coach_id to that coach's UUID.
-- SECURITY DEFINER bypasses RLS so it can update any client row.

CREATE OR REPLACE FUNCTION link_clients_to_coaches(batch_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  updated_count INTEGER;
BEGIN
  UPDATE clients c
  SET coach_id = co.id
  FROM coaches co
  WHERE c.original_coach_id = co.optavia_id
    AND c.import_batch_id = batch_id
    AND c.coach_id IS NULL;

  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count;
END;
$$;

COMMIT;

-- ============================================================
-- DONE! You can verify with:
--
--   SELECT column_name, data_type, is_nullable
--   FROM information_schema.columns
--   WHERE table_name = 'clients'
--   ORDER BY ordinal_position;
-- ============================================================
