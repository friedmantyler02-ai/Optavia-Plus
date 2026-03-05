import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase-server";
import {
  extractUniqueCoaches,
  upsertCoachStubs,
  buildClientRecord,
  batchUpsertClients,
  linkClientsToCoaches,
} from "@/lib/import-engine";

// Allow up to 60s for large chunk processing
export const maxDuration = 60;

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

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

    // --- First chunk: create import batch and upsert coaches ---
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
    // New coaches can appear in any chunk, so always process them
    const coaches = extractUniqueCoaches(rows);
    if (coaches.length > 0) {
      coachResult = await upsertCoachStubs(supabaseAdmin, coaches);
    }

    // --- Build and upsert client records ---
    const clientRecords = rows
      .map((row) => buildClientRecord(row, batchId))
      .filter((r) => r !== null);

    const clientResult = await batchUpsertClients(
      supabaseAdmin,
      clientRecords,
      null
    );

    // --- Last chunk: link clients to coaches and update batch stats ---
    let linked = null;
    const isLastChunk = chunkIndex === totalChunks - 1;

    if (isLastChunk) {
      linked = await linkClientsToCoaches(supabaseAdmin, batchId);
    }

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
