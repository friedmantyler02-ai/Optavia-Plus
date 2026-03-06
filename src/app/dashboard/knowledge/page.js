"use client";

import { useState, useEffect, useRef } from "react";
import { useCoach } from "../layout";
import PageHeader from "../components/PageHeader";
import LoadingSpinner from "../components/LoadingSpinner";
import EmptyState from "../components/EmptyState";
import ErrorBanner from "../components/ErrorBanner";

// ---------------------------------------------------------------------------
// Document viewer modal
// ---------------------------------------------------------------------------
function DocumentModal({ doc, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl border-2 border-gray-100 w-full max-w-2xl max-h-[80vh] flex flex-col shadow-xl">
        {/* Header */}
        <div className="px-6 py-4 border-b-2 border-gray-100 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h3 className="font-display text-lg font-bold text-gray-900 truncate">
              {doc.title}
            </h3>
            <p className="text-xs text-gray-400 mt-0.5">
              {doc.category} &middot; {doc.filename}
            </p>
          </div>
          <button
            onClick={onClose}
            className="shrink-0 w-8 h-8 rounded-lg bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500 text-lg transition-colors duration-150"
          >
            &times;
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {doc.content ? (
            <p className="font-body text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
              {doc.content}
            </p>
          ) : (
            <LoadingSpinner message="Loading document..." />
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Category section in document sidebar
// ---------------------------------------------------------------------------
function CategorySection({ category, docs, onDocClick }) {
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
          <span className="text-gray-400 text-xs">{open ? "\u25B2" : "\u25BC"}</span>
        </span>
      </button>
      {open && (
        <ul className="mt-1 space-y-0.5 pl-3">
          {docs.map((doc) => (
            <li key={doc.id}>
              <button
                onClick={() => onDocClick(doc)}
                className="w-full text-left text-sm font-body text-gray-600 py-1.5 px-2 rounded-lg hover:bg-[#E8735A]/5 hover:text-[#E8735A] transition-colors duration-150"
              >
                {doc.title}
              </button>
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
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [answer, setAnswer] = useState(null);
  const [sources, setSources] = useState([]);
  const [error, setError] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [docsLoading, setDocsLoading] = useState(true);
  const [selectedDoc, setSelectedDoc] = useState(null);
  const answerRef = useRef(null);

  // Load documents on mount
  useEffect(() => {
    loadDocuments();
  }, []);

  // Scroll to answer when it appears
  useEffect(() => {
    if (answer) {
      answerRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [answer]);

  const loadDocuments = async () => {
    setDocsLoading(true);
    const { data, error: fetchError } = await supabase
      .from("knowledge_documents")
      .select("id, title, filename, category")
      .order("category")
      .order("title");

    if (!fetchError && data) {
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

  const handleDocClick = async (doc) => {
    // Show modal immediately with title, then load content
    setSelectedDoc(doc);

    if (!doc.content) {
      const { data } = await supabase
        .from("knowledge_documents")
        .select("content")
        .eq("id", doc.id)
        .single();

      if (data) {
        setSelectedDoc((prev) => (prev ? { ...prev, content: data.content } : null));
      }
    }
  };

  const sendQuestion = async () => {
    const question = input.trim();
    if (!question || loading) return;

    setError(null);
    setAnswer(null);
    setSources([]);
    setLoading(true);

    try {
      const res = await fetch("/api/knowledge/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Something went wrong");
      } else {
        setAnswer(data.answer);
        setSources(data.sources || []);
      }
    } catch {
      setError("Network error. Please try again.");
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
    <div>
      <PageHeader
        title="Knowledge Base"
        subtitle="Search OPTAVIA training docs or ask the AI coach assistant"
      />

      <div className="flex flex-col lg:flex-row gap-6">
        {/* ================================================================ */}
        {/* LEFT — AI Q&A                                                    */}
        {/* ================================================================ */}
        <div className="lg:w-[60%] flex flex-col gap-4">
          {/* Search input card */}
          <div className="bg-white rounded-2xl border-2 border-gray-100 p-5">
            <label className="font-display text-sm font-bold text-gray-700 mb-2 block">
              Ask a Question
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="e.g. What are the Optimal Weight 5&1 lean and green options?"
                disabled={loading}
                className="flex-1 rounded-xl border-2 border-gray-200 px-4 py-2.5 font-body text-sm focus:outline-none focus:border-[#E8735A] focus:ring-1 focus:ring-[#E8735A]/30 disabled:opacity-50 transition-colors duration-150"
              />
              <button
                onClick={sendQuestion}
                disabled={loading || !input.trim()}
                className="bg-[#E8735A] hover:bg-[#d4644d] disabled:opacity-40 text-white font-bold text-sm px-6 py-2.5 rounded-xl transition-colors duration-150"
              >
                Ask
              </button>
            </div>
          </div>

          {/* Error banner */}
          {error && (
            <ErrorBanner message={error} onRetry={sendQuestion} />
          )}

          {/* Loading */}
          {loading && (
            <div className="bg-white rounded-2xl border-2 border-gray-100">
              <LoadingSpinner message="Searching documents and generating answer..." />
            </div>
          )}

          {/* Answer card */}
          {answer && !loading && (
            <div ref={answerRef} className="bg-white rounded-2xl border-2 border-gray-100 p-6">
              <h3 className="font-display text-sm font-bold text-gray-700 mb-3">
                Answer
              </h3>
              <p className="font-body text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
                {answer}
              </p>

              {sources.length > 0 && (
                <div className="mt-4 pt-3 border-t border-gray-100">
                  <p className="text-xs font-bold text-gray-400 mb-2">Sources</p>
                  <div className="flex flex-wrap gap-1.5">
                    {sources.map((s, i) => (
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
          )}

          {/* Empty state — only when no answer, not loading, no error */}
          {!answer && !loading && !error && (
            <EmptyState
              icon="\uD83D\uDCDA"
              title="Ask anything about Optavia coaching"
              subtitle="Get instant answers from training documents, program guides, and coaching resources. Your AI assistant searches across all uploaded materials."
            />
          )}
        </div>

        {/* ================================================================ */}
        {/* RIGHT — Reference Documents                                      */}
        {/* ================================================================ */}
        <div className="lg:w-[40%] bg-white rounded-2xl border-2 border-gray-100 overflow-hidden flex flex-col lg:max-h-[calc(100vh-200px)]">
          <div className="px-5 py-4 border-b-2 border-gray-100 flex items-center justify-between">
            <h2 className="font-display text-base font-bold text-gray-800">
              Reference Documents
            </h2>
            {documents.length > 0 && (
              <span className="text-xs text-gray-400 font-body">
                {documents.length} docs
              </span>
            )}
          </div>

          <div className="flex-1 overflow-y-auto px-3 py-3">
            {docsLoading ? (
              <LoadingSpinner message="Loading documents..." />
            ) : Object.keys(grouped).length === 0 ? (
              <div className="p-4">
                <EmptyState
                  icon="\uD83D\uDCC4"
                  title="No documents yet"
                  subtitle="Upload training materials to get started."
                />
              </div>
            ) : (
              Object.entries(grouped)
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([category, docs]) => (
                  <CategorySection
                    key={category}
                    category={category}
                    docs={docs}
                    onDocClick={handleDocClick}
                  />
                ))
            )}
          </div>
        </div>
      </div>

      {/* Document viewer modal */}
      {selectedDoc && (
        <DocumentModal doc={selectedDoc} onClose={() => setSelectedDoc(null)} />
      )}
    </div>
  );
}
