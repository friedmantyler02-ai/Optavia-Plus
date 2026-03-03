import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase-server";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function GET(request) {
  try {
    // Verify the requesting user is authenticated
    const supabase = await createServerClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
    const limit = Math.min(
      100,
      Math.max(1, parseInt(searchParams.get("limit") ?? "20", 10))
    );
    const search = (searchParams.get("search") ?? "").trim();
    const offset = (page - 1) * limit;

    // Fetch all stub coaches (optionally filtered by name)
    let coachQuery = supabaseAdmin
      .from("coaches")
      .select("id, full_name, optavia_id", { count: "exact" })
      .eq("is_stub", true)
      .order("full_name", { ascending: true });

    if (search) {
      coachQuery = coachQuery.ilike("full_name", `%${search}%`);
    }

    const { data: allCoaches, count: totalCount, error: coachError } =
      await coachQuery;

    if (coachError) {
      console.error("Coach query error:", coachError);
      return NextResponse.json(
        { error: "Failed to fetch coaches" },
        { status: 500 }
      );
    }

    if (!allCoaches || allCoaches.length === 0) {
      return NextResponse.json({
        coaches: [],
        total_count: 0,
        page,
        limit,
      });
    }

    // Get all client stats grouped by coach_id in one query
    const coachIds = allCoaches.map((c) => c.id);
    const { data: clientRows } = await supabaseAdmin
      .from("clients")
      .select("coach_id, account_status, last_order_date")
      .not("import_batch_id", "is", null)
      .in("coach_id", coachIds);

    // Aggregate client stats per coach
    const statsMap = {};
    if (clientRows) {
      for (const row of clientRows) {
        if (!statsMap[row.coach_id]) {
          statsMap[row.coach_id] = {
            client_count: 0,
            active_count: 0,
            reverted_count: 0,
            last_order_max: null,
          };
        }
        const s = statsMap[row.coach_id];
        s.client_count++;
        if (row.account_status === "Active") s.active_count++;
        if (row.account_status === "Reverted") s.reverted_count++;
        if (
          row.last_order_date &&
          (!s.last_order_max || row.last_order_date > s.last_order_max)
        ) {
          s.last_order_max = row.last_order_date;
        }
      }
    }

    // Merge coach info with stats, sort by client_count desc, then paginate
    const merged = allCoaches
      .map((c) => ({
        id: c.id,
        full_name: c.full_name,
        optavia_id: c.optavia_id,
        client_count: statsMap[c.id]?.client_count ?? 0,
        active_count: statsMap[c.id]?.active_count ?? 0,
        reverted_count: statsMap[c.id]?.reverted_count ?? 0,
        last_order_max: statsMap[c.id]?.last_order_max ?? null,
      }))
      .sort((a, b) => b.client_count - a.client_count);

    const paginated = merged.slice(offset, offset + limit);

    return NextResponse.json({
      coaches: paginated,
      total_count: totalCount ?? allCoaches.length,
      page,
      limit,
    });
  } catch (err) {
    console.error("Org coaches error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
