import { NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase-server";

const supabaseAdmin = createSupabaseClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function GET() {
  try {
    const supabase = await createServerClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: triggers, error } = await supabaseAdmin
      .from("email_triggers")
      .select("id, name, slug, trigger_type, description, default_delay_days")
      .order("name");

    if (error) {
      console.error("[triggers] List error:", error);
      return NextResponse.json(
        { error: "Failed to fetch triggers" },
        { status: 500 }
      );
    }

    return NextResponse.json({ triggers: triggers ?? [] });
  } catch (err) {
    console.error("[triggers] GET error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
