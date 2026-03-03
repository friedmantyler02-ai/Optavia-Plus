/**
 * One-time script to link already-imported clients to their coaches.
 *
 * Finds all clients where import_batch_id IS NOT NULL and coach_id IS NULL,
 * resolves their original_coach_id → coach UUID, and updates in batches.
 *
 * Usage:
 *   cd landflow
 *   node src/scripts/fix-linking.js
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
  const val = trimmed.slice(eq + 1);
  if (!process.env[key]) process.env[key] = val;
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

// Use service role key to bypass RLS
const supabase = createClient(supabaseUrl, serviceRoleKey);

const PAGE_SIZE = 1000;
const BATCH_SIZE = 500;

async function main() {
  console.log("Fetching unlinked clients...");

  // 1. Paginate through all unlinked clients
  const unlinked = [];
  let offset = 0;

  while (true) {
    const { data, error } = await supabase
      .from("clients")
      .select("id, original_coach_id")
      .not("import_batch_id", "is", null)
      .is("coach_id", null)
      .not("original_coach_id", "is", null)
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) {
      console.error("Query error:", error.message);
      process.exit(1);
    }

    if (!data || data.length === 0) break;

    unlinked.push(...data);
    console.log(`  fetched ${unlinked.length} unlinked clients so far...`);

    if (data.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  if (unlinked.length === 0) {
    console.log("No unlinked clients found. Nothing to do.");
    return;
  }

  console.log(`Found ${unlinked.length} unlinked clients.`);

  // 2. Group by original_coach_id
  const byCoach = new Map();
  for (const client of unlinked) {
    const key = client.original_coach_id;
    if (!byCoach.has(key)) byCoach.set(key, []);
    byCoach.get(key).push(client.id);
  }

  console.log(`Grouped into ${byCoach.size} unique coaches.`);

  // 3. Resolve coach optavia_ids → UUIDs
  console.log("Resolving coach UUIDs...");
  const coachOptaviaIds = Array.from(byCoach.keys());
  const coachMap = new Map();

  for (let i = 0; i < coachOptaviaIds.length; i += 100) {
    const chunk = coachOptaviaIds.slice(i, i + 100);
    const { data, error } = await supabase
      .from("coaches")
      .select("id, optavia_id")
      .in("optavia_id", chunk);

    if (error) {
      console.error("Coach lookup error:", error.message);
      process.exit(1);
    }

    if (data) {
      for (const coach of data) coachMap.set(coach.optavia_id, coach.id);
    }
  }

  console.log(`Resolved ${coachMap.size} of ${coachOptaviaIds.length} coach IDs.`);

  const unmatchedCoaches = coachOptaviaIds.filter((id) => !coachMap.has(id));
  if (unmatchedCoaches.length > 0) {
    console.log(`  ${unmatchedCoaches.length} coach optavia_ids had no matching coach record.`);
  }

  // 4. Update clients in batches
  let linked = 0;
  let skipped = 0;

  for (const [coachOptaviaId, clientIds] of byCoach) {
    const coachUuid = coachMap.get(coachOptaviaId);
    if (!coachUuid) {
      skipped += clientIds.length;
      continue;
    }

    for (let i = 0; i < clientIds.length; i += BATCH_SIZE) {
      const batch = clientIds.slice(i, i + BATCH_SIZE);
      const { error } = await supabase
        .from("clients")
        .update({ coach_id: coachUuid })
        .in("id", batch);

      if (error) {
        console.error(`  Batch update error for coach ${coachOptaviaId}: ${error.message}`);
      } else {
        linked += batch.length;
      }

      // Log progress every 2000 records
      if ((linked + skipped) % 2000 < BATCH_SIZE) {
        console.log(`  Progress: ${linked.toLocaleString()} linked, ${skipped.toLocaleString()} skipped of ${unlinked.length.toLocaleString()}`);
      }
    }
  }

  console.log("\nDone!");
  console.log(`  Linked:  ${linked.toLocaleString()}`);
  console.log(`  Skipped: ${skipped.toLocaleString()} (no matching coach)`);
  console.log(`  Total:   ${unlinked.length.toLocaleString()}`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
