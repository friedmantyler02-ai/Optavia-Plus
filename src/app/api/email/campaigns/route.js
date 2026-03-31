import { NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase-server";

const supabaseAdmin = createSupabaseClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ─── GET /api/email/campaigns ────────────────────────────────────────
// List all campaigns for the logged-in coach.
// ─────────────────────────────────────────────────────────────────────

export async function GET() {
  try {
    const supabase = await createServerClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const coachId = user.id;

    const { data: campaigns, error } = await supabaseAdmin
      .from("email_campaigns")
      .select(
        "*, email_triggers(name), email_templates(subject)"
      )
      .eq("coach_id", coachId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[campaigns] List error:", error);
      return NextResponse.json(
        { error: "Failed to fetch campaigns" },
        { status: 500 }
      );
    }

    const result = (campaigns ?? []).map((c) => ({
      id: c.id,
      name: c.name,
      status: c.status,
      send_mode: c.send_mode,
      tone: c.tone,
      trigger_name: c.email_triggers?.name ?? null,
      template_subject: c.email_templates?.subject ?? null,
      total_recipients: c.total_recipients,
      sent_count: c.sent_count,
      opened_count: c.opened_count,
      excluded_count: c.excluded_count,
      created_at: c.created_at,
      approved_at: c.approved_at,
    }));

    return NextResponse.json({ campaigns: result });
  } catch (err) {
    console.error("[campaigns] GET error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// ─── POST /api/email/campaigns ───────────────────────────────────────
// Create a new campaign, resolve template, evaluate eligible recipients.
// ─────────────────────────────────────────────────────────────────────

export async function POST(request) {
  try {
    const supabase = await createServerClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const coachId = user.id;
    const body = await request.json();
    const { trigger_id, tone, name, send_mode } = body;

    if (!trigger_id || !tone) {
      return NextResponse.json(
        { error: "trigger_id and tone are required" },
        { status: 400 }
      );
    }

    if (send_mode && !["send_all", "review"].includes(send_mode)) {
      return NextResponse.json(
        { error: "send_mode must be 'send_all' or 'review'" },
        { status: 400 }
      );
    }

    // Fetch the trigger
    const { data: trigger, error: triggerErr } = await supabaseAdmin
      .from("email_triggers")
      .select("*")
      .eq("id", trigger_id)
      .single();

    if (triggerErr || !trigger) {
      return NextResponse.json(
        { error: "Trigger not found" },
        { status: 404 }
      );
    }

    // Resolve template: coach custom first, then system default
    let template = null;

    const { data: coachTemplate } = await supabaseAdmin
      .from("email_templates")
      .select("*")
      .eq("trigger_id", trigger_id)
      .eq("tone", tone)
      .eq("coach_id", coachId)
      .single();

    if (coachTemplate) {
      template = coachTemplate;
    } else {
      const { data: defaultTemplate } = await supabaseAdmin
        .from("email_templates")
        .select("*")
        .eq("trigger_id", trigger_id)
        .eq("tone", tone)
        .is("coach_id", null)
        .single();

      template = defaultTemplate;
    }

    if (!template) {
      return NextResponse.json(
        { error: "No template found for this trigger and tone" },
        { status: 404 }
      );
    }

    // Create the campaign
    const { data: campaign, error: createErr } = await supabaseAdmin
      .from("email_campaigns")
      .insert({
        coach_id: coachId,
        trigger_id,
        template_id: template.id,
        tone,
        name: name || `${trigger.name} — ${tone.replace("_", " ")}`,
        send_mode: send_mode || "review",
        status: "draft",
        total_recipients: 0,
        sent_count: 0,
        opened_count: 0,
        excluded_count: 0,
      })
      .select()
      .single();

    if (createErr) {
      console.error("[campaigns] Create error:", createErr);
      return NextResponse.json(
        { error: "Failed to create campaign" },
        { status: 500 }
      );
    }

    // Evaluate eligible recipients
    const eligible = await evaluateRecipients(coachId, trigger, campaign.id);

    if (eligible.length > 0) {
      const recipientRows = eligible.map((client) => ({
        campaign_id: campaign.id,
        client_id: client.id,
        included: true,
        status: "pending",
      }));

      const { error: insertErr } = await supabaseAdmin
        .from("email_campaign_recipients")
        .insert(recipientRows);

      if (insertErr) {
        console.error("[campaigns] Recipient insert error:", insertErr);
      }
    }

    // Update total_recipients
    const { data: updated } = await supabaseAdmin
      .from("email_campaigns")
      .update({ total_recipients: eligible.length })
      .eq("id", campaign.id)
      .select()
      .single();

    return NextResponse.json({
      campaign: updated ?? { ...campaign, total_recipients: eligible.length },
      recipient_count: eligible.length,
    });
  } catch (err) {
    console.error("[campaigns] POST error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════
// Recipient evaluation
// ═══════════════════════════════════════════════════════════════════════

async function evaluateRecipients(coachId, trigger, campaignId) {
  const now = new Date();

  switch (trigger.trigger_type) {
    case "time_since_last_order":
      return await evalTimeSinceLastOrder(coachId, trigger);
    case "order_after_lapse":
      return await evalOrderAfterLapse(coachId);
    case "order_streak":
      return await evalOrderStreak(coachId);
    default:
      console.warn(
        `[campaigns] Unknown trigger type for evaluation: ${trigger.trigger_type}`
      );
      return [];
  }
}

async function evalTimeSinceLastOrder(coachId, trigger) {
  const cutoff = new Date(
    Date.now() - trigger.default_delay_days * 24 * 60 * 60 * 1000
  ).toISOString();

  const { data: clients, error } = await supabaseAdmin
    .from("clients")
    .select("id, email, full_name, last_order_date")
    .eq("coach_id", coachId)
    .not("email", "is", null)
    .neq("email", "")
    .not("email", "ilike", "%@medifastinc.com")
    .not("last_order_date", "is", null)
    .lte("last_order_date", cutoff);

  if (error) {
    console.error("[campaigns] eval time_since_last_order error:", error);
    return [];
  }

  // Exclude clients already in an active campaign with the same trigger
  const clientIds = (clients ?? []).map((c) => c.id);
  if (clientIds.length === 0) return [];

  const { data: existing } = await supabaseAdmin
    .from("email_campaign_recipients")
    .select("client_id, email_campaigns!inner(trigger_id, status)")
    .in("client_id", clientIds)
    .in("email_campaigns.status", ["draft", "sending"])
    .eq("email_campaigns.trigger_id", trigger.id)
    .in("status", ["pending", "queued", "sent"]);

  const excludeIds = new Set((existing ?? []).map((r) => r.client_id));
  return (clients ?? []).filter((c) => !excludeIds.has(c.id));
}

async function evalOrderAfterLapse(coachId) {
  const sevenDaysAgo = new Date(
    Date.now() - 7 * 24 * 60 * 60 * 1000
  ).toISOString();

  // Clients who ordered in last 7 days but had a 60+ day gap before that
  // Approximation: recent order + account_status = 'Reverted' means lapsed
  const { data: clients, error } = await supabaseAdmin
    .from("clients")
    .select("id, email, full_name, last_order_date")
    .eq("coach_id", coachId)
    .not("email", "is", null)
    .neq("email", "")
    .not("email", "ilike", "%@medifastinc.com")
    .not("last_order_date", "is", null)
    .gte("last_order_date", sevenDaysAgo)
    .eq("account_status", "Reverted");

  if (error) {
    console.error("[campaigns] eval order_after_lapse error:", error);
    return [];
  }

  return clients ?? [];
}

async function evalOrderStreak(coachId) {
  const now = new Date();
  const thirtyDaysAgo = new Date(
    now.getTime() - 30 * 24 * 60 * 60 * 1000
  ).toISOString();
  const sixMonthsAgo = new Date(now);
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
  const sixMonthsAgoStr = sixMonthsAgo.toISOString().split("T")[0];

  // Clients active 6+ months with recent orders
  const { data: clients, error } = await supabaseAdmin
    .from("clients")
    .select("id, email, full_name, last_order_date, start_date")
    .eq("coach_id", coachId)
    .not("email", "is", null)
    .neq("email", "")
    .not("email", "ilike", "%@medifastinc.com")
    .not("last_order_date", "is", null)
    .gte("last_order_date", thirtyDaysAgo)
    .not("start_date", "is", null)
    .lte("start_date", sixMonthsAgoStr);

  if (error) {
    console.error("[campaigns] eval order_streak error:", error);
    return [];
  }

  return clients ?? [];
}
