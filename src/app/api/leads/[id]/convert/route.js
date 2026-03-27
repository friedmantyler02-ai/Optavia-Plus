import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { getValidToken, deleteCalendarEvent } from "@/lib/google-calendar";

const supabaseAdmin = createSupabaseClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function POST(request, { params }) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    // Fetch the lead
    const { data: lead, error: leadErr } = await supabase
      .from("leads")
      .select("*")
      .eq("id", id)
      .eq("coach_id", user.id)
      .single();

    if (leadErr || !lead) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    if (lead.stage !== "client") {
      return NextResponse.json(
        { error: "Lead must be at Client stage to convert" },
        { status: 400 }
      );
    }

    // Returning past client: lead came from a lapsed client profile
    const isReturningClient = lead.source === "past_client" && lead.converted_client_id;

    if (isReturningClient) {
      const originalClientId = lead.converted_client_id;

      // Verify the original client exists and belongs to this coach
      const { data: existingClient, error: clientFetchErr } = await supabase
        .from("clients")
        .select("id, full_name")
        .eq("id", originalClientId)
        .eq("coach_id", user.id)
        .single();

      if (clientFetchErr || !existingClient) {
        // Fall through to normal convert if original client not found
      } else {
        // Reactivate the original client
        await supabase
          .from("clients")
          .update({
            status: "active",
            moved_to_lead_id: null,
            is_returning_client: true,
            last_contact_date: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", originalClientId)
          .eq("coach_id", user.id);

        // Log activity on the client
        await supabase.from("activities").insert({
          coach_id: user.id,
          client_id: originalClientId,
          action: "Returned from leads pipeline — now active client",
          details: existingClient.full_name,
        });

        // Delete follow-up calendar event (best-effort)
        if (lead.google_calendar_event_id) {
          try {
            const accessToken = await getValidToken(user.id);
            await deleteCalendarEvent(accessToken, lead.google_calendar_event_id);
          } catch (err) {
            console.error("[gcal] Failed to delete lead event on returning convert:", err.message);
          }
        }

        // Delete the lead record
        await supabase.from("leads").delete().eq("id", id).eq("coach_id", user.id);

        return NextResponse.json({
          success: true,
          client_id: originalClientId,
          returning: true,
        });
      }
    }

    // Normal convert: lead was NOT from a past client
    // Guard against already-converted leads (converted_client_id set by normal flow)
    if (lead.converted_client_id && !isReturningClient) {
      return NextResponse.json(
        { error: "Lead already converted" },
        { status: 400 }
      );
    }

    // Create new client record
    const { data: newClient, error: clientErr } = await supabase
      .from("clients")
      .insert({
        coach_id: user.id,
        full_name: lead.full_name,
        email: lead.email || null,
        phone: lead.phone || null,
        status: "new",
        notes: lead.notes || null,
        start_date: new Date().toISOString(),
        last_contact_date: lead.last_contact_date || null,
      })
      .select()
      .single();

    if (clientErr) {
      console.error("Client insert error:", clientErr);
      return NextResponse.json(
        { error: "Failed to create client record" },
        { status: 500 }
      );
    }

    // Update lead with converted_client_id
    await supabase
      .from("leads")
      .update({
        converted_client_id: newClient.id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("coach_id", user.id);

    // Delete follow-up calendar event since lead is now a client
    if (lead.google_calendar_event_id) {
      try {
        const accessToken = await getValidToken(user.id);
        await deleteCalendarEvent(accessToken, lead.google_calendar_event_id);
        await supabaseAdmin
          .from("leads")
          .update({ google_calendar_event_id: null })
          .eq("id", id);
      } catch (err) {
        console.error("[gcal] Failed to delete lead event on convert:", err.message);
      }
    }

    // Log activity
    await supabase.from("lead_activities").insert({
      lead_id: id,
      coach_id: user.id,
      action: "other",
      details: "Converted to client record",
    });

    return NextResponse.json({
      success: true,
      client_id: newClient.id,
      returning: false,
    });
  } catch (err) {
    console.error("Lead convert error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
