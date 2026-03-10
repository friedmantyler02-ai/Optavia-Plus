import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";

export async function PATCH(request, { params }) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const now = new Date().toISOString();

    const { error } = await supabase
      .from("clients")
      .update({ last_checkin_date: now, updated_at: now })
      .eq("id", id)
      .eq("coach_id", user.id);

    if (error) {
      console.error("Checkin error:", error);
      return NextResponse.json({ error: "Failed to check in" }, { status: 500 });
    }

    await supabase.from("activities").insert({
      coach_id: user.id,
      client_id: id,
      action: "Logged a check-in",
      details: "Weekly check-in completed",
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Checkin PATCH error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
