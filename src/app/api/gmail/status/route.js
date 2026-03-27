import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function GET(request) {
  const coachId = new URL(request.url).searchParams.get("coach_id");

  if (!coachId) {
    return NextResponse.json(
      { error: "coach_id is required" },
      { status: 400 }
    );
  }

  const { data, error } = await supabaseAdmin
    .from("gmail_tokens")
    .select("gmail_address")
    .eq("coach_id", coachId)
    .maybeSingle();

  if (error) {
    console.error("Failed to check Gmail status:", error);
    return NextResponse.json(
      { connected: false, gmail_address: null },
      { status: 200 }
    );
  }

  return NextResponse.json({
    connected: !!data,
    gmail_address: data?.gmail_address || null,
  });
}
