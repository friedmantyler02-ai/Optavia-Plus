/**
 * Org CSV import engine.
 *
 * Processes parsed CSV rows (from Papa Parse) and upserts coaches + clients
 * into Supabase.
 */

// ---------------------------------------------------------------------------
// Phone normalisation — mirrors normalizeOrgCsvPhone from lib/phone.ts
// ---------------------------------------------------------------------------

function normalizeOrgCsvPhone(raw) {
  if (raw == null) return null;
  let value = raw.trim();
  if (!value) return null;

  // Strip =" prefix and " suffix from CSV export format
  if (value.startsWith('="')) value = value.slice(2);
  if (value.endsWith('"')) value = value.slice(0, -1);

  const digits = value.replace(/\D/g, "");
  if (!digits) return null;

  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (digits.length === 10) return `+1${digits}`;

  return null;
}

// ---------------------------------------------------------------------------
// Column name normalization
// ---------------------------------------------------------------------------

/**
 * Normalizes a CSV row's keys so that downstream code doesn't need to worry
 * about whitespace, ="" wrapping, or other Optavia CSV quirks.
 *
 * Papa Parse's transformHeader already handles the Phone column in the page,
 * but the import engine receives raw row objects directly and must be resilient
 * to slight variations:
 *   - Leading/trailing whitespace:  "  Email " → "Email"
 *   - Excel ="" prefix:             '="Phone"' → "Phone"
 *   - BOM prefix:                   "\uFEFFOPTAVIAID" → "OPTAVIAID"
 *
 * Returns a new object with cleaned keys — values are untouched.
 */
function normalizeRowKeys(row) {
  const out = {};
  for (const rawKey of Object.keys(row)) {
    let key = rawKey.trim();
    // Strip BOM if present on first column
    if (key.charCodeAt(0) === 0xfeff) key = key.slice(1);
    // Strip ="" wrapping:  ='="Foo"' → 'Foo'
    if (key.startsWith('="') && key.endsWith('"')) {
      key = key.slice(2, -1);
    }
    out[key] = row[rawKey];
  }
  return out;
}

// ---------------------------------------------------------------------------
// 1. extractUniqueCoaches
// ---------------------------------------------------------------------------

/**
 * Extracts unique coaches from parsed CSV rows.
 *
 * @param {Array<Object>} parsedRows – raw rows from Papa Parse (header mode)
 * @returns {Array<{optavia_id: string, full_name: string}>}
 */
export function extractUniqueCoaches(parsedRows) {
  const seen = new Map();

  for (const rawRow of parsedRows) {
    const row = normalizeRowKeys(rawRow);
    const id = (row.CurrentCoachID ?? "").trim();
    if (!id) continue;
    if (seen.has(id)) continue;

    seen.set(id, {
      optavia_id: id,
      full_name: (row.CurrentCoachName ?? "").trim(),
    });
  }

  return Array.from(seen.values());
}

// ---------------------------------------------------------------------------
// 2. upsertCoachStubs
// ---------------------------------------------------------------------------

/**
 * Upserts coach stubs into the coaches table.
 * Does NOT overwrite is_stub if the coach already exists (preserves real accounts).
 *
 * Why we use select-then-insert instead of .upsert():
 * Supabase's .upsert() applies ON CONFLICT DO UPDATE SET for ALL columns in the
 * payload. If we included is_stub: true in an upsert, it would overwrite
 * is_stub = false on coaches who already signed up — demoting a real coach to a
 * stub. By checking existence first, we only set is_stub on genuinely new rows.
 *
 * This also handles the logged-in coach case correctly: if the importing coach's
 * own optavia_id appears in the CSV's CurrentCoachID column, their real coach
 * record (is_stub = false) is left untouched. Later, linkClientsToCoaches joins
 * on optavia_id, so those clients get linked to the real coach's UUID — not a stub.
 *
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {Array<{optavia_id: string, full_name: string}>} coaches
 * @returns {Promise<{created: number, existing: number}>}
 */
export async function upsertCoachStubs(supabase, coaches) {
  let created = 0;
  let existing = 0;

  for (const coach of coaches) {
    // Check if this coach already has a record (real account or prior stub)
    const { data: existingCoach } = await supabase
      .from("coaches")
      .select("id")
      .eq("optavia_id", coach.optavia_id)
      .maybeSingle();

    if (existingCoach) {
      existing++;
      // Update the display name only — never touch is_stub, user_id, or any
      // other field that belongs to a real coach account.
      await supabase
        .from("coaches")
        .update({ full_name: coach.full_name })
        .eq("optavia_id", coach.optavia_id);
    } else {
      // Brand-new coach we haven't seen before — create a stub
      const { error } = await supabase
        .from("coaches")
        .insert({
          optavia_id: coach.optavia_id,
          full_name: coach.full_name,
          is_stub: true,
        });

      if (error) {
        // Race condition: another request inserted between our check and insert.
        // Treat as existing — their record is already there.
        existing++;
      } else {
        created++;
      }
    }
  }

  return { created, existing };
}

// ---------------------------------------------------------------------------
// 3. buildClientRecord
// ---------------------------------------------------------------------------

/**
 * Maps a single parsed CSV row to a clients table record.
 *
 * Runs normalizeRowKeys first so column lookups work regardless of
 * whitespace, ="" wrapping, or BOM prefixes in the CSV headers.
 *
 * @param {Object} rawRow – a raw row from Papa Parse
 * @param {string} batchId – import batch UUID
 * @returns {Object|null} – mapped record, or null if corrupt (missing OPTAVIAID)
 */
export function buildClientRecord(rawRow, batchId) {
  const row = normalizeRowKeys(rawRow);

  const optaviaId = (row.OPTAVIAID ?? "").trim();
  if (!optaviaId) return null;

  // Guard: skip the header row if it was accidentally included as data
  if (optaviaId === "OPTAVIAID") return null;

  const email = (row.Email ?? "").trim();
  const phone = normalizeOrgCsvPhone(row.Phone ?? "");

  const lastOrderDate = (row.LastOrderDate ?? "").trim();
  const pqvRaw = (row.PQV ?? "").trim();
  const premierRaw = (row["Premier+Member"] ?? "").trim();

  // Safe date parsing — malformed dates become null instead of crashing
  let parsedLastOrderDate = null;
  if (lastOrderDate) {
    try {
      const d = new Date(lastOrderDate);
      if (!isNaN(d.getTime())) {
        parsedLastOrderDate = d.toISOString();
      }
    } catch {
      // Invalid date string — leave as null
    }
  }

  // Safe PQV parsing — non-numeric values become 0
  let parsedPqv = null;
  if (pqvRaw) {
    const n = Number(pqvRaw);
    parsedPqv = isNaN(n) ? 0 : n;
  }

  return {
    optavia_id: optaviaId,
    full_name: `${(row.FirstName ?? "").trim()} ${(row.LastName ?? "").trim()}`.trim(),
    email: email && !email.toLowerCase().endsWith("@medifastinc.com") ? email : null,
    phone: phone,
    country_code: (row.CountryCode ?? "").trim() || null,
    level: (row.Level ?? "").trim() || null,
    last_order_date: parsedLastOrderDate,
    account_status: (row.AccountStatus ?? "").trim() || null,
    pqv: parsedPqv,
    is_premier_member: premierRaw ? premierRaw.toLowerCase() === "yes" : null,
    original_coach_name: (row.CurrentCoachName ?? "").trim() || null,
    original_coach_id: (row.CurrentCoachID ?? "").trim() || null,
    global_director: (row.GlobalDirector ?? "").trim() || null,
    presidential_director: (row.PresidentialDirector ?? "").trim() || null,
    import_batch_id: batchId,
  };
}

// ---------------------------------------------------------------------------
// 4. batchUpsertClients
// ---------------------------------------------------------------------------

const BATCH_SIZE = 500;

/** Columns that an org import may update on conflict. */
const ORG_SOURCED_COLUMNS = [
  "full_name",
  "email",
  "phone",
  "country_code",
  "level",
  "last_order_date",
  "account_status",
  "pqv",
  "is_premier_member",
  "original_coach_name",
  "original_coach_id",
  "global_director",
  "presidential_director",
  "import_batch_id",
];

/**
 * Upserts client records in batches of 500.
 *
 * On conflict (optavia_id), only org-sourced fields are updated — coach-added
 * fields (status, plan, weight_start, weight_current, notes, start_date,
 * last_contact_date, coach_id) are never overwritten.
 *
 * If a batch fails, it is retried once after a 1-second delay. If the retry
 * also fails, the error is logged and processing continues with the next batch.
 * One bad batch should never kill the entire import.
 *
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {Array<Object>} records – from buildClientRecord()
 * @param {(progress: {completed: number, total: number, errors: number}) => void} onProgress
 * @returns {Promise<{inserted: number, updated: number, errors: number, errorDetails: Array}>}
 */
export async function batchUpsertClients(supabase, records, onProgress) {
  let inserted = 0;
  let updated = 0;
  let errors = 0;
  const errorDetails = [];
  let completed = 0;

  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    const batchIndex = Math.floor(i / BATCH_SIZE);
    const chunk = records.slice(i, i + BATCH_SIZE);

    let result = await supabase
      .from("clients")
      .upsert(chunk, {
        onConflict: "optavia_id",
        ignoreDuplicates: false,
      })
      .select("optavia_id");

    // Retry once after 1 second if the batch failed
    if (result.error) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      result = await supabase
        .from("clients")
        .upsert(chunk, {
          onConflict: "optavia_id",
          ignoreDuplicates: false,
        })
        .select("optavia_id");
    }

    if (result.error) {
      // Both attempts failed — log and continue with next batch
      errors += chunk.length;
      errorDetails.push({
        batch: batchIndex,
        message: result.error.message,
        code: result.error.code,
        rowRange: `rows ${i + 1}–${Math.min(i + BATCH_SIZE, records.length)}`,
      });
    } else {
      // Supabase upsert doesn't distinguish inserted vs updated in response,
      // so we count the returned rows as successful and tally the total.
      const succeeded = result.data ? result.data.length : chunk.length;
      // We can't distinguish inserts from updates without a prior existence check,
      // so we count all successes. The caller can compare with pre-import counts.
      inserted += succeeded;
    }

    completed += chunk.length;
    if (onProgress) {
      onProgress({ completed, total: records.length, errors });
    }
  }

  return { inserted, updated, errors, errorDetails };
}

// ---------------------------------------------------------------------------
// 5. linkClientsToCoaches
// ---------------------------------------------------------------------------

/**
 * Links imported clients to their coaches by matching
 * clients.original_coach_id → coaches.optavia_id.
 *
 * This works for both stubs AND real coaches. If the logged-in coach's
 * optavia_id appears as a CurrentCoachID in the CSV, upsertCoachStubs will
 * have preserved their real record (is_stub = false). This RPC joins purely
 * on optavia_id, so those clients get the real coach's Supabase UUID as their
 * coach_id — exactly what we want.
 *
 * The `coach_id IS NULL` guard in the SQL ensures we never overwrite a
 * coach_id that was set by a previous import or manual assignment.
 *
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {string} batchId – the import batch UUID to scope the update
 * @returns {Promise<number>} – number of client records linked
 */
export async function linkClientsToCoaches(supabase, batchId) {
  const { data, error } = await supabase.rpc("link_clients_to_coaches", {
    batch_id: batchId,
  });

  if (error) {
    throw new Error(`linkClientsToCoaches failed: ${error.message}`);
  }

  // The RPC should return the count of updated rows
  return typeof data === "number" ? data : 0;
}
