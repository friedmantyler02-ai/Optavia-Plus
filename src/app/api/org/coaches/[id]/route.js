import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getSubtreeCoachIds } from "@/lib/org-auth";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function GET(request, { params }) {
  try {
    const result = await getSubtreeCoachIds();
    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    const { coachIds } = result;

    const { id } = await params;

    // Query params for client pagination / filtering
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
    const limit = Math.min(
      100,
      Math.max(1, parseInt(searchParams.get("limit") ?? "25", 10))
    );
    const search = (searchParams.get("search") ?? "").trim();
    const status = (searchParams.get("status") ?? "all").trim();
    const offset = (page - 1) * limit;

    // ── Fetch coach record ────────────────────────────────────────────
    const { data: coach, error: coachError } = await supabaseAdmin
      .from("coaches")
      .select("id, full_name, optavia_id, email, phone, rank, is_stub")
      .eq("id", id)
      .single();

    if (coachError || !coach) {
      return NextResponse.json(
        { error: "Coach not found" },
        { status: 404 }
      );
    }

    if (!coachIds.includes(coach.id)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // ── Fetch stats in parallel ───────────────────────────────────────
    const baseFilter = (q) =>
      q.from("clients").select("*", { count: "exact", head: true }).eq("coach_id", id).not("import_batch_id", "is", null);

    const [
      totalRes,
      activeRes,
      revertedRes,
      withEmailRes,
      withPhoneRes,
      neverContactedRes,
      premierRes,
    ] = await Promise.all([
      baseFilter(supabaseAdmin),
      baseFilter(supabaseAdmin).eq("account_status", "Active"),
      baseFilter(supabaseAdmin).eq("account_status", "Reverted"),
      baseFilter(supabaseAdmin)
        .not("email", "is", null)
        .not("email", "like", "%@medifastinc.com"),
      baseFilter(supabaseAdmin)
        .not("phone", "is", null)
        .neq("phone", ""),
      baseFilter(supabaseAdmin).is("last_contact_date", null),
      baseFilter(supabaseAdmin).eq("is_premier_member", true),
    ]);

    const stats = {
      total_clients: totalRes.count ?? 0,
      active_clients: activeRes.count ?? 0,
      reverted_clients: revertedRes.count ?? 0,
      with_email: withEmailRes.count ?? 0,
      with_phone: withPhoneRes.count ?? 0,
      never_contacted: neverContactedRes.count ?? 0,
      premier_members: premierRes.count ?? 0,
    };

    // ── Fetch paginated clients ───────────────────────────────────────
    let clientQuery = supabaseAdmin
      .from("clients")
      .select(
        "id, full_name, email, phone, account_status, last_order_date, pqv, is_premier_member, level, last_contact_date",
        { count: "exact" }
      )
      .eq("coach_id", id)
      .not("import_batch_id", "is", null)
      .order("full_name", { ascending: true })
      .range(offset, offset + limit - 1);

    if (search) {
      clientQuery = clientQuery.ilike("full_name", `%${search}%`);
    }
    if (status && status !== "all") {
      clientQuery = clientQuery.eq("account_status", status);
    }

    const { data: clients, count: totalClientCount, error: clientError } =
      await clientQuery;

    if (clientError) {
      console.error("Client query error:", clientError);
      return NextResponse.json(
        { error: "Failed to fetch clients" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      coach,
      stats,
      clients: clients ?? [],
      total_client_count: totalClientCount ?? 0,
      page,
      limit,
    });
  } catch (err) {
    console.error("Org coach detail error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
