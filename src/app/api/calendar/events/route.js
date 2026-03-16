import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";

export async function GET(request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const month = searchParams.get("month"); // YYYY-MM
    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return NextResponse.json({ error: "month param required (YYYY-MM)" }, { status: 400 });
    }

    const [year, mon] = month.split("-").map(Number);
    const startDate = `${month}-01`;
    // Last day of month
    const endDate = new Date(year, mon, 0).toISOString().split("T")[0];

    const events = [];

    // 1. Lead follow-ups
    const { data: leads, error: leadsErr } = await supabase
      .from("leads")
      .select("id, full_name, next_followup_date, stage")
      .eq("coach_id", user.id)
      .neq("stage", "client")
      .gte("next_followup_date", startDate)
      .lte("next_followup_date", endDate + "T23:59:59")
      .not("next_followup_date", "is", null);

    if (leadsErr) console.error("Calendar leads error:", leadsErr);

    (leads ?? []).forEach((lead) => {
      const date = lead.next_followup_date.split("T")[0];
      events.push({
        id: `followup-${lead.id}`,
        type: "lead_followup",
        date,
        title: lead.full_name,
        subtitle: "Follow-up",
        leadId: lead.id,
        isCompleted: false,
      });
    });

    // 2. Client check-ins (weekly_reminder = true)
    const DAY_MAP = { Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5 };

    const { data: clients, error: clientsErr } = await supabase
      .from("clients")
      .select("id, full_name, last_checkin_date, contact_day, weekly_reminder")
      .eq("coach_id", user.id)
      .eq("weekly_reminder", true);

    if (clientsErr) console.error("Calendar clients error:", clientsErr);

    (clients ?? []).forEach((client) => {
      const monthStart = new Date(year, mon - 1, 1);
      const monthEnd = new Date(year, mon, 0);

      // Use the client's chosen contact_day, default to Monday
      const targetDow = DAY_MAP[client.contact_day] ?? 1; // 1=Monday default

      // Find the first occurrence of the target day in this month
      let current = new Date(monthStart);
      const startDow = current.getDay(); // 0=Sun
      let daysUntil = targetDow - startDow;
      if (daysUntil < 0) daysUntil += 7;
      current.setDate(current.getDate() + daysUntil);

      while (current <= monthEnd) {
        const dateStr = current.toISOString().split("T")[0];

        // Check if completed: last_checkin_date falls in the same week (±3 days of contact day)
        let isCompleted = false;
        if (client.last_checkin_date) {
          const checkinDate = new Date(client.last_checkin_date);
          const weekStart = new Date(current);
          weekStart.setDate(weekStart.getDate() - 3);
          const weekEnd = new Date(current);
          weekEnd.setDate(weekEnd.getDate() + 3);
          isCompleted = checkinDate >= weekStart && checkinDate <= weekEnd;
        }

        events.push({
          id: `checkin-${client.id}-${dateStr}`,
          type: "client_checkin",
          date: dateStr,
          title: client.full_name,
          subtitle: `Weekly check-in · ${client.contact_day || "Monday"}`,
          clientId: client.id,
          isCompleted,
        });

        current.setDate(current.getDate() + 7);
      }
    });

    // 3. Custom reminders
    const { data: reminders, error: remindersErr } = await supabase
      .from("reminders")
      .select("*")
      .eq("coach_id", user.id)
      .gte("due_date", startDate)
      .lte("due_date", endDate);

    if (remindersErr) console.error("Calendar reminders error:", remindersErr);

    (reminders ?? []).forEach((r) => {
      events.push({
        id: r.id,
        type: "reminder",
        date: r.due_date,
        title: r.title,
        subtitle: r.notes || "Reminder",
        clientId: r.client_id,
        leadId: r.lead_id,
        isCompleted: r.is_completed,
        dueTime: r.due_time,
      });
    });

    // Sort by date ASC
    events.sort((a, b) => a.date.localeCompare(b.date));

    return NextResponse.json({ events, month });
  } catch (err) {
    console.error("Calendar events GET error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
