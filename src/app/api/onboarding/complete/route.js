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

    // Use RPC to bypass PostgREST schema cache issue with onboarding_completed column
    const { error: rpcError } = await supabaseAdmin.rpc('complete_onboarding', { coach_email: user.email });

    console.log("Onboarding complete: rpc result =", { rpcError: rpcError?.message });

    if (rpcError) {
      console.error("Onboarding complete: rpc error:", rpcError);
      return NextResponse.json(
        { error: `Failed to complete onboarding: ${rpcError.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Onboarding complete error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}
