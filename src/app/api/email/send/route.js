import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendEmail } from "@/lib/resend";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const BATCH_SIZE = 50;
const MAX_PENDING = 200;
const DELAY_MS = 100;

// ---------------------------------------------------------------------------
// Auth helpers
// ---------------------------------------------------------------------------
function isCronAuthorized(request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return false;

  // X-Cron-Secret header
  if (request.headers.get("x-cron-secret") === cronSecret) return true;

  // Authorization: Bearer <CRON_SECRET> (Vercel Cron)
  const authHeader = request.headers.get("authorization");
  if (authHeader === `Bearer ${cronSecret}`) return true;

  return false;
}

// ---------------------------------------------------------------------------
// Template variable rendering
// ---------------------------------------------------------------------------
function renderTemplate(template, vars) {
  if (!template) return "";
  return template
    .replace(/\{\{client_first_name\}\}/g, vars.clientFirstName)
    .replace(/\{\{client_name\}\}/g, vars.clientName)
    .replace(/\{\{coach_name\}\}/g, vars.coachName)
    .replace(/\{\{coach_email\}\}/g, vars.coachEmail);
}

function getFirstName(fullName) {
  return (fullName || "").split(" ")[0] || "there";
}

function isValidEmail(email) {
  if (!email || !email.trim()) return false;
  if (email.toLowerCase().endsWith("@medifastinc.com")) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Core processing logic
// ---------------------------------------------------------------------------
async function processEmailQueue() {
  const { data: pendingRows, error: fetchErr } = await supabaseAdmin
    .from("email_queue")
    .select(`
      id,
      coach_id,
      client_id,
      template_id,
      scheduled_for,
      email_templates (
        subject,
        body_html,
        body_text
      ),
      clients (
        full_name,
        email
      ),
      coaches (
        full_name,
        email
      )
    `)
    .eq("status", "pending")
    .lte("scheduled_for", new Date().toISOString())
    .order("scheduled_for", { ascending: true })
    .limit(MAX_PENDING);

  if (fetchErr) {
    console.error("[email/send] Failed to fetch queue:", fetchErr);
    return NextResponse.json({ error: "Failed to fetch email queue" }, { status: 500 });
  }

  if (!pendingRows || pendingRows.length === 0) {
    return NextResponse.json({ processed: 0, sent: 0, failed: 0, skipped: 0 });
  }

  console.log(`[email/send] Found ${pendingRows.length} pending emails`);

  let sent = 0;
  let failed = 0;
  let skipped = 0;
  const totalBatches = Math.ceil(pendingRows.length / BATCH_SIZE);

  for (let b = 0; b < totalBatches; b++) {
    const batch = pendingRows.slice(b * BATCH_SIZE, (b + 1) * BATCH_SIZE);
    console.log(`[email/send] Processing batch ${b + 1} of ${totalBatches}...`);

    for (const row of batch) {
      const client = row.clients;
      const coach = row.coaches;
      const template = row.email_templates;

      // Skip if client has no valid email
      if (!client || !isValidEmail(client.email)) {
        await supabaseAdmin
          .from("email_queue")
          .update({ status: "skipped" })
          .eq("id", row.id);
        skipped++;
        continue;
      }

      // Skip if missing template or coach
      if (!template || !coach) {
        await supabaseAdmin
          .from("email_queue")
          .update({ status: "skipped" })
          .eq("id", row.id);
        skipped++;
        continue;
      }

      const vars = {
        clientFirstName: getFirstName(client.full_name),
        clientName: client.full_name || "there",
        coachName: coach.full_name || "Your Coach",
        coachEmail: coach.email || "",
      };

      const subject = renderTemplate(template.subject, vars);
      const html = renderTemplate(template.body_html, vars);
      const text = renderTemplate(template.body_text, vars);

      try {
        const { data, error: sendErr } = await sendEmail({
          from: `${coach.full_name} via OPTAVIA Plus <notifications@optaviaplus.com>`,
          replyTo: coach.email,
          to: client.email,
          subject,
          html: html || undefined,
          text: text || undefined,
        });

        if (sendErr) {
          throw new Error(sendErr.message || JSON.stringify(sendErr));
        }

        // Success — update queue + insert log
        const now = new Date().toISOString();
        await supabaseAdmin
          .from("email_queue")
          .update({ status: "sent", sent_at: now })
          .eq("id", row.id);

        await supabaseAdmin
          .from("email_log")
          .insert({
            queue_id: row.id,
            coach_id: row.coach_id,
            client_id: row.client_id,
            trigger_id: row.trigger_id,
            resend_id: data?.id || null,
            sent_at: now,
          });

        sent++;
      } catch (err) {
        console.error(`[email/send] Failed to send email (queue ${row.id}):`, err.message);
        await supabaseAdmin
          .from("email_queue")
          .update({ status: "failed", error: err.message })
          .eq("id", row.id);
        failed++;
      }

      // Rate limit delay
      await new Promise((r) => setTimeout(r, DELAY_MS));
    }
  }

  console.log(`[email/send] Done. Sent ${sent}, failed ${failed}, skipped ${skipped}`);
  return NextResponse.json({
    processed: pendingRows.length,
    sent,
    failed,
    skipped,
  });
}

// ---------------------------------------------------------------------------
// GET /api/email/send  (Vercel Cron)
// ---------------------------------------------------------------------------
export async function GET(request) {
  try {
    if (!isCronAuthorized(request)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return await processEmailQueue();
  } catch (err) {
    console.error("[email/send] Unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// POST /api/email/send  (Cron secret required — same as GET)
// ---------------------------------------------------------------------------
export async function POST(request) {
  try {
    if (!isCronAuthorized(request)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    return await processEmailQueue();
  } catch (err) {
    console.error("[email/send] Unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
