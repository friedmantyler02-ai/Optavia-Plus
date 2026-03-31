import { NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase-server";

const supabaseAdmin = createSupabaseClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ─── Auth helper ─────────────────────────────────────────────────────

async function getAuthenticatedCoach() {
  const supabase = await createServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) return null;
  return user.id;
}

async function getCampaignIfOwned(campaignId, coachId) {
  const { data, error } = await supabaseAdmin
    .from("email_campaigns")
    .select("*")
    .eq("id", campaignId)
    .single();

  if (error || !data) return null;
  if (data.coach_id !== coachId) return null;
  return data;
}

// ─── GET /api/email/campaigns/[id] ──────────────────────────────────
// Campaign detail with paginated recipients.
// ─────────────────────────────────────────────────────────────────────

export async function GET(request, { params }) {
  try {
    const coachId = await getAuthenticatedCoach();
    if (!coachId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const campaign = await getCampaignIfOwned(id, coachId);
    if (!campaign) {
      return NextResponse.json(
        { error: "Campaign not found" },
        { status: 404 }
      );
    }

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
    const perPage = Math.min(
      100,
      Math.max(1, parseInt(searchParams.get("per_page") ?? "50", 10))
    );
    const search = (searchParams.get("search") ?? "").trim();
    const offset = (page - 1) * perPage;

    // Fetch trigger + template info
    const [{ data: trigger }, { data: template }] = await Promise.all([
      supabaseAdmin
        .from("email_triggers")
        .select("name, slug, trigger_type")
        .eq("id", campaign.trigger_id)
        .single(),
      supabaseAdmin
        .from("email_templates")
        .select("subject, tone")
        .eq("id", campaign.template_id)
        .single(),
    ]);

    // Fetch recipients with client join
    let recipientQuery = supabaseAdmin
      .from("email_campaign_recipients")
      .select(
        "id, client_id, included, status, clients!inner(full_name, email, last_order_date)",
        { count: "exact" }
      )
      .eq("campaign_id", id)
      .order("created_at", { ascending: true });

    if (search) {
      recipientQuery = recipientQuery.ilike(
        "clients.full_name",
        `%${search}%`
      );
    }

    recipientQuery = recipientQuery.range(offset, offset + perPage - 1);

    const {
      data: recipients,
      count: totalRecipients,
      error: recError,
    } = await recipientQuery;

    if (recError) {
      console.error("[campaigns] Recipients query error:", recError);
      return NextResponse.json(
        { error: "Failed to fetch recipients" },
        { status: 500 }
      );
    }

    const recipientList = (recipients ?? []).map((r) => ({
      id: r.id,
      client_id: r.client_id,
      full_name: r.clients?.full_name ?? null,
      email: r.clients?.email ?? null,
      last_order_date: r.clients?.last_order_date ?? null,
      included: r.included,
      status: r.status,
    }));

    return NextResponse.json({
      campaign: {
        ...campaign,
        trigger_name: trigger?.name ?? null,
        trigger_slug: trigger?.slug ?? null,
        template_subject: template?.subject ?? null,
        template_tone: template?.tone ?? null,
      },
      recipients: recipientList,
      pagination: {
        page,
        per_page: perPage,
        total: totalRecipients ?? 0,
        total_pages: Math.ceil((totalRecipients ?? 0) / perPage),
      },
    });
  } catch (err) {
    console.error("[campaigns] GET detail error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// ─── PUT /api/email/campaigns/[id] ──────────────────────────────────
// Update campaign: include/exclude recipients, cancel.
// ─────────────────────────────────────────────────────────────────────

export async function PUT(request, { params }) {
  try {
    const coachId = await getAuthenticatedCoach();
    if (!coachId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const campaign = await getCampaignIfOwned(id, coachId);
    if (!campaign) {
      return NextResponse.json(
        { error: "Campaign not found" },
        { status: 404 }
      );
    }

    const body = await request.json();
    const { action, client_ids } = body;

    if (!action) {
      return NextResponse.json(
        { error: "action is required" },
        { status: 400 }
      );
    }

    switch (action) {
      case "exclude": {
        if (!client_ids || !Array.isArray(client_ids) || client_ids.length === 0) {
          return NextResponse.json(
            { error: "client_ids array is required for exclude" },
            { status: 400 }
          );
        }

        const { data: updated, error } = await supabaseAdmin
          .from("email_campaign_recipients")
          .update({ included: false })
          .eq("campaign_id", id)
          .eq("included", true)
          .in("client_id", client_ids)
          .select("id");

        if (error) {
          console.error("[campaigns] Exclude error:", error);
          return NextResponse.json({ error: "Failed to exclude" }, { status: 500 });
        }

        const excludedCount = updated?.length ?? 0;
        await supabaseAdmin
          .from("email_campaigns")
          .update({ excluded_count: campaign.excluded_count + excludedCount })
          .eq("id", id);

        return NextResponse.json({ excluded: excludedCount });
      }

      case "include": {
        if (!client_ids || !Array.isArray(client_ids) || client_ids.length === 0) {
          return NextResponse.json(
            { error: "client_ids array is required for include" },
            { status: 400 }
          );
        }

        const { data: updated, error } = await supabaseAdmin
          .from("email_campaign_recipients")
          .update({ included: true })
          .eq("campaign_id", id)
          .eq("included", false)
          .in("client_id", client_ids)
          .select("id");

        if (error) {
          console.error("[campaigns] Include error:", error);
          return NextResponse.json({ error: "Failed to include" }, { status: 500 });
        }

        const includedCount = updated?.length ?? 0;
        await supabaseAdmin
          .from("email_campaigns")
          .update({
            excluded_count: Math.max(0, campaign.excluded_count - includedCount),
          })
          .eq("id", id);

        return NextResponse.json({ included: includedCount });
      }

      case "exclude_all": {
        const { data: updated, error } = await supabaseAdmin
          .from("email_campaign_recipients")
          .update({ included: false })
          .eq("campaign_id", id)
          .eq("included", true)
          .select("id");

        if (error) {
          console.error("[campaigns] Exclude all error:", error);
          return NextResponse.json({ error: "Failed to exclude all" }, { status: 500 });
        }

        const count = updated?.length ?? 0;
        await supabaseAdmin
          .from("email_campaigns")
          .update({ excluded_count: campaign.excluded_count + count })
          .eq("id", id);

        return NextResponse.json({ excluded: count });
      }

      case "include_all": {
        const { data: updated, error } = await supabaseAdmin
          .from("email_campaign_recipients")
          .update({ included: true })
          .eq("campaign_id", id)
          .eq("included", false)
          .select("id");

        if (error) {
          console.error("[campaigns] Include all error:", error);
          return NextResponse.json({ error: "Failed to include all" }, { status: 500 });
        }

        await supabaseAdmin
          .from("email_campaigns")
          .update({ excluded_count: 0 })
          .eq("id", id);

        return NextResponse.json({ included: updated?.length ?? 0 });
      }

      case "cancel": {
        if (campaign.status === "cancelled") {
          return NextResponse.json(
            { error: "Campaign is already cancelled" },
            { status: 400 }
          );
        }

        const { data: updated, error } = await supabaseAdmin
          .from("email_campaigns")
          .update({ status: "cancelled" })
          .eq("id", id)
          .select()
          .single();

        if (error) {
          console.error("[campaigns] Cancel error:", error);
          return NextResponse.json({ error: "Failed to cancel" }, { status: 500 });
        }

        return NextResponse.json({ campaign: updated });
      }

      default:
        return NextResponse.json(
          { error: `Unknown action: ${action}` },
          { status: 400 }
        );
    }
  } catch (err) {
    console.error("[campaigns] PUT error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// ─── DELETE /api/email/campaigns/[id] ────────────────────────────────
// Delete a draft or cancelled campaign.
// ─────────────────────────────────────────────────────────────────────

export async function DELETE(request, { params }) {
  try {
    const coachId = await getAuthenticatedCoach();
    if (!coachId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const campaign = await getCampaignIfOwned(id, coachId);
    if (!campaign) {
      return NextResponse.json(
        { error: "Campaign not found" },
        { status: 404 }
      );
    }

    if (!["draft", "cancelled"].includes(campaign.status)) {
      return NextResponse.json(
        {
          error: "Can only delete campaigns in draft or cancelled status",
        },
        { status: 400 }
      );
    }

    // Delete recipients first, then campaign
    await supabaseAdmin
      .from("email_campaign_recipients")
      .delete()
      .eq("campaign_id", id);

    const { error } = await supabaseAdmin
      .from("email_campaigns")
      .delete()
      .eq("id", id);

    if (error) {
      console.error("[campaigns] Delete error:", error);
      return NextResponse.json(
        { error: "Failed to delete campaign" },
        { status: 500 }
      );
    }

    return NextResponse.json({ deleted: true });
  } catch (err) {
    console.error("[campaigns] DELETE error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
