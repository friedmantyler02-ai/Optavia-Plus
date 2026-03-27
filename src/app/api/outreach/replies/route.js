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

// GET: fetch uncategorized replies for a coach
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

    // Fetch uncategorized responses with joined data
    const { data: responses, error } = await supabaseAdmin
      .from("reactivation_responses")
      .select(`
        id,
        email_id,
        client_id,
        coach_id,
        auto_detected,
        response_type,
        detected_at,
        created_at,
        reactivation_emails (
          reply_snippet,
          sent_at,
          replied_at,
          gmail_thread_id,
          gmail_message_id
        ),
        clients (
          full_name,
          email
        )
      `)
      .eq("coach_id", coach_id)
      .is("response_type", null)
      .order("detected_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Fetch campaign segment for each email
    const emailIds = (responses || [])
      .map((r) => r.email_id)
      .filter(Boolean);

    let segmentByEmailId = {};
    if (emailIds.length > 0) {
      const { data: emailRows } = await supabaseAdmin
        .from("reactivation_emails")
        .select("id, campaign_id, reactivation_campaigns(segment)")
        .in("id", emailIds);

      for (const row of emailRows || []) {
        segmentByEmailId[row.id] = row.reactivation_campaigns?.segment || null;
      }
    }

    const enriched = (responses || []).map((r) => ({
      id: r.id,
      email_id: r.email_id,
      client_id: r.client_id,
      auto_detected: r.auto_detected,
      response_type: r.response_type,
      detected_at: r.detected_at || r.created_at,
      reply_snippet: r.reactivation_emails?.reply_snippet || null,
      sent_at: r.reactivation_emails?.sent_at || null,
      replied_at: r.reactivation_emails?.replied_at || null,
      gmail_thread_id: r.reactivation_emails?.gmail_thread_id || null,
      gmail_message_id: r.reactivation_emails?.gmail_message_id || null,
      client_name: r.clients?.full_name || "Unknown",
      client_email: r.clients?.email || null,
      segment: segmentByEmailId[r.email_id] || null,
    }));

    return NextResponse.json({ replies: enriched });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}

// PUT: categorize a reply
export async function PUT(request) {
  try {
    const user = await authCheck();
    if (!user)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { response_id, response_type, notes, next_step, follow_up_date } =
      await request.json();

    if (!response_id || !response_type) {
      return NextResponse.json(
        { error: "response_id and response_type are required" },
        { status: 400 }
      );
    }

    // Update the response row
    const { data: response, error: updateError } = await supabaseAdmin
      .from("reactivation_responses")
      .update({
        response_type,
        notes: notes || null,
        next_step: next_step || null,
        follow_up_date: follow_up_date || null,
        categorized_at: new Date().toISOString(),
      })
      .eq("id", response_id)
      .select("client_id, email_id")
      .single();

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    // Handle unsubscribe
    if (response_type === "unsubscribe" && response.client_id) {
      const now = new Date().toISOString();

      // Mark client as do_not_contact
      await supabaseAdmin
        .from("clients")
        .update({ do_not_contact: true, do_not_contact_at: now })
        .eq("id", response.client_id);

      // Skip any queued emails for this client
      await supabaseAdmin
        .from("reactivation_emails")
        .update({ status: "skipped" })
        .eq("client_id", response.client_id)
        .eq("status", "queued");

      // Get campaign_id to increment total_dnc
      if (response.email_id) {
        const { data: emailRow } = await supabaseAdmin
          .from("reactivation_emails")
          .select("campaign_id")
          .eq("id", response.email_id)
          .single();

        if (emailRow?.campaign_id) {
          const { data: camp } = await supabaseAdmin
            .from("reactivation_campaigns")
            .select("total_dnc")
            .eq("id", emailRow.campaign_id)
            .single();

          await supabaseAdmin
            .from("reactivation_campaigns")
            .update({ total_dnc: (camp?.total_dnc || 0) + 1 })
            .eq("id", emailRow.campaign_id);
        }
      }
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}
