import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { normalizeOrgCsvPhone } from "@/lib/phone";

export const maxDuration = 60;

const supabaseAdmin = createSupabaseClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * Normalize CSV header keys — strip BOM, ="" wrapping, whitespace, quotes.
 */
function cleanHeaderKey(key) {
  if (!key) return "";
  return key
    .replace(/^\uFEFF/, "")
    .replace(/^="?/, "")
    .replace(/"$/, "")
    .trim();
}

/**
 * Normalize a row: clean keys, and also create no-space variants so
 * "OPTAVIA ID" can be accessed as row.OPTAVIAID, "First Name" as row.FirstName, etc.
 */
function normalizeRow(rawRow) {
  const out = {};
  for (const [k, v] of Object.entries(rawRow)) {
    const cleaned = cleanHeaderKey(k);
    const val = typeof v === "string" ? v.trim() : v;
    out[cleaned] = val;
    // Also store a no-space version: "OPTAVIA ID" → "OPTAVIAID", "First Name" → "FirstName"
    const noSpaces = cleaned.replace(/\s+/g, "");
    if (noSpaces !== cleaned) {
      out[noSpaces] = val;
    }
  }
  return out;
}

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

/**
 * Run an array of async functions with limited concurrency.
 */
async function runConcurrent(tasks, limit = 10) {
  const results = [];
  let i = 0;

  async function next() {
    while (i < tasks.length) {
      const idx = i++;
      results[idx] = await tasks[idx]();
    }
  }

  const workers = Array.from({ length: Math.min(limit, tasks.length) }, () => next());
  await Promise.all(workers);
  return results;
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

    const { orders } = await request.json();

    if (!Array.isArray(orders) || orders.length === 0) {
      return NextResponse.json(
        { error: "orders must be a non-empty array" },
        { status: 400 }
      );
    }

    const coachId = user.id;
    let updated = 0;
    let created = 0;
    let alertCount = 0;
    const errors = [];

    // Fetch all existing clients for this coach (by optavia_id) for matching
    const { data: existingClients } = await supabase
      .from("clients")
      .select("id, optavia_id, pqv, expected_order_date, order_alerts")
      .eq("coach_id", coachId);

    const clientMap = {};
    if (existingClients) {
      for (const c of existingClients) {
        if (c.optavia_id) clientMap[c.optavia_id] = c;
      }
    }

    // Process all rows in memory — separate into updates and inserts
    const updateOps = [];  // { id, updates }
    const insertRows = []; // full records for new clients
    const orderRows = [];  // orders to upsert into the orders table

    for (let i = 0; i < orders.length; i++) {
      const row = normalizeRow(orders[i]);

      const optaviaId = (row.OPTAVIAID || "").trim();
      if (!optaviaId || optaviaId === "OPTAVIAID") continue;

      const orderDate = parseDate(row.OrderDate || row.LastOrderDate);
      const qv = parseNum(row.QV);
      const cv = parseNum(row.CV);
      const orderTotal = parseNum(row.OrderTotal);
      const orderType = (row.OrderType || "").trim() || null;
      const orderStatus = (row.OrderStatus || "").trim() || null;
      const accountType = (row.AccountType || "").trim() || null;
      const email = (row.Email || "").trim() || null;
      const phone = normalizeOrgCsvPhone(row.Phone || "");
      const orderNumber = (row.OrderNumber || "").trim() || null;
      const trackingRaw = (row.TrackingNumbers || row["Tracking Numbers"] || "").trim();
      const firstName = (row.FirstName || "").trim();
      const lastName = (row.LastName || "").trim();
      const fullName = `${firstName} ${lastName}`.trim();
      const countryCode = (row.CountryCode || "").trim() || null;
      const level = (row.Level || "").trim() || null;

      // Build order record for the orders table (if we have an order number)
      if (orderNumber) {
        const isNoTracking = !trackingRaw || trackingRaw === "NO_TRACKING_NUMBER" || trackingRaw.toUpperCase() === "N/A";
        orderRows.push({
          optavia_id: optaviaId,
          client_name: fullName || null,
          order_number: orderNumber,
          tracking_number: isNoTracking ? null : trackingRaw,
          order_date: orderDate,
          cv,
          shipping_status: isNoTracking ? "no_tracking" : "unknown",
          coach_id: coachId,
          _clientMatch: optaviaId, // used below for client_id lookup
        });
      }

      const existing = clientMap[optaviaId];

      if (existing) {
        // Build update payload
        const updates = {
          last_order_date: orderDate,
          pqv: qv,
          cv,
          order_total: orderTotal,
          order_type: orderType,
          order_status: orderStatus,
          account_type: accountType,
          last_order_import_date: new Date().toISOString(),
        };

        if (email && !email.toLowerCase().endsWith("@medifastinc.com")) {
          updates.email = email;
        }
        if (phone) updates.phone = phone;

        // Build alerts
        const alerts = [...(existing.order_alerts || [])];

        if (orderStatus && orderStatus.toLowerCase() === "cancelled") {
          alerts.push({
            type: "cancellation",
            date: orderDate,
            order_number: orderNumber,
            timestamp: new Date().toISOString(),
          });
          alertCount++;
        }

        if (orderDate && existing.expected_order_date) {
          const oldDate = new Date(existing.expected_order_date);
          const newDate = new Date(orderDate);
          const diffDays = Math.abs(
            (newDate - oldDate) / (1000 * 60 * 60 * 24)
          );
          if (diffDays > 7) {
            alerts.push({
              type: "date_change",
              old_date: existing.expected_order_date,
              new_date: orderDate,
              timestamp: new Date().toISOString(),
            });
            alertCount++;
          }
        }

        if (
          qv != null &&
          existing.pqv != null &&
          existing.pqv >= 350 &&
          qv < 350
        ) {
          alerts.push({
            type: "qv_drop",
            old_qv: existing.pqv,
            new_qv: qv,
            timestamp: new Date().toISOString(),
          });
          alertCount++;
        }

        if (alerts.length > (existing.order_alerts || []).length) {
          updates.order_alerts = alerts;
        }

        updateOps.push({ id: existing.id, updates, rowIndex: i, optaviaId });
      } else {
        insertRows.push({
          optavia_id: optaviaId,
          full_name: fullName || null,
          email:
            email && !email.toLowerCase().endsWith("@medifastinc.com")
              ? email
              : null,
          phone,
          country_code: countryCode,
          level,
          last_order_date: orderDate,
          pqv: qv,
          cv,
          order_total: orderTotal,
          order_type: orderType,
          order_status: orderStatus,
          account_type: accountType,
          account_status: "Active",
          coach_id: coachId,
          last_order_import_date: new Date().toISOString(),
          order_alerts: [],
          _rowIndex: i,
          _optaviaId: optaviaId,
        });
      }
    }

    // Batch insert all new clients in one call
    if (insertRows.length > 0) {
      // Strip internal tracking fields before inserting
      const cleanInserts = insertRows.map(({ _rowIndex, _optaviaId, ...row }) => row);

      const { error: insertError } = await supabase
        .from("clients")
        .insert(cleanInserts);

      if (insertError) {
        console.error("Batch insert error:", insertError.message);
        errors.push({ batch: "insert", error: insertError.message });
      } else {
        created += insertRows.length;
      }
    }

    // Run all updates concurrently (max 10 at a time)
    if (updateOps.length > 0) {
      const tasks = updateOps.map((op) => async () => {
        const { error: updateError } = await supabase
          .from("clients")
          .update(op.updates)
          .eq("id", op.id);

        if (updateError) {
          return { error: true, row: op.rowIndex, optavia_id: op.optaviaId, message: updateError.message };
        }
        return { error: false };
      });

      const results = await runConcurrent(tasks, 10);

      for (const r of results) {
        if (r.error) {
          errors.push({ row: r.row, optavia_id: r.optavia_id, error: r.message });
        } else {
          updated++;
        }
      }
    }

    // Upsert orders into the orders table (with tracking data)
    let ordersImported = 0;
    let orderErrors = [];
    if (orderRows.length > 0) {
      // Re-fetch clients to get IDs for newly created clients too
      const { data: allClients } = await supabaseAdmin
        .from("clients")
        .select("id, optavia_id")
        .eq("coach_id", coachId);

      const fullClientMap = {};
      if (allClients) {
        for (const c of allClients) {
          if (c.optavia_id) fullClientMap[c.optavia_id] = c.id;
        }
      }

      const orderUpserts = orderRows.map(({ _clientMatch, ...order }) => ({
        ...order,
        client_id: fullClientMap[_clientMatch] || null,
        updated_at: new Date().toISOString(),
      }));

      // Upsert in batches of 100
      for (let i = 0; i < orderUpserts.length; i += 100) {
        const batch = orderUpserts.slice(i, i + 100);
        const { error: orderError } = await supabaseAdmin
          .from("orders")
          .upsert(batch, { onConflict: "order_number,coach_id", ignoreDuplicates: false });

        if (orderError) {
          console.error("[import-orders] Orders upsert error:", orderError.message, orderError.code, orderError.details);
          orderErrors.push({
            batch: Math.floor(i / 100) + 1,
            error: orderError.message,
            code: orderError.code,
          });
        } else {
          ordersImported += batch.length;
        }
      }
    }

    return NextResponse.json({
      updated,
      created,
      alerts: alertCount,
      errors,
      ordersImported,
      ordersPending: orderRows.length,
      orderErrors: orderErrors.length > 0 ? orderErrors : undefined,
    });
  } catch (err) {
    console.error("Import orders error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
