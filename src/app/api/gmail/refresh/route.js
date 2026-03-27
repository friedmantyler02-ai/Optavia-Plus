import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;

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

  const { data, error } = await supabaseAdmin
    .from("gmail_tokens")
    .select("refresh_token")
    .eq("coach_id", coach_id)
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: "No Gmail connection found" },
      { status: 404 }
    );
  }

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: data.refresh_token,
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      grant_type: "refresh_token",
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error("Gmail token refresh failed:", errText);
    return NextResponse.json(
      { error: "Token refresh failed" },
      { status: 500 }
    );
  }

  const tokens = await res.json();
  const newExpiry = new Date(
    Date.now() + tokens.expires_in * 1000
  ).toISOString();

  await supabaseAdmin
    .from("gmail_tokens")
    .update({
      access_token: tokens.access_token,
      token_expiry: newExpiry,
    })
    .eq("coach_id", coach_id);

  return NextResponse.json({ access_token: tokens.access_token });
}
