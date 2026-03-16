import { NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase-server";

const supabaseAdmin = createSupabaseClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function POST(request) {
  try {
    // Auth check: require a valid session
    const supabase = await createServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { user_id, email, full_name, optavia_id } = await request.json();

    if (!user_id || !email) {
      return NextResponse.json(
        { error: "user_id and email are required" },
        { status: 400 }
      );
    }

    // Verify the caller is creating a coach record for themselves
    if (user_id !== user.id) {
      return NextResponse.json(
        { error: "user_id must match authenticated user" },
        { status: 403 }
      );
    }

    // Check if a coach record already exists for this user
    const { data: existing } = await supabaseAdmin
      .from("coaches")
      .select("id")
      .eq("id", user_id)
      .single();

    if (existing) {
      return NextResponse.json({ success: true, existed: true });
    }

    // Check if there's a stub coach (from org CSV import) that matches by email
    const { data: stub } = await supabaseAdmin
      .from("coaches")
      .select("id")
      .eq("email", email.toLowerCase())
      .eq("is_stub", true)
      .single();

    if (stub) {
      // Merge: update the stub with the real auth user ID and details
      const { error: mergeError } = await supabaseAdmin
        .from("coaches")
        .update({
          id: user_id,
          full_name: full_name || email.split("@")[0],
          optavia_id: optavia_id || null,
          is_stub: false,
          onboarding_completed: false,
          updated_at: new Date().toISOString(),
        })
        .eq("id", stub.id);

      if (mergeError) {
        console.error("Stub merge error:", mergeError);
        // Fall through to create fresh
      } else {
        return NextResponse.json({ success: true, merged: true });
      }
    }

    // Create a fresh coach profile
    const { error: insertError } = await supabaseAdmin
      .from("coaches")
      .insert({
        id: user_id,
        email: email.toLowerCase(),
        full_name: full_name || email.split("@")[0],
        optavia_id: optavia_id || null,
        onboarding_completed: false,
      });

    if (insertError) {
      // Could be a race condition duplicate — check again
      if (insertError.message.includes("duplicate")) {
        return NextResponse.json({ success: true, existed: true });
      }
      return NextResponse.json(
        { error: insertError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, created: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}
