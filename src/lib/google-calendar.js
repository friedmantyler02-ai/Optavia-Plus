import { createClient } from "@supabase/supabase-js";

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;

function getRedirectUri(origin) {
  return origin + "/api/auth/google/callback";
}

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export function getAuthUrl(state, origin) {
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: getRedirectUri(origin),
    response_type: "code",
    scope: "https://www.googleapis.com/auth/calendar.events",
    access_type: "offline",
    prompt: "consent",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export async function exchangeCodeForTokens(code, origin) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      redirect_uri: getRedirectUri(origin),
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

export async function updateCalendarEvent(accessToken, eventId, event) {
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(eventId)}`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(event),
    }
  );
  if (!res.ok) {
    const error = await res.text();
    throw new Error(`Failed to update calendar event: ${error}`);
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

// ---------------------------------------------------------------------------
// Reminder ↔ Google Calendar event conversion
// ---------------------------------------------------------------------------
export function buildGoogleEvent(reminder) {
  const time = reminder.due_time || "09:00";
  const startDateTime = `${reminder.due_date}T${time}:00`;
  const startDate = new Date(startDateTime);
  const endDate = new Date(startDate.getTime() + 30 * 60 * 1000); // 30 min default
  const endDateTime = endDate.toISOString().replace("Z", "").split(".")[0];

  return {
    summary: reminder.title,
    description: reminder.notes || "",
    start: { dateTime: startDateTime, timeZone: "America/New_York" },
    end: { dateTime: endDateTime, timeZone: "America/New_York" },
  };
}

// ---------------------------------------------------------------------------
// Bulk sync: create Google Calendar events for all unsynced reminders
// ---------------------------------------------------------------------------
export async function bulkSyncReminders(coachId, accessTokenOverride) {
  console.log(`[gcal] bulkSyncReminders called for coach ${coachId}, tokenOverride: ${!!accessTokenOverride}`);
  let accessToken = accessTokenOverride || null;

  if (!accessToken) {
    try {
      accessToken = await getValidToken(coachId);
      console.log("[gcal] Got valid token from DB for bulk sync");
    } catch (err) {
      console.error("[gcal] No valid token for bulk sync, skipping:", err.message);
      return { synced: 0, failed: 0, errors: [] };
    }
  }

  const { data: reminders, error } = await supabaseAdmin
    .from("reminders")
    .select("id, title, notes, due_date, due_time")
    .eq("coach_id", coachId)
    .is("google_calendar_event_id", null)
    .eq("is_completed", false);

  if (error) {
    console.error("[gcal] Failed to fetch reminders for bulk sync:", error);
    return { synced: 0, failed: 0, errors: [] };
  }

  console.log(`[gcal] Found ${reminders?.length || 0} unsynced reminders for coach ${coachId}`);

  if (!reminders || reminders.length === 0) {
    return { synced: 0, failed: 0, errors: [] };
  }

  let synced = 0;
  let failed = 0;
  const errors = [];

  for (const reminder of reminders) {
    try {
      const event = buildGoogleEvent(reminder);
      console.log(`[gcal] Creating event for reminder ${reminder.id}: "${reminder.title}" on ${reminder.due_date}`);
      const result = await createCalendarEvent(accessToken, event);
      console.log(`[gcal] Created Google event ${result.id} for reminder ${reminder.id}`);
      const { error: updateErr } = await supabaseAdmin
        .from("reminders")
        .update({ google_calendar_event_id: result.id })
        .eq("id", reminder.id);
      if (updateErr) {
        console.error(`[gcal] Failed to store event ID for reminder ${reminder.id}:`, updateErr);
      }
      synced++;
    } catch (err) {
      console.error(`[gcal] Failed to sync reminder ${reminder.id}:`, err.message);
      errors.push({ reminderId: reminder.id, error: err.message });
      failed++;
    }
  }

  console.log(`[gcal] Bulk sync complete: ${synced} synced, ${failed} failed`);
  return { synced, failed, errors };
}

// ---------------------------------------------------------------------------
// Bulk delete: remove all Google Calendar events for a coach's reminders
// ---------------------------------------------------------------------------
export async function bulkDeleteReminders(coachId) {
  let accessToken;
  try {
    accessToken = await getValidToken(coachId);
  } catch {
    console.log("[gcal] No valid token for bulk delete, skipping event cleanup");
    // Still clear the IDs even if we can't delete from Google
    await supabaseAdmin
      .from("reminders")
      .update({ google_calendar_event_id: null })
      .eq("coach_id", coachId)
      .not("google_calendar_event_id", "is", null);
    return { deleted: 0, failed: 0, errors: [] };
  }

  const { data: reminders, error } = await supabaseAdmin
    .from("reminders")
    .select("id, google_calendar_event_id")
    .eq("coach_id", coachId)
    .not("google_calendar_event_id", "is", null);

  if (error || !reminders || reminders.length === 0) {
    if (error) console.error("[gcal] Failed to fetch reminders for bulk delete:", error);
    return { deleted: 0, failed: 0, errors: [] };
  }

  let deleted = 0;
  let failed = 0;
  const errors = [];

  for (const reminder of reminders) {
    try {
      await deleteCalendarEvent(accessToken, reminder.google_calendar_event_id);
      deleted++;
    } catch (err) {
      console.error(`[gcal] Failed to delete event for reminder ${reminder.id}:`, err.message);
      errors.push({ reminderId: reminder.id, error: err.message });
      failed++;
    }
  }

  // Clear all event IDs regardless of delete success
  await supabaseAdmin
    .from("reminders")
    .update({ google_calendar_event_id: null })
    .eq("coach_id", coachId)
    .not("google_calendar_event_id", "is", null);

  console.log(`[gcal] Bulk delete complete: ${deleted} deleted, ${failed} failed`);
  return { deleted, failed, errors };
}
