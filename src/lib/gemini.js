const GEMINI_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";

/**
 * Call Gemini 2.5 Flash with a plain text prompt.
 * Returns { text } on success or { error } on failure.
 */
export async function askGemini(prompt, options = {}) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return { error: "Gemini API key is not configured" };
  }

  try {
    const res = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: options.temperature ?? 0.7,
          maxOutputTokens: options.maxTokens ?? 1500,
        },
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error("[gemini] API error:", res.status, errText);
      return { error: `Gemini API error (${res.status})` };
    }

    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!text) {
      return { error: "No response generated" };
    }

    return { text };
  } catch (err) {
    console.error("[gemini] Unexpected error:", err);
    return { error: err.message || "Failed to call Gemini" };
  }
}

/**
 * Ask Gemini a question using training documents as context.
 */
export async function askGeminiWithContext(question, contextDocs) {
  const docsText =
    contextDocs && contextDocs.length > 0
      ? contextDocs
          .map((d, i) => `--- Document ${i + 1}: ${d.title} ---\n${d.content}`)
          .join("\n\n")
      : "No specific training documents matched this query.";

  const prompt = `You are a knowledgeable Optavia health coach assistant. Answer the following question using ONLY the provided training documents. Be helpful, warm, and specific. If the documents don't contain the answer, say so honestly.

TRAINING DOCUMENTS:
${docsText}

QUESTION: ${question}

Answer concisely and cite which document(s) your answer comes from when possible.`;

  return askGemini(prompt, { temperature: 0.3, maxTokens: 1500 });
}
