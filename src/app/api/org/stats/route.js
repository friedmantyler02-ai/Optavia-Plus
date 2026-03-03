import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase-server";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function GET() {
  try {
    // Verify the requesting user is authenticated
    const supabase = await createServerClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Fetch all counts in parallel using the admin client (bypasses RLS)
    const [
      totalClientsRes,
      totalCoachesRes,
      activeClientsRes,
      revertedClientsRes,
      clientsWithEmailRes,
      clientsWithPhoneRes,
      neverContactedRes,
    ] = await Promise.all([
      supabaseAdmin
        .from("clients")
        .select("*", { count: "exact", head: true })
        .not("import_batch_id", "is", null),
      supabaseAdmin
        .from("coaches")
        .select("*", { count: "exact", head: true })
        .eq("is_stub", true),
      supabaseAdmin
        .from("clients")
        .select("*", { count: "exact", head: true })
        .not("import_batch_id", "is", null)
        .eq("account_status", "Active"),
      supabaseAdmin
        .from("clients")
        .select("*", { count: "exact", head: true })
        .not("import_batch_id", "is", null)
        .eq("account_status", "Reverted"),
      supabaseAdmin
        .from("clients")
        .select("*", { count: "exact", head: true })
        .not("import_batch_id", "is", null)
        .not("email", "is", null)
        .not("email", "like", "%@medifastinc.com"),
      supabaseAdmin
        .from("clients")
        .select("*", { count: "exact", head: true })
        .not("import_batch_id", "is", null)
        .not("phone", "is", null)
        .neq("phone", ""),
      supabaseAdmin
        .from("clients")
        .select("*", { count: "exact", head: true })
        .not("import_batch_id", "is", null)
        .is("last_contact_date", null),
    ]);

    // Top 20 coaches by client count
    const { data: coachRows } = await supabaseAdmin
      .from("coaches")
      .select("id, full_name, optavia_id")
      .eq("is_stub", true);

    let topCoaches = [];
    if (coachRows) {
      const { data: clientRows } = await supabaseAdmin
        .from("clients")
        .select("coach_id, account_status")
        .not("import_batch_id", "is", null)
        .not("coach_id", "is", null);

      if (clientRows) {
        const coachMap = {};
        for (const row of clientRows) {
          if (!coachMap[row.coach_id]) {
            coachMap[row.coach_id] = { total: 0, active: 0, reverted: 0 };
          }
          coachMap[row.coach_id].total++;
          if (row.account_status === "Active") coachMap[row.coach_id].active++;
          if (row.account_status === "Reverted") coachMap[row.coach_id].reverted++;
        }

        topCoaches = coachRows
          .map((c) => ({
            coach_name: c.full_name,
            optavia_id: c.optavia_id,
            client_count: coachMap[c.id]?.total ?? 0,
            active_count: coachMap[c.id]?.active ?? 0,
            reverted_count: coachMap[c.id]?.reverted ?? 0,
          }))
          .filter((c) => c.client_count > 0)
          .sort((a, b) => b.client_count - a.client_count)
          .slice(0, 20);
      }
    }

    return NextResponse.json({
      total_clients: totalClientsRes.count ?? 0,
      total_coaches: totalCoachesRes.count ?? 0,
      active_clients: activeClientsRes.count ?? 0,
      reverted_clients: revertedClientsRes.count ?? 0,
      clients_with_email: clientsWithEmailRes.count ?? 0,
      clients_with_phone: clientsWithPhoneRes.count ?? 0,
      never_contacted: neverContactedRes.count ?? 0,
      top_coaches: topCoaches,
    });
  } catch (err) {
    console.error("Org stats error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
