import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getSubtreeCoachIds } from "@/lib/org-auth";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function GET(request) {
  try {
    const result = await getSubtreeCoachIds();
    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    const { coachIds } = result;

    if (coachIds.length === 0) {
      return NextResponse.json({
        clients: [],
        total: 0,
        page: 1,
        limit: 50,
        totalPages: 0,
      });
    }

    // Parse query parameters
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
    const limit = Math.min(
      100,
      Math.max(1, parseInt(searchParams.get("limit") ?? "50", 10))
    );
    const search = (searchParams.get("search") ?? "").trim();
    const coachIdFilter = (searchParams.get("coach_id") ?? "").trim();
    const status = (searchParams.get("status") ?? "").trim();
    const sort = searchParams.get("sort") ?? "full_name";
    const order = searchParams.get("order") ?? "asc";
    const offset = (page - 1) * limit;

    // Validate sort column against allowlist
    const allowedSorts = [
      "full_name",
      "email",
      "account_status",
      "last_order_date",
      "pqv",
      "level",
      "coach_id",
    ];
    const safeSort = allowedSorts.includes(sort) ? sort : "full_name";
    const ascending = order !== "desc";

    // If coach_id filter is specified, verify it's in the subtree
    let targetCoachIds = coachIds;
    if (coachIdFilter) {
      if (!coachIds.includes(coachIdFilter)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      targetCoachIds = [coachIdFilter];
    }

    // Build query
    let query = supabaseAdmin
      .from("clients")
      .select(
        "id, full_name, email, phone, account_status, last_order_date, coach_id, pqv, level",
        { count: "exact" }
      )
      .in("coach_id", targetCoachIds)
      .not("import_batch_id", "is", null)
      .order(safeSort, { ascending })
      .range(offset, offset + limit - 1);

    if (search) {
      query = query.or(
        `full_name.ilike.%${search}%,email.ilike.%${search}%`
      );
    }

    if (status) {
      query = query.eq("account_status", status);
    }

    const { data: clients, count: total, error: queryError } = await query;

    if (queryError) {
      console.error("Org clients query error:", queryError);
      return NextResponse.json(
        { error: "Failed to fetch clients" },
        { status: 500 }
      );
    }

    if (!clients || clients.length === 0) {
      return NextResponse.json({
        clients: [],
        total: total ?? 0,
        page,
        limit,
        totalPages: Math.ceil((total ?? 0) / limit),
      });
    }

    // Look up coach names for the coach IDs on this page
    const pageCoachIds = [...new Set(clients.map((c) => c.coach_id))];
    const { data: coaches } = await supabaseAdmin
      .from("coaches")
      .select("id, full_name")
      .in("id", pageCoachIds);

    const coachNameMap = {};
    if (coaches) {
      for (const c of coaches) {
        coachNameMap[c.id] = c.full_name;
      }
    }

    const enriched = clients.map((c) => ({
      ...c,
      coach_name: coachNameMap[c.coach_id] ?? null,
    }));

    return NextResponse.json({
      clients: enriched,
      total: total ?? 0,
      page,
      limit,
      totalPages: Math.ceil((total ?? 0) / limit),
    });
  } catch (err) {
    console.error("Org clients error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
