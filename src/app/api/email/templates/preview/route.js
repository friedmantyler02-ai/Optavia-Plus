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

    console.log("[TemplatePreview] Query params:", { triggerId, tone, coachId });

    // ─── Diagnostic: direct check with trigger_id ─────────────────
    if (triggerId) {
      const { data: directCheck } = await supabaseAdmin
        .from("email_templates")
        .select("id, subject, tone, trigger_id")
        .eq("trigger_id", triggerId)
        .is("coach_id", null);
      console.log("[TemplatePreview] DIRECT CHECK with trigger_id=" + triggerId + ":", JSON.stringify(directCheck));

      if (!directCheck || directCheck.length === 0) {
        const { data: allTemplates } = await supabaseAdmin
          .from("email_templates")
          .select("id, subject, tone, trigger_id")
          .is("coach_id", null)
          .limit(5);
        console.log("[TemplatePreview] SAMPLE of all system templates:", JSON.stringify(allTemplates));
      }
    }
    // ─── End diagnostic ───────────────────────────────────────────

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
    console.log("[TemplatePreview] All templates for trigger_id:", JSON.stringify(allForTrigger), "error:", diagErr);

    // Try coach-specific template first, then system default
    let template = null;

    const { data: coachTemplate, error: coachErr } = await supabaseAdmin
      .from("email_templates")
      .select("id, subject, body, tone")
      .eq("trigger_id", triggerId)
      .eq("tone", tone)
      .eq("coach_id", coachId)
      .single();

    console.log("[TemplatePreview] Coach template query result:", coachTemplate, "error:", coachErr?.message);

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

      console.log("[TemplatePreview] Default template query result:", defaultTemplate, "error:", defaultErr?.message);
      template = defaultTemplate;
    }

    if (!template) {
      // Diagnostic: hardcoded test to confirm supabaseAdmin can read the table
      const { data: hardTest } = await supabaseAdmin
        .from("email_templates")
        .select("*")
        .limit(1);
      console.log("[TemplatePreview] HARD TEST any template:", JSON.stringify(hardTest));

      return NextResponse.json({ template: null });
    }

    return NextResponse.json({ template });
  } catch (err) {
    console.error("[TemplatePreview] GET error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
