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

    if (!triggerId || !tone) {
      return NextResponse.json(
        { error: "trigger_id and tone are required" },
        { status: 400 }
      );
    }

    // Try coach-specific template first, then system default
    let template = null;

    const { data: coachTemplate } = await supabaseAdmin
      .from("email_templates")
      .select("id, subject, body, tone")
      .eq("trigger_id", triggerId)
      .eq("tone", tone)
      .eq("coach_id", coachId)
      .single();

    if (coachTemplate) {
      template = coachTemplate;
    } else {
      const { data: defaultTemplate } = await supabaseAdmin
        .from("email_templates")
        .select("id, subject, body, tone")
        .eq("trigger_id", triggerId)
        .eq("tone", tone)
        .is("coach_id", null)
        .single();

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
