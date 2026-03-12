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

export async function GET(request, { params }) {
  try {
    const auth = await requireAdmin(request);
    if (auth.error) {
      return NextResponse.json(
        { error: auth.error },
        { status: auth.status }
      );
    }

    const { id: coachId } = await params;

    const { searchParams } = new URL(request.url);
    const search = (searchParams.get("search") ?? "").trim();
    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
    const perPage = Math.max(1, Math.min(100, parseInt(searchParams.get("per_page") ?? "50", 10)));
    const offset = (page - 1) * perPage;

    let query = supabaseAdmin
      .from("clients")
      .select(
        "id, full_name, email, phone, status, last_order_date, last_contact_date, ownership_status, pqv",
        { count: "exact" }
      )
      .eq("coach_id", coachId)
      .order("full_name", { ascending: true })
      .range(offset, offset + perPage - 1);

    if (search) {
      query = query.or(
        `full_name.ilike.%${search}%,email.ilike.%${search}%`
      );
    }

    const { data: clients, count: total, error: clientError } = await query;

    if (clientError) {
      console.error("Admin coach clients query error:", clientError);
      return NextResponse.json(
        { error: "Failed to fetch clients" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      clients: clients ?? [],
      total: total ?? 0,
      page,
      per_page: perPage,
    });
  } catch (err) {
    console.error("Admin coach clients error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
