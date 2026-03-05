import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getSubtreeCoachIds } from "@/lib/org-auth";
import { calculateRank, progressToNextRank } from "@/lib/rank-config";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function isCloseToNextRank(progressPercent) {
  const today = new Date();
  const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  const daysLeft = lastDay - today.getDate();
  return progressPercent >= 70 && daysLeft <= 5;
}

async function getCoachRankStats(coachId) {
  // GQV: sum of pqv from all clients
  const { data: gqvRow } = await supabaseAdmin
    .from("clients")
    .select("pqv")
    .eq("coach_id", coachId)
    .not("pqv", "is", null);

  const gqv = (gqvRow || []).reduce((sum, r) => sum + (Number(r.pqv) || 0), 0);

  // Ordering entities: clients with last_order_date in current calendar month
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const { count: orderingEntities } = await supabaseAdmin
    .from("clients")
    .select("*", { count: "exact", head: true })
    .eq("coach_id", coachId)
    .gte("last_order_date", monthStart.toISOString());

  const stats = { gqv, orderingEntities: orderingEntities || 0, qualifyingPoints: 0, fqv: 0 };
  const { current, next } = calculateRank(stats);
  const progress = progressToNextRank(stats);

  return {
    coach_id: coachId,
    gqv,
    ordering_entities: stats.orderingEntities,
    current_rank: { name: current.name, slug: current.slug, emoji: current.emoji, color: current.color },
    next_rank: next ? { name: next.name, slug: next.slug, emoji: next.emoji, color: next.color, minGQV: next.minGQV } : null,
    progress_percent: progress.percent,
    gqv_needed: progress.gqvNeeded,
    qp_needed: progress.qpNeeded,
    entities_needed: progress.entitiesNeeded,
    is_close: next ? isCloseToNextRank(progress.percent) : false,
  };
}

// ---------------------------------------------------------------------------
// GET /api/org/rank-stats
// ---------------------------------------------------------------------------
export async function GET(request) {
  try {
    const result = await getSubtreeCoachIds();
    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    const { coachIds, coachId } = result;

    const { searchParams } = new URL(request.url);
    const view = searchParams.get("view");
    const targetCoachId = searchParams.get("coach_id") || coachId;

    // Downline view: return stats for all direct downline coaches
    if (view === "downline") {
      const { data: downlineCoaches, error: dcErr } = await supabaseAdmin
        .from("coaches")
        .select("id, full_name")
        .eq("upline_id", coachId)
        .in("id", coachIds);

      if (dcErr) {
        return NextResponse.json({ error: "Failed to fetch downline coaches" }, { status: 500 });
      }

      const results = await Promise.all(
        (downlineCoaches || []).map(async (c) => {
          const stats = await getCoachRankStats(c.id);
          return { ...stats, full_name: c.full_name };
        })
      );

      results.sort((a, b) => b.progress_percent - a.progress_percent);
      return NextResponse.json(results);
    }

    // Single coach view
    if (!coachIds.includes(targetCoachId)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const stats = await getCoachRankStats(targetCoachId);
    return NextResponse.json(stats);
  } catch (err) {
    console.error("[rank-stats] Error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
