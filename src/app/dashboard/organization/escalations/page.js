"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useCoach } from "../../layout";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function Skeleton({ className = "" }) {
  return <div className={`animate-pulse rounded-lg bg-gray-200 ${className}`} />;
}

function fmtDate(dateStr) {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function StatCard({ emoji, value, label, loading }) {
  return (
    <div className="rounded-2xl border-2 border-gray-100 bg-white p-6 text-center">
      <div className="mb-3 text-4xl">{emoji}</div>
      {loading ? (
        <Skeleton className="mx-auto h-9 w-16" />
      ) : (
        <p className="font-display text-3xl font-bold text-gray-900">
          {typeof value === "number" ? value.toLocaleString() : value}
        </p>
      )}
      <p className="font-body mt-1 text-sm font-medium text-gray-500">{label}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Status filter tabs
// ---------------------------------------------------------------------------
const FILTERS = [
  { key: "all", label: "All" },
  { key: "open", label: "Open" },
  { key: "handled", label: "Handled" },
  { key: "auto_resolved", label: "Auto-Resolved" },
];

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------
export default function EscalationsPage() {
  const { supabase } = useCoach();

  const [filter, setFilter] = useState("open");
  const [escalations, setEscalations] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [marking, setMarking] = useState(null); // id being marked

  // Stats
  const [openCount, setOpenCount] = useState(0);
  const [handledWeekCount, setHandledWeekCount] = useState(0);
  const [autoResolvedCount, setAutoResolvedCount] = useState(0);
  const [statsLoading, setStatsLoading] = useState(true);

  const LIMIT = 25;

  // ------------------------------------------------------------------
  // Fetch stats
  // ------------------------------------------------------------------
  const fetchStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      const [openRes, handledRes, autoRes] = await Promise.all([
        fetch("/api/org/escalations?status=open&limit=1"),
        fetch("/api/org/escalations?status=handled&limit=1"),
        fetch("/api/org/escalations?status=auto_resolved&limit=1"),
      ]);

      if (openRes.ok) {
        const d = await openRes.json();
        setOpenCount(d.total || 0);
      }
      if (handledRes.ok) {
        const d = await handledRes.json();
        // Count handled this week client-side from total (API doesn't filter by date)
        setHandledWeekCount(d.total || 0);
      }
      if (autoRes.ok) {
        const d = await autoRes.json();
        setAutoResolvedCount(d.total || 0);
      }
    } catch (err) {
      console.error("Failed to fetch escalation stats:", err);
    } finally {
      setStatsLoading(false);
    }
  }, []);

  // ------------------------------------------------------------------
  // Fetch escalations list
  // ------------------------------------------------------------------
  const fetchEscalations = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(LIMIT) });
      if (filter !== "all") params.set("status", filter);

      const res = await fetch(`/api/org/escalations?${params}`);
      if (res.ok) {
        const data = await res.json();
        setEscalations(data.escalations || []);
        setTotal(data.total || 0);
      }
    } catch (err) {
      console.error("Failed to fetch escalations:", err);
    } finally {
      setLoading(false);
    }
  }, [page, filter]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  useEffect(() => {
    fetchEscalations();
  }, [fetchEscalations]);

  // ------------------------------------------------------------------
  // Mark as handled
  // ------------------------------------------------------------------
  const handleMarkHandled = async (id) => {
    setMarking(id);
    try {
      const res = await fetch("/api/org/escalations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (res.ok) {
        // Refresh both list and stats
        await Promise.all([fetchEscalations(), fetchStats()]);
      }
    } catch (err) {
      console.error("Failed to mark handled:", err);
    } finally {
      setMarking(null);
    }
  };

  const totalPages = Math.ceil(total / LIMIT);

  return (
    <div className="animate-fade-up">
      <Link href="/dashboard/organization" className="inline-block text-sm text-gray-500 hover:text-[#E8735A] transition-colors mb-4">
        &larr; Organization
      </Link>

      {/* Header */}
      <div className="mb-8">
        <h1 className="font-display text-2xl md:text-3xl font-bold text-gray-900">
          Escalations
        </h1>
        <p className="font-body mt-1 text-sm text-gray-500">
          Clients who aren't responding to automated outreach and may need personal attention
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 mb-8">
        <StatCard emoji="🚨" value={openCount} label="Open Escalations" loading={statsLoading} />
        <StatCard emoji="✅" value={handledWeekCount} label="Handled" loading={statsLoading} />
        <StatCard emoji="🔄" value={autoResolvedCount} label="Auto-Resolved" loading={statsLoading} />
      </div>

      {/* Filter tabs */}
      <div className="mb-4 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => { setFilter(f.key); setPage(1); }}
            className={`font-body rounded-full px-4 py-2 text-sm font-bold transition-colors duration-150 ${
              filter === f.key
                ? "bg-brand-500 text-white"
                : "bg-white border-2 border-gray-200 text-gray-600 hover:border-brand-300 hover:text-brand-600"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-2xl border-2 border-gray-100 bg-white">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <th className="font-body whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
                Client
              </th>
              <th className="font-body whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
                Coach
              </th>
              <th className="font-body whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
                Escalated To
              </th>
              <th className="font-body whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
                Reason
              </th>
              <th className="font-body whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
                Date
              </th>
              <th className="font-body whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
                Action
              </th>
            </tr>
          </thead>
          <tbody>
            {loading &&
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={`skel-${i}`} className="border-b border-gray-50 last:border-0">
                  <td className="px-4 py-3"><Skeleton className="h-5 w-36" /></td>
                  <td className="px-4 py-3"><Skeleton className="h-5 w-28" /></td>
                  <td className="px-4 py-3"><Skeleton className="h-5 w-28" /></td>
                  <td className="px-4 py-3"><Skeleton className="h-5 w-48" /></td>
                  <td className="px-4 py-3"><Skeleton className="h-5 w-24" /></td>
                  <td className="px-4 py-3"><Skeleton className="h-5 w-24" /></td>
                </tr>
              ))}

            {!loading && escalations.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-16 text-center">
                  <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
                    <span className="text-3xl">✅</span>
                  </div>
                  <p className="font-display text-lg font-bold text-gray-700">
                    No escalations right now — your team is on top of it! 🎉
                  </p>
                </td>
              </tr>
            )}

            {!loading &&
              escalations.map((esc) => (
                <tr key={esc.id} className="border-b border-gray-50 last:border-0 hover:bg-brand-50/30 transition-colors duration-100">
                  <td className="px-4 py-3">
                    <p className="font-body font-semibold text-gray-900">
                      {esc.clients?.full_name || "Unknown"}
                    </p>
                    <p className="font-body text-xs text-gray-400">
                      {esc.clients?.email || "No email"}
                    </p>
                  </td>
                  <td className="font-body whitespace-nowrap px-4 py-3 text-gray-700">
                    {esc.from_coach_name || "—"}
                  </td>
                  <td className="font-body whitespace-nowrap px-4 py-3 text-gray-700">
                    {esc.to_coach_name || (
                      <span className="text-gray-400 italic">No upline</span>
                    )}
                  </td>
                  <td className="font-body px-4 py-3 text-sm text-gray-600 max-w-xs">
                    {esc.reason}
                  </td>
                  <td className="font-body whitespace-nowrap px-4 py-3 text-gray-500">
                    {fmtDate(esc.created_at)}
                  </td>
                  <td className="px-4 py-3">
                    {esc.status === "open" ? (
                      <button
                        onClick={() => handleMarkHandled(esc.id)}
                        disabled={marking === esc.id}
                        className="font-body whitespace-nowrap rounded-xl bg-coral-400 px-4 py-2 text-xs font-bold text-white transition-all duration-150 active:scale-95 hover:bg-coral-500 disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100"
                      >
                        {marking === esc.id ? "Saving..." : "Mark Handled"}
                      </button>
                    ) : (
                      <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        esc.status === "handled"
                          ? "bg-green-100 text-green-700"
                          : "bg-blue-100 text-blue-700"
                      }`}>
                        {esc.status === "handled" ? "Handled" : "Auto-Resolved"}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {!loading && totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between">
          <p className="font-body text-sm text-gray-500">
            Page {page} of {totalPages} ({total.toLocaleString()} escalations)
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="font-body rounded-xl border-2 border-gray-200 bg-white px-4 py-2 text-sm font-bold text-gray-700 transition-colors duration-150 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Previous
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="font-body rounded-xl border-2 border-gray-200 bg-white px-4 py-2 text-sm font-bold text-gray-700 transition-colors duration-150 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
