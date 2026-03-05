import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getSubtreeCoachIds } from "@/lib/org-auth";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function GET() {
  try {
    const result = await getSubtreeCoachIds();
    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    const { coachIds } = result;

    // Run all queries in parallel
    const [funnelRes, byTriggerRes, conversionRes, volumeRes, topCoachesRes] =
      await Promise.all([
        getFunnel(coachIds),
        getByTrigger(coachIds),
        getConversion(coachIds),
        getVolumeOverTime(coachIds),
        getTopCoaches(coachIds),
      ]);

    return NextResponse.json({
      funnel: funnelRes,
      byTrigger: byTriggerRes,
      conversion: conversionRes,
      volumeOverTime: volumeRes,
      topCoaches: topCoachesRes,
    });
  } catch (err) {
    console.error("[analytics] Error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// 1. Overall email funnel
// ---------------------------------------------------------------------------
async function getFunnel(coachIds) {
  // Queue counts
  const [sentRes, failedRes, pendingRes] = await Promise.all([
    supabaseAdmin
      .from("email_queue")
      .select("*", { count: "exact", head: true })
      .eq("status", "sent")
      .in("coach_id", coachIds),
    supabaseAdmin
      .from("email_queue")
      .select("*", { count: "exact", head: true })
      .eq("status", "failed")
      .in("coach_id", coachIds),
    supabaseAdmin
      .from("email_queue")
      .select("*", { count: "exact", head: true })
      .eq("status", "pending")
      .in("coach_id", coachIds),
  ]);

  const totalSent = sentRes.count || 0;
  const totalFailed = failedRes.count || 0;
  const totalPending = pendingRes.count || 0;

  // Log counts (delivered, opened, clicked, bounced)
  const { data: logRows } = await supabaseAdmin
    .from("email_log")
    .select("opened_at, clicked_at, bounced_at")
    .in("coach_id", coachIds);

  const logs = logRows || [];
  const delivered = logs.length;
  const opened = logs.filter((l) => l.opened_at).length;
  const clicked = logs.filter((l) => l.clicked_at).length;
  const bounced = logs.filter((l) => l.bounced_at).length;

  return {
    total_sent: totalSent,
    total_failed: totalFailed,
    total_pending: totalPending,
    delivered,
    opened,
    clicked,
    bounced,
  };
}

// ---------------------------------------------------------------------------
// 2. Performance by trigger
// ---------------------------------------------------------------------------
async function getByTrigger(coachIds) {
  const { data: triggers } = await supabaseAdmin
    .from("email_triggers")
    .select("id, name, icon, color, slug");

  if (!triggers || triggers.length === 0) return [];

  const results = [];

  for (const trigger of triggers) {
    // Sent emails for this trigger
    const { data: queueRows } = await supabaseAdmin
      .from("email_queue")
      .select("id")
      .eq("trigger_id", trigger.id)
      .eq("status", "sent")
      .in("coach_id", coachIds);

    const sent = (queueRows || []).length;
    if (sent === 0) {
      results.push({
        trigger_name: trigger.name,
        icon: trigger.icon,
        color: trigger.color,
        slug: trigger.slug,
        sent: 0,
        delivered: 0,
        opened: 0,
        clicked: 0,
        bounced: 0,
        open_rate: null,
        click_rate: null,
      });
      continue;
    }

    const queueIds = queueRows.map((q) => q.id);

    // Batch log query
    const { data: logRows } = await supabaseAdmin
      .from("email_log")
      .select("opened_at, clicked_at, bounced_at")
      .in("queue_id", queueIds);

    const logs = logRows || [];
    const delivered = logs.length;
    const opened = logs.filter((l) => l.opened_at).length;
    const clicked = logs.filter((l) => l.clicked_at).length;
    const bounced = logs.filter((l) => l.bounced_at).length;

    results.push({
      trigger_name: trigger.name,
      icon: trigger.icon,
      color: trigger.color,
      slug: trigger.slug,
      sent,
      delivered,
      opened,
      clicked,
      bounced,
      open_rate: delivered > 0 ? Math.round((opened / delivered) * 1000) / 10 : null,
      click_rate: delivered > 0 ? Math.round((clicked / delivered) * 1000) / 10 : null,
    });
  }

  results.sort((a, b) => (b.open_rate || 0) - (a.open_rate || 0));
  return results;
}

// ---------------------------------------------------------------------------
// 3. Conversion (orders within 30 days of email)
// ---------------------------------------------------------------------------
async function getConversion(coachIds) {
  const { data: triggers } = await supabaseAdmin
    .from("email_triggers")
    .select("id, name, slug");

  if (!triggers || triggers.length === 0) return [];

  const results = [];

  for (const trigger of triggers) {
    const { data: queueRows } = await supabaseAdmin
      .from("email_queue")
      .select("id, client_id, scheduled_for")
      .eq("trigger_id", trigger.id)
      .eq("status", "sent")
      .in("coach_id", coachIds)
      .not("client_id", "is", null);

    const emailsSent = (queueRows || []).length;
    if (emailsSent === 0) {
      results.push({
        trigger_name: trigger.name,
        slug: trigger.slug,
        emails_sent: 0,
        orders_within_30_days: 0,
        conversion_rate: null,
      });
      continue;
    }

    // Get clients for these emails
    const clientIds = [...new Set(queueRows.map((q) => q.client_id))];
    const { data: clients } = await supabaseAdmin
      .from("clients")
      .select("id, last_order_date")
      .in("id", clientIds);

    const clientMap = {};
    for (const c of clients || []) {
      clientMap[c.id] = c.last_order_date;
    }

    let ordersWithin30 = 0;
    for (const q of queueRows) {
      const orderDate = clientMap[q.client_id];
      if (!orderDate || !q.scheduled_for) continue;
      const sent = new Date(q.scheduled_for);
      const ordered = new Date(orderDate);
      const diffDays = (ordered - sent) / (1000 * 60 * 60 * 24);
      if (diffDays > 0 && diffDays <= 30) {
        ordersWithin30++;
      }
    }

    results.push({
      trigger_name: trigger.name,
      slug: trigger.slug,
      emails_sent: emailsSent,
      orders_within_30_days: ordersWithin30,
      conversion_rate:
        emailsSent > 0 ? Math.round((ordersWithin30 / emailsSent) * 1000) / 10 : null,
    });
  }

  results.sort((a, b) => (b.conversion_rate || 0) - (a.conversion_rate || 0));
  return results;
}

// ---------------------------------------------------------------------------
// 4. Volume over time (last 12 weeks)
// ---------------------------------------------------------------------------
async function getVolumeOverTime(coachIds) {
  const twelveWeeksAgo = new Date();
  twelveWeeksAgo.setDate(twelveWeeksAgo.getDate() - 84);

  const { data: queueRows } = await supabaseAdmin
    .from("email_queue")
    .select("id, scheduled_for")
    .eq("status", "sent")
    .in("coach_id", coachIds)
    .gte("scheduled_for", twelveWeeksAgo.toISOString())
    .order("scheduled_for", { ascending: true });

  if (!queueRows || queueRows.length === 0) return [];

  const queueIds = queueRows.map((q) => q.id);

  const { data: logRows } = await supabaseAdmin
    .from("email_log")
    .select("queue_id, opened_at")
    .in("queue_id", queueIds);

  const openedSet = new Set(
    (logRows || []).filter((l) => l.opened_at).map((l) => l.queue_id)
  );

  // Group by week
  const weeks = {};
  for (const q of queueRows) {
    const d = new Date(q.scheduled_for);
    // Get Monday of this week
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(d);
    monday.setDate(diff);
    const key = monday.toISOString().slice(0, 10);

    if (!weeks[key]) weeks[key] = { week: key, sent: 0, opened: 0 };
    weeks[key].sent++;
    if (openedSet.has(q.id)) weeks[key].opened++;
  }

  return Object.values(weeks).sort((a, b) => a.week.localeCompare(b.week));
}

// ---------------------------------------------------------------------------
// 5. Top coaches by open rate (min 5 emails)
// ---------------------------------------------------------------------------
async function getTopCoaches(coachIds) {
  const { data: coaches } = await supabaseAdmin
    .from("coaches")
    .select("id, full_name")
    .in("id", coachIds);

  if (!coaches || coaches.length === 0) return [];

  const results = [];

  for (const coach of coaches) {
    const { data: queueRows } = await supabaseAdmin
      .from("email_queue")
      .select("id")
      .eq("coach_id", coach.id)
      .eq("status", "sent");

    const sent = (queueRows || []).length;
    if (sent < 5) continue;

    const queueIds = queueRows.map((q) => q.id);
    const { data: logRows } = await supabaseAdmin
      .from("email_log")
      .select("opened_at")
      .in("queue_id", queueIds);

    const opened = (logRows || []).filter((l) => l.opened_at).length;
    const delivered = (logRows || []).length;

    results.push({
      full_name: coach.full_name,
      id: coach.id,
      sent,
      open_rate: delivered > 0 ? Math.round((opened / delivered) * 1000) / 10 : 0,
    });
  }

  results.sort((a, b) => b.open_rate - a.open_rate);
  return results.slice(0, 10);
}
