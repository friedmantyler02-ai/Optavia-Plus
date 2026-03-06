// Knowledge Base Q&A endpoint - v1
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase-server";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function POST(request) {
  try {
    // Check Anthropic API key
    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json(
        { error: "Knowledge base AI is not configured yet" },
        { status: 503 }
      );
    }

    // Authenticate user
    const supabase = await createServerClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized: no active session" }, { status: 401 });
    }

    // Verify coach record exists
    const { data: coach, error: coachError } = await supabaseAdmin
      .from("coaches")
      .select("id")
      .eq("user_id", user.id)
      .single();

    if (coachError || !coach) {
      return NextResponse.json({ error: "Unauthorized: no coach record found for this user" }, { status: 401 });
    }

    // Parse request body
    const { question } = await request.json();
    if (!question || !question.trim()) {
      return NextResponse.json(
        { error: "Question is required" },
        { status: 400 }
      );
    }

    // Full-text search on knowledge_documents
    const { data: docs, error: searchError } = await supabaseAdmin.rpc(
      "search_knowledge_documents",
      { search_query: question }
    ).limit(5);

    // Fallback: if RPC doesn't exist, use ilike search
    let results = docs;
    if (searchError) {
      const keywords = question
        .split(/\s+/)
        .filter((w) => w.length > 2)
        .slice(0, 5);
      const pattern = keywords.map((k) => `%${k}%`).join("");

      const { data: fallbackDocs } = await supabaseAdmin
        .from("knowledge_documents")
        .select("id, title, filename, category, content")
        .or(keywords.map((k) => `content.ilike.%${k}%`).join(","))
        .limit(5);

      results = fallbackDocs || [];
    }

    // Build context for Claude
    let documentContext = "";
    const sources = [];

    if (results && results.length > 0) {
      for (const doc of results) {
        const snippet = doc.content.substring(0, 2000);
        documentContext += `Document: ${doc.title}\nExcerpt: ${snippet}\n\n`;
        sources.push({
          title: doc.title,
          filename: doc.filename,
          category: doc.category,
        });
      }
    } else {
      documentContext =
        "No specific documents matched this query. Answer based on general OPTAVIA knowledge if possible, but clearly state that no matching documents were found.\n\n";
    }

    const userMessage = `${documentContext}Question: ${question}`;

    // Call Anthropic API
    const anthropicResponse = await fetch(
      "https://api.anthropic.com/v1/messages",
      {
        method: "POST",
        headers: {
          "x-api-key": process.env.ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1500,
          system:
            "You are a knowledgeable OPTAVIA coach assistant. Answer questions using ONLY the provided document excerpts. If the documents don't contain enough information to answer, say so clearly. Keep answers concise, practical, and encouraging. Always cite which document(s) your answer comes from.",
          messages: [{ role: "user", content: userMessage }],
        }),
      }
    );

    if (!anthropicResponse.ok) {
      const errBody = await anthropicResponse.text();
      console.error("[knowledge/ask] Anthropic API error:", errBody);
      return NextResponse.json(
        { error: "Failed to get AI response" },
        { status: 500 }
      );
    }

    const anthropicData = await anthropicResponse.json();
    const answer =
      anthropicData.content?.[0]?.text || "No response generated.";

    return NextResponse.json({ answer, sources });
  } catch (err) {
    console.error("[knowledge/ask] Unexpected error:", err);
    return NextResponse.json(
      { error: err.message || "Internal server error" },
      { status: 500 }
    );
  }
}
