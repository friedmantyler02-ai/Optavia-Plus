"use client";

import { useState, useEffect, useCallback } from "react";
import { useCoach } from "../layout";
import { ALL_MESSAGES } from "@/lib/suggested-messages";

/* ─── Suggested Messages Data ─── */
const MESSAGE_CATEGORIES = [
  { key: "reengagement", label: "Re-engagement" },
  { key: "checkin", label: "Weekly Check-in" },
  { key: "celebrations", label: "Celebrations" },
  { key: "seasonal", label: "Seasonal" },
];

const MESSAGES = ALL_MESSAGES;

/* ─── Copy helper ─── */
async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
  }
}

/* ─── Suggested Messages Tab ─── */
function SuggestedMessagesTab({ coachName }) {
  const [activeCategory, setActiveCategory] = useState("reengagement");
  const [copiedKey, setCopiedKey] = useState(null);
  const [customMessages, setCustomMessages] = useState([]);
  const [loadingCustom, setLoadingCustom] = useState(true);

  // Add form state
  const [showAddForm, setShowAddForm] = useState(false);
  const [addText, setAddText] = useState("");
  const [saving, setSaving] = useState(false);

  // Edit state
  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  // Delete confirmation
  const [deletingId, setDeletingId] = useState(null);

  // AI generated messages
  const [generatedMessages, setGeneratedMessages] = useState({});
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState(null);
  const [savingGenIdx, setSavingGenIdx] = useState(null);

  // Fetch custom messages
  const fetchCustomMessages = useCallback(async () => {
    try {
      const res = await fetch("/api/coach-messages");
      if (res.ok) {
        const { data } = await res.json();
        setCustomMessages(data || []);
      }
    } catch (err) {
      console.error("Failed to fetch custom messages:", err);
    } finally {
      setLoadingCustom(false);
    }
  }, []);

  useEffect(() => {
    fetchCustomMessages();
  }, [fetchCustomMessages]);

  const handleCopy = async (text, key) => {
    await copyToClipboard(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1500);
  };

  // Add message
  const handleAdd = async () => {
    if (!addText.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/coach-messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: activeCategory,
          message_text: addText.trim(),
        }),
      });
      if (res.ok) {
        const { data } = await res.json();
        setCustomMessages((prev) => [data, ...prev]);
        setAddText("");
        setShowAddForm(false);
      }
    } catch (err) {
      console.error("Failed to add message:", err);
    } finally {
      setSaving(false);
    }
  };

  // Update message
  const handleUpdate = async (id) => {
    if (!editText.trim()) return;
    setEditSaving(true);
    try {
      const res = await fetch("/api/coach-messages", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, message_text: editText.trim() }),
      });
      if (res.ok) {
        const { data } = await res.json();
        setCustomMessages((prev) =>
          prev.map((m) => (m.id === id ? data : m))
        );
        setEditingId(null);
        setEditText("");
      }
    } catch (err) {
      console.error("Failed to update message:", err);
    } finally {
      setEditSaving(false);
    }
  };

  // Delete message
  const handleDelete = async (id) => {
    try {
      const res = await fetch("/api/coach-messages", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (res.ok) {
        setCustomMessages((prev) => prev.filter((m) => m.id !== id));
        setDeletingId(null);
      }
    } catch (err) {
      console.error("Failed to delete message:", err);
    }
  };

  // Generate fresh messages
  const handleGenerate = async () => {
    setGenerating(true);
    setGenerateError(null);
    try {
      const res = await fetch("/api/messages/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: activeCategory,
          coachName: coachName || "Coach",
        }),
      });
      const data = await res.json();
      if (res.ok && data.messages) {
        setGeneratedMessages((prev) => ({
          ...prev,
          [activeCategory]: data.messages,
        }));
      } else {
        setGenerateError(data.error || "Failed to generate messages.");
      }
    } catch {
      setGenerateError("Something went wrong. Please try again.");
    } finally {
      setGenerating(false);
    }
  };

  // Save a generated message as a custom message
  const handleSaveGenerated = async (text, idx) => {
    setSavingGenIdx(idx);
    try {
      const res = await fetch("/api/coach-messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: activeCategory,
          message_text: text,
        }),
      });
      if (res.ok) {
        const { data } = await res.json();
        setCustomMessages((prev) => [data, ...prev]);
        // Remove from generated list
        setGeneratedMessages((prev) => ({
          ...prev,
          [activeCategory]: (prev[activeCategory] || []).filter(
            (_, i) => i !== idx
          ),
        }));
      }
    } catch (err) {
      console.error("Failed to save generated message:", err);
    } finally {
      setSavingGenIdx(null);
    }
  };

  const categoryCustom = customMessages.filter(
    (m) => m.category === activeCategory
  );
  const prewritten = MESSAGES[activeCategory];
  const categoryGenerated = generatedMessages[activeCategory] || [];

  return (
    <div>
      {/* Category pills */}
      <div className="flex flex-wrap gap-2 mb-6">
        {MESSAGE_CATEGORIES.map((cat) => (
          <button
            key={cat.key}
            onClick={() => {
              setActiveCategory(cat.key);
              setShowAddForm(false);
              setEditingId(null);
              setDeletingId(null);
            }}
            className={`px-4 py-2.5 rounded-xl text-sm font-bold transition-colors duration-150 min-h-[44px] touch-manipulation ${
              activeCategory === cat.key
                ? "bg-brand-500 text-white"
                : "bg-white border-2 border-gray-100 text-gray-500 hover:bg-gray-50"
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Action buttons */}
      {!showAddForm && (
        <div className="flex flex-wrap gap-2 mb-6">
          <button
            onClick={() => setShowAddForm(true)}
            className="px-4 py-2.5 rounded-xl text-sm font-bold border-2 border-brand-300 text-brand-500 hover:bg-brand-50 transition-colors duration-150 min-h-[44px] touch-manipulation flex items-center gap-2"
          >
            <span className="text-lg leading-none">+</span> Add Message
          </button>
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="px-4 py-2.5 rounded-xl text-sm font-bold border-2 border-purple-300 text-purple-500 hover:bg-purple-50 transition-colors duration-150 min-h-[44px] touch-manipulation flex items-center gap-2 disabled:opacity-50"
          >
            {generating ? (
              <>
                <div className="w-4 h-4 border-2 border-purple-200 border-t-purple-500 rounded-full animate-spin" />
                Generating...
              </>
            ) : (
              "✨ Generate Fresh Messages"
            )}
          </button>
        </div>
      )}

      {/* Add form */}
      {showAddForm && (
        <div className="bg-white rounded-2xl border-2 border-brand-200 p-5 mb-6">
          <p className="font-display text-sm font-bold text-gray-700 mb-2">
            New Custom Message
          </p>
          <p className="font-body text-xs text-gray-400 mb-3">
            Use {"{{firstName}}"} as a placeholder for the contact's first name.
          </p>
          <textarea
            value={addText}
            onChange={(e) => setAddText(e.target.value)}
            placeholder="Type your message here..."
            rows={4}
            className="w-full px-4 py-3 rounded-xl border-2 border-gray-100 bg-white font-body text-base text-gray-700 placeholder-gray-400 focus:outline-none focus:border-brand-300 transition resize-none"
          />
          <div className="flex gap-2 mt-3">
            <button
              onClick={handleAdd}
              disabled={saving || !addText.trim()}
              className="px-4 py-2.5 rounded-xl text-sm font-bold bg-brand-500 text-white hover:bg-brand-600 transition-colors duration-150 min-h-[44px] touch-manipulation disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save"}
            </button>
            <button
              onClick={() => {
                setShowAddForm(false);
                setAddText("");
              }}
              className="px-4 py-2.5 rounded-xl text-sm font-bold text-gray-400 hover:bg-gray-50 transition-colors duration-150 min-h-[44px] touch-manipulation"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Generate error */}
      {generateError && (
        <div className="bg-red-50 border-2 border-red-100 rounded-2xl p-4 mb-4">
          <p className="font-body text-sm text-red-500">{generateError}</p>
        </div>
      )}

      {/* Message cards */}
      <div className="space-y-4">
        {/* AI Generated messages */}
        {categoryGenerated.length > 0 && (
          <>
            <div className="flex items-center gap-2 mb-1">
              <span className="px-2.5 py-1 rounded-lg bg-purple-50 text-purple-500 text-xs font-bold">
                AI Generated — Fresh Today ✨
              </span>
            </div>
            {categoryGenerated.map((msg, idx) => {
              const copyKey = `generated-${activeCategory}-${idx}`;
              return (
                <div
                  key={copyKey}
                  className="bg-white rounded-2xl border-2 border-purple-100 p-5"
                >
                  <p className="font-body text-gray-700 text-base leading-relaxed mb-4 whitespace-pre-wrap">
                    {msg}
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleCopy(msg, copyKey)}
                      className={`px-4 py-2.5 rounded-xl text-sm font-bold transition-colors duration-150 min-h-[44px] touch-manipulation ${
                        copiedKey === copyKey
                          ? "bg-green-100 text-green-700"
                          : "bg-brand-50 text-brand-600 hover:bg-brand-100"
                      }`}
                    >
                      {copiedKey === copyKey ? "Copied!" : "Copy"}
                    </button>
                    <button
                      onClick={() => handleSaveGenerated(msg, idx)}
                      disabled={savingGenIdx === idx}
                      className="px-4 py-2.5 rounded-xl text-sm font-bold border-2 border-purple-200 text-purple-500 hover:bg-purple-50 transition-colors duration-150 min-h-[44px] touch-manipulation disabled:opacity-50"
                    >
                      {savingGenIdx === idx ? "Saving..." : "Save"}
                    </button>
                  </div>
                </div>
              );
            })}
          </>
        )}

        {/* Custom messages */}
        {loadingCustom && categoryCustom.length === 0 && (
          <div className="flex items-center justify-center py-4">
            <div className="w-6 h-6 border-3 border-brand-200 border-t-brand-500 rounded-full animate-spin" />
          </div>
        )}
        {categoryCustom.map((msg) => {
          const isEditing = editingId === msg.id;
          const isDeleting = deletingId === msg.id;
          const copyKey = `custom-${msg.id}`;

          return (
            <div
              key={msg.id}
              className="bg-white rounded-2xl border-2 border-gray-100 p-5 relative"
            >
              {/* Custom badge + action buttons */}
              <div className="flex items-center justify-between mb-3">
                <span className="px-2.5 py-1 rounded-lg bg-brand-50 text-brand-500 text-xs font-bold">
                  Custom
                </span>
                {!isEditing && !isDeleting && (
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => {
                        setEditingId(msg.id);
                        setEditText(msg.message_text);
                        setDeletingId(null);
                      }}
                      className="w-9 h-9 rounded-lg flex items-center justify-center text-gray-400 hover:bg-gray-50 hover:text-gray-600 transition min-w-[44px] min-h-[44px] touch-manipulation"
                      title="Edit"
                    >
                      ✏️
                    </button>
                    <button
                      onClick={() => {
                        setDeletingId(msg.id);
                        setEditingId(null);
                      }}
                      className="w-9 h-9 rounded-lg flex items-center justify-center text-gray-400 hover:bg-red-50 hover:text-red-500 transition min-w-[44px] min-h-[44px] touch-manipulation"
                      title="Delete"
                    >
                      🗑️
                    </button>
                  </div>
                )}
              </div>

              {/* Delete confirmation */}
              {isDeleting && (
                <div className="bg-red-50 rounded-xl p-4 mb-3">
                  <p className="font-body text-sm text-red-600 font-semibold mb-3">
                    Are you sure you want to delete this message?
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleDelete(msg.id)}
                      className="px-4 py-2.5 rounded-xl text-sm font-bold bg-red-500 text-white hover:bg-red-600 transition-colors duration-150 min-h-[44px] touch-manipulation"
                    >
                      Delete
                    </button>
                    <button
                      onClick={() => setDeletingId(null)}
                      className="px-4 py-2.5 rounded-xl text-sm font-bold text-gray-400 hover:bg-gray-50 transition-colors duration-150 min-h-[44px] touch-manipulation"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {/* Edit mode */}
              {isEditing ? (
                <div>
                  <textarea
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    rows={4}
                    className="w-full px-4 py-3 rounded-xl border-2 border-gray-100 bg-white font-body text-base text-gray-700 focus:outline-none focus:border-brand-300 transition resize-none mb-3"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleUpdate(msg.id)}
                      disabled={editSaving || !editText.trim()}
                      className="px-4 py-2.5 rounded-xl text-sm font-bold bg-brand-500 text-white hover:bg-brand-600 transition-colors duration-150 min-h-[44px] touch-manipulation disabled:opacity-50"
                    >
                      {editSaving ? "Saving..." : "Save"}
                    </button>
                    <button
                      onClick={() => {
                        setEditingId(null);
                        setEditText("");
                      }}
                      className="px-4 py-2.5 rounded-xl text-sm font-bold text-gray-400 hover:bg-gray-50 transition-colors duration-150 min-h-[44px] touch-manipulation"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                !isDeleting && (
                  <>
                    <p className="font-body text-gray-700 text-base leading-relaxed mb-4 whitespace-pre-wrap">
                      {msg.message_text}
                    </p>
                    <button
                      onClick={() => handleCopy(msg.message_text, copyKey)}
                      className={`px-4 py-2.5 rounded-xl text-sm font-bold transition-colors duration-150 min-h-[44px] touch-manipulation ${
                        copiedKey === copyKey
                          ? "bg-green-100 text-green-700"
                          : "bg-brand-50 text-brand-600 hover:bg-brand-100"
                      }`}
                    >
                      {copiedKey === copyKey ? "Copied!" : "Copy"}
                    </button>
                  </>
                )
              )}
            </div>
          );
        })}

        {/* Pre-written messages */}
        {prewritten.map((msg, idx) => {
          const copyKey = `prewritten-${activeCategory}-${idx}`;
          return (
            <div
              key={copyKey}
              className="bg-white rounded-2xl border-2 border-gray-100 p-5"
            >
              <p className="font-body text-gray-700 text-base leading-relaxed mb-4 whitespace-pre-wrap">
                {msg}
              </p>
              <button
                onClick={() => handleCopy(msg, copyKey)}
                className={`px-4 py-2.5 rounded-xl text-sm font-bold transition-colors duration-150 min-h-[44px] touch-manipulation ${
                  copiedKey === copyKey
                    ? "bg-green-100 text-green-700"
                    : "bg-brand-50 text-brand-600 hover:bg-brand-100"
                }`}
              >
                {copiedKey === copyKey ? "Copied!" : "Copy"}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─── Training Library Tab ─── */
function TrainingLibraryTab({ supabase }) {
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    const fetchDocs = async () => {
      try {
        const { data, error: fetchErr } = await supabase
          .from("knowledge_documents")
          .select("*")
          .order("created_at", { ascending: false });

        if (fetchErr) throw fetchErr;
        setDocs(data || []);
      } catch (err) {
        console.error("Failed to fetch knowledge docs:", err);
        setError("Failed to load training documents.");
      } finally {
        setLoading(false);
      }
    };
    fetchDocs();
  }, [supabase]);

  const filtered = docs.filter((doc) =>
    (doc.title || "").toLowerCase().includes(search.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="w-8 h-8 border-4 border-brand-200 border-t-brand-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-2xl border-2 border-red-100 p-6 text-center">
        <p className="text-red-500 font-body text-base">{error}</p>
      </div>
    );
  }

  return (
    <div>
      {/* Search bar */}
      <div className="mb-6">
        <input
          type="text"
          placeholder="Search documents..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full px-4 py-3 rounded-xl border-2 border-gray-100 bg-white font-body text-base text-gray-700 placeholder-gray-400 focus:outline-none focus:border-brand-300 transition min-h-[44px]"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border-2 border-gray-100 p-8 text-center">
          <p className="text-4xl mb-3">📚</p>
          <p className="font-display text-lg font-bold text-gray-600 mb-1">
            {docs.length === 0
              ? "Training materials will be available here soon."
              : "No results found"}
          </p>
          {docs.length > 0 && (
            <p className="font-body text-sm text-gray-400">
              Try a different search term.
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map((doc) => (
            <div
              key={doc.id}
              className="bg-white rounded-2xl border-2 border-gray-100 p-5"
            >
              <h3 className="font-display text-base font-bold text-gray-800 mb-1">
                {doc.title || "Untitled Document"}
              </h3>
              {doc.description && (
                <p className="font-body text-sm text-gray-500 mb-2">
                  {doc.description}
                </p>
              )}
              <p className="font-body text-xs text-gray-400">
                Added{" "}
                {new Date(doc.created_at).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </p>
              {doc.file_url && (
                <a
                  href={doc.file_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block mt-3 px-4 py-2.5 rounded-xl bg-brand-50 text-brand-600 text-sm font-bold hover:bg-brand-100 transition min-h-[44px] touch-manipulation leading-[44px]"
                >
                  View Document
                </a>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── AI Coach Tab ─── */
function AICoachTab() {
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState([]);

  const handleAsk = async () => {
    const q = question.trim();
    if (!q || loading) return;
    setLoading(true);
    setQuestion("");

    try {
      const res = await fetch("/api/knowledge/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q }),
      });
      const data = await res.json();

      if (res.ok) {
        setHistory((prev) => [
          { question: q, answer: data.answer, sources: data.sources || [] },
          ...prev,
        ]);
      } else {
        setHistory((prev) => [
          {
            question: q,
            answer: null,
            error: data.error || "Something went wrong. Try rephrasing your question!",
          },
          ...prev,
        ]);
      }
    } catch {
      setHistory((prev) => [
        {
          question: q,
          answer: null,
          error: "Hmm, I couldn't reach the server. Please try again!",
        },
        ...prev,
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      {/* Search input */}
      <div className="flex gap-2 mb-6">
        <input
          type="text"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleAsk()}
          placeholder="Ask about Optavia plans, recipes, coaching tips..."
          className="flex-1 px-4 py-3 rounded-xl border-2 border-gray-100 bg-white font-body text-base text-gray-700 placeholder-gray-400 focus:outline-none focus:border-brand-300 transition min-h-[44px]"
        />
        <button
          onClick={handleAsk}
          disabled={loading || !question.trim()}
          className="px-5 py-3 rounded-xl text-sm font-bold bg-brand-500 text-white hover:bg-brand-600 transition-colors duration-150 min-h-[44px] touch-manipulation disabled:opacity-50"
        >
          {loading ? "..." : "Ask"}
        </button>
      </div>

      {/* Loading indicator */}
      {loading && (
        <div className="bg-white rounded-2xl border-2 border-gray-100 p-6 mb-4">
          <div className="flex items-center gap-3">
            <div className="w-5 h-5 border-2 border-brand-200 border-t-brand-500 rounded-full animate-spin" />
            <p className="font-body text-sm text-gray-500">Searching training documents...</p>
          </div>
        </div>
      )}

      {/* Conversation history */}
      {history.length > 0 && (
        <div className="space-y-4">
          {history.map((entry, idx) => (
            <div
              key={idx}
              className="bg-white rounded-2xl border-2 border-gray-100 p-5"
            >
              <p className="font-display text-sm font-bold text-gray-800 mb-3">
                {entry.question}
              </p>
              {entry.error ? (
                <p className="font-body text-base text-red-500">{entry.error}</p>
              ) : (
                <>
                  <p className="font-body text-base text-gray-700 leading-relaxed whitespace-pre-wrap">
                    {entry.answer}
                  </p>
                  {entry.sources && entry.sources.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-gray-100">
                      <p className="text-xs font-bold text-gray-400 uppercase mb-1">
                        Sources
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {entry.sources.map((s, i) => (
                          <span
                            key={i}
                            className="px-2 py-0.5 rounded-lg bg-gray-50 text-xs text-gray-500"
                          >
                            {s.title}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          ))}

          <button
            onClick={() => setHistory([])}
            className="text-sm font-bold text-gray-400 hover:text-gray-600 transition-colors"
          >
            Clear conversation
          </button>
        </div>
      )}

      {/* Empty state */}
      {history.length === 0 && !loading && (
        <div className="bg-white rounded-2xl border-2 border-gray-100 p-8 text-center">
          <p className="text-4xl mb-3">🤖</p>
          <p className="font-display text-lg font-bold text-gray-600 mb-1">
            Ask anything about coaching
          </p>
          <p className="font-body text-sm text-gray-400">
            Get AI-powered answers from your training library.
          </p>
        </div>
      )}

      {/* Disclaimer */}
      <p className="font-body text-xs text-gray-400 text-center mt-6">
        AI answers are based on Optavia training materials and may not always be
        perfect. Always verify important health information.
      </p>
    </div>
  );
}

/* ─── Main Page ─── */
const TABS = [
  { key: "messages", label: "Suggested Messages" },
  { key: "library", label: "Training Library" },
  { key: "coach", label: "AI Coach" },
];

export default function ResourcesPage() {
  const { coach, supabase } = useCoach();
  const [activeTab, setActiveTab] = useState("messages");

  return (
    <div>
      <h1 className="font-display text-2xl md:text-3xl font-bold text-gray-800 mb-6">
        Resources
      </h1>

      {/* Tab buttons */}
      <div className="flex gap-1 mb-6 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2.5 rounded-xl text-sm font-bold whitespace-nowrap transition-colors duration-150 min-h-[44px] touch-manipulation ${
              activeTab === tab.key
                ? "bg-brand-100 text-brand-500"
                : "text-gray-400 hover:bg-gray-50"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === "messages" && <SuggestedMessagesTab coachName={coach?.full_name} />}
      {activeTab === "library" && <TrainingLibraryTab supabase={supabase} />}
      {activeTab === "coach" && <AICoachTab />}
    </div>
  );
}
