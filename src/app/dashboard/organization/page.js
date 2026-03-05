"use client";

import { useState, useEffect, useCallback } from "react";
import { useCoach } from "../layout";
import Link from "next/link";
import SkeletonCard from "../components/SkeletonCard";
import ErrorBanner from "../components/ErrorBanner";
import EmptyState from "../components/EmptyState";
import PageHeader from "../components/PageHeader";

// ---------------------------------------------------------------------------
// Skeleton pulse component
// ---------------------------------------------------------------------------
function Skeleton({ className = "" }) {
  return (
    <div className={`animate-pulse rounded-lg bg-gray-200 ${className}`} />
  );
}

// ---------------------------------------------------------------------------
// Stat card — big emoji, large number, small label
// ---------------------------------------------------------------------------
function StatCard({ emoji, value, label, loading }) {
  return (
    <div className="rounded-2xl border-2 border-gray-100 bg-white p-6 text-center">
      <div className="mb-3 text-4xl">{emoji}</div>
      {loading ? (
        <Skeleton className="mx-auto h-9 w-24" />
      ) : (
        <p className="font-display text-3xl font-bold text-gray-900">
          {typeof value === "number" ? value.toLocaleString() : value}
        </p>
      )}
      <p className="font-body mt-1 text-sm font-medium text-gray-500">
        {label}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Relationship score badge
// ---------------------------------------------------------------------------
function ScoreBadge({ score }) {
  let emoji, bg, text;
  if (score >= 70) {
    emoji = "🟢"; bg = "#065f46"; text = "#6ee7b7";
  } else if (score >= 40) {
    emoji = "🟡"; bg = "#92400e"; text = "#fde68a";
  } else {
    emoji = "🔴"; bg = "#991b1b"; text = "#fca5a5";
  }
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold"
      style={{ backgroundColor: bg, color: text }}
    >
      {emoji} {score}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Sort arrow indicator
// ---------------------------------------------------------------------------
function SortArrow({ column, sortBy, sortDir }) {
  if (sortBy !== column) return null;
  return (
    <span className="ml-1 text-gray-400">
      {sortDir === "asc" ? "↑" : "↓"}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------
export default function OrganizationPage() {
  const { supabase } = useCoach();

  // Stats state
  const [stats, setStats] = useState(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [error, setError] = useState(null);

  // Escalation alert
  const [escalationCount, setEscalationCount] = useState(0);

  // Coaches table state
  const [coaches, setCoaches] = useState([]);
  const [coachesLoading, setCoachesLoading] = useState(true);
  const [totalCoachCount, setTotalCoachCount] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [sortBy, setSortBy] = useState("client_count");
  const [sortDir, setSortDir] = useState("desc");

  const LIMIT = 20;

  // Fetch org stats
  useEffect(() => {
    async function fetchStats() {
      try {
        const res = await fetch("/api/org/stats");
        if (res.ok) {
          const data = await res.json();
          setStats(data);
        }
      } catch (err) {
        console.error("Failed to fetch org stats:", err);
        setError("Failed to load organization data.");
      } finally {
        setStatsLoading(false);
      }
    }
    fetchStats();
    // Fetch escalation count
    fetch("/api/org/escalations?status=open&limit=1")
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d) setEscalationCount(d.total || 0); })
      .catch(() => {});
  }, []);

  // Fetch coaches (paginated + searchable)
  const fetchCoaches = useCallback(async () => {
    setCoachesLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(LIMIT),
      });
      if (search) params.set("search", search);

      const res = await fetch(`/api/org/coaches?${params}`);
      if (res.ok) {
        const data = await res.json();
        setCoaches(data.coaches ?? []);
        setTotalCoachCount(data.total_count ?? 0);
      }
    } catch (err) {
      console.error("Failed to fetch coaches:", err);
      setError("Failed to load coaches.");
    } finally {
      setCoachesLoading(false);
    }
  }, [page, search]);

  useEffect(() => {
    fetchCoaches();
  }, [fetchCoaches]);

  // Search handler
  function handleSearch(e) {
    e.preventDefault();
    setPage(1);
    setSearch(searchInput);
  }

  // Sort handler (client-side sort of current page)
  function handleSort(column) {
    if (sortBy === column) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(column);
      setSortDir("desc");
    }
  }

  // Apply client-side sorting
  const sortedCoaches = [...coaches].sort((a, b) => {
    const aVal = a[sortBy] ?? 0;
    const bVal = b[sortBy] ?? 0;
    if (typeof aVal === "string") {
      return sortDir === "asc"
        ? aVal.localeCompare(bVal)
        : bVal.localeCompare(aVal);
    }
    return sortDir === "asc" ? aVal - bVal : bVal - aVal;
  });

  const totalPages = Math.ceil(totalCoachCount / LIMIT);

  return (
    <div className="animate-fade-up">
      <PageHeader
        title="Organization"
        actions={
          <div className="flex items-center gap-3">
            <Link
              href="/dashboard/organization/neglected"
              className="font-display inline-flex items-center gap-2 rounded-2xl border-2 border-gray-200 bg-white px-5 py-3 text-base font-bold text-gray-700 shadow-sm transition-all hover:border-coral-300 hover:bg-coral-50 hover:text-coral-600"
            >
              <span className="text-lg">👀</span>
              Needs Attention
            </Link>
            <Link
              href="/dashboard/org-import"
              className="font-display inline-flex items-center gap-2 rounded-2xl bg-coral-400 px-6 py-3 text-base font-bold text-white shadow-lg transition-all hover:bg-coral-500 hover:shadow-xl"
            >
              <span className="text-lg">📥</span>
              Import Data
            </Link>
          </div>
        }
      />

      {error && <ErrorBanner message={error} onRetry={() => window.location.reload()} />}

      {/* ----------------------------------------------------------------- */}
      {/* ESCALATION ALERT                                                   */}
      {/* ----------------------------------------------------------------- */}
      {escalationCount > 0 && (
        <Link
          href="/dashboard/organization/escalations"
          className="mb-6 block rounded-2xl border-2 border-coral-200 bg-coral-50 px-6 py-5 transition-all hover:border-coral-400 hover:shadow-md"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-2xl">⚠️</span>
              <p className="font-display text-base font-bold text-coral-700">
                {escalationCount} client{escalationCount !== 1 ? "s" : ""} need{escalationCount === 1 ? "s" : ""} attention — automated outreach isn't working.
              </p>
            </div>
            <span className="font-display shrink-0 text-sm font-bold text-coral-500">
              View Escalations →
            </span>
          </div>
        </Link>
      )}

      {/* ----------------------------------------------------------------- */}
      {/* STAT CARDS                                                         */}
      {/* ----------------------------------------------------------------- */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          emoji="👥"
          value={stats?.total_clients}
          label="Total People"
          loading={statsLoading}
        />
        <StatCard
          emoji="🏃"
          value={stats?.active_clients}
          label="Active"
          loading={statsLoading}
        />
        <StatCard
          emoji="🔄"
          value={stats?.reverted_clients}
          label="Reverted"
          loading={statsLoading}
        />
        <StatCard
          emoji="👨‍🏫"
          value={stats?.total_coaches}
          label="Coaches"
          loading={statsLoading}
        />
        <StatCard
          emoji="📧"
          value={stats?.clients_with_email}
          label="Have Email"
          loading={statsLoading}
        />
        <StatCard
          emoji="📱"
          value={stats?.clients_with_phone}
          label="Have Phone"
          loading={statsLoading}
        />
      </div>

      {/* ----------------------------------------------------------------- */}
      {/* NEVER CONTACTED ALERT                                              */}
      {/* ----------------------------------------------------------------- */}
      {!statsLoading && stats?.never_contacted > 0 && (
        <Link
          href="/dashboard/organization/neglected"
          className="mt-6 block rounded-2xl border border-warm-200 bg-warm-50 px-6 py-5 transition-all hover:border-coral-300 hover:shadow-md sm:px-8 sm:py-6"
        >
          <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
              <span className="text-3xl">⚠️</span>
              <div>
                <p className="font-display text-lg font-bold text-gray-900">
                  {stats.never_contacted.toLocaleString()} people have never
                  been contacted
                </p>
                <p className="font-body mt-1 text-sm text-gray-600">
                  These people have no recorded contact date from their coach.
                  This is the biggest opportunity for outreach.
                </p>
              </div>
            </div>
            <span className="font-display shrink-0 text-sm font-bold text-coral-500">
              View All →
            </span>
          </div>
        </Link>
      )}
      {statsLoading && (
        <div className="mt-6 rounded-2xl border-2 border-gray-100 bg-white px-8 py-6">
          <Skeleton className="h-6 w-80" />
          <Skeleton className="mt-2 h-4 w-60" />
        </div>
      )}

      {/* ----------------------------------------------------------------- */}
      {/* COACHES TABLE                                                      */}
      {/* ----------------------------------------------------------------- */}
      <div className="mt-8">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="font-display text-xl font-bold text-gray-900">
            Coaches
          </h2>
          {/* Search bar */}
          <form onSubmit={handleSearch} className="flex gap-2">
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search by coach name..."
              className="font-body w-full sm:w-64 rounded-xl border-2 border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-brand-400 focus:outline-none"
            />
            <button
              type="submit"
              className="font-body rounded-xl bg-brand-50 px-4 py-2.5 text-sm font-bold text-brand-600 transition-colors hover:bg-brand-100"
            >
              Search
            </button>
          </form>
        </div>

        <div className="overflow-x-auto rounded-2xl border-2 border-gray-100 bg-white">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th
                  onClick={() => handleSort("full_name")}
                  className="font-body cursor-pointer whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500 select-none hover:text-gray-700"
                >
                  Coach Name
                  <SortArrow column="full_name" sortBy={sortBy} sortDir={sortDir} />
                </th>
                <th className="font-body whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500 hidden md:table-cell">
                  Optavia ID
                </th>
                <th
                  onClick={() => handleSort("client_count")}
                  className="font-body cursor-pointer whitespace-nowrap px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500 select-none hover:text-gray-700"
                >
                  Total Clients
                  <SortArrow column="client_count" sortBy={sortBy} sortDir={sortDir} />
                </th>
                <th
                  onClick={() => handleSort("active_count")}
                  className="font-body cursor-pointer whitespace-nowrap px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500 select-none hover:text-gray-700"
                >
                  Active
                  <SortArrow column="active_count" sortBy={sortBy} sortDir={sortDir} />
                </th>
                <th
                  onClick={() => handleSort("reverted_count")}
                  className="font-body cursor-pointer whitespace-nowrap px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500 select-none hover:text-gray-700 hidden md:table-cell"
                >
                  Reverted
                  <SortArrow column="reverted_count" sortBy={sortBy} sortDir={sortDir} />
                </th>
                <th
                  onClick={() => handleSort("relationship_score")}
                  className="font-body cursor-pointer whitespace-nowrap px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500 select-none hover:text-gray-700"
                >
                  Score
                  <SortArrow column="relationship_score" sortBy={sortBy} sortDir={sortDir} />
                </th>
              </tr>
            </thead>
            <tbody>
              {coachesLoading &&
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={`skel-${i}`} className="border-b border-gray-50 last:border-0">
                    <td className="px-4 py-3"><Skeleton className="h-5 w-40" /></td>
                    <td className="px-4 py-3 hidden md:table-cell"><Skeleton className="h-5 w-24" /></td>
                    <td className="px-4 py-3 text-right"><Skeleton className="ml-auto h-5 w-12" /></td>
                    <td className="px-4 py-3 text-right"><Skeleton className="ml-auto h-5 w-12" /></td>
                    <td className="px-4 py-3 text-right hidden md:table-cell"><Skeleton className="ml-auto h-5 w-12" /></td>
                    <td className="px-4 py-3 text-right"><Skeleton className="ml-auto h-5 w-16" /></td>
                  </tr>
                ))}

              {!coachesLoading && sortedCoaches.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-6">
                    {search ? (
                      <EmptyState icon="🔍" title="No coaches match your search" subtitle="Try clearing your search" />
                    ) : (
                      <EmptyState icon="🏢" title="No coaches in your organization yet" subtitle="Import your organization CSV to get started" />
                    )}
                  </td>
                </tr>
              )}

              {!coachesLoading &&
                sortedCoaches.map((coach) => (
                  <tr
                    key={coach.id}
                    className="cursor-pointer border-b border-gray-50 transition-colors last:border-0 hover:bg-brand-50/50"
                  >
                    <td className="px-4 py-3">
                      <Link
                        href={`/dashboard/organization/coach/${coach.id}`}
                        className="font-body font-semibold text-gray-900 hover:text-brand-500"
                      >
                        {coach.full_name}
                      </Link>
                    </td>
                    <td className="font-body whitespace-nowrap px-4 py-3 text-gray-500 hidden md:table-cell">
                      {coach.optavia_id}
                    </td>
                    <td className="font-body whitespace-nowrap px-4 py-3 text-right font-bold text-gray-900">
                      {coach.client_count.toLocaleString()}
                    </td>
                    <td className="font-body whitespace-nowrap px-4 py-3 text-right font-semibold text-brand-500">
                      {coach.active_count.toLocaleString()}
                    </td>
                    <td className="font-body whitespace-nowrap px-4 py-3 text-right font-semibold text-coral-400 hidden md:table-cell">
                      {coach.reverted_count.toLocaleString()}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      <ScoreBadge score={coach.relationship_score} />
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {!coachesLoading && totalPages > 1 && (
          <div className="mt-4 flex items-center justify-between">
            <p className="font-body text-sm text-gray-500">
              Page {page} of {totalPages} ({totalCoachCount.toLocaleString()}{" "}
              coaches)
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="font-body rounded-xl border-2 border-gray-200 bg-white px-4 py-2 text-sm font-bold text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Previous
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="font-body rounded-xl border-2 border-gray-200 bg-white px-4 py-2 text-sm font-bold text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
