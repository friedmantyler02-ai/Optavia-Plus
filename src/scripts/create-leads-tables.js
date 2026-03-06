/**
 * Creates the leads and lead_activities tables with indexes and RLS policies.
 *
 * NOTE: Supabase's REST API does not support DDL (CREATE TABLE, etc.).
 * This script verifies the tables exist after running the SQL via the
 * Supabase Dashboard SQL Editor. The full DDL is included below for reference.
 *
 * To create the tables:
 *   1. Open https://supabase.com/dashboard/project/couqugkxroslnzvevpvm/sql/new
 *   2. Paste the SQL from the DDL constant below
 *   3. Click Run
 *
 * To verify:
 *   cd Optavia-Plus
 *   node src/scripts/create-leads-tables.js
 */

const { readFileSync } = require("fs");
const { resolve } = require("path");
const { createClient } = require("@supabase/supabase-js");

// Parse .env.local manually (no dotenv dependency needed)
const envPath = resolve(process.cwd(), ".env.local");
const envLines = readFileSync(envPath, "utf-8").split("\n");
for (const line of envLines) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const eq = trimmed.indexOf("=");
  if (eq === -1) continue;
  const key = trimmed.slice(0, eq);
  let val = trimmed.slice(eq + 1);
  if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
    val = val.slice(1, -1);
  }
  if (!process.env[key]) process.env[key] = val;
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

/*
 * Full DDL for reference (run in Supabase SQL Editor):
 *
 * -- 1. Create leads table
 * CREATE TABLE IF NOT EXISTS leads (
 *   id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
 *   coach_id uuid NOT NULL REFERENCES coaches(id),
 *   full_name text NOT NULL,
 *   email text,
 *   phone text,
 *   facebook_url text,
 *   source text CHECK (source IN ('facebook_post','facebook_group','instagram','referral','in_person','past_client','other')),
 *   stage text NOT NULL DEFAULT 'prospect' CHECK (stage IN ('prospect','conversation','ha_scheduled','ha_completed','client','potential_coach')),
 *   ha_date timestamptz,
 *   ha_outcome text CHECK (ha_outcome IN ('client','thinking','not_now','no_show')),
 *   groups text,
 *   notes text,
 *   last_contact_date timestamptz,
 *   next_followup_date timestamptz,
 *   converted_client_id uuid REFERENCES clients(id),
 *   created_at timestamptz DEFAULT now(),
 *   updated_at timestamptz DEFAULT now()
 * );
 *
 * -- 2. Indexes on leads
 * CREATE INDEX IF NOT EXISTS idx_leads_coach_id ON leads(coach_id);
 * CREATE INDEX IF NOT EXISTS idx_leads_coach_id_stage ON leads(coach_id, stage);
 * CREATE INDEX IF NOT EXISTS idx_leads_coach_id_next_followup ON leads(coach_id, next_followup_date);
 *
 * -- 3. Create lead_activities table
 * CREATE TABLE IF NOT EXISTS lead_activities (
 *   id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
 *   lead_id uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
 *   coach_id uuid NOT NULL REFERENCES coaches(id),
 *   action text NOT NULL CHECK (action IN ('note','call','text','email','meeting','facebook_message','stage_change','other')),
 *   details text,
 *   created_at timestamptz DEFAULT now()
 * );
 *
 * -- 4. Indexes on lead_activities
 * CREATE INDEX IF NOT EXISTS idx_lead_activities_lead_id ON lead_activities(lead_id);
 * CREATE INDEX IF NOT EXISTS idx_lead_activities_coach_id_created ON lead_activities(coach_id, created_at);
 *
 * -- 5. Enable RLS
 * ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
 * ALTER TABLE lead_activities ENABLE ROW LEVEL SECURITY;
 *
 * -- 6. RLS policies for leads
 * CREATE POLICY leads_select ON leads FOR SELECT USING (coach_id = auth.uid());
 * CREATE POLICY leads_insert ON leads FOR INSERT WITH CHECK (coach_id = auth.uid());
 * CREATE POLICY leads_update ON leads FOR UPDATE USING (coach_id = auth.uid());
 * CREATE POLICY leads_delete ON leads FOR DELETE USING (coach_id = auth.uid());
 *
 * -- 7. RLS policies for lead_activities
 * CREATE POLICY lead_activities_select ON lead_activities FOR SELECT USING (coach_id = auth.uid());
 * CREATE POLICY lead_activities_insert ON lead_activities FOR INSERT WITH CHECK (coach_id = auth.uid());
 * CREATE POLICY lead_activities_update ON lead_activities FOR UPDATE USING (coach_id = auth.uid());
 * CREATE POLICY lead_activities_delete ON lead_activities FOR DELETE USING (coach_id = auth.uid());
 */

async function main() {
  console.log("Verifying leads system tables...\n");

  // Check leads table
  const { data: leadsData, error: leadsErr } = await supabase
    .from("leads")
    .select("id")
    .limit(0);

  if (leadsErr) {
    console.error("FAIL: leads table");
    console.error(`  ${leadsErr.message}`);
  } else {
    console.log("OK: leads table exists");
  }

  // Check lead_activities table
  const { data: activitiesData, error: activitiesErr } = await supabase
    .from("lead_activities")
    .select("id")
    .limit(0);

  if (activitiesErr) {
    console.error("FAIL: lead_activities table");
    console.error(`  ${activitiesErr.message}`);
  } else {
    console.log("OK: lead_activities table exists");
  }

  // Summary
  const failures = [leadsErr, activitiesErr].filter(Boolean).length;
  console.log(`\nDone: ${2 - failures} passed, ${failures} failed`);
  if (failures > 0) process.exit(1);
}

main().catch((err) => {
  console.error("Fatal:", err.message);
  process.exit(1);
});
