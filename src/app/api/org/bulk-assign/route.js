import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase-server";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const BATCH_SIZE = 100;

export async function POST(request) {
  try {
    const supabase = await createServerClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { client_ids: rawClientIds, sequence_id } = body;

    if (!Array.isArray(rawClientIds) || rawClientIds.length === 0) {
      return NextResponse.json(
        { error: "client_ids must be a non-empty array" },
        { status: 400 }
      );
    }

    if (!sequence_id || typeof sequence_id !== "string") {
      return NextResponse.json(
        { error: "sequence_id is required" },
        { status: 400 }
      );
    }

    // Deduplicate client IDs
    const client_ids = [...new Set(rawClientIds)];

    // Validate that the sequence exists
    const { data: sequence, error: seqError } = await supabaseAdmin
      .from("touchpoint_sequences")
      .select("id")
      .eq("id", sequence_id)
      .single();

    if (seqError || !sequence) {
      return NextResponse.json(
        { error: "Sequence not found" },
        { status: 404 }
      );
    }

    // Fetch all targeted clients with their coach_id
    const { data: clients, error: clientError } = await supabaseAdmin
      .from("clients")
      .select("id, coach_id")
      .in("id", client_ids);

    if (clientError) {
      console.error("Client fetch error:", clientError);
      return NextResponse.json(
        { error: "Failed to fetch clients" },
        { status: 500 }
      );
    }

    const foundClientIds = new Set(clients?.map((c) => c.id) ?? []);

    // Fetch existing active touchpoints for this sequence to avoid duplicates
    const { data: existingTouchpoints, error: existingError } =
      await supabaseAdmin
        .from("client_touchpoints")
        .select("client_id")
        .eq("sequence_id", sequence_id)
        .eq("status", "active")
        .in("client_id", client_ids);

    if (existingError) {
      console.error("Existing touchpoints fetch error:", existingError);
      return NextResponse.json(
        { error: "Failed to check existing touchpoints" },
        { status: 500 }
      );
    }

    const alreadyAssigned = new Set(
      existingTouchpoints?.map((t) => t.client_id) ?? []
    );

    // Build records to insert
    const toInsert = [];
    const errors = [];
    let skipped = 0;

    for (const clientId of client_ids) {
      if (!foundClientIds.has(clientId)) {
        errors.push(`Client ${clientId} not found`);
        continue;
      }
      if (alreadyAssigned.has(clientId)) {
        skipped++;
        continue;
      }
      const client = clients.find((c) => c.id === clientId);
      toInsert.push({
        client_id: clientId,
        coach_id: client.coach_id,
        sequence_id,
        started_at: new Date().toISOString(),
        status: "active",
      });
    }

    // Insert in batches
    let assigned = 0;
    for (let i = 0; i < toInsert.length; i += BATCH_SIZE) {
      const batch = toInsert.slice(i, i + BATCH_SIZE);
      const { data: inserted, error: insertError } = await supabaseAdmin
        .from("client_touchpoints")
        .insert(batch)
        .select("id");

      if (insertError) {
        console.error(`Batch insert error (offset ${i}):`, insertError);
        errors.push(
          `Failed to assign batch starting at index ${i}: ${insertError.message}`
        );
      } else {
        assigned += inserted.length;
      }
    }

    return NextResponse.json({ success: true, assigned, skipped, errors });
  } catch (err) {
    console.error("Bulk assign error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
