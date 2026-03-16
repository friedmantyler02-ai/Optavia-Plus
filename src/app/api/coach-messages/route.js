/*
 * SQL Migration — run in Supabase SQL Editor:
 *
 * CREATE TABLE coach_messages (
 *   id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 *   coach_id uuid REFERENCES coaches(id) NOT NULL,
 *   category text NOT NULL CHECK (category IN ('reengagement', 'checkin', 'celebrations', 'seasonal')),
 *   message_text text NOT NULL,
 *   created_at timestamptz DEFAULT now(),
 *   updated_at timestamptz DEFAULT now()
 * );
 *
 * ALTER TABLE coach_messages ENABLE ROW LEVEL SECURITY;
 *
 * CREATE POLICY "Coaches can view own messages"
 *   ON coach_messages FOR SELECT
 *   USING (coach_id = auth.uid());
 *
 * CREATE POLICY "Coaches can insert own messages"
 *   ON coach_messages FOR INSERT
 *   WITH CHECK (coach_id = auth.uid());
 *
 * CREATE POLICY "Coaches can update own messages"
 *   ON coach_messages FOR UPDATE
 *   USING (coach_id = auth.uid());
 *
 * CREATE POLICY "Coaches can delete own messages"
 *   ON coach_messages FOR DELETE
 *   USING (coach_id = auth.uid());
 *
 * CREATE INDEX idx_coach_messages_coach_id ON coach_messages(coach_id);
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";

async function getAuthUser(supabase) {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) return null;
  return user;
}

export async function GET() {
  try {
    const supabase = await createClient();
    const user = await getAuthUser(supabase);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data, error } = await supabase
      .from("coach_messages")
      .select("*")
      .eq("coach_id", user.id)
      .order("created_at", { ascending: false });

    if (error) throw error;

    return NextResponse.json({ data });
  } catch (err) {
    console.error("GET /api/coach-messages error:", err);
    return NextResponse.json(
      { error: "Failed to fetch messages" },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  try {
    const supabase = await createClient();
    const user = await getAuthUser(supabase);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { category, message_text } = await request.json();

    if (!category || !message_text?.trim()) {
      return NextResponse.json(
        { error: "category and message_text are required" },
        { status: 400 }
      );
    }

    const validCategories = [
      "reengagement",
      "checkin",
      "celebrations",
      "seasonal",
    ];
    if (!validCategories.includes(category)) {
      return NextResponse.json(
        { error: "Invalid category" },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("coach_messages")
      .insert({
        coach_id: user.id,
        category,
        message_text: message_text.trim(),
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ data }, { status: 201 });
  } catch (err) {
    console.error("POST /api/coach-messages error:", err);
    return NextResponse.json(
      { error: "Failed to create message" },
      { status: 500 }
    );
  }
}

export async function PUT(request) {
  try {
    const supabase = await createClient();
    const user = await getAuthUser(supabase);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id, message_text } = await request.json();

    if (!id || !message_text?.trim()) {
      return NextResponse.json(
        { error: "id and message_text are required" },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("coach_messages")
      .update({
        message_text: message_text.trim(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("coach_id", user.id)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ data });
  } catch (err) {
    console.error("PUT /api/coach-messages error:", err);
    return NextResponse.json(
      { error: "Failed to update message" },
      { status: 500 }
    );
  }
}

export async function DELETE(request) {
  try {
    const supabase = await createClient();
    const user = await getAuthUser(supabase);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await request.json();

    if (!id) {
      return NextResponse.json(
        { error: "id is required" },
        { status: 400 }
      );
    }

    const { error } = await supabase
      .from("coach_messages")
      .delete()
      .eq("id", id)
      .eq("coach_id", user.id);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("DELETE /api/coach-messages error:", err);
    return NextResponse.json(
      { error: "Failed to delete message" },
      { status: 500 }
    );
  }
}
