import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getValidToken, createCalendarEvent } from "@/lib/google-calendar";

export async function POST(request) {
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

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { summary, description, date, time, durationMinutes = 30 } =
    await request.json();

  let accessToken;
  try {
    accessToken = await getValidToken(user.id);
  } catch {
    return NextResponse.json(
      { error: "Google Calendar not connected" },
      { status: 400 }
    );
  }

  const startDateTime = `${date}T${time || "09:00"}:00`;
  const startDate = new Date(startDateTime);
  const endDate = new Date(startDate.getTime() + durationMinutes * 60 * 1000);
  const endDateTime = endDate.toISOString().replace("Z", "").split(".")[0];

  const event = {
    summary,
    description: description || "",
    start: {
      dateTime: startDateTime,
      timeZone: "America/New_York",
    },
    end: {
      dateTime: endDateTime,
      timeZone: "America/New_York",
    },
  };

  try {
    const result = await createCalendarEvent(accessToken, event);
    return NextResponse.json({ success: true, eventId: result.id });
  } catch (err) {
    console.error("Failed to create Google Calendar event:", err);
    return NextResponse.json(
      { error: "Failed to create event" },
      { status: 500 }
    );
  }
}
