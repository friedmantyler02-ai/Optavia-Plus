import { NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase-server";

const supabaseAdmin = createSupabaseClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function GET(request) {
  try {
    // Auth check
    const supabase = await createServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const coach_id = searchParams.get("coach_id");

    if (!coach_id) {
      return NextResponse.json({ error: "coach_id is required" }, { status: 400 });
    }

    // Fetch eligible clients
    const { data: clients, error } = await supabaseAdmin
      .from("clients")
      .select("id, email, last_order_date")
      .eq("coach_id", coach_id)
      .or("do_not_contact.is.null,do_not_contact.eq.false")
      .or("bad_email.is.null,bad_email.eq.false")
      .not("email", "is", null)
      .neq("email", "");

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Filter out @medifastinc.com emails and segment
    const now = new Date();
    const segments = { active: 0, warm: 0, moderate: 0, cold: 0, dormant: 0 };

    for (const client of clients || []) {
      // Skip medifastinc emails (already filtered no-email above)
      if (client.email && client.email.toLowerCase().includes("@medifastinc.com")) {
        continue;
      }

      if (!client.last_order_date) {
        segments.dormant++;
        continue;
      }

      const lastOrder = new Date(client.last_order_date);
      const daysSince = Math.floor((now - lastOrder) / (1000 * 60 * 60 * 24));

      if (daysSince <= 60) {
        segments.active++;
      } else if (daysSince <= 180) {
        segments.warm++;
      } else if (daysSince <= 365) {
        segments.moderate++;
      } else if (daysSince <= 730) {
        segments.cold++;
      } else {
        segments.dormant++;
      }
    }

    return NextResponse.json({
      segments,
      total_reachable: segments.warm + segments.moderate + segments.cold + segments.dormant,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}
