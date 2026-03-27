import { NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase-server";

const supabaseAdmin = createSupabaseClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function authCheck() {
  const supabase = await createServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) return null;
  return user;
}

function pct(num, denom) {
  if (!denom || denom === 0) return 0;
  return Math.round((num / denom) * 1000) / 10; // one decimal
}

export async function GET(request) {
  try {
    const user = await authCheck();
    if (!user)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const coach_id = searchParams.get("coach_id");

    if (!coach_id) {
      return NextResponse.json(
        { error: "coach_id is required" },
        { status: 400 }
      );
    }

    // ── Campaigns ────────────────────────────────────────────────────────────
    const { data: campaigns, error: campErr } = await supabaseAdmin
      .from("reactivation_campaigns")
      .select(
        "id, segment, status, total_sent, total_opened, total_replied, total_bounced, total_dnc, total_queued, started_at, completed_at, warmup_day"
      )
      .eq("coach_id", coach_id)
      .order("started_at", { ascending: false });

    if (campErr) {
      return NextResponse.json({ error: campErr.message }, { status: 500 });
    }

    // ── Response type breakdown ───────────────────────────────────────────────
    const { data: responses } = await supabaseAdmin
      .from("reactivation_responses")
      .select("response_type")
      .eq("coach_id", coach_id);

    const responseCounts = {
      interested: 0,
      curious: 0,
      not_now: 0,
      not_interested: 0,
      unsubscribe: 0,
      uncategorized: 0,
    };
    for (const r of responses || []) {
      const key = r.response_type || "uncategorized";
      if (key in responseCounts) responseCounts[key]++;
      else responseCounts.uncategorized++;
    }

    // ── Reactivation: clients who ordered after being emailed ─────────────────
    // Get all sent emails with client_id and sent_at
    const { data: sentEmails } = await supabaseAdmin
      .from("reactivation_emails")
      .select("client_id, sent_at, campaign_id")
      .eq("coach_id", coach_id)
      .in("status", ["sent", "opened", "replied", "bounced"]);

    // Build earliest sent_at per client
    const earliestSentByClient = {};
    const sentByCampaignClient = {}; // campaign_id -> Set of reactivated client_ids
    for (const e of sentEmails || []) {
      if (
        !earliestSentByClient[e.client_id] ||
        new Date(e.sent_at) < new Date(earliestSentByClient[e.client_id].sent_at)
      ) {
        earliestSentByClient[e.client_id] = {
          sent_at: e.sent_at,
          campaign_id: e.campaign_id,
        };
      }
    }

    const clientIds = Object.keys(earliestSentByClient);
    let totalReactivated = 0;
    const reactivatedByCampaign = {};

    if (clientIds.length > 0) {
      const { data: clients } = await supabaseAdmin
        .from("clients")
        .select("id, last_order_date")
        .in("id", clientIds);

      for (const client of clients || []) {
        if (!client.last_order_date) continue;
        const sentInfo = earliestSentByClient[client.id];
        if (!sentInfo?.sent_at) continue;
        if (new Date(client.last_order_date) > new Date(sentInfo.sent_at)) {
          totalReactivated++;
          const cid = sentInfo.campaign_id;
          if (cid) reactivatedByCampaign[cid] = (reactivatedByCampaign[cid] || 0) + 1;
        }
      }
    }

    // ── Overall totals ────────────────────────────────────────────────────────
    const overall = (campaigns || []).reduce(
      (acc, c) => {
        acc.sent += c.total_sent || 0;
        acc.opened += c.total_opened || 0;
        acc.replied += c.total_replied || 0;
        acc.bounced += c.total_bounced || 0;
        acc.dnc += c.total_dnc || 0;
        return acc;
      },
      { sent: 0, opened: 0, replied: 0, bounced: 0, dnc: 0 }
    );

    overall.reactivated = totalReactivated;
    overall.open_rate = pct(overall.opened, overall.sent);
    overall.reply_rate = pct(overall.replied, overall.sent);
    overall.positive_reply_rate = pct(
      responseCounts.interested + responseCounts.curious,
      overall.sent
    );
    overall.bounce_rate = pct(overall.bounced, overall.sent);

    // ── Enrich campaigns with reply_rate and reactivated ─────────────────────
    const enrichedCampaigns = (campaigns || []).map((c) => ({
      ...c,
      total_reactivated: reactivatedByCampaign[c.id] || 0,
      reply_rate: pct(c.total_replied || 0, c.total_sent || 0),
    }));

    // ── Insights ─────────────────────────────────────────────────────────────
    const insights = [];

    if (overall.sent >= 20) {
      // Best performing segment
      const withReplies = enrichedCampaigns.filter((c) => (c.total_sent || 0) >= 10);
      if (withReplies.length > 0) {
        const best = withReplies.reduce((a, b) =>
          a.reply_rate >= b.reply_rate ? a : b
        );
        if (best.reply_rate > 0) {
          const segLabel =
            best.segment.charAt(0).toUpperCase() + best.segment.slice(1);
          insights.push(
            `Your best performing segment is ${segLabel} with a ${best.reply_rate}% reply rate.`
          );
        }
      }

      // Reactivated clients this month
      const thisMonth = new Date();
      thisMonth.setDate(1);
      thisMonth.setHours(0, 0, 0, 0);
      let reactivatedThisMonth = 0;
      for (const client of (clientIds.length > 0 ? [] : [])) {
        // Simplified: use total since we don't have monthly breakdown here
        reactivatedThisMonth = totalReactivated;
      }
      // Use total as approximation — we don't have monthly granularity without extra query
      if (totalReactivated > 0) {
        insights.push(
          `You've reactivated ${totalReactivated} client${totalReactivated !== 1 ? "s" : ""} — ${totalReactivated === 1 ? "that's someone" : "those are people"} who came back to Optavia.`
        );
      }

      // Bounces
      if (overall.bounced > 0) {
        insights.push(
          `${overall.bounced} email${overall.bounced !== 1 ? "s" : ""} bounced — ${overall.bounced === 1 ? "that address has" : "those addresses have"} been automatically removed.`
        );
      }

      // Low reply rate warnings
      for (const c of enrichedCampaigns) {
        if ((c.total_sent || 0) >= 20 && c.reply_rate < 2) {
          const segLabel = c.segment.charAt(0).toUpperCase() + c.segment.slice(1);
          insights.push(
            `Consider revising your ${segLabel} template — reply rate is only ${c.reply_rate}%.`
          );
        }
      }

      // High reply rate celebrations
      for (const c of enrichedCampaigns) {
        if ((c.total_sent || 0) >= 20 && c.reply_rate >= 5) {
          const segLabel = c.segment.charAt(0).toUpperCase() + c.segment.slice(1);
          insights.push(
            `Your ${segLabel} outreach is performing well at ${c.reply_rate}% reply rate — keep it up!`
          );
        }
      }

      // Low overall reply rate
      if (overall.reply_rate < 2 && enrichedCampaigns.length > 0) {
        insights.push(
          `Overall reply rate is ${overall.reply_rate}% — personal subject lines and shorter messages tend to get more responses.`
        );
      }
    }

    return NextResponse.json({
      overall,
      campaigns: enrichedCampaigns,
      responses: responseCounts,
      insights,
    });
  } catch (err) {
    console.error("analytics error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}
