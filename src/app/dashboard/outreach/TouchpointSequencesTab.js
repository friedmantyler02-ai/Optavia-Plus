"use client";

import { useState, useEffect } from "react";
import { useCoach } from "../layout";

// Icons for each default sequence (matched by name)
const SEQUENCE_ICONS = {
  "New Client Onboarding": "\uD83D\uDE80",
  "Weekly Check-In": "\uD83D\uDCCB",
  "Plateau Support": "\uD83C\uDFD4\uFE0F",
  "Milestone Celebration": "\uD83C\uDF89",
  "Lapsed Client Win-Back": "\uD83D\uDCAA",
};

// Action type badges
const ACTION_BADGES = {
  call: { label: "Call", color: "bg-blue-100 text-blue-700" },
  text: { label: "Text", color: "bg-green-100 text-green-700" },
  email: { label: "Email", color: "bg-purple-100 text-purple-700" },
  other: { label: "Other", color: "bg-gray-100 text-gray-700" },
};

// ---------------------------------------------------------------------------
// Skeleton loader
// ---------------------------------------------------------------------------
function Skeleton({ className = "" }) {
  return <div className={`animate-pulse rounded-lg bg-gray-200 ${className}`} />;
}

export default function TouchpointSequencesTab() {
  const { supabase } = useCoach();
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
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="rounded-2xl border-2 border-gray-100 bg-white p-6">
            <div className="flex items-center gap-4">
              <Skeleton className="h-10 w-10 rounded-xl" />
              <div className="flex-1">
                <Skeleton className="h-5 w-48 mb-2" />
                <Skeleton className="h-4 w-72" />
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (sequences.length === 0) {
    return (
      <div className="rounded-2xl border-2 border-gray-100 bg-white p-10 text-center">
        <p className="text-5xl mb-4">{"\uD83D\uDCCB"}</p>
        <p className="font-display text-lg font-bold text-gray-700 mb-1">
          No touchpoint plans found
        </p>
        <p className="font-body text-sm text-gray-500">
          Check your database seeding.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {sequences.map((seq) => {
        const isExpanded = expandedId === seq.id;
        const icon = SEQUENCE_ICONS[seq.name] || seq.icon || "\uD83D\uDCCB";

        return (
          <div
            key={seq.id}
            className="rounded-2xl border-2 border-gray-100 bg-white overflow-hidden transition-all duration-200"
          >
            {/* Sequence Header - Clickable */}
            <button
              onClick={() => toggleExpand(seq.id)}
              className="w-full p-5 sm:p-6 flex items-center justify-between text-left hover:bg-[#faf7f2] transition-colors duration-150"
            >
              <div className="flex items-center gap-4">
                <span className="text-3xl shrink-0">{icon}</span>
                <div>
                  <h3 className="font-display text-lg font-bold text-gray-900">
                    {seq.name}
                  </h3>
                  <p className="font-body text-sm text-gray-500 mt-0.5">
                    {seq.description || "No description"}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="font-body text-xs font-semibold text-gray-400 bg-gray-100 px-3 py-1 rounded-full">
                  {seq.steps.length} step{seq.steps.length !== 1 ? "s" : ""}
                </span>
                <span
                  className={`text-gray-400 text-xl transition-transform duration-200 ${
                    isExpanded ? "rotate-180" : ""
                  }`}
                >
                  {"\u25BE"}
                </span>
              </div>
            </button>

            {/* Expanded Steps */}
            {isExpanded && (
              <div className="px-5 sm:px-6 pb-6 border-t-2 border-gray-100">
                <div className="pt-4 space-y-3">
                  {seq.steps.length === 0 ? (
                    <p className="font-body text-sm text-gray-400 italic">
                      No steps defined for this plan yet.
                    </p>
                  ) : (
                    seq.steps.map((step, index) => {
                      const badge =
                        ACTION_BADGES[step.action_type] || ACTION_BADGES.other;

                      return (
                        <div
                          key={step.id}
                          className="flex items-start gap-4 p-4 bg-[#faf7f2] rounded-xl"
                        >
                          {/* Day indicator */}
                          <div className="flex-shrink-0 w-16 text-center">
                            <div className="font-body text-xs text-gray-400 uppercase font-semibold">
                              Day
                            </div>
                            <div className="font-display text-2xl font-bold text-gray-700">
                              {step.day_offset}
                            </div>
                          </div>

                          {/* Step content */}
                          <div className="flex-1 min-w-0">
                            <p className="font-body text-sm font-medium text-gray-800">
                              {step.action_text}
                            </p>
                            <span
                              className={`inline-block mt-2 px-2.5 py-0.5 rounded-full text-xs font-semibold ${badge.color}`}
                            >
                              {badge.label}
                            </span>
                          </div>

                          {/* Step number */}
                          <div className="flex-shrink-0 font-body text-xs font-medium text-gray-300">
                            #{index + 1}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Total duration summary */}
                {seq.steps.length > 0 && (
                  <div className="mt-4 pt-4 border-t-2 border-gray-100 font-body text-sm text-gray-400 text-center">
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
  );
}
