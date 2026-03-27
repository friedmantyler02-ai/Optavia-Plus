import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import {
  getValidToken,
  createCalendarEvent,
  updateCalendarEvent,
  deleteCalendarEvent,
} from "@/lib/google-calendar";

const supabaseAdmin = createAdminClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ─── Maps ────────────────────────────────────────────────────────────────────
const DAY_TO_RRULE = {
  Monday: "MO", Tuesday: "TU", Wednesday: "WE", Thursday: "TH", Friday: "FR",
};
const DAY_TO_DOW = {
  Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5,
};
const ORDINAL_NUM = { "1st": 1, "2nd": 2, "3rd": 3, "4th": 4 };

// ─── Helpers ─────────────────────────────────────────────────────────────────
function buildRrule({ frequency, day_of_week, monthly_ordinal, monthly_day }) {
  if (frequency === "weekly") {
    return `RRULE:FREQ=WEEKLY;BYDAY=${DAY_TO_RRULE[day_of_week]}`;
  }
  if (frequency === "biweekly") {
    return `RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=${DAY_TO_RRULE[day_of_week]}`;
  }
  if (frequency === "monthly") {
    const n = ORDINAL_NUM[monthly_ordinal] || 1;
    return `RRULE:FREQ=MONTHLY;BYDAY=${n}${DAY_TO_RRULE[monthly_day]}`;
  }
  return null;
}

function addMinutes(timeStr, mins) {
  const [h, m] = timeStr.split(":").map(Number);
  const total = h * 60 + m + mins;
  return `${String(Math.floor(total / 60) % 24).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

function getFirstOccurrence({ frequency, day_of_week, monthly_ordinal, monthly_day }) {
  const now = new Date();
  now.setHours(0, 0, 0, 0);

  if (frequency === "monthly") {
    const dow = DAY_TO_DOW[monthly_day];
    const n = ORDINAL_NUM[monthly_ordinal] || 1;
    // Try current month, then next two months
    for (let offset = 0; offset <= 2; offset++) {
      const year = now.getFullYear();
      const month = now.getMonth() + offset;
      let count = 0;
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      for (let d = 1; d <= daysInMonth; d++) {
        const date = new Date(year, month, d);
        if (date.getDay() === dow) {
          count++;
          if (count === n) {
            if (date >= now) return date;
            break;
          }
        }
      }
    }
    return now;
  }

  // Weekly / biweekly: next occurrence of the target day
  const targetDow = DAY_TO_DOW[day_of_week];
  const currentDow = now.getDay();
  let daysUntil = targetDow - currentDow;
  if (daysUntil < 0) daysUntil += 7;
  const next = new Date(now);
  next.setDate(now.getDate() + daysUntil);
  return next;
}

function buildGCalEvent(reminder, clientName) {
  const rrule = buildRrule(reminder);
  if (!rrule) return null;

  const first = getFirstOccurrence(reminder);
  const dateStr = first.toISOString().split("T")[0];
  const title = clientName ? `${clientName}: ${reminder.title}` : reminder.title;

  if (reminder.is_all_day || !reminder.reminder_time) {
    // All-day: GCal end date is exclusive (next day)
    const endDate = new Date(first);
    endDate.setDate(endDate.getDate() + 1);
    return {
      summary: title,
      start: { date: dateStr },
      end: { date: endDate.toISOString().split("T")[0] },
      recurrence: [rrule],
    };
  }

  const time = reminder.reminder_time.slice(0, 5);
  return {
    summary: title,
    start: { dateTime: `${dateStr}T${time}:00`, timeZone: "America/New_York" },
    end: { dateTime: `${dateStr}T${addMinutes(time, 30)}:00`, timeZone: "America/New_York" },
    recurrence: [rrule],
  };
}

// ─── POST — create ────────────────────────────────────────────────────────────
export async function POST(request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json();
    const {
      title, client_id, client_name,
      frequency, day_of_week,
      monthly_ordinal, monthly_day,
      is_all_day, reminder_time,
    } = body;

    if (!title?.trim()) return NextResponse.json({ error: "title is required" }, { status: 400 });
    if (!frequency) return NextResponse.json({ error: "frequency is required" }, { status: 400 });

    const allDay = is_all_day !== false;

    const { data: reminder, error: insertErr } = await supabaseAdmin
      .from("recurring_reminders")
      .insert({
        coach_id: user.id,
        client_id: client_id || null,
        title: title.trim(),
        frequency,
        day_of_week: day_of_week || null,
        monthly_ordinal: monthly_ordinal || null,
        monthly_day: monthly_day || null,
        is_all_day: allDay,
        has_time: !allDay,
        reminder_time: allDay ? null : (reminder_time || null),
      })
      .select()
      .single();

    if (insertErr) {
      console.error("recurring_reminders insert error:", insertErr);
      return NextResponse.json({ error: "Failed to create recurring reminder" }, { status: 500 });
    }

    // Sync to Google Calendar if connected
    try {
      const accessToken = await getValidToken(user.id);
      const event = buildGCalEvent(reminder, client_name || null);
      if (event) {
        const result = await createCalendarEvent(accessToken, event);
        await supabaseAdmin
          .from("recurring_reminders")
          .update({ google_calendar_event_id: result.id })
          .eq("id", reminder.id);
        reminder.google_calendar_event_id = result.id;
      }
    } catch (err) {
      if (!err.message?.includes("No Google Calendar connection")) {
        console.error("[gcal] Failed to sync recurring reminder:", err.message);
      }
    }

    return NextResponse.json(reminder, { status: 201 });
  } catch (err) {
    console.error("recurring POST error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ─── PATCH — update ───────────────────────────────────────────────────────────
export async function PATCH(request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json();
    const {
      id, title, client_id, client_name,
      frequency, day_of_week,
      monthly_ordinal, monthly_day,
      is_all_day, reminder_time,
    } = body;

    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

    const allDay = is_all_day !== false;

    const { data: reminder, error: updateErr } = await supabaseAdmin
      .from("recurring_reminders")
      .update({
        title: title?.trim(),
        client_id: client_id || null,
        frequency,
        day_of_week: day_of_week || null,
        monthly_ordinal: monthly_ordinal || null,
        monthly_day: monthly_day || null,
        is_all_day: allDay,
        has_time: !allDay,
        reminder_time: allDay ? null : (reminder_time || null),
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("coach_id", user.id)
      .select()
      .single();

    if (updateErr) {
      return NextResponse.json({ error: "Failed to update recurring reminder" }, { status: 500 });
    }

    // Update Google Calendar if linked
    if (reminder.google_calendar_event_id) {
      try {
        const accessToken = await getValidToken(user.id);
        const event = buildGCalEvent(reminder, client_name || null);
        if (event) {
          await updateCalendarEvent(accessToken, reminder.google_calendar_event_id, event);
        }
      } catch (err) {
        console.error("[gcal] Failed to update recurring reminder in GCal:", err.message);
      }
    }

    return NextResponse.json(reminder);
  } catch (err) {
    console.error("recurring PATCH error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ─── DELETE ───────────────────────────────────────────────────────────────────
export async function DELETE(request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await request.json();
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

    // Fetch event ID before deleting
    const { data: reminder } = await supabaseAdmin
      .from("recurring_reminders")
      .select("google_calendar_event_id")
      .eq("id", id)
      .eq("coach_id", user.id)
      .single();

    if (reminder?.google_calendar_event_id) {
      try {
        const accessToken = await getValidToken(user.id);
        await deleteCalendarEvent(accessToken, reminder.google_calendar_event_id);
      } catch (err) {
        console.error("[gcal] Failed to delete recurring reminder from GCal:", err.message);
      }
    }

    const { error: deleteErr } = await supabaseAdmin
      .from("recurring_reminders")
      .delete()
      .eq("id", id)
      .eq("coach_id", user.id);

    if (deleteErr) {
      return NextResponse.json({ error: "Failed to delete recurring reminder" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("recurring DELETE error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
