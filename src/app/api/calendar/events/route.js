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

    // 2. Client check-ins (wants_weekly_checkin = true, active within 90 days)
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    const { data: clients, error: clientsErr } = await supabase
      .from("clients")
      .select("id, full_name, last_checkin_date, last_order_date, wants_weekly_checkin")
      .eq("coach_id", user.id)
      .eq("wants_weekly_checkin", true)
      .gte("last_order_date", ninetyDaysAgo.toISOString());

    if (clientsErr) console.error("Calendar clients error:", clientsErr);

    (clients ?? []).forEach((client) => {
      // Generate weekly dates within the requested month
      const monthStart = new Date(year, mon - 1, 1);
      const monthEnd = new Date(year, mon, 0);

      // Start from the beginning of the month, find each Monday (or start of week)
      // Use simple approach: generate one event per 7-day interval from month start
      let current = new Date(monthStart);
      // Advance to the first Monday of the month (or use Sunday as start)
      const dayOfWeek = current.getDay(); // 0=Sun
      if (dayOfWeek !== 1) {
        // advance to next Monday
        const daysUntilMonday = dayOfWeek === 0 ? 1 : 8 - dayOfWeek;
        current.setDate(current.getDate() + daysUntilMonday);
      }

      while (current <= monthEnd) {
        const dateStr = current.toISOString().split("T")[0];

        // Check if completed: last_checkin_date falls in the same ISO week
        let isCompleted = false;
        if (client.last_checkin_date) {
          const checkinDate = new Date(client.last_checkin_date);
          const weekStart = new Date(current);
          const weekEnd = new Date(current);
          weekEnd.setDate(weekEnd.getDate() + 6);
          isCompleted = checkinDate >= weekStart && checkinDate <= weekEnd;
        }

        events.push({
          id: `checkin-${client.id}-${dateStr}`,
          type: "client_checkin",
          date: dateStr,
          title: client.full_name,
          subtitle: "Weekly check-in",
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
