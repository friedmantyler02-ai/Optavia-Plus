import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { exchangeCodeForTokens, bulkSyncReminders } from "@/lib/google-calendar";

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

  if (!user || user.id !== state) {
    return NextResponse.redirect(
      new URL("/dashboard/calendar?error=unauthorized", origin)
    );
  }

  try {
    const tokens = await exchangeCodeForTokens(code, origin);
    const expiresAt = new Date(
      Date.now() + tokens.expires_in * 1000
    ).toISOString();

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
        new URL("/dashboard/calendar?error=storage_failed", origin)
      );
    }

    // Bulk sync all existing reminders to Google Calendar
    try {
      const syncResult = await bulkSyncReminders(user.id);
      console.log(`[gcal] Initial sync on connect: ${syncResult.synced} synced, ${syncResult.failed} failed`);
    } catch (err) {
      console.error("[gcal] Bulk sync on connect failed:", err.message);
    }

    return NextResponse.redirect(
      new URL("/dashboard/calendar?connected=true", origin)
    );
  } catch (err) {
    console.error("Google OAuth callback error:", err);
    return NextResponse.redirect(
      new URL("/dashboard/calendar?error=token_exchange_failed", origin)
    );
  }
}
