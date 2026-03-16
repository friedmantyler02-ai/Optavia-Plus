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
function SuggestedMessagesTab() {
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

  const categoryCustom = customMessages.filter(
    (m) => m.category === activeCategory
  );
  const prewritten = MESSAGES[activeCategory];

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

      {/* Add Message button */}
      {!showAddForm && (
        <button
          onClick={() => setShowAddForm(true)}
          className="mb-6 px-4 py-2.5 rounded-xl text-sm font-bold border-2 border-brand-300 text-brand-500 hover:bg-brand-50 transition-colors duration-150 min-h-[44px] touch-manipulation flex items-center gap-2"
        >
          <span className="text-lg leading-none">+</span> Add Message
        </button>
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

      {/* Message cards */}
      <div className="space-y-4">
        {/* Custom messages first */}
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
          <p className="text-4xl mb-3">📄</p>
          <p className="font-display text-lg font-bold text-gray-600 mb-1">
            {docs.length === 0 ? "No documents yet" : "No results found"}
          </p>
          <p className="font-body text-sm text-gray-400">
            {docs.length === 0
              ? "Training documents will appear here once they're added."
              : "Try a different search term."}
          </p>
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
  return (
    <div className="bg-white rounded-2xl border-2 border-gray-100 p-8 text-center">
      <p className="text-5xl mb-4">🤖</p>
      <h3 className="font-display text-xl font-bold text-gray-800 mb-2">
        Coming Soon
      </h3>
      <p className="font-body text-base text-gray-500 mb-6 max-w-md mx-auto">
        Ask questions about Optavia plans, recipes, coaching tips, and more.
        AI-powered answers from our training library.
      </p>
      <input
        type="text"
        disabled
        placeholder="Ask anything about coaching..."
        className="w-full max-w-md mx-auto px-4 py-3 rounded-xl border-2 border-gray-100 bg-gray-50 font-body text-base text-gray-300 placeholder-gray-300 cursor-not-allowed min-h-[44px]"
      />
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
  const { supabase } = useCoach();
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
      {activeTab === "messages" && <SuggestedMessagesTab />}
      {activeTab === "library" && <TrainingLibraryTab supabase={supabase} />}
      {activeTab === "coach" && <AICoachTab />}
    </div>
  );
}
