import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { progressToNextRank } from "@/lib/rank-config";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const CLIENT_BATCH_SIZE = 1000;

// ---------------------------------------------------------------------------
// Auth helpers
// ---------------------------------------------------------------------------
function isCronAuthorized(request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return false;

  if (request.headers.get("x-cron-secret") === cronSecret) return true;

  const authHeader = request.headers.get("authorization");
  if (authHeader === `Bearer ${cronSecret}`) return true;

  return false;
}

// ---------------------------------------------------------------------------
// Trigger evaluator functions
// ---------------------------------------------------------------------------
function daysSince(dateStr) {
  if (!dateStr) return Infinity;
  const diff = Date.now() - new Date(dateStr).getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

function evaluateTimeSinceLastOrder(client, delayDays) {
  if (!client.last_order_date) return false;
  return daysSince(client.last_order_date) > delayDays;
}

function evaluateTimeSinceImport(client, delayDays) {
  if (!client.created_at) return false;
  if (client.last_contact_date) return false; // already contacted
  return daysSince(client.created_at) > delayDays;
}

function evaluateOrderAfterLapse(client, delayDays) {
  if (!client.last_order_date) return false;
  const status = (client.account_status || "").toLowerCase();
  if (status === "reverted") return false;
  // Recent order (within delay_days), but long-time client (>90 days old) implies comeback
  return (
    daysSince(client.last_order_date) <= delayDays &&
    daysSince(client.created_at) > 90
  );
}

function evaluateOrderStreak(client) {
  const status = (client.account_status || "").toLowerCase();
  if (status !== "active") return false;
  if (!client.last_order_date) return false;
  // Ordered within last 30 days AND has been around 180+ days
  return (
    daysSince(client.last_order_date) <= 30 &&
    daysSince(client.created_at) > 180
  );
}

function clientMatchesTrigger(client, trigger, delayDays) {
  switch (trigger.trigger_type) {
    case "time_since_last_order":
      return evaluateTimeSinceLastOrder(client, delayDays);
    case "time_since_import":
      return evaluateTimeSinceImport(client, delayDays);
    case "order_after_lapse":
      return evaluateOrderAfterLapse(client, delayDays);
    case "order_streak":
      return evaluateOrderStreak(client);
    default:
      return false;
  }
}

// ---------------------------------------------------------------------------
// Template lookup helper
// ---------------------------------------------------------------------------
function buildTemplateLookup(templates) {
  // systemDefaults[trigger_id] = template
  // coachOverrides[coach_id:trigger_id] = template
  const systemDefaults = {};
  const coachOverrides = {};

  for (const t of templates) {
    if (!t.coach_id) {
      systemDefaults[t.trigger_id] = t;
    } else {
      coachOverrides[`${t.coach_id}:${t.trigger_id}`] = t;
    }
  }

  return (triggerId, coachId) =>
    coachOverrides[`${coachId}:${triggerId}`] || systemDefaults[triggerId] || null;
}

// ---------------------------------------------------------------------------
// Email validation
// ---------------------------------------------------------------------------
function isValidEmail(email) {
  if (!email || !email.trim()) return false;
  if (email.toLowerCase().endsWith("@medifastinc.com")) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Core evaluation logic
// ---------------------------------------------------------------------------
async function evaluateTriggers() {
  // Step 1: Load all triggers
  const { data: triggers, error: tErr } = await supabaseAdmin
    .from("email_triggers")
    .select("*");
  if (tErr) {
    console.error("[email/evaluate] Failed to load triggers:", tErr);
    return NextResponse.json({ error: "Failed to load triggers" }, { status: 500 });
  }
  if (!triggers || triggers.length === 0) {
    console.log("[email/evaluate] No triggers found");
    return NextResponse.json({ evaluated: 0, queued: 0, skipped: {} });
  }
  console.log(`[email/evaluate] Loaded ${triggers.length} triggers`);

  // Step 2: Load all coach trigger settings → coachSettings[coach_id][trigger_id]
  const { data: settingsRows, error: sErr } = await supabaseAdmin
    .from("coach_trigger_settings")
    .select("*");
  if (sErr) {
    console.error("[email/evaluate] Failed to load coach settings:", sErr);
    return NextResponse.json({ error: "Failed to load settings" }, { status: 500 });
  }
  const coachSettings = {};
  for (const s of settingsRows || []) {
    if (!coachSettings[s.coach_id]) coachSettings[s.coach_id] = {};
    coachSettings[s.coach_id][s.trigger_id] = s;
  }

  // Step 3: Load all email templates
  const { data: templateRows, error: tmErr } = await supabaseAdmin
    .from("email_templates")
    .select("*");
  if (tmErr) {
    console.error("[email/evaluate] Failed to load templates:", tmErr);
    return NextResponse.json({ error: "Failed to load templates" }, { status: 500 });
  }
  const getTemplate = buildTemplateLookup(templateRows || []);

  // Step 4: Load dedup set (existing pending/sent queue entries from last 30 days)
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const { data: existingQueue, error: qErr } = await supabaseAdmin
    .from("email_queue")
    .select("client_id, trigger_id")
    .in("status", ["pending", "sent"])
    .gte("created_at", thirtyDaysAgo.toISOString());
  if (qErr) {
    console.error("[email/evaluate] Failed to load dedup data:", qErr);
    return NextResponse.json({ error: "Failed to load queue data" }, { status: 500 });
  }
  const dedupSet = new Set();
  for (const q of existingQueue || []) {
    dedupSet.add(`${q.client_id}:${q.trigger_id}`);
  }
  console.log(`[email/evaluate] Dedup set has ${dedupSet.size} existing entries`);

  // Step 5: Process clients in batches
  let totalEvaluated = 0;
  let totalQueued = 0;
  const skipped = { noEmail: 0, noCoach: 0, alreadyQueued: 0, triggerDisabled: 0 };
  let batchNum = 0;
  let hasMore = true;

  while (hasMore) {
    const from = batchNum * CLIENT_BATCH_SIZE;
    const to = from + CLIENT_BATCH_SIZE - 1;

    const { data: clients, error: cErr } = await supabaseAdmin
      .from("clients")
      .select("id, coach_id, full_name, email, last_order_date, last_contact_date, account_status, created_at")
      .order("id", { ascending: true })
      .range(from, to);

    if (cErr) {
      console.error(`[email/evaluate] Failed to load clients batch ${batchNum}:`, cErr);
      break;
    }

    if (!clients || clients.length === 0) {
      hasMore = false;
      break;
    }

    console.log(`[email/evaluate] Evaluating batch ${batchNum + 1}... (clients ${from}-${from + clients.length - 1})`);

    const toInsert = [];

    for (const client of clients) {
      // Skip clients with no coach
      if (!client.coach_id) {
        skipped.noCoach++;
        continue;
      }

      // Skip clients with invalid email
      if (!isValidEmail(client.email)) {
        skipped.noEmail++;
        continue;
      }

      totalEvaluated++;

      for (const trigger of triggers) {
        // Check if trigger is enabled for this coach
        const coachSetting = coachSettings[client.coach_id]?.[trigger.id];
        const isEnabled = coachSetting ? coachSetting.enabled : trigger.default_enabled;
        if (!isEnabled) {
          skipped.triggerDisabled++;
          continue;
        }

        // Dedup check
        const dedupKey = `${client.id}:${trigger.id}`;
        if (dedupSet.has(dedupKey)) {
          skipped.alreadyQueued++;
          continue;
        }

        // Get effective delay
        const delayDays = coachSetting?.delay_days ?? trigger.default_delay_days;

        // Evaluate trigger condition
        if (!clientMatchesTrigger(client, trigger, delayDays)) {
          continue;
        }

        // Find template
        const template = getTemplate(trigger.id, client.coach_id);
        if (!template) {
          continue;
        }

        // Queue it
        toInsert.push({
          coach_id: client.coach_id,
          client_id: client.id,
          trigger_id: trigger.id,
          template_id: template.id,
          status: "pending",
          scheduled_for: new Date().toISOString(),
        });

        // Add to dedup set so we don't queue the same combo again in this run
        dedupSet.add(dedupKey);
      }
    }

    // Batch insert queued emails
    if (toInsert.length > 0) {
      const { error: insertErr } = await supabaseAdmin
        .from("email_queue")
        .insert(toInsert);

      if (insertErr) {
        console.error(`[email/evaluate] Failed to insert queue batch:`, insertErr);
      } else {
        totalQueued += toInsert.length;
        console.log(`[email/evaluate] Queued ${toInsert.length} emails from batch ${batchNum + 1}`);
      }
    }

    if (clients.length < CLIENT_BATCH_SIZE) {
      hasMore = false;
    }
    batchNum++;
  }

  // -------------------------------------------------------------------
  // Rank progress nudge (coach-level, last 3 days of month only)
  // -------------------------------------------------------------------
  const today = new Date();
  const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  const isEndOfMonth = today.getDate() > lastDay - 3;

  if (isEndOfMonth) {
    const rankTrigger = (triggers || []).find((t) => t.trigger_type === "rank_progress");
    if (rankTrigger) {
      console.log("[email/evaluate] Running end-of-month rank progress evaluation");

      // Get all unique coach_ids from the system
      const { data: allCoaches } = await supabaseAdmin
        .from("coaches")
        .select("id, email")
        .not("email", "is", null);

      // Dedup: check which coaches already got a rank_progress email this month
      const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
      const { data: existingRankEmails } = await supabaseAdmin
        .from("email_queue")
        .select("coach_id")
        .eq("trigger_id", rankTrigger.id)
        .gte("created_at", monthStart.toISOString());
      const sentCoaches = new Set((existingRankEmails || []).map((e) => e.coach_id));

      const rankInserts = [];

      for (const coach of allCoaches || []) {
        if (sentCoaches.has(coach.id)) continue;

        // Check if trigger is enabled for this coach
        const coachSetting = coachSettings[coach.id]?.[rankTrigger.id];
        const isEnabled = coachSetting ? coachSetting.enabled : rankTrigger.default_enabled;
        if (!isEnabled) continue;

        // Compute rank stats
        const { data: pqvRows } = await supabaseAdmin
          .from("clients")
          .select("pqv")
          .eq("coach_id", coach.id)
          .not("pqv", "is", null);
        const gqv = (pqvRows || []).reduce((s, r) => s + (Number(r.pqv) || 0), 0);

        const { count: orderingEntities } = await supabaseAdmin
          .from("clients")
          .select("*", { count: "exact", head: true })
          .eq("coach_id", coach.id)
          .gte("last_order_date", monthStart.toISOString());

        const progress = progressToNextRank({ gqv, orderingEntities: orderingEntities || 0 });
        if (progress.percent >= 60 && progress.gqvNeeded > 0 && progress.next) {
          const template = getTemplate(rankTrigger.id, coach.id);
          if (template) {
            rankInserts.push({
              coach_id: coach.id,
              client_id: null,
              trigger_id: rankTrigger.id,
              template_id: template.id,
              status: "pending",
              scheduled_for: new Date().toISOString(),
            });
          }
        }
      }

      if (rankInserts.length > 0) {
        const { error: riErr } = await supabaseAdmin.from("email_queue").insert(rankInserts);
        if (riErr) {
          console.error("[email/evaluate] Failed to insert rank progress emails:", riErr);
        } else {
          totalQueued += rankInserts.length;
          console.log(`[email/evaluate] Queued ${rankInserts.length} rank progress nudge emails`);
        }
      }
    }
  }

  console.log(`[email/evaluate] Done. Evaluated ${totalEvaluated} clients, queued ${totalQueued} emails`);
  return NextResponse.json({
    evaluated: totalEvaluated,
    queued: totalQueued,
    skipped,
  });
}

// ---------------------------------------------------------------------------
// GET /api/email/evaluate  (Vercel Cron)
// ---------------------------------------------------------------------------
export async function GET(request) {
  try {
    if (!isCronAuthorized(request)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return await evaluateTriggers();
  } catch (err) {
    console.error("[email/evaluate] Unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// POST /api/email/evaluate  (Cron secret required — same as GET)
// ---------------------------------------------------------------------------
export async function POST(request) {
  try {
    if (!isCronAuthorized(request)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    return await evaluateTriggers();
  } catch (err) {
    console.error("[email/evaluate] Unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
