import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { bulkSyncAll } from "@/lib/google-calendar";

export async function POST() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await bulkSyncAll(user.id);
    return NextResponse.json(result);
  } catch (err) {
    console.error("Calendar bulk sync error:", err);
    return NextResponse.json(
      { error: "Failed to sync calendar" },
      { status: 500 }
    );
  }
}
