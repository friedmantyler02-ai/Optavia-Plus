import { NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase-server";

const supabaseAdmin = createSupabaseClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ─── POST /api/email/campaigns/[id]/launch ───────────────────────────
// Launch a draft campaign: queue emails for all included recipients.
// ─────────────────────────────────────────────────────────────────────

export async function POST(request, { params }) {
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
    const { id } = await params;

    // Fetch campaign and verify ownership
    const { data: campaign, error: fetchErr } = await supabaseAdmin
      .from("email_campaigns")
      .select("*")
      .eq("id", id)
      .single();

    if (fetchErr || !campaign) {
      return NextResponse.json(
        { error: "Campaign not found" },
        { status: 404 }
      );
    }

    if (campaign.coach_id !== coachId) {
      return NextResponse.json(
        { error: "Campaign not found" },
        { status: 404 }
      );
    }

    if (campaign.status !== "draft") {
      return NextResponse.json(
        { error: "Only draft campaigns can be launched" },
        { status: 400 }
      );
    }

    // Set campaign to sending
    await supabaseAdmin
      .from("email_campaigns")
      .update({
        status: "sending",
        approved_at: new Date().toISOString(),
      })
      .eq("id", id);

    // Fetch all included recipients
    const { data: recipients, error: recErr } = await supabaseAdmin
      .from("email_campaign_recipients")
      .select("id, client_id")
      .eq("campaign_id", id)
      .eq("included", true);

    if (recErr) {
      console.error("[campaigns/launch] Recipients query error:", recErr);
      return NextResponse.json(
        { error: "Failed to fetch recipients" },
        { status: 500 }
      );
    }

    const includedRecipients = recipients ?? [];
    const now = new Date().toISOString();

    // Queue emails in batches
    const BATCH_SIZE = 100;
    let queuedCount = 0;

    for (let i = 0; i < includedRecipients.length; i += BATCH_SIZE) {
      const batch = includedRecipients.slice(i, i + BATCH_SIZE);

      const queueRows = batch.map((r) => ({
        client_id: r.client_id,
        coach_id: coachId,
        trigger_id: campaign.trigger_id,
        template_id: campaign.template_id,
        campaign_id: campaign.id,
        scheduled_for: now,
        status: "pending",
      }));

      const { data: inserted, error: queueErr } = await supabaseAdmin
        .from("email_queue")
        .insert(queueRows)
        .select("id");

      if (queueErr) {
        console.error(
          `[campaigns/launch] Queue insert error (batch ${Math.floor(i / BATCH_SIZE)}):`,
          queueErr
        );
        continue;
      }

      queuedCount += inserted?.length ?? 0;

      // Update recipient statuses for this batch
      const recipientIds = batch.map((r) => r.id);
      await supabaseAdmin
        .from("email_campaign_recipients")
        .update({ status: "queued" })
        .in("id", recipientIds);
    }

    // Update campaign sent_count
    const { data: updated } = await supabaseAdmin
      .from("email_campaigns")
      .update({ sent_count: queuedCount })
      .eq("id", id)
      .select()
      .single();

    return NextResponse.json({
      campaign: updated,
      queued_count: queuedCount,
    });
  } catch (err) {
    console.error("[campaigns/launch] Error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
