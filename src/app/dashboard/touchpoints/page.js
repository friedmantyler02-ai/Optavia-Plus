"use client";

import { useState, useEffect } from "react";
import { useCoach } from "../layout";

// Icons for each default sequence (matched by name)
const SEQUENCE_ICONS = {
  "New Client Onboarding": "🚀",
  "Weekly Check-In": "📋",
  "Plateau Support": "🏔️",
  "Milestone Celebration": "🎉",
  "Lapsed Client Win-Back": "💪",
};

// Action type badges
const ACTION_BADGES = {
  call: { label: "📞 Call", color: "bg-blue-100 text-blue-700" },
  text: { label: "💬 Text", color: "bg-green-100 text-green-700" },
  email: { label: "📧 Email", color: "bg-purple-100 text-purple-700" },
  other: { label: "📝 Other", color: "bg-gray-100 text-gray-700" },
};

export default function TouchpointsPage() {
  const { coach, supabase } = useCoach();
  const [sequences, setSequences] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState(null);

  useEffect(() => {
    if (!supabase) return;
    fetchSequences();
  }, [supabase]);

  async function fetchSequences() {
    setLoading(true);
    try {
      // Fetch all sequences
      const { data: seqs, error: seqError } = await supabase
        .from("touchpoint_sequences")
        .select("*")
        .order("name");

      if (seqError) throw seqError;

      // Fetch all steps for all sequences
      const { data: steps, error: stepError } = await supabase
        .from("touchpoint_steps")
        .select("*")
        .order("sort_order");

      if (stepError) throw stepError;

      // Group steps under their sequence
      const sequencesWithSteps = seqs.map((seq) => ({
        ...seq,
        steps: steps.filter((step) => step.sequence_id === seq.id),
      }));

      setSequences(sequencesWithSteps);
    } catch (err) {
      console.error("Error fetching touchpoint sequences:", err);
    } finally {
      setLoading(false);
    }
  }

  function toggleExpand(id) {
    setExpandedId(expandedId === id ? null : id);
  }

  if (loading) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <h1
          className="text-3xl font-bold mb-2"
          style={{ fontFamily: "Playfair Display, serif" }}
        >
          Touchpoint Plans
        </h1>
        <p className="text-gray-500 text-lg mb-8">Loading your plans...</p>
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="bg-white rounded-2xl p-6 shadow-sm animate-pulse"
            >
              <div className="h-6 bg-gray-200 rounded w-1/3 mb-3"></div>
              <div className="h-4 bg-gray-100 rounded w-2/3"></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Page Header */}
      <div className="mb-8">
        <h1
          className="text-3xl font-bold mb-2"
          style={{ fontFamily: "Playfair Display, serif" }}
        >
          Touchpoint Plans
        </h1>
        <p className="text-gray-500 text-lg">
          These are your proven coaching sequences. Tap any plan to see the
          step-by-step actions, then assign one to a client from their profile
          page.
        </p>
      </div>

      {/* Sequence Cards */}
      {sequences.length === 0 ? (
        <div className="bg-white rounded-2xl p-10 shadow-sm text-center">
          <p className="text-5xl mb-4">📋</p>
          <p className="text-gray-500 text-lg">
            No touchpoint plans found. Check your database seeding.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {sequences.map((seq) => {
            const isExpanded = expandedId === seq.id;
            const icon =
              SEQUENCE_ICONS[seq.name] || seq.icon || "📋";

            return (
              <div
                key={seq.id}
                className="bg-white rounded-2xl shadow-sm overflow-hidden transition-all duration-200"
              >
                {/* Sequence Header - Clickable */}
                <button
                  onClick={() => toggleExpand(seq.id)}
                  className="w-full p-6 flex items-center justify-between text-left hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-4">
                    <span className="text-4xl">{icon}</span>
                    <div>
                      <h2
                        className="text-xl font-bold text-gray-800"
                        style={{ fontFamily: "Playfair Display, serif" }}
                      >
                        {seq.name}
                      </h2>
                      <p className="text-gray-500 mt-1">
                        {seq.description || "No description"}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-gray-400 bg-gray-100 px-3 py-1 rounded-full">
                      {seq.steps.length} step{seq.steps.length !== 1 ? "s" : ""}
                    </span>
                    <span
                      className={`text-gray-400 text-2xl transition-transform duration-200 ${
                        isExpanded ? "rotate-180" : ""
                      }`}
                    >
                      ▾
                    </span>
                  </div>
                </button>

                {/* Expanded Steps */}
                {isExpanded && (
                  <div className="px-6 pb-6 border-t border-gray-100">
                    <div className="pt-4 space-y-3">
                      {seq.steps.length === 0 ? (
                        <p className="text-gray-400 italic">
                          No steps defined for this plan yet.
                        </p>
                      ) : (
                        seq.steps.map((step, index) => {
                          const badge =
                            ACTION_BADGES[step.action_type] ||
                            ACTION_BADGES.other;

                          return (
                            <div
                              key={step.id}
                              className="flex items-start gap-4 p-4 bg-gray-50 rounded-xl"
                            >
                              {/* Day indicator */}
                              <div className="flex-shrink-0 w-16 text-center">
                                <div className="text-xs text-gray-400 uppercase font-semibold">
                                  Day
                                </div>
                                <div className="text-2xl font-bold text-gray-700">
                                  {step.day_offset}
                                </div>
                              </div>

                              {/* Step content */}
                              <div className="flex-1 min-w-0">
                                <p className="text-gray-800 text-base font-medium">
                                  {step.action_text}
                                </p>
                                <span
                                  className={`inline-block mt-2 px-3 py-1 rounded-full text-xs font-semibold ${badge.color}`}
                                >
                                  {badge.label}
                                </span>
                              </div>

                              {/* Step number */}
                              <div className="flex-shrink-0 text-gray-300 text-sm font-medium">
                                #{index + 1}
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>

                    {/* Total duration summary */}
                    {seq.steps.length > 0 && (
                      <div className="mt-4 pt-4 border-t border-gray-100 text-sm text-gray-400 text-center">
                        Total plan duration:{" "}
                        <span className="font-semibold text-gray-600">
                          {Math.max(...seq.steps.map((s) => s.day_offset))} days
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
