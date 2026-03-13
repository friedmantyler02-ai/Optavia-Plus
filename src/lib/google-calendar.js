import { createClient } from "@supabase/supabase-js";

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REDIRECT_URI =
  (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000") +
  "/api/auth/google/callback";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export function getAuthUrl(state) {
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: "code",
    scope: "https://www.googleapis.com/auth/calendar.events",
    access_type: "offline",
    prompt: "consent",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export async function exchangeCodeForTokens(code) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      redirect_uri: REDIRECT_URI,
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) {
    const error = await res.text();
    throw new Error(`Token exchange failed: ${error}`);
  }
  return res.json();
}

export async function refreshAccessToken(refreshToken) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) {
    const error = await res.text();
    throw new Error(`Token refresh failed: ${error}`);
  }
  return res.json();
}

export async function getValidToken(coachId) {
  const { data, error } = await supabaseAdmin
    .from("google_calendar_connections")
    .select("access_token, refresh_token, token_expires_at")
    .eq("coach_id", coachId)
    .single();

  if (error || !data) {
    throw new Error("No Google Calendar connection found");
  }

  const expiresAt = new Date(data.token_expires_at);
  if (expiresAt > new Date()) {
    return data.access_token;
  }

  const tokens = await refreshAccessToken(data.refresh_token);
  const newExpiresAt = new Date(
    Date.now() + tokens.expires_in * 1000
  ).toISOString();

  await supabaseAdmin
    .from("google_calendar_connections")
    .update({
      access_token: tokens.access_token,
      token_expires_at: newExpiresAt,
    })
    .eq("coach_id", coachId);

  return tokens.access_token;
}

export async function createCalendarEvent(accessToken, event) {
  const res = await fetch(
    "https://www.googleapis.com/calendar/v3/calendars/primary/events",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(event),
    }
  );
  if (!res.ok) {
    const error = await res.text();
    throw new Error(`Failed to create calendar event: ${error}`);
  }
  return res.json();
}

export async function deleteCalendarEvent(accessToken, eventId) {
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(eventId)}`,
    {
      method: "DELETE",
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );
  if (!res.ok && res.status !== 404) {
    const error = await res.text();
    throw new Error(`Failed to delete calendar event: ${error}`);
  }
}
