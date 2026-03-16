import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { askGemini } from "@/lib/gemini";

const CATEGORY_DESCRIPTIONS = {
  reengagement:
    "Reaching out to past clients who haven't ordered in a while. Warm, no pressure, invite them back.",
  checkin:
    "Weekly check-in with active clients. Supportive, ask how they're doing, celebrate small wins.",
  celebrations:
    "Celebrating a client's milestone or achievement. Enthusiastic, specific praise.",
  seasonal:
    "Seasonal promotion or challenge invitation. Timely, exciting, specific.",
};

export async function POST(request) {
  try {
    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json(
        { error: "AI message generation is not configured yet" },
        { status: 503 }
      );
    }

    // Authenticate
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { category, coachName } = await request.json();

    if (!category || !CATEGORY_DESCRIPTIONS[category]) {
      return NextResponse.json(
        { error: "Valid category is required" },
        { status: 400 }
      );
    }

    const prompt = `You are writing outreach messages for an Optavia health coach named ${coachName || "Coach"}.
Generate 3 unique, warm, enthusiastic messages for the category: ${category}.

Category description: ${CATEGORY_DESCRIPTIONS[category]}

Rules:
- Use {{firstName}} as a placeholder for the client's name (DO NOT use a real name)
- Keep each message 2-4 sentences
- End with a soft call-to-action or question
- Vary the tone slightly between messages (some more casual, some more energetic)
- Include an emoji or two where natural
- Do NOT include numbering or bullet points

Respond with ONLY a JSON array of 3 message strings, no other text. Example format:
["message one", "message two", "message three"]`;

    const { text, error: geminiError } = await askGemini(prompt, {
      temperature: 0.9,
      maxTokens: 1500,
    });

    if (geminiError) {
      return NextResponse.json(
        { error: geminiError },
        { status: 500 }
      );
    }

    // Parse JSON array from response — handle markdown code fences
    let messages;
    try {
      const cleaned = text
        .replace(/```json?\s*/g, "")
        .replace(/```/g, "")
        .trim();
      messages = JSON.parse(cleaned);
      if (!Array.isArray(messages)) throw new Error("Not an array");
      messages = messages.filter((m) => typeof m === "string" && m.trim());
    } catch {
      console.error("[messages/generate] Failed to parse Gemini response:", text);
      return NextResponse.json(
        { error: "Failed to generate messages. Please try again." },
        { status: 500 }
      );
    }

    return NextResponse.json({ messages });
  } catch (err) {
    console.error("[messages/generate] Unexpected error:", err);
    return NextResponse.json(
      { error: err.message || "Internal server error" },
      { status: 500 }
    );
  }
}
