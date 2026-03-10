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

    const { leads } = await request.json();

    if (!Array.isArray(leads) || leads.length === 0) {
      return NextResponse.json(
        { error: "leads must be a non-empty array" },
        { status: 400 }
      );
    }

    const coachId = user.id;

    // Fetch existing lead names for this coach to deduplicate
    const { data: existingLeads } = await supabase
      .from("leads")
      .select("full_name")
      .eq("coach_id", coachId);

    const existingNames = new Set(
      (existingLeads || []).map((l) => (l.full_name || "").toLowerCase().trim())
    );

    const toInsert = [];
    let skipped = 0;

    for (const lead of leads) {
      const fullName = (lead.full_name || "").trim();
      if (!fullName) {
        skipped++;
        continue;
      }

      // Dedup: skip if coach already has a lead with this name (case-insensitive)
      if (existingNames.has(fullName.toLowerCase())) {
        skipped++;
        continue;
      }

      // Mark as seen so we don't insert duplicates within the same batch
      existingNames.add(fullName.toLowerCase());

      toInsert.push({
        coach_id: coachId,
        full_name: fullName,
        email: lead.email || null,
        phone: lead.phone || null,
        facebook_url: lead.facebook_url || null,
        source: lead.source || null,
        notes: lead.notes || null,
        stage: "prospect",
      });
    }

    let imported = 0;

    if (toInsert.length > 0) {
      // Insert in batches of 100 to avoid payload size issues
      for (let i = 0; i < toInsert.length; i += 100) {
        const batch = toInsert.slice(i, i + 100);
        const { error: insertError, data } = await supabase
          .from("leads")
          .insert(batch)
          .select("id");

        if (insertError) {
          console.error("Lead import batch error:", insertError);
          // Continue with remaining batches
        } else {
          imported += data?.length || batch.length;
        }
      }
    }

    return NextResponse.json({ imported, skipped });
  } catch (err) {
    console.error("Lead import error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
