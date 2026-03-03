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
      Math.max(1, parseInt(searchParams.get("limit") ?? "25", 10))
    );
    const search = (searchParams.get("search") ?? "").trim();
    const tier = (searchParams.get("tier") ?? "all").trim().toLowerCase();
    const coachId = (searchParams.get("coach_id") ?? "").trim();
    const offset = (page - 1) * limit;

    // Date boundaries
    const now = new Date();
    const threeMonthsAgo = new Date(now);
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
    const sixMonthsAgo = new Date(now);
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    const twelveMonthsAgo = new Date(now);
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);

    const fmt = (d) => d.toISOString().split("T")[0];

    // ── Helper: apply shared filters (search, coachId) ─────────────
    function applyShared(query) {
      let q = query
        .not("import_batch_id", "is", null)
        .is("last_contact_date", null);
      if (search) q = q.ilike("full_name", `%${search}%`);
      if (coachId) q = q.eq("coach_id", coachId);
      return q;
    }

    // ── Helper: apply tier date filter ─────────────────────────────
    function applyTierFilter(query, tierName) {
      switch (tierName) {
        case "critical":
          return query.or(
            `last_order_date.is.null,last_order_date.lt.${fmt(twelveMonthsAgo)}`
          );
        case "warning":
          return query
            .gte("last_order_date", fmt(twelveMonthsAgo))
            .lt("last_order_date", fmt(sixMonthsAgo));
        case "watch":
          return query
            .gte("last_order_date", fmt(sixMonthsAgo))
            .lt("last_order_date", fmt(threeMonthsAgo));
        default:
          // "all" — any neglected client (order > 3 months ago or null)
          return query.or(
            `last_order_date.is.null,last_order_date.lt.${fmt(threeMonthsAgo)}`
          );
      }
    }

    // ── Fetch coaches for name lookup ──────────────────────────────
    const { data: allCoaches } = await supabaseAdmin
      .from("coaches")
      .select("id, full_name");

    const coachMap = {};
    if (allCoaches) {
      for (const c of allCoaches) coachMap[c.id] = c.full_name;
    }

    // ── Main data query (paginated) ────────────────────────────────
    let mainQuery = supabaseAdmin
      .from("clients")
      .select(
        "id, full_name, email, phone, account_status, last_order_date, last_contact_date, pqv, is_premier_member, level, coach_id",
        { count: "exact" }
      );
    mainQuery = applyShared(mainQuery);
    mainQuery = applyTierFilter(mainQuery, tier);
    mainQuery = mainQuery
      .order("last_order_date", { ascending: true, nullsFirst: true })
      .range(offset, offset + limit - 1);

    // ── Tier count queries (ignore current tier filter) ────────────
    const criticalQuery = applyTierFilter(
      applyShared(
        supabaseAdmin
          .from("clients")
          .select("*", { count: "exact", head: true })
      ),
      "critical"
    );
    const warningQuery = applyTierFilter(
      applyShared(
        supabaseAdmin
          .from("clients")
          .select("*", { count: "exact", head: true })
      ),
      "warning"
    );
    const watchQuery = applyTierFilter(
      applyShared(
        supabaseAdmin
          .from("clients")
          .select("*", { count: "exact", head: true })
      ),
      "watch"
    );

    // Execute all in parallel
    const [mainResult, criticalResult, warningResult, watchResult] =
      await Promise.all([mainQuery, criticalQuery, warningQuery, watchQuery]);

    if (mainResult.error) {
      console.error("Neglected main query error:", mainResult.error);
      return NextResponse.json(
        { error: "Failed to fetch neglected clients" },
        { status: 500 }
      );
    }

    // ── Classify each client and attach coach name ─────────────────
    const clients = (mainResult.data ?? []).map((c) => {
      let neglect_tier = "critical";
      if (c.last_order_date) {
        const d = new Date(c.last_order_date);
        if (d >= sixMonthsAgo) {
          neglect_tier = "watch";
        } else if (d >= twelveMonthsAgo) {
          neglect_tier = "warning";
        }
      }
      return {
        ...c,
        neglect_tier,
        coach_name: coachMap[c.coach_id] ?? "Unknown",
      };
    });

    return NextResponse.json({
      clients,
      total_count: mainResult.count ?? 0,
      tier_counts: {
        critical: criticalResult.count ?? 0,
        warning: warningResult.count ?? 0,
        watch: watchResult.count ?? 0,
      },
    });
  } catch (err) {
    console.error("Neglected clients error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
