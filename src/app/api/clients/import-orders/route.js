import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { normalizeOrgCsvPhone } from "@/lib/phone";

export const maxDuration = 60;

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

function normalizeRow(rawRow) {
  const out = {};
  for (const [k, v] of Object.entries(rawRow)) {
    out[cleanHeaderKey(k)] = typeof v === "string" ? v.trim() : v;
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

    for (let i = 0; i < orders.length; i++) {
      const row = normalizeRow(orders[i]);

      const optaviaId = (row.OPTAVIAID || "").trim();
      if (!optaviaId || optaviaId === "OPTAVIAID") continue;

      const orderDate = parseDate(row.OrderDate);
      const qv = parseNum(row.QV);
      const cv = parseNum(row.CV);
      const orderTotal = parseNum(row.OrderTotal);
      const orderType = (row.OrderType || "").trim() || null;
      const orderStatus = (row.OrderStatus || "").trim() || null;
      const accountType = (row.AccountType || "").trim() || null;
      const email = (row.Email || "").trim() || null;
      const phone = normalizeOrgCsvPhone(row.Phone || "");
      const orderNumber = (row.OrderNumber || "").trim() || null;
      const firstName = (row.FirstName || "").trim();
      const lastName = (row.LastName || "").trim();
      const fullName = `${firstName} ${lastName}`.trim();
      const countryCode = (row.CountryCode || "").trim() || null;
      const level = (row.Level || "").trim() || null;

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

        // Update email if current is placeholder and CSV has a real one
        if (email && !email.toLowerCase().endsWith("@medifastinc.com")) {
          updates.email = email;
        }

        if (phone) updates.phone = phone;

        // Build alerts
        const alerts = [...(existing.order_alerts || [])];

        // Alert: cancellation
        if (orderStatus && orderStatus.toLowerCase() === "cancelled") {
          alerts.push({
            type: "cancellation",
            date: orderDate,
            order_number: orderNumber,
            timestamp: new Date().toISOString(),
          });
          alertCount++;
        }

        // Alert: expected order date changed by more than 7 days
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

        // Alert: QV dropped below 350
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

        const { error: updateError } = await supabase
          .from("clients")
          .update(updates)
          .eq("id", existing.id);

        if (updateError) {
          errors.push({
            row: i,
            optavia_id: optaviaId,
            error: updateError.message,
          });
        } else {
          updated++;
        }
      } else {
        // Create new client
        const newClient = {
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
        };

        const { error: insertError } = await supabase
          .from("clients")
          .insert(newClient);

        if (insertError) {
          errors.push({
            row: i,
            optavia_id: optaviaId,
            error: insertError.message,
          });
        } else {
          created++;
        }
      }
    }

    return NextResponse.json({ updated, created, alerts: alertCount, errors });
  } catch (err) {
    console.error("Import orders error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
