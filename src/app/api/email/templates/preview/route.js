import { NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase-server";

const supabaseAdmin = createSupabaseClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function GET(request) {
  try {
    const supabase = await createServerClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const coachId = user.id;
    const { searchParams } = new URL(request.url);
    const triggerId = searchParams.get("trigger_id");
    const tone = searchParams.get("tone");

    console.log("[templates/preview] Query params:", { triggerId, tone, coachId });

    if (!triggerId || !tone) {
      return NextResponse.json(
        { error: "trigger_id and tone are required" },
        { status: 400 }
      );
    }

    // Diagnostic: fetch ALL templates for this trigger_id to see what exists
    const { data: allForTrigger, error: diagErr } = await supabaseAdmin
      .from("email_templates")
      .select("id, trigger_id, tone, coach_id, subject")
      .eq("trigger_id", triggerId);
    console.log("[templates/preview] All templates for trigger_id:", JSON.stringify(allForTrigger), "error:", diagErr);

    // Try coach-specific template first, then system default
    let template = null;

    const { data: coachTemplate, error: coachErr } = await supabaseAdmin
      .from("email_templates")
      .select("id, subject, body, tone")
      .eq("trigger_id", triggerId)
      .eq("tone", tone)
      .eq("coach_id", coachId)
      .single();

    console.log("[templates/preview] Coach template query result:", coachTemplate, "error:", coachErr?.message);

    if (coachTemplate) {
      template = coachTemplate;
    } else {
      const { data: defaultTemplate, error: defaultErr } = await supabaseAdmin
        .from("email_templates")
        .select("id, subject, body, tone")
        .eq("trigger_id", triggerId)
        .eq("tone", tone)
        .is("coach_id", null)
        .single();

      console.log("[templates/preview] Default template query result:", defaultTemplate, "error:", defaultErr?.message);
      template = defaultTemplate;
    }

    if (!template) {
      return NextResponse.json({ template: null });
    }

    return NextResponse.json({ template });
  } catch (err) {
    console.error("[templates/preview] GET error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
