import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";

export async function POST(request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { title, notes, due_date, due_time, client_id, lead_id } = body;

    if (!title || !title.trim()) {
      return NextResponse.json({ error: "title is required" }, { status: 400 });
    }
    if (!due_date) {
      return NextResponse.json({ error: "due_date is required" }, { status: 400 });
    }

    const { data: reminder, error } = await supabase
      .from("reminders")
      .insert({
        coach_id: user.id,
        title: title.trim(),
        notes: notes || null,
        due_date,
        due_time: due_time || null,
        client_id: client_id || null,
        lead_id: lead_id || null,
      })
      .select()
      .single();

    if (error) {
      console.error("Reminder insert error:", error);
      return NextResponse.json({ error: "Failed to create reminder" }, { status: 500 });
    }

    return NextResponse.json(reminder, { status: 201 });
  } catch (err) {
    console.error("Reminders POST error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { id, is_completed, title, notes, due_date, due_time } = body;

    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const updates = { updated_at: new Date().toISOString() };

    if (is_completed === true) {
      updates.is_completed = true;
      updates.completed_at = new Date().toISOString();
    } else if (is_completed === false) {
      updates.is_completed = false;
      updates.completed_at = null;
    }

    if (title !== undefined) updates.title = title;
    if (notes !== undefined) updates.notes = notes;
    if (due_date !== undefined) updates.due_date = due_date;
    if (due_time !== undefined) updates.due_time = due_time;

    const { data: reminder, error } = await supabase
      .from("reminders")
      .update(updates)
      .eq("id", id)
      .eq("coach_id", user.id)
      .select()
      .single();

    if (error) {
      console.error("Reminder update error:", error);
      return NextResponse.json({ error: "Failed to update reminder" }, { status: 500 });
    }

    return NextResponse.json(reminder);
  } catch (err) {
    console.error("Reminders PATCH error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { id } = body;

    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const { error } = await supabase
      .from("reminders")
      .delete()
      .eq("id", id)
      .eq("coach_id", user.id);

    if (error) {
      console.error("Reminder delete error:", error);
      return NextResponse.json({ error: "Failed to delete reminder" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Reminders DELETE error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
