"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { useCoach } from "../layout";

// ---------------------------------------------------------------------------
// Tier classification — mirrors the neglected API logic
// ---------------------------------------------------------------------------
const TIER_CONFIG = {
  critical: { label: "Critical", icon: "🔴", color: "#ef4444", sequenceName: "Win-Back Outreach" },
  warning:  { label: "Warning",  icon: "🟡", color: "#f59e0b", sequenceName: "Re-Engagement" },
  watch:    { label: "Watch",    icon: "🟠", color: "#f97316", sequenceName: "Quick Check-In" },
  other:    { label: "Other",    icon: "⚪", color: "#9ca3af", sequenceName: null },
};

function classifyClient(client) {
  const now = new Date();
  const lastOrder = client.last_order_date ? new Date(client.last_order_date) : null;
  const lastContact = client.last_contact_date ? new Date(client.last_contact_date) : null;

  // Clients with recent contact aren't neglected
  if (lastContact) return "other";
  if (!lastOrder) return "critical";

  // Use setMonth() to match the API's date math exactly
  const sixMonthsAgo = new Date(now);
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
  const twelveMonthsAgo = new Date(now);
  twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);
  const threeMonthsAgo = new Date(now);
  threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

  const d = new Date(lastOrder);
  if (d >= sixMonthsAgo) {
    // Within 6 months — only neglected if older than 3 months
    return d < threeMonthsAgo ? "watch" : "other";
  }
  if (d >= twelveMonthsAgo) return "warning";
  return "critical";
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function BulkAssignModal({
  isOpen,
  onClose,
  selectedClients,
  onAssignComplete,
}) {
  const { supabase } = useCoach();
  const [sequences, setSequences] = useState([]);
  const [loadingSequences, setLoadingSequences] = useState(true);
  const [mode, setMode] = useState("auto"); // "auto" | "manual"
  const [assignMode, setAssignMode] = useState("match"); // "single" | "match"
  const [manualSequenceId, setManualSequenceId] = useState("");
  const [assigning, setAssigning] = useState(false);
  const [result, setResult] = useState(null);
  const autoCloseTimer = useRef(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Auto-close 3 seconds after successful result
  useEffect(() => {
    if (result && result.assigned > 0) {
      autoCloseTimer.current = setTimeout(() => {
        onCloseRef.current();
      }, 3000);
    }
    return () => {
      if (autoCloseTimer.current) clearTimeout(autoCloseTimer.current);
    };
  }, [result]);

  // Prevent closing while assigning
  function handleClose() {
    if (assigning) return;
    if (autoCloseTimer.current) clearTimeout(autoCloseTimer.current);
    onClose();
  }

  // Fetch sequences on open
  useEffect(() => {
    if (!isOpen) return;
    setResult(null);
    setAssigning(false);
    setMode("auto");
    setAssignMode("match");
    setManualSequenceId("");

    async function fetchSequences() {
      setLoadingSequences(true);
      try {
        const { data, error } = await supabase
          .from("touchpoint_sequences")
          .select("id, name, description, icon, color, dormancy_tier")
          .order("created_at", { ascending: true });
        if (!error && data) setSequences(data);
      } catch (err) {
        console.error("Failed to fetch sequences:", err);
      } finally {
        setLoadingSequences(false);
      }
    }
    fetchSequences();
  }, [isOpen, supabase]);

  // Tier breakdown
  const tierBreakdown = useMemo(() => {
    const counts = { critical: [], warning: [], watch: [], other: [] };
    for (const client of selectedClients) {
      const tier = classifyClient(client);
      counts[tier].push(client);
    }
    return counts;
  }, [selectedClients]);

  const activeTiers = useMemo(
    () => Object.keys(tierBreakdown).filter((t) => t !== "other" && tierBreakdown[t].length > 0),
    [tierBreakdown]
  );

  const isSingleTier = activeTiers.length === 1 && tierBreakdown.other.length === 0;
  const singleTier = isSingleTier ? activeTiers[0] : null;

  const autoSequence = useMemo(() => {
    if (!singleTier) return null;
    return sequences.find((s) => s.dormancy_tier === singleTier) ?? null;
  }, [singleTier, sequences]);

  const tierSequenceMap = useMemo(() => {
    const map = {};
    for (const seq of sequences) {
      if (seq.dormancy_tier) map[seq.dormancy_tier] = seq;
    }
    return map;
  }, [sequences]);

  // Assignment
  async function handleAssign() {
    setAssigning(true);
    setResult(null);

    try {
      const calls = [];

      if (mode === "manual" && manualSequenceId) {
        calls.push({ client_ids: selectedClients.map((c) => c.id), sequence_id: manualSequenceId });
      } else if (isSingleTier && autoSequence) {
        calls.push({ client_ids: selectedClients.map((c) => c.id), sequence_id: autoSequence.id });
      } else if (assignMode === "match") {
        for (const tier of activeTiers) {
          const seq = tierSequenceMap[tier];
          if (seq && tierBreakdown[tier].length > 0) {
            calls.push({ client_ids: tierBreakdown[tier].map((c) => c.id), sequence_id: seq.id });
          }
        }
      } else if (assignMode === "single" && manualSequenceId) {
        calls.push({ client_ids: selectedClients.map((c) => c.id), sequence_id: manualSequenceId });
      }

      if (calls.length === 0) {
        setResult({ assigned: 0, skipped: 0, errors: ["No valid sequence selected"] });
        setAssigning(false);
        return;
      }

      let totalAssigned = 0;
      let totalSkipped = 0;
      const allErrors = [];

      for (const body of calls) {
        const res = await fetch("/api/org/bulk-assign", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (data.success) {
          totalAssigned += data.assigned;
          totalSkipped += data.skipped;
          if (data.errors?.length) allErrors.push(...data.errors);
        } else {
          allErrors.push(data.error || "Unknown error");
        }
      }

      const finalResult = { assigned: totalAssigned, skipped: totalSkipped, errors: allErrors };
      setResult(finalResult);
      if (totalAssigned > 0 && onAssignComplete) onAssignComplete(finalResult);
    } catch (err) {
      console.error("Bulk assign failed:", err);
      setResult({ assigned: 0, skipped: 0, errors: [err.message] });
    } finally {
      setAssigning(false);
    }
  }

  const canConfirm = (() => {
    if (assigning || result) return false;
    if (mode === "manual") return !!manualSequenceId;
    if (isSingleTier) return !!autoSequence;
    if (assignMode === "match") return activeTiers.some((t) => tierSequenceMap[t]);
    if (assignMode === "single") return !!manualSequenceId;
    return false;
  })();

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[60]"
        style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
        onClick={handleClose}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
        <div
          className="w-full max-w-lg rounded-2xl border-2 border-gray-100 bg-white p-6 shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="mb-5 flex items-start justify-between">
            <div>
              <h2 className="font-display text-xl font-bold text-gray-900">
                Assign Touchpoint Sequence
              </h2>
              <p className="font-body mt-1 text-sm text-gray-500">
                {selectedClients.length.toLocaleString()} client{selectedClients.length !== 1 ? "s" : ""} selected
              </p>
            </div>
            <button
              onClick={handleClose}
              disabled={assigning}
              className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
                <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
              </svg>
            </button>
          </div>

          {/* Tier badges */}
          <div className="mb-5 flex flex-wrap gap-2">
            {Object.entries(TIER_CONFIG).map(([tier, cfg]) => {
              const count = tierBreakdown[tier]?.length ?? 0;
              if (count === 0) return null;
              return (
                <span
                  key={tier}
                  className="font-body inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold"
                  style={{
                    backgroundColor: cfg.color + "18",
                    color: cfg.color,
                    border: `1px solid ${cfg.color}40`,
                  }}
                >
                  {cfg.icon} {cfg.label}: {count}
                </span>
              );
            })}
          </div>

          {/* Result display */}
          {result && (
            <div className={`mb-5 rounded-xl border-2 p-4 ${
              result.assigned > 0
                ? "border-green-100 bg-green-50"
                : "border-red-100 bg-red-50"
            }`}>
              <p className={`font-display text-base font-bold ${
                result.assigned > 0 ? "text-green-800" : "text-red-800"
              }`}>
                {result.assigned > 0 ? "Assignment Complete" : "Assignment Failed"}
              </p>
              {result.assigned > 0 && (
                <p className="font-body mt-1 text-sm text-green-700">
                  {result.assigned} assigned{result.skipped > 0 ? `, ${result.skipped} skipped (already active)` : ""}
                </p>
              )}
              {result.errors.length > 0 && (
                <div className="mt-2">
                  {result.errors.map((err, i) => (
                    <p key={i} className="font-body text-xs text-red-600">{err}</p>
                  ))}
                </div>
              )}
              <div className="mt-3 flex items-center gap-3">
                <button
                  onClick={handleClose}
                  className={`font-display rounded-xl px-5 py-2 text-sm font-bold text-white transition-colors duration-150 ${
                    result.assigned > 0
                      ? "bg-brand-500 hover:bg-brand-600"
                      : "bg-gray-500 hover:bg-gray-600"
                  }`}
                >
                  {result.assigned > 0 ? "Done" : "Close"}
                </button>
                {result.assigned > 0 && (
                  <span className="font-body text-xs text-gray-400">Auto-closing in a moment...</span>
                )}
              </div>
            </div>
          )}

          {/* Assignment configuration */}
          {!result && (
            <>
              {loadingSequences ? (
                <div className="flex items-center gap-2 py-6">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-brand-500" />
                  <span className="font-body text-sm text-gray-500">Loading sequences...</span>
                </div>
              ) : (
                <>
                  {/* Single tier auto-suggest */}
                  {isSingleTier && autoSequence && mode === "auto" && (
                    <div className="mb-4 rounded-xl border-2 border-gray-100 bg-gray-50 p-4">
                      <div className="flex items-center gap-2">
                        <span className="text-lg">{autoSequence.icon}</span>
                        <div>
                          <p className="font-display text-sm font-bold text-gray-900">{autoSequence.name}</p>
                          <p className="font-body text-xs font-medium text-brand-500">
                            Recommended for {TIER_CONFIG[singleTier].label.toLowerCase()} clients
                          </p>
                        </div>
                      </div>
                      <p className="font-body mt-2 text-xs text-gray-500">{autoSequence.description}</p>
                    </div>
                  )}

                  {/* Mixed tier toggle */}
                  {!isSingleTier && activeTiers.length > 0 && mode === "auto" && (
                    <div className="mb-4">
                      <p className="font-body mb-2 text-sm font-medium text-gray-700">
                        Clients span multiple tiers. How should we assign?
                      </p>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setAssignMode("match")}
                          className={`font-body flex-1 rounded-xl border-2 px-3 py-2.5 text-xs font-semibold transition-colors ${
                            assignMode === "match"
                              ? "border-brand-400 bg-brand-50 text-brand-600"
                              : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"
                          }`}
                        >
                          Match sequence to tier automatically
                        </button>
                        <button
                          onClick={() => setAssignMode("single")}
                          className={`font-body flex-1 rounded-xl border-2 px-3 py-2.5 text-xs font-semibold transition-colors ${
                            assignMode === "single"
                              ? "border-brand-400 bg-brand-50 text-brand-600"
                              : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"
                          }`}
                        >
                          Assign one sequence to all
                        </button>
                      </div>

                      {assignMode === "match" && (
                        <div className="mt-3 space-y-1.5">
                          {activeTiers.map((tier) => {
                            const seq = tierSequenceMap[tier];
                            const cfg = TIER_CONFIG[tier];
                            return (
                              <div key={tier} className="font-body flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2 text-xs">
                                <span className="text-gray-600">{cfg.icon} {cfg.label} ({tierBreakdown[tier].length})</span>
                                <span className="font-semibold text-gray-900">{seq ? seq.name : "No matching sequence"}</span>
                              </div>
                            );
                          })}
                          {tierBreakdown.other.length > 0 && (
                            <div className="font-body flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2 text-xs">
                              <span className="text-gray-400">{TIER_CONFIG.other.icon} Other ({tierBreakdown.other.length})</span>
                              <span className="text-gray-400 italic">Skipped</span>
                            </div>
                          )}
                        </div>
                      )}

                      {assignMode === "single" && (
                        <select
                          value={manualSequenceId}
                          onChange={(e) => setManualSequenceId(e.target.value)}
                          className="font-body mt-3 w-full rounded-xl border-2 border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#E8735A] focus:border-transparent transition-colors duration-150"
                        >
                          <option value="">Select a sequence...</option>
                          {sequences.map((s) => (
                            <option key={s.id} value={s.id}>{s.icon} {s.name}</option>
                          ))}
                        </select>
                      )}
                    </div>
                  )}

                  {/* Manual override */}
                  <div className="mb-5">
                    {mode === "auto" && (isSingleTier || activeTiers.length > 0) ? (
                      <button
                        onClick={() => setMode("manual")}
                        className="font-body text-xs font-medium text-gray-400 underline decoration-gray-300 underline-offset-2 transition-colors hover:text-gray-600"
                      >
                        Override: pick a different sequence
                      </button>
                    ) : (
                      <>
                        <label className="font-body mb-1.5 block text-sm font-medium text-gray-700">
                          {activeTiers.length === 0 ? "Select a sequence" : "Override sequence"}
                        </label>
                        <select
                          value={manualSequenceId}
                          onChange={(e) => setManualSequenceId(e.target.value)}
                          className="font-body w-full rounded-xl border-2 border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#E8735A] focus:border-transparent transition-colors duration-150"
                        >
                          <option value="">Select a sequence...</option>
                          {sequences.map((s) => (
                            <option key={s.id} value={s.id}>{s.icon} {s.name}</option>
                          ))}
                        </select>
                        {mode === "manual" && activeTiers.length > 0 && (
                          <button
                            onClick={() => { setMode("auto"); setManualSequenceId(""); }}
                            className="font-body mt-1.5 text-xs font-medium text-brand-500 underline underline-offset-2"
                          >
                            Back to auto-suggest
                          </button>
                        )}
                      </>
                    )}
                  </div>

                  {/* Confirm */}
                  <div className="flex items-center justify-end gap-3">
                    <button
                      onClick={handleClose}
                      disabled={assigning}
                      className="font-body rounded-xl border-2 border-gray-200 bg-white px-5 py-2.5 text-sm font-medium text-gray-700 transition-colors duration-150 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleAssign}
                      disabled={!canConfirm}
                      className="font-display inline-flex items-center gap-2 rounded-xl bg-brand-500 px-5 py-2.5 text-sm font-bold text-white shadow-lg transition-all duration-150 active:scale-95 hover:bg-brand-600 hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
                    >
                      {assigning && (
                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                      )}
                      {assigning ? "Assigning..." : "Assign Sequence"}
                    </button>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
