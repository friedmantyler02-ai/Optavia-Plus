import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";

export async function GET(request, { params }) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    const { data: lead, error: leadError } = await supabase
      .from("leads")
      .select("*")
      .eq("id", id)
      .single();

    if (leadError || !lead) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    const { data: activities, error: actError } = await supabase
      .from("lead_activities")
      .select("*")
      .eq("lead_id", id)
      .order("created_at", { ascending: false })
      .limit(50);

    if (actError) {
      console.error("Lead activities query error:", actError);
    }

    return NextResponse.json({
      lead,
      activities: activities ?? [],
    });
  } catch (err) {
    console.error("Lead GET error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

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
    const body = await request.json();

    // Remove fields that should not be updated directly
    delete body.id;
    delete body.coach_id;
    delete body.created_at;

    // If stage is changing, fetch current lead to record the change
    let oldStage = null;
    if (body.stage) {
      const { data: current } = await supabase
        .from("leads")
        .select("stage")
        .eq("id", id)
        .single();

      if (current && current.stage !== body.stage) {
        oldStage = current.stage;
      }
    }

    body.updated_at = new Date().toISOString();

    const { data: lead, error } = await supabase
      .from("leads")
      .update(body)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      console.error("Lead update error:", error);
      return NextResponse.json(
        { error: "Failed to update lead" },
        { status: 500 }
      );
    }

    if (!lead) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    // Log stage change as an activity
    if (oldStage) {
      await supabase.from("lead_activities").insert({
        lead_id: id,
        coach_id: user.id,
        action: "stage_change",
        details: `Stage changed from ${oldStage} to ${body.stage}`,
      });
    }

    return NextResponse.json(lead);
  } catch (err) {
    console.error("Lead PATCH error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function DELETE(request, { params }) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    const { error } = await supabase.from("leads").delete().eq("id", id);

    if (error) {
      console.error("Lead delete error:", error);
      return NextResponse.json(
        { error: "Failed to delete lead" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Lead DELETE error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
