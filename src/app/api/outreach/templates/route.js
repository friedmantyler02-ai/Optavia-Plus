import { NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase-server";

const supabaseAdmin = createSupabaseClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Hardcoded defaults — used as fallback if DB has no default rows yet
const HARDCODED_DEFAULTS = {
  warm: {
    segment: "warm",
    subject: "Checking in on you, {{FirstName}} 💛",
    body: `Hi {{FirstName}},\n\nI was thinking about you and wanted to reach out! It's been a couple of months since we last connected, and I'd love to hear how you're doing.\n\nHave you been keeping up with healthy habits? I'm here to support you in any way I can.\n\nFeel free to reply anytime — I'd love to reconnect!\n\nWarm wishes,\n{{CoachName}}`,
    is_default: true,
  },
  moderate: {
    segment: "moderate",
    subject: "It's been a while, {{FirstName}} — thinking of you",
    body: `Hi {{FirstName}},\n\nIt's been several months since we last spoke, and I just wanted to say hello!\n\nSo much can change over time, and I'd love to hear how you're doing. If you've been thinking about getting back on track with your health goals, I'm here to help.\n\nNo pressure at all — just wanted you to know I'm thinking of you.\n\nWith care,\n{{CoachName}}`,
    is_default: true,
  },
  cold: {
    segment: "cold",
    subject: "Hi {{FirstName}}, it's {{CoachName}} — hope you're well!",
    body: `Hi {{FirstName}},\n\nI hope this message finds you well! I'm {{CoachName}}, your Optavia coach, and I wanted to check in after some time has passed.\n\nI know life gets busy and plans change — that's completely okay. I just wanted you to know I'm still here if you ever want to revisit your health journey.\n\nNo commitment needed — even just a quick hello would make my day!\n\nBest,\n{{CoachName}}`,
    is_default: true,
  },
  dormant: {
    segment: "dormant",
    subject: "A quick hello from {{CoachName}}",
    body: `Hi {{FirstName}},\n\nMy name is {{CoachName}} and I was your Optavia health coach. It's been a while since we've connected, and I just wanted to reach out with a friendly hello!\n\nIf you've been thinking about getting back to a healthier routine, I'd love to help you get started again. And if life has taken you in a different direction, that's completely wonderful too.\n\nEither way, I hope you're doing great!\n\nWarmly,\n{{CoachName}}`,
    is_default: true,
  },
};

async function authCheck() {
  const supabase = await createServerClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;
  return user;
}

// GET: fetch template for a segment (coach-specific or default)
export async function GET(request) {
  try {
    const user = await authCheck();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const coach_id = searchParams.get("coach_id");
    const segment = searchParams.get("segment");

    if (!coach_id || !segment) {
      return NextResponse.json({ error: "coach_id and segment are required" }, { status: 400 });
    }

    // Try coach-specific template first
    const { data: coachTemplate } = await supabaseAdmin
      .from("reactivation_templates")
      .select("id, segment, subject, body, is_default")
      .eq("coach_id", coach_id)
      .eq("segment", segment)
      .maybeSingle();

    if (coachTemplate) {
      return NextResponse.json({ template: { ...coachTemplate, is_default: false } });
    }

    // Fall back to default template in DB
    const { data: defaultTemplate } = await supabaseAdmin
      .from("reactivation_templates")
      .select("id, segment, subject, body, is_default")
      .is("coach_id", null)
      .eq("segment", segment)
      .eq("is_default", true)
      .maybeSingle();

    if (defaultTemplate) {
      return NextResponse.json({ template: defaultTemplate });
    }

    // Fall back to hardcoded defaults
    const hardcoded = HARDCODED_DEFAULTS[segment];
    if (hardcoded) {
      return NextResponse.json({ template: hardcoded });
    }

    return NextResponse.json({ template: null });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}

// PUT: save or update a coach's custom template
export async function PUT(request) {
  try {
    const user = await authCheck();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { coach_id, segment, subject, body } = await request.json();

    if (!coach_id || !segment || !subject || !body) {
      return NextResponse.json(
        { error: "coach_id, segment, subject, and body are required" },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from("reactivation_templates")
      .upsert(
        {
          coach_id,
          segment,
          subject,
          body,
          is_default: false,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "coach_id,segment" }
      )
      .select("id, segment, subject, body, is_default")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ template: data });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}

// DELETE: remove coach-specific template (revert to default)
export async function DELETE(request) {
  try {
    const user = await authCheck();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const coach_id = searchParams.get("coach_id");
    const segment = searchParams.get("segment");

    if (!coach_id || !segment) {
      return NextResponse.json({ error: "coach_id and segment are required" }, { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from("reactivation_templates")
      .delete()
      .eq("coach_id", coach_id)
      .eq("segment", segment);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}
