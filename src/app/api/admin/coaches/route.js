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

    const { searchParams } = new URL(request.url);
    const search = (searchParams.get("search") ?? "").trim();
    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
    const perPage = Math.max(1, Math.min(100, parseInt(searchParams.get("per_page") ?? "20", 10)));
    const offset = (page - 1) * perPage;

    // Build query for coaches
    let query = supabaseAdmin
      .from("coaches")
      .select("id, full_name, email, optavia_id, onboarding_completed, created_at", {
        count: "exact",
      })
      .eq("is_stub", false)
      .order("created_at", { ascending: false })
      .range(offset, offset + perPage - 1);

    if (search) {
      query = query.or(
        `full_name.ilike.%${search}%,email.ilike.%${search}%`
      );
    }

    const { data: coaches, count: total, error: coachError } = await query;

    if (coachError) {
      console.error("Admin coaches query error:", coachError);
      return NextResponse.json(
        { error: "Failed to fetch coaches" },
        { status: 500 }
      );
    }

    if (!coaches || coaches.length === 0) {
      return NextResponse.json({
        coaches: [],
        total: 0,
        page,
        per_page: perPage,
      });
    }

    const coachIds = coaches.map((c) => c.id);

    // Get client counts and last activity in parallel
    const [{ data: clientRows }, { data: activityRows }] = await Promise.all([
      supabaseAdmin
        .from("clients")
        .select("coach_id")
        .in("coach_id", coachIds),
      supabaseAdmin
        .from("activities")
        .select("coach_id, created_at")
        .in("coach_id", coachIds)
        .order("created_at", { ascending: false }),
    ]);

    // Count clients per coach
    const clientCounts = {};
    if (clientRows) {
      for (const row of clientRows) {
        clientCounts[row.coach_id] = (clientCounts[row.coach_id] || 0) + 1;
      }
    }

    // Get most recent activity per coach
    const lastActivity = {};
    if (activityRows) {
      for (const row of activityRows) {
        if (!lastActivity[row.coach_id]) {
          lastActivity[row.coach_id] = row.created_at;
        }
      }
    }

    const enrichedCoaches = coaches.map((c) => ({
      ...c,
      client_count: clientCounts[c.id] || 0,
      last_activity: lastActivity[c.id] || null,
    }));

    return NextResponse.json({
      coaches: enrichedCoaches,
      total: total ?? 0,
      page,
      per_page: perPage,
    });
  } catch (err) {
    console.error("Admin coaches error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
