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

export async function GET(request) {
  try {
    const auth = await requireAdmin();
    if (auth.error) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { searchParams } = new URL(request.url);
    const search = (searchParams.get("search") ?? "").trim();

    // Fetch all coaches
    let query = supabaseAdmin
      .from("coaches")
      .select("id, email, full_name, optavia_id, is_stub, is_admin, last_sign_in_at, invited_at, invite_status, created_at");

    if (search) {
      query = query.or(`full_name.ilike.%${search}%,email.ilike.%${search}%`);
    }

    const { data: coaches, error: coachError } = await query;

    if (coachError) {
      console.error("Admin coaches query error:", coachError);
      return NextResponse.json({ error: "Failed to fetch coaches" }, { status: 500 });
    }

    // Get client counts per coach
    const coachIds = coaches.map((c) => c.id);
    const { data: clientRows } = await supabaseAdmin
      .from("clients")
      .select("coach_id")
      .in("coach_id", coachIds);

    const clientCounts = {};
    if (clientRows) {
      for (const row of clientRows) {
        clientCounts[row.coach_id] = (clientCounts[row.coach_id] || 0) + 1;
      }
    }

    // Merge and sort
    const result = coaches
      .map((c) => ({
        ...c,
        client_count: clientCounts[c.id] || 0,
      }))
      .sort((a, b) => {
        // Real users first (is_stub = false)
        if (a.is_stub !== b.is_stub) return a.is_stub ? 1 : -1;
        // Then by last_sign_in_at desc (for non-stubs)
        if (!a.is_stub && !b.is_stub) {
          const aTime = a.last_sign_in_at ? new Date(a.last_sign_in_at).getTime() : 0;
          const bTime = b.last_sign_in_at ? new Date(b.last_sign_in_at).getTime() : 0;
          if (aTime !== bTime) return bTime - aTime;
        }
        // Stubs alphabetically
        return (a.full_name || "").localeCompare(b.full_name || "");
      });

    return NextResponse.json({ coaches: result });
  } catch (err) {
    console.error("Admin coaches error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
