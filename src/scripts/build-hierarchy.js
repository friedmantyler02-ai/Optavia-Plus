/**
 * Build the coach hierarchy tree by wiring up upline_id on every coach stub.
 *
 * Hierarchy: 10 presidential_directors → 40 global_directors → 463 coach stubs
 *
 * Usage:
 *   cd Optavia-Plus
 *   node src/scripts/build-hierarchy.js
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

// ---------- Helpers ----------

/** Fetch all rows in batches of 1000 (PostgREST default limit). */
async function fetchAll(table, select, filters) {
  let rows = [];
  let from = 0;
  const BATCH = 1000;
  while (true) {
    let q = supabase.from(table).select(select).range(from, from + BATCH - 1);
    if (filters) filters(q);
    // We need to apply filters inline — rebuild query each time
    const { data, error } = await applyFilters(supabase.from(table).select(select).range(from, from + BATCH - 1), filters);
    if (error) throw new Error(`fetchAll ${table}: ${error.message}`);
    rows = rows.concat(data);
    if (data.length < BATCH) break;
    from += BATCH;
  }
  return rows;
}

async function applyFilters(query, filters) {
  if (filters) return filters(query);
  return query;
}

/** Update rows in batches to avoid payload limits. */
async function batchUpdate(table, ids, updates, batchSize = 500) {
  let total = 0;
  for (let i = 0; i < ids.length; i += batchSize) {
    const batch = ids.slice(i, i + batchSize);
    const { error, count } = await supabase
      .from(table)
      .update(updates)
      .in("id", batch);
    if (error) throw new Error(`batchUpdate ${table}: ${error.message}`);
    total += batch.length;
  }
  return total;
}

// ---------- Main ----------

async function main() {
  console.log("=== BUILD HIERARCHY SCRIPT ===\n");

  // ================================================================
  // STEP 1 — Fix double-space typo in presidential_director
  // ================================================================
  console.log("STEP 1 — Fix double-space typo in presidential_director...");

  // Find clients with double-spaced presidential_director
  let doubleSpaceClients = [];
  let from = 0;
  const BATCH = 1000;
  while (true) {
    const { data, error } = await supabase
      .from("clients")
      .select("id, presidential_director")
      .like("presidential_director", "%  %")
      .range(from, from + BATCH - 1);
    if (error) throw new Error(`Step 1 fetch: ${error.message}`);
    doubleSpaceClients = doubleSpaceClients.concat(data);
    if (data.length < BATCH) break;
    from += BATCH;
  }

  console.log(`  Found ${doubleSpaceClients.length} client rows with double-space in presidential_director`);

  if (doubleSpaceClients.length > 0) {
    // Group by the bad value → fixed value
    const fixes = {};
    for (const c of doubleSpaceClients) {
      const fixed = c.presidential_director.replace(/\s{2,}/g, " ");
      if (!fixes[c.presidential_director]) {
        fixes[c.presidential_director] = { fixed, ids: [] };
      }
      fixes[c.presidential_director].ids.push(c.id);
    }

    for (const [bad, { fixed, ids }] of Object.entries(fixes)) {
      console.log(`  Fixing "${bad}" → "${fixed}" (${ids.length} rows)`);
      // Update in batches
      for (let i = 0; i < ids.length; i += 500) {
        const batch = ids.slice(i, i + 500);
        const { error } = await supabase
          .from("clients")
          .update({ presidential_director: fixed })
          .in("id", batch);
        if (error) throw new Error(`Step 1 update: ${error.message}`);
      }
    }
    console.log(`  ✓ Fixed ${doubleSpaceClients.length} rows\n`);
  } else {
    console.log("  No double-space rows found (already fixed?)\n");
  }

  // Also fix double-space in global_director just in case
  let doubleSpaceGD = [];
  from = 0;
  while (true) {
    const { data, error } = await supabase
      .from("clients")
      .select("id, global_director")
      .like("global_director", "%  %")
      .range(from, from + BATCH - 1);
    if (error) throw new Error(`Step 1 GD fetch: ${error.message}`);
    doubleSpaceGD = doubleSpaceGD.concat(data);
    if (data.length < BATCH) break;
    from += BATCH;
  }
  if (doubleSpaceGD.length > 0) {
    console.log(`  Also found ${doubleSpaceGD.length} rows with double-space in global_director`);
    for (const c of doubleSpaceGD) {
      const fixed = c.global_director.replace(/\s{2,}/g, " ");
      const { error } = await supabase
        .from("clients")
        .update({ global_director: fixed })
        .eq("id", c.id);
      if (error) throw new Error(`Step 1 GD update: ${error.message}`);
    }
    console.log(`  ✓ Fixed ${doubleSpaceGD.length} global_director rows\n`);
  }

  // ================================================================
  // STEP 2 — Merge Alison's two coach records
  // ================================================================
  console.log("STEP 2 — Merge Alison Friedman's records...");

  const { data: realAlison } = await supabase
    .from("coaches")
    .select("id, email, full_name, optavia_id, is_stub")
    .eq("email", "alibfriedman@gmail.com")
    .eq("is_stub", false)
    .single();

  const { data: stubAlison } = await supabase
    .from("coaches")
    .select("id, email, full_name, optavia_id, is_stub")
    .eq("full_name", "Alison Friedman")
    .eq("is_stub", true)
    .single();

  if (realAlison && stubAlison) {
    console.log(`  Real Alison: id=${realAlison.id}, optavia_id=${realAlison.optavia_id}`);
    console.log(`  Stub Alison: id=${stubAlison.id}, optavia_id=${stubAlison.optavia_id}`);

    // Clear optavia_id from stub first (unique constraint), then copy to real
    const { error: eClear } = await supabase
      .from("coaches")
      .update({ optavia_id: null })
      .eq("id", stubAlison.id);
    if (eClear) throw new Error(`Step 2 clear optavia_id: ${eClear.message}`);

    const { error: e1 } = await supabase
      .from("coaches")
      .update({ optavia_id: stubAlison.optavia_id })
      .eq("id", realAlison.id);
    if (e1) throw new Error(`Step 2 copy optavia_id: ${e1.message}`);
    console.log(`  Copied optavia_id ${stubAlison.optavia_id} to real record`);

    // Reassign clients from stub → real
    let clientsReassigned = 0;
    from = 0;
    while (true) {
      const { data: clientBatch, error } = await supabase
        .from("clients")
        .select("id")
        .eq("coach_id", stubAlison.id)
        .range(from, from + BATCH - 1);
      if (error) throw new Error(`Step 2 client fetch: ${error.message}`);
      if (clientBatch.length === 0) break;

      const ids = clientBatch.map((c) => c.id);
      for (let i = 0; i < ids.length; i += 500) {
        const batch = ids.slice(i, i + 500);
        const { error: ue } = await supabase
          .from("clients")
          .update({ coach_id: realAlison.id })
          .in("id", batch);
        if (ue) throw new Error(`Step 2 client update: ${ue.message}`);
      }
      clientsReassigned += clientBatch.length;
      if (clientBatch.length < BATCH) break;
      // Don't advance `from` — the rows we just updated no longer match the filter
    }
    console.log(`  Reassigned ${clientsReassigned} clients from stub → real`);

    // Reassign any coaches whose upline_id points to the stub
    const { data: uplineRefs } = await supabase
      .from("coaches")
      .select("id")
      .eq("upline_id", stubAlison.id);
    if (uplineRefs && uplineRefs.length > 0) {
      const { error: e2 } = await supabase
        .from("coaches")
        .update({ upline_id: realAlison.id })
        .eq("upline_id", stubAlison.id);
      if (e2) throw new Error(`Step 2 upline reassign: ${e2.message}`);
      console.log(`  Reassigned ${uplineRefs.length} coach upline refs`);
    }

    // Delete the stub
    const { error: e3 } = await supabase
      .from("coaches")
      .delete()
      .eq("id", stubAlison.id);
    if (e3) throw new Error(`Step 2 delete stub: ${e3.message}`);
    console.log(`  ✓ Deleted stub Alison (${stubAlison.id})\n`);
  } else {
    console.log("  Could not find both records — skipping merge");
    if (!realAlison) console.log("  Missing: real Alison");
    if (!stubAlison) console.log("  Missing: stub Alison");
    console.log();
  }

  // ================================================================
  // STEP 3 — Merge Scott Friedman if both exist
  // ================================================================
  console.log("STEP 3 — Check/merge Scott Friedman...");

  const { data: realScott } = await supabase
    .from("coaches")
    .select("id, email, full_name, optavia_id, is_stub")
    .eq("email", "sfriedman@greenavise.com")
    .eq("is_stub", false)
    .single();

  const { data: stubScott } = await supabase
    .from("coaches")
    .select("id, email, full_name, optavia_id, is_stub")
    .eq("full_name", "Scott Friedman")
    .eq("is_stub", true)
    .maybeSingle();

  if (realScott && stubScott) {
    console.log(`  Real Scott: id=${realScott.id}, optavia_id=${realScott.optavia_id}`);
    console.log(`  Stub Scott: id=${stubScott.id}, optavia_id=${stubScott.optavia_id}`);

    // Clear optavia_id from stub first (unique constraint), then copy to real
    const { error: eClear } = await supabase
      .from("coaches")
      .update({ optavia_id: null })
      .eq("id", stubScott.id);
    if (eClear) throw new Error(`Step 3 clear optavia_id: ${eClear.message}`);

    const { error: e1 } = await supabase
      .from("coaches")
      .update({ optavia_id: stubScott.optavia_id })
      .eq("id", realScott.id);
    if (e1) throw new Error(`Step 3 copy optavia_id: ${e1.message}`);
    console.log(`  Copied optavia_id ${stubScott.optavia_id} to real record`);

    // Reassign clients
    let clientsReassigned = 0;
    while (true) {
      const { data: clientBatch, error } = await supabase
        .from("clients")
        .select("id")
        .eq("coach_id", stubScott.id)
        .range(0, BATCH - 1);
      if (error) throw new Error(`Step 3 client fetch: ${error.message}`);
      if (clientBatch.length === 0) break;

      const ids = clientBatch.map((c) => c.id);
      for (let i = 0; i < ids.length; i += 500) {
        const batch = ids.slice(i, i + 500);
        const { error: ue } = await supabase
          .from("clients")
          .update({ coach_id: realScott.id })
          .in("id", batch);
        if (ue) throw new Error(`Step 3 client update: ${ue.message}`);
      }
      clientsReassigned += clientBatch.length;
      if (clientBatch.length < BATCH) break;
    }
    console.log(`  Reassigned ${clientsReassigned} clients from stub → real`);

    // Reassign upline refs
    const { data: uplineRefs } = await supabase
      .from("coaches")
      .select("id")
      .eq("upline_id", stubScott.id);
    if (uplineRefs && uplineRefs.length > 0) {
      const { error: e2 } = await supabase
        .from("coaches")
        .update({ upline_id: realScott.id })
        .eq("upline_id", stubScott.id);
      if (e2) throw new Error(`Step 3 upline reassign: ${e2.message}`);
      console.log(`  Reassigned ${uplineRefs.length} coach upline refs`);
    }

    // Delete stub
    const { error: e3 } = await supabase
      .from("coaches")
      .delete()
      .eq("id", stubScott.id);
    if (e3) throw new Error(`Step 3 delete stub: ${e3.message}`);
    console.log(`  ✓ Deleted stub Scott (${stubScott.id})\n`);
  } else {
    console.log("  No stub Scott Friedman found — nothing to merge\n");
  }

  // ================================================================
  // STEP 4 — Wire up BOTTOM level: direct coaches → global directors
  // ================================================================
  console.log("STEP 4 — Wire up bottom level (coaches → global directors)...");

  // Build a map of coach full_name → coach id (including real users)
  let allCoaches = [];
  from = 0;
  while (true) {
    const { data, error } = await supabase
      .from("coaches")
      .select("id, full_name, is_stub")
      .range(from, from + BATCH - 1);
    if (error) throw new Error(`Step 4 coach fetch: ${error.message}`);
    allCoaches = allCoaches.concat(data);
    if (data.length < BATCH) break;
    from += BATCH;
  }

  const coachByName = {};
  for (const c of allCoaches) {
    // Prefer non-stub (real) records when names collide
    if (!coachByName[c.full_name] || !c.is_stub) {
      coachByName[c.full_name] = c;
    }
  }
  console.log(`  Loaded ${allCoaches.length} coaches, ${Object.keys(coachByName).length} unique names`);

  // Fetch all imported clients with their coach_id and global_director
  console.log("  Fetching all imported clients (coach_id, global_director)...");
  let importedClients = [];
  from = 0;
  while (true) {
    const { data, error } = await supabase
      .from("clients")
      .select("coach_id, global_director")
      .not("import_batch_id", "is", null)
      .not("coach_id", "is", null)
      .range(from, from + BATCH - 1);
    if (error) throw new Error(`Step 4 client fetch: ${error.message}`);
    importedClients = importedClients.concat(data);
    if (data.length < BATCH) break;
    from += BATCH;
  }
  console.log(`  Fetched ${importedClients.length} imported clients`);

  // For each coach, find the most common global_director among their clients
  const coachToGD = {}; // coach_id → { gd_name: count }
  for (const c of importedClients) {
    if (!c.global_director) continue;
    if (!coachToGD[c.coach_id]) coachToGD[c.coach_id] = {};
    coachToGD[c.coach_id][c.global_director] = (coachToGD[c.coach_id][c.global_director] || 0) + 1;
  }

  let bottomWired = 0;
  const updates4 = []; // { id, upline_id }
  for (const [coachId, gdCounts] of Object.entries(coachToGD)) {
    // Find the most common GD
    let bestGD = null;
    let bestCount = 0;
    for (const [gd, count] of Object.entries(gdCounts)) {
      if (count > bestCount) {
        bestGD = gd;
        bestCount = count;
      }
    }
    if (!bestGD) continue;

    const gdCoach = coachByName[bestGD];
    if (!gdCoach) {
      console.log(`  WARNING: No coach found for global_director "${bestGD}"`);
      continue;
    }

    // Skip if the coach IS the global director
    if (gdCoach.id === coachId) continue;

    updates4.push({ id: coachId, upline_id: gdCoach.id, name: allCoaches.find(c => c.id === coachId)?.full_name, gd: bestGD });
    bottomWired++;
  }

  // Apply updates in batches grouped by upline_id for efficiency
  const byUpline4 = {};
  for (const u of updates4) {
    if (!byUpline4[u.upline_id]) byUpline4[u.upline_id] = [];
    byUpline4[u.upline_id].push(u.id);
  }

  for (const [uplineId, coachIds] of Object.entries(byUpline4)) {
    for (let i = 0; i < coachIds.length; i += 500) {
      const batch = coachIds.slice(i, i + 500);
      const { error } = await supabase
        .from("coaches")
        .update({ upline_id: uplineId })
        .in("id", batch);
      if (error) throw new Error(`Step 4 update: ${error.message}`);
    }
  }

  // Log a sample of updates (first 10)
  for (const u of updates4.slice(0, 10)) {
    console.log(`  Set upline for ${u.name || u.id} → ${u.gd}`);
  }
  if (updates4.length > 10) console.log(`  ... and ${updates4.length - 10} more`);
  console.log(`  ✓ Set upline for ${bottomWired} coaches (bottom level)\n`);

  // ================================================================
  // STEP 5 — Wire up MIDDLE level: global directors → presidential directors
  // ================================================================
  console.log("STEP 5 — Wire up middle level (global directors → presidential directors)...");

  // Fetch clients with global_director and presidential_director
  console.log("  Fetching clients (global_director, presidential_director)...");
  let clientsForGD = [];
  from = 0;
  while (true) {
    const { data, error } = await supabase
      .from("clients")
      .select("global_director, presidential_director")
      .not("import_batch_id", "is", null)
      .not("global_director", "is", null)
      .not("presidential_director", "is", null)
      .range(from, from + BATCH - 1);
    if (error) throw new Error(`Step 5 client fetch: ${error.message}`);
    clientsForGD = clientsForGD.concat(data);
    if (data.length < BATCH) break;
    from += BATCH;
  }
  console.log(`  Fetched ${clientsForGD.length} clients with both GD and PD`);

  // For each global_director, find the most common presidential_director
  const gdToPD = {}; // gd_name → { pd_name: count }
  for (const c of clientsForGD) {
    if (!gdToPD[c.global_director]) gdToPD[c.global_director] = {};
    gdToPD[c.global_director][c.presidential_director] =
      (gdToPD[c.global_director][c.presidential_director] || 0) + 1;
  }

  let middleWired = 0;
  for (const [gdName, pdCounts] of Object.entries(gdToPD)) {
    let bestPD = null;
    let bestCount = 0;
    for (const [pd, count] of Object.entries(pdCounts)) {
      if (count > bestCount) {
        bestPD = pd;
        bestCount = count;
      }
    }
    if (!bestPD) continue;

    const gdCoach = coachByName[gdName];
    const pdCoach = coachByName[bestPD];
    if (!gdCoach) {
      console.log(`  WARNING: No coach for GD "${gdName}"`);
      continue;
    }
    if (!pdCoach) {
      console.log(`  WARNING: No coach for PD "${bestPD}"`);
      continue;
    }
    if (gdCoach.id === pdCoach.id) {
      console.log(`  SKIP: ${gdName} is their own presidential director`);
      continue;
    }

    const { error } = await supabase
      .from("coaches")
      .update({ upline_id: pdCoach.id })
      .eq("id", gdCoach.id);
    if (error) throw new Error(`Step 5 update: ${error.message}`);

    console.log(`  Set upline for ${gdName} → ${bestPD}`);
    middleWired++;
  }

  console.log(`  ✓ Set upline for ${middleWired} global directors (middle level)\n`);

  // ================================================================
  // STEP 6 — Verification
  // ================================================================
  console.log("STEP 6 — Verification...");

  const { count: hasUpline } = await supabase
    .from("coaches")
    .select("*", { count: "exact", head: true })
    .not("upline_id", "is", null);

  const { count: noUpline } = await supabase
    .from("coaches")
    .select("*", { count: "exact", head: true })
    .is("upline_id", null);

  console.log(`  Coaches with upline_id set: ${hasUpline}`);
  console.log(`  Coaches with upline_id NULL: ${noUpline}`);

  // Find Alison's real ID
  const { data: alison } = await supabase
    .from("coaches")
    .select("id")
    .eq("email", "alibfriedman@gmail.com")
    .single();

  if (alison) {
    const { data: subtree, error: rpcErr } = await supabase.rpc("get_subtree_coach_ids", {
      root_coach_id: alison.id,
    });
    if (rpcErr) {
      console.log(`  RPC error: ${rpcErr.message}`);
    } else {
      console.log(`  Alison's subtree (get_subtree_coach_ids): ${subtree.length} coach IDs`);
    }
  }

  console.log("\n=== DONE ===");
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
