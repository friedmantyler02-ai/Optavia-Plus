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

// PUT: pause or resume a campaign
export async function PUT(request, { params }) {
  try {
    const user = await authCheck();
    if (!user)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const { status } = await request.json();

    if (!id) {
      return NextResponse.json(
        { error: "Campaign ID is required" },
        { status: 400 }
      );
    }

    if (!["paused", "active"].includes(status)) {
      return NextResponse.json(
        { error: "status must be 'paused' or 'active'" },
        { status: 400 }
      );
    }

    const now = new Date().toISOString();
    const updateData =
      status === "paused"
        ? { status: "paused", paused_at: now }
        : { status: "active", paused_at: null };

    // On resume, increment warmup_day so rate limit resets fresh
    if (status === "active") {
      const { data: existing } = await supabaseAdmin
        .from("reactivation_campaigns")
        .select("warmup_day")
        .eq("id", id)
        .single();

      if (existing) {
        updateData.warmup_day = (existing.warmup_day || 1) + 1;
      }
    }

    const { data: campaign, error: updateError } = await supabaseAdmin
      .from("reactivation_campaigns")
      .update(updateData)
      .eq("id", id)
      .select()
      .single();

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ campaign });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}
