import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase-server";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const CLIENT_BATCH_SIZE = 500;

// ---------------------------------------------------------------------------
// Auth
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
// Core logic
// ---------------------------------------------------------------------------
async function evaluateEscalations() {
  let resolved = 0;
  let escalated = 0;
  let evaluated = 0;
  let errors = 0;

  // ========================================================================
  // Pass 1: Auto-resolve open escalations
  // ========================================================================
  try {
    const { data: openEscalations, error: escErr } = await supabaseAdmin
      .from("escalations")
      .select("id, client_id, created_at, clients(last_order_date, last_contact_date)")
      .eq("status", "open");

    if (escErr) {
      console.error("[escalations/evaluate] Failed to load open escalations:", escErr);
      errors++;
    } else {
      const now = Date.now();
      const ninetyDaysMs = 90 * 24 * 60 * 60 * 1000;
      const toResolve = [];

      for (const esc of openEscalations || []) {
        const client = esc.clients;
        if (!client) continue;

        const lastOrderRecent =
          client.last_order_date && (now - new Date(client.last_order_date).getTime()) <= ninetyDaysMs;

        const contactedSinceEscalation =
          client.last_contact_date && new Date(client.last_contact_date) > new Date(esc.created_at);

        if (lastOrderRecent || contactedSinceEscalation) {
          toResolve.push(esc.id);
        }
      }

      if (toResolve.length > 0) {
        const { error: resolveErr } = await supabaseAdmin
          .from("escalations")
          .update({ status: "auto_resolved", resolved_at: new Date().toISOString() })
          .in("id", toResolve);

        if (resolveErr) {
          console.error("[escalations/evaluate] Failed to auto-resolve:", resolveErr);
          errors++;
        } else {
          resolved = toResolve.length;
          console.log(`[escalations/evaluate] Auto-resolved ${resolved} escalations`);
        }
      }
    }
  } catch (err) {
    console.error("[escalations/evaluate] Auto-resolve pass error:", err);
    errors++;
  }

  // ========================================================================
  // Pass 2: Evaluate clients for new escalations
  // ========================================================================
  try {
    // Pre-load: clients with 2+ sent emails
    const { data: sentCounts, error: scErr } = await supabaseAdmin
      .from("email_queue")
      .select("client_id")
      .eq("status", "sent");

    if (scErr) {
      console.error("[escalations/evaluate] Failed to load sent counts:", scErr);
      return NextResponse.json({ evaluated, escalated, resolved, errors: errors + 1 });
    }

    // Count sent emails per client
    const sentByClient = {};
    for (const row of sentCounts || []) {
      sentByClient[row.client_id] = (sentByClient[row.client_id] || 0) + 1;
    }

    // Filter to clients with 2+ sent
    const candidateClientIds = Object.keys(sentByClient).filter((id) => sentByClient[id] >= 2);
    if (candidateClientIds.length === 0) {
      console.log("[escalations/evaluate] No clients with 2+ sent emails");
      return NextResponse.json({ evaluated, escalated, resolved, errors });
    }

    // Pre-load: clients who have opened at least one email
    const { data: openedRows, error: orErr } = await supabaseAdmin
      .from("email_log")
      .select("client_id")
      .not("opened_at", "is", null);

    if (orErr) {
      console.error("[escalations/evaluate] Failed to load opened emails:", orErr);
      return NextResponse.json({ evaluated, escalated, resolved, errors: errors + 1 });
    }

    const clientsWhoOpened = new Set((openedRows || []).map((r) => r.client_id));

    // Pre-load: existing open escalations
    const { data: existingOpen, error: eoErr } = await supabaseAdmin
      .from("escalations")
      .select("client_id")
      .eq("status", "open");

    if (eoErr) {
      console.error("[escalations/evaluate] Failed to load existing escalations:", eoErr);
      return NextResponse.json({ evaluated, escalated, resolved, errors: errors + 1 });
    }

    const clientsWithOpenEscalation = new Set((existingOpen || []).map((r) => r.client_id));

    // Process candidate clients in batches
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    for (let i = 0; i < candidateClientIds.length; i += CLIENT_BATCH_SIZE) {
      const batchIds = candidateClientIds.slice(i, i + CLIENT_BATCH_SIZE);
      const batchNum = Math.floor(i / CLIENT_BATCH_SIZE) + 1;

      const { data: clients, error: cErr } = await supabaseAdmin
        .from("clients")
        .select("id, coach_id, last_order_date, coaches(upline_id)")
        .in("id", batchIds);

      if (cErr) {
        console.error(`[escalations/evaluate] Failed to load clients batch ${batchNum}:`, cErr);
        errors++;
        continue;
      }

      const toInsert = [];

      for (const client of clients || []) {
        evaluated++;

        // Skip if client opened any email
        if (clientsWhoOpened.has(client.id)) continue;

        // Skip if last order within 90 days
        if (client.last_order_date && new Date(client.last_order_date) > ninetyDaysAgo) continue;

        // Skip if already has open escalation
        if (clientsWithOpenEscalation.has(client.id)) continue;

        toInsert.push({
          client_id: client.id,
          from_coach_id: client.coach_id,
          to_coach_id: client.coaches?.upline_id || null,
          reason: "2+ emails sent, none opened, no order in 90+ days",
          status: "open",
        });

        // Add to set to prevent duplicates within this run
        clientsWithOpenEscalation.add(client.id);
      }

      if (toInsert.length > 0) {
        const { error: insertErr } = await supabaseAdmin
          .from("escalations")
          .insert(toInsert);

        if (insertErr) {
          console.error(`[escalations/evaluate] Failed to insert escalations batch ${batchNum}:`, insertErr);
          errors++;
        } else {
          escalated += toInsert.length;
          console.log(`[escalations/evaluate] Created ${toInsert.length} escalations from batch ${batchNum}`);
        }
      }
    }
  } catch (err) {
    console.error("[escalations/evaluate] Trigger pass error:", err);
    errors++;
  }

  console.log(`[escalations/evaluate] Done. Evaluated ${evaluated}, escalated ${escalated}, resolved ${resolved}, errors ${errors}`);
  return NextResponse.json({ evaluated, escalated, resolved, errors });
}

// ---------------------------------------------------------------------------
// GET /api/org/escalations/evaluate  (Vercel Cron)
// ---------------------------------------------------------------------------
export async function GET(request) {
  try {
    if (!isCronAuthorized(request)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return await evaluateEscalations();
  } catch (err) {
    console.error("[escalations/evaluate] Unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// POST /api/org/escalations/evaluate
// ---------------------------------------------------------------------------
export async function POST(request) {
  try {
    let authorized = isCronAuthorized(request);

    if (!authorized) {
      const supabase = await createServerClient();
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (!authError && user) {
        authorized = true;
      }
    }

    if (!authorized) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    return await evaluateEscalations();
  } catch (err) {
    console.error("[escalations/evaluate] Unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
