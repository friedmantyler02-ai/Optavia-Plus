import { NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase-server";

const supabaseAdmin = createSupabaseClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function authCheck() {
  const supabase = await createServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) return null;
  return user;
}

// GET: fetch all DNC clients for a coach
export async function GET(request) {
  try {
    const user = await authCheck();
    if (!user)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const coach_id = searchParams.get("coach_id");

    if (!coach_id) {
      return NextResponse.json(
        { error: "coach_id is required" },
        { status: 400 }
      );
    }

    const { data: clients, error } = await supabaseAdmin
      .from("clients")
      .select("id, full_name, email, do_not_contact_at")
      .eq("coach_id", coach_id)
      .eq("do_not_contact", true)
      .order("do_not_contact_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ clients: clients || [] });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}

// POST: manually mark a client as DNC
export async function POST(request) {
  try {
    const user = await authCheck();
    if (!user)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { coach_id, client_id } = await request.json();

    if (!coach_id || !client_id) {
      return NextResponse.json(
        { error: "coach_id and client_id are required" },
        { status: 400 }
      );
    }

    const now = new Date().toISOString();

    // Mark client as DNC
    const { error: clientError } = await supabaseAdmin
      .from("clients")
      .update({ do_not_contact: true, do_not_contact_at: now })
      .eq("id", client_id)
      .eq("coach_id", coach_id);

    if (clientError) {
      return NextResponse.json({ error: clientError.message }, { status: 500 });
    }

    // Cancel any queued reactivation emails for this client
    await supabaseAdmin
      .from("reactivation_emails")
      .update({ status: "skipped" })
      .eq("client_id", client_id)
      .eq("status", "queued");

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}

// DELETE: undo DNC (within 24 hours only)
export async function DELETE(request) {
  try {
    const user = await authCheck();
    if (!user)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const coach_id = searchParams.get("coach_id");
    const client_id = searchParams.get("client_id");

    if (!coach_id || !client_id) {
      return NextResponse.json(
        { error: "coach_id and client_id are required" },
        { status: 400 }
      );
    }

    // Fetch the client to check do_not_contact_at
    const { data: client, error: fetchError } = await supabaseAdmin
      .from("clients")
      .select("do_not_contact_at")
      .eq("id", client_id)
      .eq("coach_id", coach_id)
      .single();

    if (fetchError || !client) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }

    if (!client.do_not_contact_at) {
      return NextResponse.json(
        { error: "Client is not on the DNC list" },
        { status: 400 }
      );
    }

    const markedAt = new Date(client.do_not_contact_at).getTime();
    const twentyFourHours = 24 * 60 * 60 * 1000;
    if (Date.now() - markedAt > twentyFourHours) {
      return NextResponse.json(
        { error: "DNC can only be undone within 24 hours" },
        { status: 400 }
      );
    }

    const { error: updateError } = await supabaseAdmin
      .from("clients")
      .update({ do_not_contact: false, do_not_contact_at: null })
      .eq("id", client_id)
      .eq("coach_id", coach_id);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}
