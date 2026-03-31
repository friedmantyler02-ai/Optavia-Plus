import { NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase-server";

const supabaseAdmin = createSupabaseClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ─── GET /api/email/campaigns/preview ───────────────────────────────
// Returns eligible clients for a segment WITHOUT creating a campaign.
// Query params: segment (warm|moderate|cold|dormant)
// ─────────────────────────────────────────────────────────────────────

const SEGMENT_DELAY_DAYS = {
  warm: 60,
  moderate: 180,
  cold: 365,
  dormant: 730,
};

const SEGMENT_MAX_DAYS = {
  warm: 180,
  moderate: 365,
  cold: 730,
  dormant: Infinity,
};

export async function GET(request) {
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
    const { searchParams } = new URL(request.url);
    const segment = searchParams.get("segment");

    if (!segment || !SEGMENT_DELAY_DAYS[segment]) {
      return NextResponse.json(
        { error: "segment query param required (warm|moderate|cold|dormant)" },
        { status: 400 }
      );
    }

    // Find the matching trigger
    const { data: triggers } = await supabaseAdmin
      .from("email_triggers")
      .select("id, name, slug, trigger_type, description, default_delay_days")
      .eq("trigger_type", "time_since_last_order")
      .limit(1);

    const trigger = triggers?.[0] || null;
    console.log("[campaigns/preview] Found trigger:", trigger ? { id: trigger.id, slug: trigger.slug, name: trigger.name } : null);
    if (!trigger) {
      return NextResponse.json(
        { error: "No matching trigger found" },
        { status: 404 }
      );
    }

    // Evaluate eligible clients using the same logic as campaign creation
    const minDays = SEGMENT_DELAY_DAYS[segment];
    const maxDays = SEGMENT_MAX_DAYS[segment];
    const cutoffMin = new Date(
      Date.now() - minDays * 24 * 60 * 60 * 1000
    ).toISOString();

    let query = supabaseAdmin
      .from("clients")
      .select("id, full_name, email, last_order_date")
      .eq("coach_id", coachId)
      .not("email", "is", null)
      .neq("email", "")
      .not("email", "ilike", "%@medifastinc.com")
      .neq("do_not_contact", true)
      .not("last_order_date", "is", null)
      .lte("last_order_date", cutoffMin);

    if (maxDays !== Infinity) {
      const cutoffMax = new Date(
        Date.now() - maxDays * 24 * 60 * 60 * 1000
      ).toISOString();
      query = query.gte("last_order_date", cutoffMax);
    }

    const { data: clients, error } = await query.order("last_order_date", { ascending: false });

    if (error) {
      console.error("[campaigns/preview] Query error:", error);
      return NextResponse.json(
        { error: "Failed to fetch eligible clients" },
        { status: 500 }
      );
    }

    // Exclude clients already in an active campaign with the same trigger
    const clientIds = (clients ?? []).map((c) => c.id);
    let filteredClients = clients ?? [];

    if (clientIds.length > 0 && trigger) {
      const { data: existing } = await supabaseAdmin
        .from("email_campaign_recipients")
        .select("client_id, email_campaigns!inner(trigger_id, status)")
        .in("client_id", clientIds)
        .in("email_campaigns.status", ["sending"])
        .eq("email_campaigns.trigger_id", trigger.id)
        .in("status", ["pending", "queued", "sent"]);

      const excludeIds = new Set((existing ?? []).map((r) => r.client_id));
      filteredClients = filteredClients.filter((c) => !excludeIds.has(c.id));
    }

    return NextResponse.json({
      trigger: {
        id: trigger.id,
        name: trigger.name,
        slug: trigger.slug,
        trigger_type: trigger.trigger_type,
        default_delay_days: trigger.default_delay_days,
      },
      clients: filteredClients.map((c) => ({
        id: c.id,
        full_name: c.full_name,
        email: c.email,
        last_order_date: c.last_order_date,
      })),
    });
  } catch (err) {
    console.error("[campaigns/preview] GET error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
