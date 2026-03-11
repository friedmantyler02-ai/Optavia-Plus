import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";

function daysBetween(dateStr) {
  if (!dateStr) return null;
  const now = new Date();
  const d = new Date(dateStr);
  return Math.floor((now - d) / 86400000);
}

function formatDate(dateStr) {
  if (!dateStr) return null;
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const coachId = user.id;
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    const sevenDaysAgo = new Date(now - 7 * 86400000).toISOString();
    const thirtyDaysAgo = new Date(now - 30 * 86400000).toISOString();
    const sixtyDaysAgo = new Date(now - 60 * 86400000).toISOString();
    const ninetyDaysAgo = new Date(now - 90 * 86400000).toISOString();

    // Run all queries in parallel
    const [
      followUpLeadsRes,
      followUpClientsRes,
      readyForHARes,
      potentialClientsRes,
      needSupportAtRiskRes,
      needSupportAlertsRes,
      reactivateRes,
    ] = await Promise.all([
      // 1a. Follow-up leads: next_followup_date <= today
      supabase
        .from("leads")
        .select("id, full_name, next_followup_date, last_contact_date, stage", { count: "exact" })
        .eq("coach_id", coachId)
        .lte("next_followup_date", todayStr)
        .not("stage", "in", "(client,potential_coach)")
        .order("next_followup_date", { ascending: true })
        .limit(10),

      // 1b. Follow-up clients: wants_weekly_checkin AND overdue
      // Only include clients with at least one logged interaction (last_checkin_date not null)
      // to avoid flooding newly-imported clients with no app history
      supabase
        .from("clients")
        .select("id, full_name, last_checkin_date, last_order_date", { count: "exact" })
        .eq("coach_id", coachId)
        .eq("wants_weekly_checkin", true)
        .gt("last_order_date", sixtyDaysAgo)
        .not("last_checkin_date", "is", null)
        .lt("last_checkin_date", sevenDaysAgo)
        .order("last_checkin_date", { ascending: true })
        .limit(10),

      // 2. Ready for HA: conversation stage, no ha_date
      supabase
        .from("leads")
        .select("id, full_name, last_contact_date, created_at, stage", { count: "exact" })
        .eq("coach_id", coachId)
        .eq("stage", "conversation")
        .is("ha_date", null)
        .order("last_contact_date", { ascending: false, nullsFirst: false })
        .limit(10),

      // 3. Potential clients: ha_completed, not converted
      supabase
        .from("leads")
        .select("id, full_name, ha_outcome, ha_date, updated_at, converted_client_id", { count: "exact" })
        .eq("coach_id", coachId)
        .eq("stage", "ha_completed")
        .is("converted_client_id", null)
        .order("updated_at", { ascending: false })
        .limit(10),

      // 4a. Need support: at-risk window (30-90 days since order)
      // Only include clients with at least one logged interaction
      supabase
        .from("clients")
        .select("id, full_name, last_order_date, last_checkin_date, last_contact_date, status", { count: "exact" })
        .eq("coach_id", coachId)
        .lt("last_order_date", thirtyDaysAgo)
        .gt("last_order_date", ninetyDaysAgo)
        .or("last_checkin_date.not.is.null,last_contact_date.not.is.null")
        .order("last_order_date", { ascending: true })
        .limit(10),

      // 4b. Need support: has order alerts
      // Only include clients with at least one logged interaction
      supabase
        .from("clients")
        .select("id, full_name, last_order_date, last_checkin_date, last_contact_date, order_alerts", { count: "exact" })
        .eq("coach_id", coachId)
        .gt("last_order_date", sixtyDaysAgo)
        .not("order_alerts", "is", null)
        .or("last_checkin_date.not.is.null,last_contact_date.not.is.null")
        .limit(10),

      // 5. Reactivate: >90 days since last order
      // Only include clients with at least one logged interaction
      supabase
        .from("clients")
        .select("id, full_name, last_order_date, last_checkin_date, last_contact_date", { count: "exact" })
        .eq("coach_id", coachId)
        .not("last_order_date", "is", null)
        .lt("last_order_date", ninetyDaysAgo)
        .or("last_checkin_date.not.is.null,last_contact_date.not.is.null")
        .order("last_order_date", { ascending: false })
        .limit(10),
    ]);

    // --- Process followUps ---
    const followUpLeads = (followUpLeadsRes.data || []).map((l) => {
      const days = daysBetween(l.next_followup_date);
      return {
        type: "lead",
        id: l.id,
        full_name: l.full_name,
        context: days > 0 ? `Follow-up overdue by ${days} day${days !== 1 ? "s" : ""}` : "Follow-up due today",
      };
    });

    const followUpClients = (followUpClientsRes.data || []).map((c) => {
      const days = daysBetween(c.last_checkin_date);
      return {
        type: "client",
        id: c.id,
        full_name: c.full_name,
        context: `No check-in in ${days} day${days !== 1 ? "s" : ""}`,
      };
    });

    const followUpItems = [...followUpLeads, ...followUpClients]
      .slice(0, 10);
    const followUpTotal = (followUpLeadsRes.count || 0) + (followUpClientsRes.count || 0);

    // --- Process readyForHA ---
    const readyForHAItems = (readyForHARes.data || []).map((l) => {
      const days = daysBetween(l.last_contact_date);
      const context = days !== null
        ? `Last contact: ${days} day${days !== 1 ? "s" : ""} ago`
        : `In conversation since ${formatDate(l.created_at)}`;
      return { id: l.id, full_name: l.full_name, context };
    });

    // --- Process potentialClients ---
    const HA_OUTCOME_LABELS = {
      client: "Client",
      thinking: "thinking about it",
      not_now: "not now",
      no_show: "no show",
    };

    const potentialClientItems = (potentialClientsRes.data || []).map((l) => {
      let context = "HA completed";
      if (l.ha_outcome) {
        context += ` \u2014 ${HA_OUTCOME_LABELS[l.ha_outcome] || l.ha_outcome}`;
      } else if (l.ha_date) {
        context += ` ${formatDate(l.ha_date)}`;
      }
      return { id: l.id, full_name: l.full_name, context };
    });

    // --- Process needSupport ---
    const atRiskItems = (needSupportAtRiskRes.data || []).map((c) => {
      const days = daysBetween(c.last_order_date);
      return {
        id: c.id,
        full_name: c.full_name,
        context: `Last order ${days} day${days !== 1 ? "s" : ""} ago`,
      };
    });

    const alertItems = (needSupportAlertsRes.data || [])
      .filter((c) => {
        if (!c.order_alerts) return false;
        const alerts = Array.isArray(c.order_alerts) ? c.order_alerts : [];
        return alerts.length > 0;
      })
      .map((c) => {
        const alerts = Array.isArray(c.order_alerts) ? c.order_alerts : [];
        const firstAlert = alerts[0];
        const alertText = firstAlert?.type || firstAlert?.details || "Order alert";
        return {
          id: c.id,
          full_name: c.full_name,
          context: `\u26A0\uFE0F ${alertText}`,
        };
      });

    // Merge and deduplicate needSupport
    const needSupportSeen = new Set();
    const needSupportItems = [];
    for (const item of [...atRiskItems, ...alertItems]) {
      if (!needSupportSeen.has(item.id)) {
        needSupportSeen.add(item.id);
        needSupportItems.push(item);
      }
    }
    const needSupportTotal = (needSupportAtRiskRes.count || 0) + (needSupportAlertsRes.count || 0);

    // --- Process reactivate ---
    const reactivateItems = (reactivateRes.data || []).map((c) => {
      const days = daysBetween(c.last_order_date);
      const months = Math.floor(days / 30);
      const context = months >= 2
        ? `Last order ${months} months ago`
        : `Last order ${formatDate(c.last_order_date)}`;
      return { id: c.id, full_name: c.full_name, context };
    });

    return NextResponse.json({
      followUps: { items: followUpItems, total: followUpTotal },
      readyForHA: { items: readyForHAItems, total: readyForHARes.count || 0 },
      potentialClients: { items: potentialClientItems, total: potentialClientsRes.count || 0 },
      needSupport: { items: needSupportItems.slice(0, 10), total: needSupportTotal },
      reactivate: { items: reactivateItems, total: reactivateRes.count || 0 },
    });
  } catch (err) {
    console.error("Dashboard priorities error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
