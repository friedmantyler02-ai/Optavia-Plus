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

// GET: fetch follow-ups due today or overdue
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

    const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD

    const { data: responses, error } = await supabaseAdmin
      .from("reactivation_responses")
      .select(`
        id,
        client_id,
        response_type,
        notes,
        next_step,
        follow_up_date,
        clients (
          full_name,
          email
        )
      `)
      .eq("coach_id", coach_id)
      .not("follow_up_date", "is", null)
      .lte("follow_up_date", today)
      .not("response_type", "in", '("not_interested","unsubscribe")')
      .order("follow_up_date", { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const followUps = (responses || []).map((r) => ({
      response_id: r.id,
      client_name: r.clients?.full_name || "Unknown",
      client_email: r.clients?.email || null,
      response_type: r.response_type,
      notes: r.notes,
      next_step: r.next_step,
      follow_up_date: r.follow_up_date,
      is_overdue: r.follow_up_date < today,
    }));

    return NextResponse.json({ follow_ups: followUps });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}
