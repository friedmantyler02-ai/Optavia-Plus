import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

const supabaseAdmin = createSupabaseClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function getCurrentWeekStart() {
  const now = new Date();
  const day = now.getDay();
  const diff = now.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(now.setDate(diff));
  return monday.toISOString().slice(0, 10);
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

    const body = await request.json();
    const {
      client_id,
      coach_id,
      measured_at,
      weight,
      bmi,
      body_fat_pct,
      skeletal_muscle_pct,
      fat_free_mass,
      subcutaneous_fat_pct,
      visceral_fat,
      body_water_pct,
      muscle_mass,
      bone_mass,
      protein_pct,
      bmr,
      metabolic_age,
    } = body;

    if (!client_id || !coach_id) {
      return NextResponse.json(
        { error: "Missing client_id or coach_id" },
        { status: 400 }
      );
    }

    // Insert body composition record
    const { data: inserted, error: insertError } = await supabaseAdmin
      .from("body_compositions")
      .insert({
        client_id,
        coach_id,
        measured_at: measured_at || new Date().toISOString().slice(0, 10),
        weight,
        bmi,
        body_fat_pct,
        skeletal_muscle_pct,
        fat_free_mass,
        subcutaneous_fat_pct,
        visceral_fat,
        body_water_pct,
        muscle_mass,
        bone_mass,
        protein_pct,
        bmr,
        metabolic_age,
      })
      .select()
      .single();

    if (insertError) {
      console.error("[body-comp/save] Insert error:", insertError);
      return NextResponse.json(
        { error: insertError.message },
        { status: 500 }
      );
    }

    // Update client's current weight if provided
    if (weight) {
      await supabaseAdmin
        .from("clients")
        .update({
          weight_current: weight,
          updated_at: new Date().toISOString(),
        })
        .eq("id", client_id);
    }

    // Mark scale pic as received for this week
    const weekStart = getCurrentWeekStart();
    const { data: existing } = await supabaseAdmin
      .from("client_weekly_checkins")
      .select("id")
      .eq("client_id", client_id)
      .eq("check_type", "scale_photo")
      .eq("week_start", weekStart)
      .maybeSingle();

    if (!existing) {
      await supabaseAdmin.from("client_weekly_checkins").insert({
        client_id,
        coach_id: user.id,
        check_type: "scale_photo",
        week_start: weekStart,
      });
    }

    // Log activity
    const details = [];
    if (weight) details.push(`Weight: ${weight} lbs`);
    if (body_fat_pct) details.push(`Body Fat: ${body_fat_pct}%`);

    await supabaseAdmin.from("activities").insert({
      coach_id: user.id,
      client_id,
      action: "Uploaded body composition",
      details: details.length > 0 ? details.join(", ") : "Body composition recorded",
    });

    return NextResponse.json({ success: true, data: inserted });
  } catch (err) {
    console.error("[body-comp/save] Unexpected error:", err);
    return NextResponse.json(
      { error: err.message || "Internal server error" },
      { status: 500 }
    );
  }
}
