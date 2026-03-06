/**
 * Wire all presidential directors under Alison, plus catch any other orphan coaches.
 *
 * Usage:
 *   cd Optavia-Plus
 *   node src/scripts/wire-pds-to-alison.js
 */

const { readFileSync } = require("fs");
const { resolve } = require("path");
const { createClient } = require("@supabase/supabase-js");

// ---------- Parse .env.local ----------
const envPath = resolve(process.cwd(), ".env.local");
const envLines = readFileSync(envPath, "utf-8").split("\n");
for (const line of envLines) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const eqIdx = trimmed.indexOf("=");
  if (eqIdx === -1) continue;
  const key = trimmed.slice(0, eqIdx);
  let val = trimmed.slice(eqIdx + 1);
  if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
    val = val.slice(1, -1);
  }
  process.env[key] = val;
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const BATCH = 1000;

async function main() {
  console.log("=== WIRE PRESIDENTIAL DIRECTORS UNDER ALISON ===\n");

  // 1. Get Alison's real coach record
  const { data: alison } = await supabase
    .from("coaches")
    .select("id, full_name, email")
    .eq("email", "alibfriedman@gmail.com")
    .eq("is_stub", false)
    .single();

  if (!alison) throw new Error("Alison's real coach record not found");
  console.log(`1. Alison: id=${alison.id}, name=${alison.full_name}`);

  // 2. Find all distinct presidential_director names from clients
  let allClients = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from("clients")
      .select("presidential_director")
      .not("import_batch_id", "is", null)
      .not("presidential_director", "is", null)
      .range(from, from + BATCH - 1);
    if (error) throw error;
    allClients = allClients.concat(data);
    if (data.length < BATCH) break;
    from += BATCH;
  }

  const pdNames = [...new Set(allClients.map((c) => c.presidential_director))];
  console.log(`\n2. Found ${pdNames.length} presidential director names: ${pdNames.join(", ")}`);

  // Find coach records for the 9 non-Alison PDs
  const otherPDNames = pdNames.filter((n) => n !== "Alison Friedman");
  console.log(`   Non-Alison PDs: ${otherPDNames.length}`);

  // 3. Set upline_id = Alison for all 9
  let wired = 0;
  for (const pdName of otherPDNames) {
    const { data: pdCoach } = await supabase
      .from("coaches")
      .select("id, full_name, upline_id")
      .eq("full_name", pdName)
      .maybeSingle();

    if (!pdCoach) {
      console.log(`   WARNING: No coach found for PD "${pdName}"`);
      continue;
    }

    if (pdCoach.upline_id === alison.id) {
      console.log(`   SKIP: ${pdName} already points to Alison`);
      continue;
    }

    const { error } = await supabase
      .from("coaches")
      .update({ upline_id: alison.id })
      .eq("id", pdCoach.id);
    if (error) throw error;

    console.log(`   Set upline for ${pdName} (${pdCoach.id}) → Alison`);
    wired++;
  }
  console.log(`\n3. Wired ${wired} presidential directors under Alison`);

  // 4. Check for any OTHER coaches with upline_id = NULL who are not Alison or Scott
  const { data: orphans } = await supabase
    .from("coaches")
    .select("id, full_name, email, is_stub")
    .is("upline_id", null)
    .neq("id", alison.id);

  // Filter out Scott
  const realOrphans = orphans.filter((c) => c.email !== "sfriedman@greenavise.com");
  console.log(`\n4. Coaches with upline_id = NULL (excluding Alison & Scott): ${realOrphans.length}`);
  if (realOrphans.length > 0) {
    for (const o of realOrphans) {
      console.log(`   - ${o.full_name} (id=${o.id}, stub=${o.is_stub})`);
    }
  }

  // 5. Verification
  console.log("\n5. Verification...");

  const { data: subtree, error: rpcErr } = await supabase.rpc("get_subtree_coach_ids", {
    root_coach_id: alison.id,
  });
  if (rpcErr) throw rpcErr;

  const coachIds = subtree.map((r) => r.coach_id);
  console.log(`   Alison's subtree: ${coachIds.length} coach IDs`);

  // Count clients in subtree (batch to avoid URL length issues)
  let totalClients = 0;
  const CBATCH = 50;
  for (let i = 0; i < coachIds.length; i += CBATCH) {
    const batch = coachIds.slice(i, i + CBATCH);
    const { count, error: ce } = await supabase
      .from("clients")
      .select("*", { count: "exact", head: true })
      .not("import_batch_id", "is", null)
      .in("coach_id", batch);
    if (ce) throw ce;
    totalClients += count;
  }
  console.log(`   Clients via subtree: ${totalClients}`);

  // Total imported clients for comparison
  const { count: totalImported } = await supabase
    .from("clients")
    .select("*", { count: "exact", head: true })
    .not("import_batch_id", "is", null);
  console.log(`   Total imported clients: ${totalImported}`);
  console.log(`   Coverage: ${((totalClients / totalImported) * 100).toFixed(1)}%`);

  console.log("\n=== DONE ===");
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
