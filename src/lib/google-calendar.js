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
// Event builders: Reminder, Lead Follow-up, Client Check-in
// ---------------------------------------------------------------------------
export function buildGoogleEvent(reminder) {
  const time = reminder.due_time || "09:00";
  const startDateTime = `${reminder.due_date}T${time}:00`;
  const startDate = new Date(startDateTime);
  const endDate = new Date(startDate.getTime() + 30 * 60 * 1000);
  const endDateTime = endDate.toISOString().replace("Z", "").split(".")[0];

  return {
    summary: reminder.title,
    description: reminder.notes || "",
    start: { dateTime: startDateTime, timeZone: "America/New_York" },
    end: { dateTime: endDateTime, timeZone: "America/New_York" },
  };
}

export function buildGoogleEventForFollowup(lead) {
  const dateStr = lead.next_followup_date.split("T")[0];
  const startDateTime = `${dateStr}T09:00:00`;
  return {
    summary: `${lead.full_name}: Follow-up`,
    description: "Lead follow-up",
    start: { dateTime: startDateTime, timeZone: "America/New_York" },
    end: { dateTime: `${dateStr}T09:30:00`, timeZone: "America/New_York" },
  };
}

// Maps contact_day display name → RRULE BYDAY code
const CONTACT_DAY_RRULE = {
  Monday: "MO",
  Tuesday: "TU",
  Wednesday: "WE",
  Thursday: "TH",
  Friday: "FR",
};

// Maps contact_day display name → JS getDay() value (0=Sun)
const CONTACT_DAY_DOW = {
  Monday: 1,
  Tuesday: 2,
  Wednesday: 3,
  Thursday: 4,
  Friday: 5,
};

// Returns null if contact_day is missing or unrecognised — caller must skip.
export function buildGoogleEventForCheckin(client) {
  const rruleDay = CONTACT_DAY_RRULE[client.contact_day];
  const targetDow = CONTACT_DAY_DOW[client.contact_day];
  if (!rruleDay || targetDow === undefined) return null;

  // Find the next (or current) occurrence of the target day
  const now = new Date();
  const currentDow = now.getDay();
  let daysUntil = targetDow - currentDow;
  if (daysUntil < 0) daysUntil += 7;
  const nextOccurrence = new Date(now);
  nextOccurrence.setDate(now.getDate() + daysUntil);
  const dateStr = nextOccurrence.toISOString().split("T")[0];

  return {
    summary: `${client.full_name}: Check-in`,
    description: "Weekly client check-in",
    start: { dateTime: `${dateStr}T09:00:00`, timeZone: "America/New_York" },
    end: { dateTime: `${dateStr}T09:30:00`, timeZone: "America/New_York" },
    recurrence: [`RRULE:FREQ=WEEKLY;BYDAY=${rruleDay}`],
  };
}

// ---------------------------------------------------------------------------
// Bulk sync: reminders
// ---------------------------------------------------------------------------
export async function bulkSyncReminders(coachId, accessToken) {
  const { data: reminders, error } = await supabaseAdmin
    .from("reminders")
    .select("id, title, notes, due_date, due_time")
    .eq("coach_id", coachId)
    .is("google_calendar_event_id", null)
    .eq("is_completed", false);

  if (error) {
    console.error("[gcal] Failed to fetch reminders for bulk sync:", error);
    return { synced: 0, failed: 0 };
  }
  if (!reminders || reminders.length === 0) return { synced: 0, failed: 0 };

  let synced = 0, failed = 0;
  for (const reminder of reminders) {
    try {
      const event = buildGoogleEvent(reminder);
      const result = await createCalendarEvent(accessToken, event);
      await supabaseAdmin
        .from("reminders")
        .update({ google_calendar_event_id: result.id })
        .eq("id", reminder.id);
      synced++;
    } catch (err) {
      console.error(`[gcal] Failed to sync reminder ${reminder.id}:`, err.message);
      failed++;
    }
  }
  return { synced, failed };
}

// ---------------------------------------------------------------------------
// Bulk sync: lead follow-ups
// ---------------------------------------------------------------------------
export async function bulkSyncLeadFollowups(coachId, accessToken) {
  const { data: leads, error } = await supabaseAdmin
    .from("leads")
    .select("id, full_name, next_followup_date")
    .eq("coach_id", coachId)
    .neq("stage", "client")
    .not("next_followup_date", "is", null)
    .is("google_calendar_event_id", null);

  if (error) {
    console.error("[gcal] Failed to fetch leads for bulk sync:", error);
    return { synced: 0, failed: 0 };
  }
  if (!leads || leads.length === 0) return { synced: 0, failed: 0 };

  let synced = 0, failed = 0;
  for (const lead of leads) {
    try {
      const event = buildGoogleEventForFollowup(lead);
      const result = await createCalendarEvent(accessToken, event);
      await supabaseAdmin
        .from("leads")
        .update({ google_calendar_event_id: result.id })
        .eq("id", lead.id);
      synced++;
    } catch (err) {
      console.error(`[gcal] Failed to sync lead ${lead.id}:`, err.message);
      failed++;
    }
  }
  return { synced, failed };
}

// ---------------------------------------------------------------------------
// Bulk sync: client weekly check-ins
// ---------------------------------------------------------------------------
export async function bulkSyncClientCheckins(coachId, accessToken) {
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

  const { data: clients, error } = await supabaseAdmin
    .from("clients")
    .select("id, full_name, contact_day")
    .eq("coach_id", coachId)
    .eq("weekly_reminder", true)
    .not("contact_day", "is", null)
    .gte("last_order_date", ninetyDaysAgo.toISOString())
    .is("google_calendar_event_id", null);

  if (error) {
    console.error("[gcal] Failed to fetch clients for bulk sync:", error);
    return { synced: 0, failed: 0 };
  }
  if (!clients || clients.length === 0) return { synced: 0, failed: 0 };

  let synced = 0, failed = 0;
  for (const client of clients) {
    try {
      const event = buildGoogleEventForCheckin(client);
      if (!event) {
        console.warn(`[gcal] Skipping client ${client.id} — unrecognised contact_day: "${client.contact_day}"`);
        continue;
      }
      const result = await createCalendarEvent(accessToken, event);
      await supabaseAdmin
        .from("clients")
        .update({ google_calendar_event_id: result.id })
        .eq("id", client.id);
      synced++;
    } catch (err) {
      console.error(`[gcal] Failed to sync client checkin ${client.id}:`, err.message);
      failed++;
    }
  }
  return { synced, failed };
}

// ---------------------------------------------------------------------------
// Bulk sync all: reminders + lead follow-ups + client check-ins
// ---------------------------------------------------------------------------
export async function bulkSyncAll(coachId, accessTokenOverride) {
  let accessToken = accessTokenOverride || null;
  if (!accessToken) {
    try {
      accessToken = await getValidToken(coachId);
    } catch (err) {
      console.error("[gcal] No valid token for bulk sync, skipping:", err.message);
      return { reminders: { synced: 0, failed: 0 }, leads: { synced: 0, failed: 0 }, clients: { synced: 0, failed: 0 } };
    }
  }

  const [reminders, leads, clients] = await Promise.all([
    bulkSyncReminders(coachId, accessToken),
    bulkSyncLeadFollowups(coachId, accessToken),
    bulkSyncClientCheckins(coachId, accessToken),
  ]);

  const totalSynced = reminders.synced + leads.synced + clients.synced;
  const totalFailed = reminders.failed + leads.failed + clients.failed;
  console.log(`[gcal] Bulk sync all: ${totalSynced} synced, ${totalFailed} failed (reminders: ${reminders.synced}, leads: ${leads.synced}, clients: ${clients.synced})`);

  return { reminders, leads, clients };
}

// ---------------------------------------------------------------------------
// Bulk delete helpers (per table)
// ---------------------------------------------------------------------------
async function bulkDeleteFromTable(tableName, coachId, accessToken) {
  const { data: rows, error } = await supabaseAdmin
    .from(tableName)
    .select("id, google_calendar_event_id")
    .eq("coach_id", coachId)
    .not("google_calendar_event_id", "is", null);

  let deleted = 0, failed = 0;
  const succeededIds = [];

  if (!error && rows && rows.length > 0 && accessToken) {
    for (const row of rows) {
      try {
        await deleteCalendarEvent(accessToken, row.google_calendar_event_id);
        succeededIds.push(row.id);
        deleted++;
      } catch (err) {
        console.error(`[gcal] Failed to delete event for ${tableName} ${row.id}:`, err.message);
        failed++;
      }
    }
  }

  // Only clear IDs for rows whose Google Calendar event was actually deleted.
  // Rows with failed deletes keep their ID so reconnect won't re-create duplicates.
  if (succeededIds.length > 0) {
    await supabaseAdmin
      .from(tableName)
      .update({ google_calendar_event_id: null })
      .in("id", succeededIds);
  }

  if (failed > 0) {
    console.warn(`[gcal] ${failed} event(s) in "${tableName}" could not be deleted from Google Calendar — their IDs are preserved in the DB to prevent duplicate creation on reconnect.`);
  }

  return { deleted, failed };
}

// ---------------------------------------------------------------------------
// Bulk delete all: reminders + lead follow-ups + client check-ins
// ---------------------------------------------------------------------------
export async function bulkDeleteAll(coachId) {
  let accessToken = null;
  try {
    accessToken = await getValidToken(coachId);
  } catch {
    console.log("[gcal] No valid token for bulk delete, clearing IDs only");
  }

  const [reminders, leads, clients] = await Promise.all([
    bulkDeleteFromTable("reminders", coachId, accessToken),
    bulkDeleteFromTable("leads", coachId, accessToken),
    bulkDeleteFromTable("clients", coachId, accessToken),
  ]);

  const totalDeleted = reminders.deleted + leads.deleted + clients.deleted;
  const totalFailed = reminders.failed + leads.failed + clients.failed;
  console.log(`[gcal] Bulk delete all: ${totalDeleted} deleted, ${totalFailed} failed`);

  return { reminders, leads, clients };
}
