import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const ADMIN_EMAILS = ["friedmantyler02@gmail.com"];

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function requireAdmin(request) {
  const authHeader = request.headers.get("authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return { error: "Unauthorized", status: 401 };
  }
  const token = authHeader.replace("Bearer ", "");

  const supabaseAnon = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
  const {
    data: { user },
    error: authError,
  } = await supabaseAnon.auth.getUser(token);

  if (authError || !user) {
    return { error: "Unauthorized", status: 401 };
  }
  if (!ADMIN_EMAILS.includes(user.email)) {
    return { error: "Forbidden", status: 403 };
  }
  return { user };
}

export async function GET(request) {
  try {
    const auth = await requireAdmin(request);
    if (auth.error) {
      return NextResponse.json(
        { error: auth.error },
        { status: auth.status }
      );
    }

    const [
      { count: totalCoaches },
      { count: totalStubCoaches },
      { count: totalClients },
      { count: coachesOnboarded },
      { count: coachesNotOnboarded },
      { data: recentSignups },
    ] = await Promise.all([
      supabaseAdmin
        .from("coaches")
        .select("*", { count: "exact", head: true })
        .eq("is_stub", false),
      supabaseAdmin
        .from("coaches")
        .select("*", { count: "exact", head: true })
        .eq("is_stub", true),
      supabaseAdmin
        .from("clients")
        .select("*", { count: "exact", head: true }),
      supabaseAdmin
        .from("coaches")
        .select("*", { count: "exact", head: true })
        .eq("onboarding_completed", true),
      supabaseAdmin
        .from("coaches")
        .select("*", { count: "exact", head: true })
        .eq("onboarding_completed", false)
        .eq("is_stub", false),
      supabaseAdmin
        .from("coaches")
        .select("id, full_name, email, created_at, onboarding_completed")
        .eq("is_stub", false)
        .gte("created_at", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
        .order("created_at", { ascending: false }),
    ]);

    return NextResponse.json({
      total_coaches: totalCoaches ?? 0,
      total_stub_coaches: totalStubCoaches ?? 0,
      total_clients: totalClients ?? 0,
      coaches_onboarded: coachesOnboarded ?? 0,
      coaches_not_onboarded: coachesNotOnboarded ?? 0,
      recent_signups: recentSignups ?? [],
    });
  } catch (err) {
    console.error("Admin overview error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
