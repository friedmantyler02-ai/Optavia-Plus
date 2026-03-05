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

    const { rows, filename } = await request.json();

    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json(
        { error: "rows must be a non-empty array" },
        { status: 400 }
      );
    }

    // --- Create import_batches record ---
    const { data: batchData, error: batchError } = await supabaseAdmin
      .from("import_batches")
      .insert({
        filename: filename || "import.csv",
        total_records: rows.length,
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

    const batchId = batchData.id;

    // --- Step 1: Extract and upsert coaches ---
    const coaches = extractUniqueCoaches(rows);
    const coachResult = await upsertCoachStubs(supabaseAdmin, coaches);

    // --- Step 2: Build and upsert client records ---
    const clientRecords = rows
      .map((row) => buildClientRecord(row, batchId))
      .filter((r) => r !== null);

    const clientResult = await batchUpsertClients(
      supabaseAdmin,
      clientRecords,
      null // no progress callback for non-streaming response
    );

    // --- Step 3: Link clients to coaches ---
    const linked = await linkClientsToCoaches(supabaseAdmin, batchId);

    // --- Update import_batches with final stats ---
    const orphanedCount = clientRecords.length - linked;
    await supabaseAdmin
      .from("import_batches")
      .update({
        new_records: clientResult.inserted,
        duplicates_skipped: clientResult.updated,
        orphaned_count: orphanedCount > 0 ? orphanedCount : 0,
      })
      .eq("id", batchId);

    return NextResponse.json({
      batchId,
      totalRecords: clientRecords.length,
      coachesCreated: coachResult.created,
      coachesExisting: coachResult.existing,
      clientsProcessed: clientResult.inserted + clientResult.updated,
      clientErrors: clientResult.errors,
      recordsLinked: linked,
      errorDetails: clientResult.errorDetails,
    });
  } catch (err) {
    console.error("Org import error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
