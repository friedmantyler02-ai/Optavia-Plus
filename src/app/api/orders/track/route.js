import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";

export async function POST(request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { order_id, tracking_number } = await request.json();

    if (!order_id && !tracking_number) {
      return NextResponse.json(
        { error: "Provide order_id or tracking_number" },
        { status: 400 }
      );
    }

    // TODO: Replace this mock response with a real FedEx API call.
    // FedEx Track API: https://developer.fedex.com/api/en-us/catalog/track/v1/docs.html
    // Steps:
    //   1. Get FedEx API credentials (client_id, client_secret)
    //   2. Call OAuth token endpoint for access_token
    //   3. POST to /track/v1/trackingnumbers with the tracking number
    //   4. Parse response and map to our shipping_status values
    //   5. Update the orders table with new status

    const mockResponse = {
      status: "in_transit",
      estimated_delivery: "2026-03-30",
      last_update: "Package in transit - Memphis, TN",
    };

    return NextResponse.json(mockResponse);
  } catch (err) {
    console.error("[orders/track] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
