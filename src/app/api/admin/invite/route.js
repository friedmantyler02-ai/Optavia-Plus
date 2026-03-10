import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function requireAdmin() {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(cookiesToSet) {
          try { cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); } catch {}
        },
      },
    }
  );

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return { error: "Unauthorized", status: 401 };

  const { data: coach } = await supabaseAdmin
    .from("coaches")
    .select("id, is_admin")
    .eq("id", user.id)
    .single();

  if (!coach?.is_admin) return { error: "Forbidden", status: 403 };
  return { coachId: coach.id };
}

export async function POST(request) {
  try {
    const auth = await requireAdmin();
    if (auth.error) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { email } = await request.json();
    if (!email || !email.includes("@")) {
      return NextResponse.json({ error: "Valid email required" }, { status: 400 });
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Send invite via Supabase Auth
    const { error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(normalizedEmail);

    if (inviteError) {
      console.error("Invite error:", inviteError);
      return NextResponse.json({ error: inviteError.message }, { status: 400 });
    }

    // If a stub coach exists with this email, update their invite status
    const { data: existingCoach } = await supabaseAdmin
      .from("coaches")
      .select("id")
      .eq("email", normalizedEmail)
      .single();

    if (existingCoach) {
      await supabaseAdmin
        .from("coaches")
        .update({
          invited_at: new Date().toISOString(),
          invite_status: "invited",
        })
        .eq("id", existingCoach.id);
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Invite error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
