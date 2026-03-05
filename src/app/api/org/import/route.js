import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase-server";
import {
  extractUniqueCoaches,
  upsertCoachStubs,
  buildClientRecord,
  batchUpsertClients,
} from "@/lib/import-engine";

// Allow up to 60s for large chunk processing
export const maxDuration = 60;

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * Links this chunk's clients to their coaches by matching
 * clients.original_coach_id → coaches.optavia_id.
 *
 * Processes one coach at a time to keep each UPDATE small and avoid timeouts.
 * Only touches clients in this batch that haven't been linked yet (coach_id IS NULL).
 */
async function linkChunkClients(supabase, clientRecords, batchId) {
  // Collect unique original_coach_ids from this chunk
  const coachOptaviaIds = [
    ...new Set(
      clientRecords
        .map((r) => r.original_coach_id)
        .filter((id) => id != null && id !== "")
    ),
  ];

  if (coachOptaviaIds.length === 0) return 0;

  // Look up coach UUIDs in bulk
  const { data: coaches } = await supabase
    .from("coaches")
    .select("id, optavia_id")
    .in("optavia_id", coachOptaviaIds);

  if (!coaches || coaches.length === 0) return 0;

  let linked = 0;

  // For each coach, update their clients in this batch
  await Promise.all(
    coaches.map(async (coach) => {
      const { count } = await supabase
        .from("clients")
        .update({ coach_id: coach.id })
        .eq("original_coach_id", coach.optavia_id)
        .eq("import_batch_id", batchId)
        .is("coach_id", null)
        .select("id", { count: "exact", head: true });

      if (count != null) linked += count;
    })
  );

  return linked;
}

export async function POST(request) {
  try {
    // Authenticate the calling user via their session cookie
    const supabase = await createServerClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { rows, chunkIndex, totalChunks, batchId: existingBatchId, filename, totalRows } =
      await request.json();

    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json(
        { error: "rows must be a non-empty array" },
        { status: 400 }
      );
    }

    let batchId = existingBatchId;
    let coachResult = null;

    // --- First chunk: create import batch ---
    if (chunkIndex === 0) {
      const { data: batchData, error: batchError } = await supabaseAdmin
        .from("import_batches")
        .insert({
          filename: filename || "import.csv",
          total_records: totalRows || rows.length,
          coach_id: user.id,
        })
        .select("id")
        .single();

      if (batchError || !batchData) {
        return NextResponse.json(
          { error: "Could not create import batch record." },
          { status: 500 }
        );
      }

      batchId = batchData.id;
    }

    if (!batchId) {
      return NextResponse.json(
        { error: "batchId is required for non-first chunks." },
        { status: 400 }
      );
    }

    // --- Extract and upsert coaches from every chunk ---
    const coaches = extractUniqueCoaches(rows);
    if (coaches.length > 0) {
      coachResult = await upsertCoachStubs(supabaseAdmin, coaches);
    }

    // --- Build and upsert client records ---
    const clientRecords = [
      ...new Map(
        rows
          .map((row) => buildClientRecord(row, batchId))
          .filter((r) => r !== null)
          .map((r) => [r.optavia_id, r])
      ).values(),
    ];

    const clientResult = await batchUpsertClients(
      supabaseAdmin,
      clientRecords,
      null
    );

    // --- Link this chunk's clients to their coaches ---
    const linked = await linkChunkClients(supabaseAdmin, clientRecords, batchId);

    const isLastChunk = chunkIndex === totalChunks - 1;

    return NextResponse.json({
      batchId,
      chunkIndex,
      isComplete: isLastChunk,
      coachesCreated: coachResult?.created ?? 0,
      coachesExisting: coachResult?.existing ?? 0,
      clientsInserted: clientResult.inserted,
      clientsUpdated: clientResult.updated,
      clientErrors: clientResult.errors,
      errorDetails: clientResult.errorDetails,
      recordsLinked: linked,
    });
  } catch (err) {
    console.error("Org import error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
