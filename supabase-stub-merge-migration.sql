-- ============================================================
-- STUB MERGE MIGRATION — Run in Supabase SQL Editor
-- ============================================================
-- Enables merging a coach stub (from org CSV import) with a
-- real coach account when they sign up.
--
-- Safe to run multiple times (uses IF EXISTS / IF NOT EXISTS).
-- ============================================================

BEGIN;

-- ============================================================
-- 1. ADD ON UPDATE CASCADE TO ALL FK CONSTRAINTS
-- ============================================================
-- When we merge a stub, we update its id to match the auth
-- user's UUID. ON UPDATE CASCADE ensures all child rows
-- (clients, activities, etc.) automatically follow.

-- 1a. clients.coach_id
DO $$
DECLARE
  fk_name TEXT;
BEGIN
  SELECT tc.constraint_name INTO fk_name
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu
    ON tc.constraint_name = kcu.constraint_name
    AND tc.table_schema = kcu.table_schema
  WHERE tc.table_name = 'clients'
    AND tc.constraint_type = 'FOREIGN KEY'
    AND kcu.column_name = 'coach_id'
  LIMIT 1;

  IF fk_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE clients DROP CONSTRAINT %I', fk_name);
  END IF;
END $$;

ALTER TABLE clients
  ADD CONSTRAINT clients_coach_id_fkey
  FOREIGN KEY (coach_id) REFERENCES coaches(id)
  ON DELETE CASCADE ON UPDATE CASCADE;

-- 1b. coaches.upline_id
DO $$
DECLARE
  fk_name TEXT;
BEGIN
  SELECT tc.constraint_name INTO fk_name
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu
    ON tc.constraint_name = kcu.constraint_name
    AND tc.table_schema = kcu.table_schema
  WHERE tc.table_name = 'coaches'
    AND tc.constraint_type = 'FOREIGN KEY'
    AND kcu.column_name = 'upline_id'
  LIMIT 1;

  IF fk_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE coaches DROP CONSTRAINT %I', fk_name);
  END IF;
END $$;

ALTER TABLE coaches
  ADD CONSTRAINT coaches_upline_id_fkey
  FOREIGN KEY (upline_id) REFERENCES coaches(id)
  ON UPDATE CASCADE;

-- 1c. client_touchpoints.coach_id
DO $$
DECLARE
  fk_name TEXT;
BEGIN
  SELECT tc.constraint_name INTO fk_name
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu
    ON tc.constraint_name = kcu.constraint_name
    AND tc.table_schema = kcu.table_schema
  WHERE tc.table_name = 'client_touchpoints'
    AND tc.constraint_type = 'FOREIGN KEY'
    AND kcu.column_name = 'coach_id'
  LIMIT 1;

  IF fk_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE client_touchpoints DROP CONSTRAINT %I', fk_name);
  END IF;
END $$;

ALTER TABLE client_touchpoints
  ADD CONSTRAINT client_touchpoints_coach_id_fkey
  FOREIGN KEY (coach_id) REFERENCES coaches(id)
  ON DELETE CASCADE ON UPDATE CASCADE;

-- 1d. activities.coach_id
DO $$
DECLARE
  fk_name TEXT;
BEGIN
  SELECT tc.constraint_name INTO fk_name
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu
    ON tc.constraint_name = kcu.constraint_name
    AND tc.table_schema = kcu.table_schema
  WHERE tc.table_name = 'activities'
    AND tc.constraint_type = 'FOREIGN KEY'
    AND kcu.column_name = 'coach_id'
  LIMIT 1;

  IF fk_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE activities DROP CONSTRAINT %I', fk_name);
  END IF;
END $$;

ALTER TABLE activities
  ADD CONSTRAINT activities_coach_id_fkey
  FOREIGN KEY (coach_id) REFERENCES coaches(id)
  ON DELETE CASCADE ON UPDATE CASCADE;

-- 1e. reminders.coach_id (may not exist yet)
DO $$
DECLARE
  fk_name TEXT;
BEGIN
  SELECT tc.constraint_name INTO fk_name
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu
    ON tc.constraint_name = kcu.constraint_name
    AND tc.table_schema = kcu.table_schema
  WHERE tc.table_name = 'reminders'
    AND tc.constraint_type = 'FOREIGN KEY'
    AND kcu.column_name = 'coach_id'
  LIMIT 1;

  IF fk_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE reminders DROP CONSTRAINT %I', fk_name);
    ALTER TABLE reminders
      ADD CONSTRAINT reminders_coach_id_fkey
      FOREIGN KEY (coach_id) REFERENCES coaches(id)
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- ============================================================
-- 2. MERGE COACH STUB — RPC (SECURITY DEFINER)
-- ============================================================
-- Called from the frontend when a new user signs up or first
-- logs in. Matches by optavia_id (primary) or email (fallback).
--
-- If a stub is found:
--   1. Updates the stub's id → auth user's UUID
--      (ON UPDATE CASCADE propagates to clients, activities, etc.)
--   2. Sets is_stub = false, fills in email/name
--   3. Also updates import_batches (no FK, done manually)
--   4. Returns the merged coach row as JSON
--
-- If no stub found: returns NULL (caller should INSERT normally).

CREATE OR REPLACE FUNCTION merge_coach_stub(
  auth_user_id UUID,
  coach_email TEXT,
  coach_full_name TEXT,
  coach_optavia_id TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  stub_record RECORD;
  result JSON;
BEGIN
  -- Try to find a matching stub by optavia_id first
  IF coach_optavia_id IS NOT NULL AND coach_optavia_id != '' THEN
    SELECT * INTO stub_record
    FROM coaches
    WHERE optavia_id = coach_optavia_id
      AND is_stub = true
    LIMIT 1;
  END IF;

  -- Fallback: try matching by email (rare — stubs usually lack email)
  IF stub_record IS NULL AND coach_email IS NOT NULL AND coach_email != '' THEN
    SELECT * INTO stub_record
    FROM coaches
    WHERE email = coach_email
      AND is_stub = true
    LIMIT 1;
  END IF;

  -- No stub found — caller should create a new record
  IF stub_record IS NULL THEN
    RETURN NULL;
  END IF;

  -- Guard: don't merge if a coach with this auth_user_id already exists
  IF EXISTS (SELECT 1 FROM coaches WHERE id = auth_user_id) THEN
    RETURN NULL;
  END IF;

  -- Merge: update the stub's id to the auth user's UUID.
  -- ON UPDATE CASCADE automatically updates coach_id in
  -- clients, client_touchpoints, activities, reminders, and
  -- upline_id in coaches.
  UPDATE coaches
  SET
    id         = auth_user_id,
    email      = coach_email,
    full_name  = COALESCE(NULLIF(coach_full_name, ''), full_name),
    is_stub    = false,
    updated_at = now()
  WHERE id = stub_record.id;

  -- Update import_batches (no FK constraint, must do manually)
  UPDATE import_batches
  SET coach_id = auth_user_id
  WHERE coach_id = stub_record.id;

  -- Return the merged profile
  SELECT row_to_json(c) INTO result
  FROM coaches c
  WHERE c.id = auth_user_id;

  RETURN result;
END;
$$;

COMMIT;

-- ============================================================
-- DONE! Verify with:
--
--   SELECT proname, prosecdef FROM pg_proc WHERE proname = 'merge_coach_stub';
--
-- Test (dry run — use a known stub optavia_id):
--
--   SELECT merge_coach_stub(
--     'some-auth-uuid'::UUID,
--     'test@example.com',
--     'Test Coach',
--     'KNOWN-STUB-OPTAVIA-ID'
--   );
-- ============================================================
