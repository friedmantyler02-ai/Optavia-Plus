import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { exchangeCodeForTokens, bulkSyncAll } from "@/lib/google-calendar";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function GET(request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const state = requestUrl.searchParams.get("state");
  const origin = requestUrl.origin;

  if (!code || !state) {
    return NextResponse.redirect(
      new URL("/dashboard/calendar?error=missing_params", origin)
    );
  }

  const cookieStore = await cookies();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Ignored in Server Components
          }
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Parse state — supports both legacy (plain user ID) and new (JSON) formats
  let stateUid = state;
  let from = "calendar";
  try {
    const parsed = JSON.parse(state);
    stateUid = parsed.uid;
    from = parsed.from || "calendar";
  } catch {
    // Legacy plain UID format — stateUid is already set
  }

  if (!user || user.id !== stateUid) {
    return NextResponse.redirect(
      new URL("/dashboard/calendar?error=unauthorized", origin)
    );
  }

  const redirectBase = from === "outreach" ? "/dashboard/outreach" : "/dashboard/calendar";

  try {
    const tokens = await exchangeCodeForTokens(code, origin);
    const expiresAt = new Date(
      Date.now() + tokens.expires_in * 1000
    ).toISOString();

    // Store Calendar tokens
    const { error } = await supabaseAdmin
      .from("google_calendar_connections")
      .upsert(
        {
          coach_id: user.id,
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
          token_expires_at: expiresAt,
          calendar_id: "primary",
        },
        { onConflict: "coach_id" }
      );

    if (error) {
      console.error("Failed to store Google Calendar tokens:", error);
      return NextResponse.redirect(
        new URL(`${redirectBase}?error=storage_failed`, origin)
      );
    }

    // Fetch Gmail address from Google userinfo
    let gmailAddress = null;
    try {
      const userinfoRes = await fetch(
        "https://www.googleapis.com/oauth2/v2/userinfo",
        { headers: { Authorization: `Bearer ${tokens.access_token}` } }
      );
      if (userinfoRes.ok) {
        const userinfo = await userinfoRes.json();
        gmailAddress = userinfo.email;
      }
    } catch (err) {
      console.error("Failed to fetch Google userinfo:", err.message);
    }

    // Store Gmail tokens
    const { error: gmailError } = await supabaseAdmin
      .from("gmail_tokens")
      .upsert(
        {
          coach_id: user.id,
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
          token_expiry: expiresAt,
          gmail_address: gmailAddress,
        },
        { onConflict: "coach_id" }
      );

    if (gmailError) {
      console.error("Failed to store Gmail tokens:", gmailError);
      // Non-fatal — Calendar still works
    }

    // Bulk sync all existing events to Google Calendar
    // Pass the fresh access token directly to avoid DB re-read race condition
    try {
      console.log(`[gcal] Starting bulk sync on connect for coach ${user.id}`);
      const syncResult = await bulkSyncAll(user.id, tokens.access_token);
      console.log(`[gcal] Initial sync on connect complete`, JSON.stringify(syncResult));
    } catch (err) {
      console.error("[gcal] Bulk sync on connect failed:", err.message, err.stack);
    }

    return NextResponse.redirect(
      new URL(`${redirectBase}?connected=true`, origin)
    );
  } catch (err) {
    console.error("Google OAuth callback error:", err);
    return NextResponse.redirect(
      new URL(`${redirectBase}?error=token_exchange_failed`, origin)
    );
  }
}
