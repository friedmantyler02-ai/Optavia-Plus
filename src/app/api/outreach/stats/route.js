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

    // Run all counts in parallel
    const [
      sentResult,
      repliedResult,
      activeCampaignsResult,
      pendingRepliesResult,
      sentEmailsForReactivationResult,
    ] = await Promise.all([
      // Total emails sent across all campaigns
      supabaseAdmin
        .from("reactivation_emails")
        .select("id", { count: "exact", head: true })
        .eq("coach_id", coach_id)
        .eq("status", "sent"),

      // Total replies received
      supabaseAdmin
        .from("reactivation_emails")
        .select("id", { count: "exact", head: true })
        .eq("coach_id", coach_id)
        .eq("status", "replied"),

      // Active campaigns count
      supabaseAdmin
        .from("reactivation_campaigns")
        .select("id", { count: "exact", head: true })
        .eq("coach_id", coach_id)
        .eq("status", "active"),

      // Pending replies (uncategorized responses)
      supabaseAdmin
        .from("reactivation_responses")
        .select("id", { count: "exact", head: true })
        .eq("coach_id", coach_id)
        .is("response_type", null),

      // Fetch sent emails with sent_at and client_id to compute reactivations
      supabaseAdmin
        .from("reactivation_emails")
        .select("client_id, sent_at")
        .eq("coach_id", coach_id)
        .eq("status", "sent"),
    ]);

    // Compute reactivated clients:
    // clients who placed an order (last_order_date) after the email was sent
    let reactivated = 0;
    if (
      sentEmailsForReactivationResult.data &&
      sentEmailsForReactivationResult.data.length > 0
    ) {
      const clientIds = [
        ...new Set(
          sentEmailsForReactivationResult.data.map((e) => e.client_id)
        ),
      ];

      const { data: clients } = await supabaseAdmin
        .from("clients")
        .select("id, last_order_date")
        .in("id", clientIds);

      const sentAtByClient = {};
      for (const e of sentEmailsForReactivationResult.data) {
        // Use the earliest sent_at per client
        if (
          !sentAtByClient[e.client_id] ||
          new Date(e.sent_at) < new Date(sentAtByClient[e.client_id])
        ) {
          sentAtByClient[e.client_id] = e.sent_at;
        }
      }

      for (const client of clients || []) {
        if (!client.last_order_date) continue;
        const sentAt = sentAtByClient[client.id];
        if (!sentAt) continue;
        if (new Date(client.last_order_date) > new Date(sentAt)) {
          reactivated++;
        }
      }
    }

    return NextResponse.json({
      stats: {
        emails_sent: sentResult.count || 0,
        replies: repliedResult.count || 0,
        reactivated,
        active_campaigns: activeCampaignsResult.count || 0,
        pending_replies: pendingRepliesResult.count || 0,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}
