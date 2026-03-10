import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";

export async function GET(request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const search = (searchParams.get("search") ?? "").trim();
    const stage = (searchParams.get("stage") ?? "").trim();
    const source = (searchParams.get("source") ?? "").trim();
    const sort = searchParams.get("sort") ?? "created_at";
    const order = searchParams.get("order") ?? "desc";
    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
    const limit = Math.min(
      100,
      Math.max(1, parseInt(searchParams.get("limit") ?? "25", 10))
    );
    const offset = (page - 1) * limit;

    const allowedSorts = [
      "created_at",
      "full_name",
      "stage",
      "source",
      "last_contact_date",
      "next_followup_date",
      "ha_date",
    ];
    const safeSort = allowedSorts.includes(sort) ? sort : "created_at";
    const ascending = order !== "desc";

    const orderOpts = { ascending };
    if (safeSort === "last_contact_date" && ascending) {
      orderOpts.nullsFirst = true;
    }

    let query = supabase
      .from("leads")
      .select("*", { count: "exact" })
      .eq("coach_id", user.id)
      .order(safeSort, orderOpts)
      .range(offset, offset + limit - 1);

    if (search) {
      query = query.ilike("full_name", `%${search}%`);
    }
    if (stage) {
      const stages = stage.split(",").map((s) => s.trim()).filter(Boolean);
      if (stages.length === 1) {
        query = query.eq("stage", stages[0]);
      } else if (stages.length > 1) {
        query = query.in("stage", stages);
      }
    }
    if (source) {
      query = query.eq("source", source);
    }

    const { data: leads, count: total, error } = await query;

    if (error) {
      console.error("Leads query error:", error);
      return NextResponse.json(
        { error: "Failed to fetch leads" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      leads: leads ?? [],
      total: total ?? 0,
      page,
      limit,
    });
  } catch (err) {
    console.error("Leads GET error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { full_name, email, phone, facebook_url, source, stage, groups, notes, next_followup_date, originally_met_date } = body;

    if (!full_name || !full_name.trim()) {
      return NextResponse.json(
        { error: "full_name is required" },
        { status: 400 }
      );
    }

    const { data: lead, error } = await supabase
      .from("leads")
      .insert({
        coach_id: user.id,
        full_name: full_name.trim(),
        email: email || null,
        phone: phone || null,
        facebook_url: facebook_url || null,
        source: source || null,
        stage: stage || "prospect",
        groups: groups || null,
        notes: notes || null,
        next_followup_date: next_followup_date || null,
        originally_met_date: originally_met_date || null,
      })
      .select()
      .single();

    if (error) {
      console.error("Lead insert error:", error);
      return NextResponse.json(
        { error: "Failed to create lead" },
        { status: 500 }
      );
    }

    return NextResponse.json(lead, { status: 201 });
  } catch (err) {
    console.error("Leads POST error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
