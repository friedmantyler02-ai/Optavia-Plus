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

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
    const limit = Math.min(
      100,
      Math.max(1, parseInt(searchParams.get("limit") ?? "20", 10))
    );
    const search = (searchParams.get("search") ?? "").trim();
    const offset = (page - 1) * limit;

    // Fetch coaches in subtree (optionally filtered by name)
    let coachQuery = supabaseAdmin
      .from("coaches")
      .select("id, full_name, optavia_id", { count: "exact" })
      .eq("is_stub", true)
      .in("id", coachIds)
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

    // Date thresholds for relationship scoring
    const now = new Date();
    const sixMonthsAgo = new Date(now);
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    const ninetyDaysAgo = new Date(now);
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
    const sixMonthsAgoStr = sixMonthsAgo.toISOString().split("T")[0];
    const ninetyDaysAgoStr = ninetyDaysAgo.toISOString().split("T")[0];

    // Fetch client stats and email data in parallel
    const pageCoachIds = allCoaches.map((c) => c.id);
    const [{ data: clientRows }, { data: emailQueueRows }] = await Promise.all([
      supabaseAdmin
        .from("clients")
        .select("coach_id, account_status, last_order_date, last_contact_date")
        .not("import_batch_id", "is", null)
        .in("coach_id", pageCoachIds),
      supabaseAdmin
        .from("email_queue")
        .select("coach_id, email_log(opened_at, bounced_at)")
        .eq("status", "sent")
        .in("coach_id", pageCoachIds),
    ]);

    // Aggregate email stats per coach
    const emailStatsMap = {};
    if (emailQueueRows) {
      for (const row of emailQueueRows) {
        if (!emailStatsMap[row.coach_id]) {
          emailStatsMap[row.coach_id] = { sent: 0, opened: 0, bounced: 0 };
        }
        const es = emailStatsMap[row.coach_id];
        es.sent++;
        const log = row.email_log?.[0];
        if (log?.opened_at) es.opened++;
        if (log?.bounced_at) es.bounced++;
      }
    }

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
            neglected_count: 0,
            recent_order_count: 0,
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
        // Neglect: no order AND no contact in 6+ months
        const orderNeglected =
          !row.last_order_date || row.last_order_date < sixMonthsAgoStr;
        const contactNeglected =
          !row.last_contact_date || row.last_contact_date < sixMonthsAgoStr;
        if (orderNeglected && contactNeglected) s.neglected_count++;
        // Recent order activity: within 90 days
        if (row.last_order_date && row.last_order_date >= ninetyDaysAgoStr) {
          s.recent_order_count++;
        }
      }
    }

    // Relationship score (0–100)
    // Weights: open rate 25, no-bounce 15, non-neglect 30, order activity 30
    function calcRelationshipScore(cs, es) {
      const c = cs || { client_count: 0, neglected_count: 0, recent_order_count: 0 };
      const e = es || { sent: 0, opened: 0, bounced: 0 };
      const openRate = e.sent > 0 ? e.opened / e.sent : 0;
      const bounceRate = e.sent > 0 ? e.bounced / e.sent : 0;
      const neglectRatio = c.client_count > 0 ? c.neglected_count / c.client_count : 1;
      const orderActivity = c.client_count > 0 ? c.recent_order_count / c.client_count : 0;
      return Math.max(
        0,
        Math.min(
          100,
          Math.round(
            openRate * 25 +
            (1 - bounceRate) * 15 +
            (1 - neglectRatio) * 30 +
            orderActivity * 30
          )
        )
      );
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
        relationship_score: calcRelationshipScore(
          statsMap[c.id],
          emailStatsMap[c.id]
        ),
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
