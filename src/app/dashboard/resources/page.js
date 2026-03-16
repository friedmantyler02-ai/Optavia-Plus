"use client";

import { useState, useEffect } from "react";
import { useCoach } from "../layout";

/* ─── Suggested Messages Data ─── */
const MESSAGE_CATEGORIES = [
  { key: "reengagement", label: "Re-engagement" },
  { key: "checkin", label: "Weekly Check-in" },
  { key: "celebrations", label: "Celebrations" },
  { key: "seasonal", label: "Seasonal" },
];

const MESSAGES = {
  reengagement: [
    "Hi {{firstName}}! I've been thinking about you and wanted to check in. We're kicking off a fresh 10-Day Metabolic Reset and I would LOVE to have you join us! No pressure at all — just wanted you to know the door is always open. Would you be up for chatting about it?",
    "Hey {{firstName}}! I hope you're doing well! I know life gets busy, but I wanted to reach out because we have some exciting new flavors and plans that I think you'd really love. Want me to fill you in?",
    "{{firstName}}! It's been a little while and I just wanted to say hi and see how you're doing. A lot of our community members are jumping back in this month and the energy is amazing. Would love to have you be part of it if you're interested!",
    "Hi {{firstName}}, just thinking of you today! I know your health journey didn't stop just because we lost touch. If you're ever ready to pick back up or even just want to chat about where you're at, I'm here for you. No strings attached 💛",
  ],
  checkin: [
    "Hey {{firstName}}! Just checking in on your week — how are you feeling? Any wins to celebrate or challenges I can help with? I'm here for you!",
    "Hi {{firstName}}! Happy [day]! How's everything going with your plan this week? Remember, progress over perfection. Let me know if you need anything!",
    "{{firstName}}! Quick check-in — how are your meals going this week? Any recipes you're loving or getting tired of? I have some great new options if you need a refresh!",
  ],
  celebrations: [
    "{{firstName}}!! I am SO proud of you! 🎉 Look at the progress you've made — this is incredible and you should feel amazing about what you've accomplished. Keep going, you're on fire!",
    "Hey {{firstName}}, I just wanted to take a moment to celebrate YOU! Hitting this milestone is a big deal and it shows how committed you are. I'm honored to be part of your journey!",
    "{{firstName}}! Can we talk about how amazing you're doing?! 🌟 Your dedication is inspiring and I love watching you crush your goals. Here's to even more wins ahead!",
  ],
  seasonal: [
    "Hi {{firstName}}! Spring is here and it's the perfect time for a fresh start! 🌸 We're putting together a Spring Reset challenge and I'd love for you to join. Want the details?",
    "Hey {{firstName}}! Summer is right around the corner and so many people in our community are feeling confident and energized. Want to make this YOUR summer? Let's chat about getting started!",
    "{{firstName}}! The holidays can be tricky but I've got some amazing tips and recipes to help you stay on track AND enjoy the season. Want me to send them your way?",
    "Happy New Year {{firstName}}! 🎆 If a healthier you is on your resolution list this year, I'd love to help you make it happen. We're starting a New Year kickoff group — interested?",
  ],
};

/* ─── Suggested Messages Tab ─── */
function SuggestedMessagesTab() {
  const [activeCategory, setActiveCategory] = useState("reengagement");
  const [copiedIdx, setCopiedIdx] = useState(null);

  const handleCopy = async (text, idx) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedIdx(idx);
      setTimeout(() => setCopiedIdx(null), 1500);
    } catch {
      // Fallback
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      setCopiedIdx(idx);
      setTimeout(() => setCopiedIdx(null), 1500);
    }
  };

  return (
    <div>
      {/* Category pills */}
      <div className="flex flex-wrap gap-2 mb-6">
        {MESSAGE_CATEGORIES.map((cat) => (
          <button
            key={cat.key}
            onClick={() => setActiveCategory(cat.key)}
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

      {/* Message cards */}
      <div className="space-y-4">
        {MESSAGES[activeCategory].map((msg, idx) => (
          <div
            key={idx}
            className="bg-white rounded-2xl border-2 border-gray-100 p-5"
          >
            <p className="font-body text-gray-700 text-base leading-relaxed mb-4 whitespace-pre-wrap">
              {msg}
            </p>
            <button
              onClick={() => handleCopy(msg, idx)}
              className={`px-4 py-2.5 rounded-xl text-sm font-bold transition-colors duration-150 min-h-[44px] touch-manipulation ${
                copiedIdx === idx
                  ? "bg-green-100 text-green-700"
                  : "bg-brand-50 text-brand-600 hover:bg-brand-100"
              }`}
            >
              {copiedIdx === idx ? "Copied!" : "Copy"}
            </button>
          </div>
        ))}
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
