import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

export const maxDuration = 60;

const supabaseAdmin = createSupabaseClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function parseDate(val) {
  if (!val) return null;
  const s = String(val).trim();
  if (!s) return null;
  try {
    const d = new Date(s);
    if (isNaN(d.getTime())) return null;
    return d.toISOString().split("T")[0];
  } catch {
    return null;
  }
}

function parseNum(val) {
  if (val == null) return null;
  const s = String(val).replace(/[$,]/g, "").trim();
  if (!s) return null;
  const n = Number(s);
  return isNaN(n) ? null : n;
}

export async function POST(request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { orders, coach_id } = await request.json();
    const coachId = coach_id || user.id;

    if (!Array.isArray(orders) || orders.length === 0) {
      return NextResponse.json(
        { error: "orders must be a non-empty array" },
        { status: 400 }
      );
    }

    // Fetch all clients for this coach keyed by optavia_id
    const { data: clients } = await supabaseAdmin
      .from("clients")
      .select("id, optavia_id, last_order_date")
      .eq("coach_id", coachId);

    const clientMap = {};
    if (clients) {
      for (const c of clients) {
        if (c.optavia_id) clientMap[c.optavia_id] = c;
      }
    }

    let imported = 0;
    let skipped = 0;
    let matched = 0;
    let unmatched = 0;

    // Track clients whose last_order_date needs updating
    const clientDateUpdates = {}; // client_id -> most recent order_date

    for (const order of orders) {
      const optaviaId = (order.optavia_id || "").trim();
      const orderNumber = (order.order_number || "").trim();
      const trackingRaw = (order.tracking_number || "").trim();
      const orderDate = parseDate(order.order_date);
      const cv = parseNum(order.cv);
      const clientName = (order.client_name || "").trim();

      if (!orderNumber) {
        skipped++;
        continue;
      }

      // Match to client
      const matchedClient = optaviaId ? clientMap[optaviaId] : null;
      const clientId = matchedClient ? matchedClient.id : null;

      if (clientId) {
        matched++;
        // Track most recent order date per client
        if (orderDate) {
          if (!clientDateUpdates[clientId] || orderDate > clientDateUpdates[clientId]) {
            clientDateUpdates[clientId] = orderDate;
          }
        }
      } else {
        unmatched++;
      }

      // Determine shipping status
      const isNoTracking =
        !trackingRaw ||
        trackingRaw === "NO_TRACKING_NUMBER" ||
        trackingRaw.toUpperCase() === "N/A";
      const trackingNumber = isNoTracking ? null : trackingRaw;
      const shippingStatus = isNoTracking ? "no_tracking" : "unknown";

      // Upsert order (on conflict of order_number + coach_id)
      const { error: upsertError } = await supabaseAdmin
        .from("orders")
        .upsert(
          {
            coach_id: coachId,
            client_id: clientId,
            optavia_id: optaviaId || null,
            client_name: clientName || null,
            order_number: orderNumber,
            tracking_number: trackingNumber,
            order_date: orderDate,
            cv,
            shipping_status: shippingStatus,
            updated_at: new Date().toISOString(),
          },
          {
            onConflict: "order_number,coach_id",
            ignoreDuplicates: false,
          }
        );

      if (upsertError) {
        // If it's a duplicate that couldn't be upserted, count as skipped
        if (upsertError.code === "23505") {
          skipped++;
        } else {
          console.error("[orders/import] Upsert error:", upsertError.message);
          skipped++;
        }
      } else {
        imported++;
      }
    }

    // Update last_order_date on matched clients where this order is more recent
    for (const [clientId, orderDate] of Object.entries(clientDateUpdates)) {
      const existingClient = clients.find((c) => c.id === clientId);
      const existingDate = existingClient?.last_order_date
        ? existingClient.last_order_date.split("T")[0]
        : null;

      if (!existingDate || orderDate > existingDate) {
        await supabaseAdmin
          .from("clients")
          .update({
            last_order_date: orderDate,
            updated_at: new Date().toISOString(),
          })
          .eq("id", clientId);
      }
    }

    return NextResponse.json({ imported, skipped, matched, unmatched });
  } catch (err) {
    console.error("[orders/import] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
