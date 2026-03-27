import { NextResponse } from "next/server";

const GEMINI_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";

export async function POST(request) {
  try {
    const formData = await request.formData();
    const file = formData.get("image");
    const clientId = formData.get("client_id");
    const coachId = formData.get("coach_id");

    if (!file || !clientId || !coachId) {
      return NextResponse.json(
        { error: "Missing required fields: image, client_id, coach_id" },
        { status: 400 }
      );
    }

    // Convert file to base64
    const bytes = await file.arrayBuffer();
    const base64 = Buffer.from(bytes).toString("base64");

    // Determine mime type
    const mimeType = file.type || "image/jpeg";

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "Gemini API key is not configured" },
        { status: 500 }
      );
    }

    const prompt =
      'Extract all health metrics from this Renpho body composition screenshot. Return ONLY valid JSON with these fields (use null if not visible): weight, bmi, body_fat_pct, skeletal_muscle_pct, fat_free_mass, subcutaneous_fat_pct, visceral_fat, body_water_pct, muscle_mass, bone_mass, protein_pct, bmr, metabolic_age. All numeric values only, no units.';

    const res = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: prompt },
              {
                inline_data: {
                  mime_type: mimeType,
                  data: base64,
                },
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 1000,
        },
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error("[body-comp/parse] Gemini API error:", res.status, errText);
      return NextResponse.json(
        { error: `Gemini API error (${res.status})` },
        { status: 502 }
      );
    }

    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!text) {
      return NextResponse.json(
        { error: "No response from Gemini" },
        { status: 502 }
      );
    }

    // Parse JSON from Gemini response (may be wrapped in ```json ... ```)
    let metrics;
    try {
      const cleaned = text.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
      metrics = JSON.parse(cleaned);
    } catch (parseErr) {
      console.error("[body-comp/parse] Failed to parse Gemini response:", text);
      return NextResponse.json(
        { error: "Could not parse metrics from screenshot. Please try a clearer image." },
        { status: 422 }
      );
    }

    return NextResponse.json({ metrics });
  } catch (err) {
    console.error("[body-comp/parse] Unexpected error:", err);
    return NextResponse.json(
      { error: err.message || "Internal server error" },
      { status: 500 }
    );
  }
}
