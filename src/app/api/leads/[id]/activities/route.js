import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";

const CONTACT_ACTIONS = new Set([
  "call",
  "text",
  "email",
  "meeting",
  "facebook_message",
]);

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

    // Verify the lead belongs to this coach
    const { data: lead, error: leadError } = await supabase
      .from("leads")
      .select("id")
      .eq("id", id)
      .eq("coach_id", user.id)
      .single();

    if (leadError || !lead) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    const { data: activities, error } = await supabase
      .from("lead_activities")
      .select("*")
      .eq("lead_id", id)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Lead activities query error:", error);
      return NextResponse.json(
        { error: "Failed to fetch activities" },
        { status: 500 }
      );
    }

    return NextResponse.json({ activities: activities ?? [] });
  } catch (err) {
    console.error("Lead activities GET error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(request, { params }) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    // Verify the lead belongs to this coach
    const { data: lead, error: leadError } = await supabase
      .from("leads")
      .select("id")
      .eq("id", id)
      .eq("coach_id", user.id)
      .single();

    if (leadError || !lead) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    const body = await request.json();
    const { action, details } = body;

    if (!action) {
      return NextResponse.json(
        { error: "action is required" },
        { status: 400 }
      );
    }

    const { data: activity, error } = await supabase
      .from("lead_activities")
      .insert({
        lead_id: id,
        coach_id: user.id,
        action,
        details: details || null,
      })
      .select()
      .single();

    if (error) {
      console.error("Lead activity insert error:", error);
      return NextResponse.json(
        { error: "Failed to create activity" },
        { status: 500 }
      );
    }

    // Update last_contact_date for contact-type actions
    if (CONTACT_ACTIONS.has(action)) {
      await supabase
        .from("leads")
        .update({
          last_contact_date: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .eq("coach_id", user.id);
    }

    return NextResponse.json(activity, { status: 201 });
  } catch (err) {
    console.error("Lead activities POST error:", err);
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
    const { searchParams } = new URL(request.url);
    const activityId = searchParams.get("activityId");

    if (!activityId) {
      return NextResponse.json({ error: "activityId is required" }, { status: 400 });
    }

    const { error } = await supabase
      .from("lead_activities")
      .delete()
      .eq("id", activityId)
      .eq("coach_id", user.id)
      .eq("lead_id", id);

    if (error) {
      console.error("Lead activity delete error:", error);
      return NextResponse.json({ error: "Failed to delete activity" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Lead activities DELETE error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
