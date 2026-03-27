import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";

export async function GET(request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const coachId = searchParams.get("coach_id") || user.id;
    const clientId = searchParams.get("client_id");
    const limit = Math.min(parseInt(searchParams.get("limit") || "50", 10), 200);

    let query = supabase
      .from("orders")
      .select("*")
      .eq("coach_id", coachId)
      .order("order_date", { ascending: false })
      .limit(limit);

    if (clientId) {
      query = query.eq("client_id", clientId);
    }

    const { data: orders, error } = await query;

    if (error) {
      console.error("[orders/list] Query error:", error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ orders: orders || [] });
  } catch (err) {
    console.error("[orders/list] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
