import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function POST(request) {
  const { coach_id } = await request.json();

  if (!coach_id) {
    return NextResponse.json(
      { error: "coach_id is required" },
      { status: 400 }
    );
  }

  const { error } = await supabaseAdmin
    .from("gmail_tokens")
    .delete()
    .eq("coach_id", coach_id);

  if (error) {
    console.error("Failed to disconnect Gmail:", error);
    return NextResponse.json(
      { error: "Failed to disconnect" },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}
