import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

const supabaseAdmin = createSupabaseClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function getCurrentWeekStart() {
  const now = new Date();
  const day = now.getUTCDay();
  const mondayOffset = day === 0 ? 6 : day - 1;
  const monday = new Date(now);
  monday.setUTCDate(now.getUTCDate() - mondayOffset);
  monday.setUTCHours(0, 0, 0, 0);
  return monday.toISOString().split("T")[0];
}

export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const weekStart = getCurrentWeekStart();

    const { data, error } = await supabase
      .from("client_weekly_checkins")
      .select("client_id, check_type")
      .eq("coach_id", user.id)
      .eq("week_start", weekStart);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ checkins: data || [] });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
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

    const { client_id, check_type } = await request.json();

    if (!client_id || !check_type) {
      return NextResponse.json(
        { error: "client_id and check_type are required" },
        { status: 400 }
      );
    }

    const weekStart = getCurrentWeekStart();

    // Check if already exists
    const { data: existing } = await supabaseAdmin
      .from("client_weekly_checkins")
      .select("id")
      .eq("client_id", client_id)
      .eq("check_type", check_type)
      .eq("week_start", weekStart)
      .maybeSingle();

    if (existing) {
      // Delete (uncheck)
      const { error: deleteError } = await supabaseAdmin
        .from("client_weekly_checkins")
        .delete()
        .eq("id", existing.id);

      if (deleteError) {
        return NextResponse.json({ error: deleteError.message }, { status: 500 });
      }

      return NextResponse.json({ success: true, checked: false });
    } else {
      // Insert (check)
      const { error: insertError } = await supabaseAdmin
        .from("client_weekly_checkins")
        .insert({
          client_id,
          coach_id: user.id,
          check_type,
          week_start: weekStart,
        });

      if (insertError) {
        return NextResponse.json({ error: insertError.message }, { status: 500 });
      }

      return NextResponse.json({ success: true, checked: true });
    }
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}
