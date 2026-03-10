import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

const supabaseAdmin = createSupabaseClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function POST() {
  try {
    // Authenticate user via cookie-based client
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      console.log("Onboarding complete: auth failed", authError?.message);
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    console.log("Onboarding complete: user id =", user.id, "email =", user.email);

    // Use service role client to bypass RLS for the update
    const { data: updatedById, error: updateError } = await supabaseAdmin
      .from("coaches")
      .update({ onboarding_completed: true })
      .eq("id", user.id)
      .select("id");

    console.log("Onboarding complete: update by id result =", { updatedById, updateError: updateError?.message });

    if (!updateError && updatedById && updatedById.length > 0) {
      return NextResponse.json({ success: true });
    }

    // Fallback: try matching by email
    if (user.email) {
      console.log("Onboarding complete: trying email fallback for", user.email);
      const { data: updatedByEmail, error: emailError } = await supabaseAdmin
        .from("coaches")
        .update({ onboarding_completed: true })
        .eq("email", user.email)
        .select("id");

      console.log("Onboarding complete: update by email result =", { updatedByEmail, emailError: emailError?.message });

      if (!emailError && updatedByEmail && updatedByEmail.length > 0) {
        return NextResponse.json({ success: true });
      }

      if (emailError) {
        console.error("Onboarding complete: email fallback error:", emailError);
        return NextResponse.json(
          { error: `Failed to update coach by email: ${emailError.message}` },
          { status: 500 }
        );
      }
    }

    // Neither matched
    console.error("Onboarding complete: no coach found for id", user.id, "or email", user.email);
    return NextResponse.json(
      { error: "Coach record not found. Please contact support." },
      { status: 404 }
    );
  } catch (err) {
    console.error("Onboarding complete error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}
