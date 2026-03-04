import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getSubtreeCoachIds } from "@/lib/org-auth";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ---------------------------------------------------------------------------
// GET /api/org/escalations
// ---------------------------------------------------------------------------
export async function GET(request) {
  try {
    const result = await getSubtreeCoachIds();
    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    const { coachIds } = result;

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") || "open";
    const page = Math.max(1, parseInt(searchParams.get("page")) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit")) || 25));
    const coachId = searchParams.get("coach_id");

    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let query = supabaseAdmin
      .from("escalations")
      .select(
        `id, client_id, from_coach_id, to_coach_id, reason, status, created_at, resolved_at,
         clients(full_name, email, last_order_date, last_contact_date),
         from_coach:coaches!escalations_from_coach_id_fkey(full_name),
         to_coach:coaches!escalations_to_coach_id_fkey(full_name)`,
        { count: "exact" }
      )
      .eq("status", status)
      .in("from_coach_id", coachIds)
      .order("created_at", { ascending: false })
      .range(from, to);

    if (coachId) {
      query = query.eq("from_coach_id", coachId);
    }

    const { data, count, error } = await query;

    if (error) {
      console.error("[org/escalations] GET error:", error);
      return NextResponse.json({ error: "Failed to fetch escalations" }, { status: 500 });
    }

    const escalations = (data || []).map((row) => ({
      ...row,
      from_coach_name: row.from_coach?.full_name || null,
      to_coach_name: row.to_coach?.full_name || null,
      from_coach: undefined,
      to_coach: undefined,
    }));

    return NextResponse.json({ escalations, total: count || 0, page, limit });
  } catch (err) {
    console.error("[org/escalations] Unexpected GET error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// POST /api/org/escalations  — mark as handled
// ---------------------------------------------------------------------------
export async function POST(request) {
  try {
    const authResult = await getSubtreeCoachIds();
    if (authResult.error) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status });
    }
    const { coachIds } = authResult;

    const { id } = await request.json();

    if (!id) {
      return NextResponse.json({ error: "Missing escalation id" }, { status: 400 });
    }

    // Verify the escalation belongs to this coach's subtree
    const { data: escalation, error: fetchError } = await supabaseAdmin
      .from("escalations")
      .select("id, from_coach_id")
      .eq("id", id)
      .single();

    if (fetchError || !escalation) {
      return NextResponse.json({ error: "Escalation not found" }, { status: 404 });
    }

    if (!coachIds.includes(escalation.from_coach_id)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { data, error } = await supabaseAdmin
      .from("escalations")
      .update({ status: "handled", resolved_at: new Date().toISOString() })
      .eq("id", id)
      .select()
      .single();

    if (error) {
      console.error("[org/escalations] POST error:", error);
      return NextResponse.json({ error: "Failed to update escalation" }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (err) {
    console.error("[org/escalations] Unexpected POST error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
