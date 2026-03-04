import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const OK = NextResponse.json({ received: true });

const EVENT_FIELD_MAP = {
  "email.delivered": "delivered_at",
  "email.opened": "opened_at",
  "email.clicked": "clicked_at",
  "email.bounced": "bounced_at",
};

export async function POST(request) {
  try {
    // ---- Verify webhook signature ----
    if (process.env.RESEND_WEBHOOK_SECRET) {
      const signature = request.headers.get("svix-signature");
      if (signature !== process.env.RESEND_WEBHOOK_SECRET) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    } else {
      console.warn("[email/webhook] RESEND_WEBHOOK_SECRET not set — skipping signature verification");
    }

    // ---- Parse body ----
    const body = await request.json();
    const eventType = body.type;
    const resendId = body.data?.email_id;

    if (!resendId) {
      console.warn("[email/webhook] No email_id in payload, ignoring");
      return OK;
    }

    const field = EVENT_FIELD_MAP[eventType];
    if (!field) {
      console.log(`[email/webhook] Unrecognized event type: ${eventType}, ignoring`);
      return OK;
    }

    console.log(`[email/webhook] ${eventType} for resend_id ${resendId}`);

    // ---- Look up email_log row ----
    const { data: logRow, error: lookupErr } = await supabaseAdmin
      .from("email_log")
      .select("id, queue_id")
      .eq("resend_id", resendId)
      .maybeSingle();

    if (lookupErr) {
      console.error("[email/webhook] Lookup failed:", lookupErr);
      return OK;
    }

    if (!logRow) {
      console.log(`[email/webhook] No email_log row for resend_id ${resendId}, ignoring`);
      return OK;
    }

    // ---- Update timestamp (only if currently null) ----
    const timestamp = body.data?.created_at || new Date().toISOString();

    const { error: updateErr } = await supabaseAdmin
      .from("email_log")
      .update({ [field]: timestamp })
      .eq("id", logRow.id)
      .is(field, null);

    if (updateErr) {
      console.error(`[email/webhook] Failed to update ${field}:`, updateErr);
    }

    // ---- Handle bounce: also mark queue row as failed ----
    if (eventType === "email.bounced" && logRow.queue_id) {
      const { error: bounceErr } = await supabaseAdmin
        .from("email_queue")
        .update({ status: "failed", error: "Email bounced" })
        .eq("id", logRow.queue_id);

      if (bounceErr) {
        console.error("[email/webhook] Failed to update queue on bounce:", bounceErr);
      }
    }

    return OK;
  } catch (err) {
    console.error("[email/webhook] Unexpected error:", err);
    return OK;
  }
}
