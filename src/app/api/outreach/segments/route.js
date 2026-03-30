import { NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { getSubtreeCoachIds } from "@/lib/org-auth";

const supabaseAdmin = createSupabaseClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function getSegmentBucket(last_order_date) {
  if (!last_order_date) return "dormant";
  const daysSince = Math.floor((Date.now() - new Date(last_order_date)) / 86400000);
  if (daysSince <= 60) return "active";
  if (daysSince <= 180) return "warm";
  if (daysSince <= 365) return "moderate";
  if (daysSince <= 730) return "cold";
  return "dormant";
}

export async function GET(request) {
  try {
    const subtreeResult = await getSubtreeCoachIds();
    if (subtreeResult.error) {
      return NextResponse.json(
        { error: subtreeResult.error },
        { status: subtreeResult.status }
      );
    }

    const { coachIds } = subtreeResult;
    const { searchParams } = new URL(request.url);
    const segmentFilter = searchParams.get("segment");

    const { data: clients, error } = await supabaseAdmin
      .from("clients")
      .select("id, full_name, email, last_order_date")
      .in("coach_id", coachIds)
      .or("do_not_contact.is.null,do_not_contact.eq.false")
      .or("bad_email.is.null,bad_email.eq.false")
      .not("email", "is", null)
      .neq("email", "");

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Build segment map
    const segmentMap = { active: [], warm: [], moderate: [], cold: [], dormant: [] };

    for (const client of clients || []) {
      if (client.email?.toLowerCase().includes("@medifastinc.com")) continue;
      const bucket = getSegmentBucket(client.last_order_date);
      segmentMap[bucket].push(client);
    }

    // If segment param provided, return client list for that segment
    if (segmentFilter) {
      const segClients = segmentMap[segmentFilter] || [];
      return NextResponse.json({
        clients: segClients.slice(0, 50).map((c) => ({
          id: c.id,
          full_name: c.full_name,
          last_order_date: c.last_order_date,
        })),
        count: segClients.length,
      });
    }

    // Otherwise return counts
    const segments = {};
    for (const [key, arr] of Object.entries(segmentMap)) segments[key] = arr.length;

    return NextResponse.json({
      segments,
      total_reachable: segments.warm + segments.moderate + segments.cold + segments.dormant,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}
