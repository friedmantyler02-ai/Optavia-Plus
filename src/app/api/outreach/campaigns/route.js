import { NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase-server";
import { getSubtreeCoachIds } from "@/lib/org-auth";

const supabaseAdmin = createSupabaseClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function getSegmentBucket(last_order_date) {
  if (!last_order_date) return "dormant";
  const daysSince = Math.floor((Date.now() - new Date(last_order_date)) / 86400000);
  if (daysSince <= 60) return "active";
  if (daysSince <= 180) return "warm";
  if (daysSince <= 365) return "moderate";
  if (daysSince <= 730) return "cold";
  return "dormant";
}

async function authCheck() {
  const supabase = await createServerClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;
  return user;
}

// GET: fetch campaigns for a coach, optionally filtered by status
export async function GET(request) {
  try {
    const user = await authCheck();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const coach_id = searchParams.get("coach_id");
    const status = searchParams.get("status");

    if (!coach_id) {
      return NextResponse.json({ error: "coach_id is required" }, { status: 400 });
    }

    let query = supabaseAdmin
      .from("reactivation_campaigns")
      .select("*")
      .eq("coach_id", coach_id)
      .order("created_at", { ascending: false });

    if (status) {
      query = query.eq("status", status);
    }

    const { data: campaigns, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ campaigns: campaigns || [] });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}

// POST: create and launch a campaign
export async function POST(request) {
  try {
    const user = await authCheck();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { coach_id, segment, template_subject, template_body } = await request.json();

    if (!coach_id || !segment) {
      return NextResponse.json({ error: "coach_id and segment are required" }, { status: 400 });
    }

    // Check no active campaign already exists for this coach + segment
    const { data: existing } = await supabaseAdmin
      .from("reactivation_campaigns")
      .select("id")
      .eq("coach_id", coach_id)
      .eq("segment", segment)
      .eq("status", "active")
      .maybeSingle();

    if (existing) {
      return NextResponse.json(
        { error: "An active campaign already exists for this segment" },
        { status: 409 }
      );
    }

    // Create the campaign record
    const { data: campaign, error: campaignError } = await supabaseAdmin
      .from("reactivation_campaigns")
      .insert({
        coach_id,
        segment,
        template_subject: template_subject || null,
        template_body: template_body || null,
        status: "active",
        started_at: new Date().toISOString(),
        total_queued: 0,
        total_sent: 0,
      })
      .select()
      .single();

    if (campaignError) {
      return NextResponse.json({ error: campaignError.message }, { status: 500 });
    }

    // Fetch all eligible clients across the coach's subtree
    const subtreeResult = await getSubtreeCoachIds();
    const coachIds = subtreeResult.coachIds || [coach_id];

    const { data: allClients } = await supabaseAdmin
      .from("clients")
      .select("id, email, last_order_date")
      .in("coach_id", coachIds);

    // Fetch client_ids already in any active campaign for this coach's org
    const { data: activeCampaigns } = await supabaseAdmin
      .from("reactivation_campaigns")
      .select("id")
      .in("coach_id", coachIds)
      .eq("status", "active")
      .neq("id", campaign.id);

    let excludedClientIds = new Set();
    if (activeCampaigns?.length > 0) {
      const campaignIds = activeCampaigns.map((c) => c.id);
      const { data: existingEmails } = await supabaseAdmin
        .from("reactivation_emails")
        .select("client_id")
        .in("campaign_id", campaignIds);
      for (const e of existingEmails || []) excludedClientIds.add(e.client_id);
    }

    // Filter to eligible clients in this segment
    const eligibleClients = (allClients || []).filter((c) => {
      if (!c.email || c.email.toLowerCase().includes("@medifastinc.com")) return false;
      if (excludedClientIds.has(c.id)) return false;
      return getSegmentBucket(c.last_order_date) === segment;
    });

    // Bulk insert reactivation_emails
    if (eligibleClients.length > 0) {
      const emailRows = eligibleClients.map((c) => ({
        campaign_id: campaign.id,
        client_id: c.id,
        coach_id,
        status: "queued",
      }));

      const { error: insertError } = await supabaseAdmin
        .from("reactivation_emails")
        .insert(emailRows);

      if (insertError) {
        // Roll back campaign if email insert fails
        await supabaseAdmin
          .from("reactivation_campaigns")
          .delete()
          .eq("id", campaign.id);
        return NextResponse.json({ error: insertError.message }, { status: 500 });
      }
    }

    // Update total_queued count
    const { data: updatedCampaign, error: updateError } = await supabaseAdmin
      .from("reactivation_campaigns")
      .update({ total_queued: eligibleClients.length })
      .eq("id", campaign.id)
      .select()
      .single();

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ campaign: updatedCampaign });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}
