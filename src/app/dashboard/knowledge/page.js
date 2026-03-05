"use client";

import { useState, useEffect, useRef } from "react";
import { useCoach } from "../layout";

// ---------------------------------------------------------------------------
// Chat bubble
// ---------------------------------------------------------------------------
function ChatBubble({ message }) {
  const isUser = message.role === "user";
  const isError = message.role === "error";

  if (isError) {
    return (
      <div className="flex justify-center my-3">
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-2 text-sm max-w-lg">
          {message.content}
        </div>
      </div>
    );
  }

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"} mb-4`}>
      <div
        className={`max-w-[80%] rounded-2xl px-4 py-3 ${
          isUser
            ? "bg-[#E8735A] text-white rounded-br-md"
            : "bg-white border-2 border-gray-100 text-gray-700 rounded-bl-md"
        }`}
      >
        <p className="font-body text-sm whitespace-pre-wrap leading-relaxed">
          {message.content}
        </p>

        {/* Sources pills */}
        {!isUser && message.sources?.length > 0 && (
          <div className="mt-3 pt-2 border-t border-gray-100">
            <p className="text-xs font-bold text-gray-400 mb-1.5">Sources</p>
            <div className="flex flex-wrap gap-1.5">
              {message.sources.map((s, i) => (
                <span
                  key={i}
                  className="inline-block bg-[#E8735A]/10 text-[#E8735A] text-xs font-semibold rounded-full px-2.5 py-0.5"
                >
                  {s.title}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Loading dots
// ---------------------------------------------------------------------------
function TypingIndicator() {
  return (
    <div className="flex justify-start mb-4">
      <div className="bg-white border-2 border-gray-100 rounded-2xl rounded-bl-md px-5 py-3 flex gap-1.5 items-center">
        <span className="w-2 h-2 bg-[#E8735A] rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
        <span className="w-2 h-2 bg-[#E8735A] rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
        <span className="w-2 h-2 bg-[#E8735A] rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Document browser category section
// ---------------------------------------------------------------------------
function CategorySection({ category, docs }) {
  const [open, setOpen] = useState(true);

  return (
    <div className="mb-3">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-3 py-2 rounded-xl hover:bg-gray-50 transition-colors duration-150"
      >
        <span className="font-display text-sm font-bold text-gray-700">
          {category}
        </span>
        <span className="flex items-center gap-2">
          <span className="bg-[#E8735A]/10 text-[#E8735A] text-xs font-bold rounded-full px-2 py-0.5">
            {docs.length}
          </span>
          <span className="text-gray-400 text-xs">{open ? "▲" : "▼"}</span>
        </span>
      </button>
      {open && (
        <ul className="mt-1 space-y-0.5 pl-3">
          {docs.map((doc) => (
            <li
              key={doc.id}
              className="text-sm font-body text-gray-500 py-1.5 px-2 rounded-lg hover:bg-gray-50 transition-colors duration-150"
            >
              {doc.title}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------
export default function KnowledgePage() {
  const { supabase } = useCoach();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [documents, setDocuments] = useState([]);
  const [docsLoading, setDocsLoading] = useState(true);
  const chatEndRef = useRef(null);

  // Scroll to bottom on new message
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  // Load documents on mount
  useEffect(() => {
    loadDocuments();
  }, []);

  const loadDocuments = async () => {
    setDocsLoading(true);
    const { data, error } = await supabase
      .from("knowledge_documents")
      .select("id, title, filename, category")
      .order("category")
      .order("title");

    if (!error && data) {
      setDocuments(data);
    }
    setDocsLoading(false);
  };

  // Group documents by category
  const grouped = documents.reduce((acc, doc) => {
    if (!acc[doc.category]) acc[doc.category] = [];
    acc[doc.category].push(doc);
    return acc;
  }, {});

  const sendQuestion = async () => {
    const question = input.trim();
    if (!question || loading) return;

    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: question }]);
    setLoading(true);

    try {
      const res = await fetch("/api/knowledge/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
      });

      const data = await res.json();

      if (!res.ok) {
        setMessages((prev) => [
          ...prev,
          { role: "error", content: data.error || "Something went wrong" },
        ]);
      } else {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: data.answer,
            sources: data.sources || [],
          },
        ]);
      }
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { role: "error", content: "Network error. Please try again." },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendQuestion();
    }
  };

  return (
    <div className="flex flex-col lg:flex-row gap-6 h-[calc(100vh-120px)]">
      {/* ============================================================= */}
      {/* LEFT — Chat Interface                                         */}
      {/* ============================================================= */}
      <div className="flex flex-col lg:w-2/3 bg-white rounded-2xl border-2 border-gray-100 overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b-2 border-gray-100">
          <h1 className="font-display text-xl font-bold text-gray-800">
            Coach Knowledge Base
          </h1>
          <p className="font-body text-sm text-gray-400 mt-0.5">
            Ask anything about OPTAVIA programs, plans, and coaching
          </p>
        </div>

        {/* Chat thread */}
        <div className="flex-1 overflow-y-auto px-6 py-4 bg-[#faf7f2]">
          {messages.length === 0 && !loading && (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <span className="text-5xl mb-4">📚</span>
              <h3 className="font-display text-lg font-bold text-gray-700 mb-1">
                Ask a question
              </h3>
              <p className="font-body text-sm text-gray-400 max-w-sm">
                I can help you find information across all OPTAVIA training
                documents, program guides, and coaching resources.
              </p>
            </div>
          )}

          {messages.map((msg, i) => (
            <ChatBubble key={i} message={msg} />
          ))}

          {loading && <TypingIndicator />}
          <div ref={chatEndRef} />
        </div>

        {/* Input bar */}
        <div className="px-4 py-3 border-t-2 border-gray-100 bg-white">
          <div className="flex gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask a question about OPTAVIA..."
              disabled={loading}
              className="flex-1 rounded-xl border-2 border-gray-200 px-4 py-2.5 font-body text-sm focus:outline-none focus:border-[#E8735A] focus:ring-1 focus:ring-[#E8735A]/30 disabled:opacity-50 transition-colors duration-150"
            />
            <button
              onClick={sendQuestion}
              disabled={loading || !input.trim()}
              className="bg-[#E8735A] hover:bg-[#d4644d] disabled:opacity-40 text-white font-bold text-sm px-5 py-2.5 rounded-xl transition-colors duration-150"
            >
              Send
            </button>
          </div>
        </div>
      </div>

      {/* ============================================================= */}
      {/* RIGHT — Document Browser                                      */}
      {/* ============================================================= */}
      <div className="lg:w-1/3 bg-white rounded-2xl border-2 border-gray-100 overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b-2 border-gray-100">
          <h2 className="font-display text-lg font-bold text-gray-800">
            Reference Documents
          </h2>
        </div>

        {/* Document list */}
        <div className="flex-1 overflow-y-auto px-3 py-3">
          {docsLoading ? (
            <div className="space-y-3 p-3">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="animate-pulse">
                  <div className="h-4 bg-gray-200 rounded w-32 mb-2" />
                  <div className="h-3 bg-gray-100 rounded w-48 mb-1" />
                  <div className="h-3 bg-gray-100 rounded w-40" />
                </div>
              ))}
            </div>
          ) : Object.keys(grouped).length === 0 ? (
            <div className="text-center py-8 text-gray-400 text-sm">
              No documents loaded yet.
            </div>
          ) : (
            Object.entries(grouped)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([category, docs]) => (
                <CategorySection
                  key={category}
                  category={category}
                  docs={docs}
                />
              ))
          )}
        </div>
      </div>
    </div>
  );
}
