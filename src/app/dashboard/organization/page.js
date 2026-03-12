"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useCoach } from "../layout";
import Link from "next/link";
import { useRouter } from "next/navigation";
import SkeletonCard from "../components/SkeletonCard";
import ErrorBanner from "../components/ErrorBanner";
import EmptyState from "../components/EmptyState";
import LoadingSpinner from "../components/LoadingSpinner";
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
// Relationship score badge
// ---------------------------------------------------------------------------
function ScoreBadge({ score }) {
  let classes;
  if (score >= 70) {
    classes = "bg-green-100 text-green-700";
  } else if (score >= 40) {
    classes = "bg-yellow-100 text-yellow-700";
  } else {
    classes = "bg-red-100 text-red-700";
  }
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${classes}`}>
      {score}
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
      {sortDir === "asc" ? "\u2191" : "\u2193"}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Status badge for clients
// ---------------------------------------------------------------------------
function StatusBadge({ status }) {
  const colors = {
    Active: "bg-green-100 text-green-700",
    Reverted: "bg-gray-100 text-gray-500",
  };
  return (
    <span
      className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${
        colors[status] || "bg-yellow-100 text-yellow-700"
      }`}
    >
      {status || "Unknown"}
    </span>
  );
}

function formatDate(dateStr) {
  if (!dateStr) return "Never";
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatNumber(n) {
  if (n == null) return "\u2014";
  return n.toLocaleString();
}

// ---------------------------------------------------------------------------
// Clients table view
// ---------------------------------------------------------------------------
function ClientsView({ coachList }) {
  const router = useRouter();
  const [clients, setClients] = useState([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(50);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [coachFilter, setCoachFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const debounceRef = useRef(null);

  const handleSearchChange = useCallback((value) => {
    setSearch(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedSearch(value);
      setPage(1);
    }, 400);
  }, []);

  useEffect(() => {
    fetchClients();
  }, [page, debouncedSearch, coachFilter, statusFilter]);

  const fetchClients = async () => {
    setLoading(true);
    setError(null);

    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("limit", String(limit));
    if (debouncedSearch) params.set("search", debouncedSearch);
    if (coachFilter) params.set("coach_id", coachFilter);
    if (statusFilter) params.set("status", statusFilter);

    try {
      const res = await fetch(`/api/org/clients?${params.toString()}`);
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to load clients");
        return;
      }

      setClients(data.clients || []);
      setTotal(data.total ?? 0);
      setTotalPages(data.totalPages ?? 0);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const hasFilters = debouncedSearch || coachFilter || statusFilter;

  const clearFilters = () => {
    setSearch("");
    setDebouncedSearch("");
    setCoachFilter("");
    setStatusFilter("");
    setPage(1);
  };

  const rangeStart = total === 0 ? 0 : (page - 1) * limit + 1;
  const rangeEnd = Math.min(page * limit, total);

  return (
    <div>
      {/* Filter bar */}
      <div className="bg-white rounded-2xl border-2 border-gray-100 p-4 mb-4">
        <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
          <input
            type="text"
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Search by name or email..."
            className="flex-1 rounded-xl border-2 border-gray-200 px-4 py-2.5 font-body text-sm focus:outline-none focus:border-[#E8735A] focus:ring-1 focus:ring-[#E8735A]/30 transition-colors duration-150"
          />

          <select
            value={coachFilter}
            onChange={(e) => {
              setCoachFilter(e.target.value);
              setPage(1);
            }}
            className="rounded-xl border-2 border-gray-200 px-3 py-2.5 font-body text-sm bg-white focus:outline-none focus:border-[#E8735A] focus:ring-1 focus:ring-[#E8735A]/30 transition-colors duration-150"
          >
            <option value="">All Coaches</option>
            {coachList.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>

          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            className="rounded-xl border-2 border-gray-200 px-3 py-2.5 font-body text-sm bg-white focus:outline-none focus:border-[#E8735A] focus:ring-1 focus:ring-[#E8735A]/30 transition-colors duration-150"
          >
            <option value="">All Statuses</option>
            <option value="Active">Active</option>
            <option value="Reverted">Reverted</option>
          </select>

          {hasFilters && (
            <button
              onClick={clearFilters}
              className="text-sm font-semibold text-[#E8735A] hover:text-[#d4644d] whitespace-nowrap transition-colors duration-150"
            >
              Clear filters
            </button>
          )}
        </div>
      </div>

      {error && <ErrorBanner message={error} onRetry={fetchClients} />}

      {loading && (
        <div className="bg-white rounded-2xl border-2 border-gray-100">
          <LoadingSpinner message="Loading clients..." />
        </div>
      )}

      {!loading && !error && clients.length > 0 && (
        <div className="bg-white rounded-2xl border-2 border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b-2 border-gray-100">
                  <th className="text-left px-5 py-3 font-display text-xs font-bold text-gray-400 uppercase tracking-wider">
                    Name
                  </th>
                  <th className="text-left px-5 py-3 font-display text-xs font-bold text-gray-400 uppercase tracking-wider hidden md:table-cell">
                    Email
                  </th>
                  <th className="text-left px-5 py-3 font-display text-xs font-bold text-gray-400 uppercase tracking-wider">
                    Coach
                  </th>
                  <th className="text-left px-5 py-3 font-display text-xs font-bold text-gray-400 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="text-left px-5 py-3 font-display text-xs font-bold text-gray-400 uppercase tracking-wider">
                    Last Order
                  </th>
                  <th className="text-right px-5 py-3 font-display text-xs font-bold text-gray-400 uppercase tracking-wider hidden md:table-cell">
                    PQV
                  </th>
                </tr>
              </thead>
              <tbody>
                {clients.map((client) => (
                  <tr
                    key={client.id}
                    className="border-b border-gray-50 hover:bg-[#faf7f2] transition-colors duration-100"
                  >
                    <td className="px-5 py-3">
                      <button
                        onClick={() =>
                          router.push(`/dashboard/clients/${client.id}`)
                        }
                        className="font-body text-sm font-semibold text-gray-800 hover:text-[#E8735A] transition-colors duration-150 text-left"
                      >
                        {client.full_name}
                      </button>
                    </td>
                    <td className="px-5 py-3 font-body text-sm text-gray-500 hidden md:table-cell">
                      {client.email || "\u2014"}
                    </td>
                    <td className="px-5 py-3">
                      {client.coach_name ? (
                        <button
                          onClick={() =>
                            router.push(
                              `/dashboard/organization/coach/${client.coach_id}`
                            )
                          }
                          className="font-body text-sm text-gray-600 hover:text-[#E8735A] transition-colors duration-150 text-left"
                        >
                          {client.coach_name}
                        </button>
                      ) : (
                        <span className="font-body text-sm text-gray-400">
                          \u2014
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      <StatusBadge status={client.account_status} />
                    </td>
                    <td className="px-5 py-3 font-body text-sm text-gray-500">
                      {formatDate(client.last_order_date)}
                    </td>
                    <td className="px-5 py-3 font-body text-sm text-gray-700 text-right hidden md:table-cell">
                      {formatNumber(client.pqv)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="px-5 py-3 border-t-2 border-gray-100 flex items-center justify-between">
            <p className="font-body text-sm text-gray-500">
              Showing {rangeStart.toLocaleString()}&ndash;
              {rangeEnd.toLocaleString()} of {total.toLocaleString()}
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="px-3 py-1.5 rounded-lg text-sm font-bold disabled:text-gray-300 disabled:cursor-not-allowed text-[#E8735A] hover:bg-[#E8735A]/10 transition-colors duration-150"
              >
                Previous
              </button>
              <span className="font-body text-sm text-gray-500">
                Page {page} of {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="px-3 py-1.5 rounded-lg text-sm font-bold disabled:text-gray-300 disabled:cursor-not-allowed text-[#E8735A] hover:bg-[#E8735A]/10 transition-colors duration-150"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      )}

      {!loading && !error && clients.length === 0 && (
        <EmptyState
          icon={hasFilters ? "\uD83D\uDD0D" : "\uD83D\uDC64"}
          title={
            hasFilters ? "No clients match your filters" : "No clients found"
          }
          subtitle={
            hasFilters
              ? "Try a different search term or clear your filters"
              : "Clients will appear here once they are imported"
          }
          actionLabel={hasFilters ? "Clear filters" : undefined}
          onAction={hasFilters ? clearFilters : undefined}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------
export default function OrganizationPage() {
  const { supabase } = useCoach();

  // Tab state
  const [activeTab, setActiveTab] = useState("coaches");

  // Stats state
  const [stats, setStats] = useState(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [error, setError] = useState(null);

  // Escalation alert
  const [escalationCount, setEscalationCount] = useState(0);

  // Downline rank digest
  const [closeCoaches, setCloseCoaches] = useState([]);
  const [closeCoachesLoading, setCloseCoachesLoading] = useState(true);

  // Coaches table state
  const [coaches, setCoaches] = useState([]);
  const [coachesLoading, setCoachesLoading] = useState(true);
  const [totalCoachCount, setTotalCoachCount] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [sortBy, setSortBy] = useState("client_count");
  const [sortDir, setSortDir] = useState("desc");

  // Coach list for clients filter dropdown
  const [coachList, setCoachList] = useState([]);

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
    // Fetch downline rank stats
    fetch("/api/org/rank-stats?view=downline")
      .then((r) => r.ok ? r.json() : [])
      .then((d) => setCloseCoaches((d || []).filter((c) => c.is_close)))
      .catch(() => {})
      .finally(() => setCloseCoachesLoading(false));
    // Fetch coach names for clients filter
    fetch("/api/org/coaches?limit=500")
      .then((r) => r.json())
      .then((data) => {
        if (data.coaches) {
          setCoachList(
            data.coaches
              .map((c) => ({ id: c.id, name: c.full_name }))
              .sort((a, b) => a.name.localeCompare(b.name))
          );
        }
      })
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
              <span className="text-lg">{"\uD83D\uDC40"}</span>
              Needs Attention
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
              <span className="text-2xl">{"\u26A0\uFE0F"}</span>
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
      {/* COACHES CLOSE TO NEXT RANK                                         */}
      {/* ----------------------------------------------------------------- */}
      {!closeCoachesLoading && closeCoaches.length > 0 && (
        <div className="mb-6">
          <h3 className="font-display text-base font-bold text-gray-900 mb-3 flex items-center gap-2">
            {"\uD83D\uDD25"} Coaches Close to Next Rank
          </h3>
          <div className="flex gap-3 overflow-x-auto pb-2">
            {closeCoaches.map((c) => (
              <Link
                key={c.coach_id}
                href={`/dashboard/organization/coach/${c.coach_id}`}
                className="min-w-[200px] bg-white rounded-xl border border-gray-100 p-4 shadow-sm hover:shadow-md transition-shadow duration-150 shrink-0"
              >
                <p className="font-medium text-sm text-gray-900 truncate">{c.full_name}</p>
                <p className="text-xs text-gray-500 mt-1">
                  {c.current_rank.emoji} {c.current_rank.name}
                </p>
                <div className="h-2 w-full bg-gray-200 rounded-full overflow-hidden mt-2">
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{ width: c.progress_percent + "%", backgroundColor: c.current_rank.color }}
                  />
                </div>
                <p className="text-xs text-[#E8735A] font-medium mt-2">
                  {c.gqv_needed > 0
                    ? `${c.gqv_needed.toLocaleString()} GQV away from ${c.next_rank.name}`
                    : `${c.qp_needed} QP away from ${c.next_rank.name}`
                  }
                </p>
              </Link>
            ))}
          </div>
        </div>
      )}

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
              <span className="text-3xl">{"\u26A0\uFE0F"}</span>
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
      {/* COACHES / CLIENTS TOGGLE                                           */}
      {/* ----------------------------------------------------------------- */}
      <div className="mt-8 mb-4">
        <div className="inline-flex rounded-xl bg-white border-2 border-gray-100 p-1">
          <button
            onClick={() => setActiveTab("coaches")}
            className={`rounded-lg py-2 px-6 text-sm font-semibold transition-colors duration-150 ${
              activeTab === "coaches"
                ? "bg-[#E8735A] text-white"
                : "text-gray-600 hover:bg-gray-100"
            }`}
          >
            Coaches{!statsLoading && stats?.total_coaches != null ? ` (${stats.total_coaches.toLocaleString()})` : ""}
          </button>
          <button
            onClick={() => setActiveTab("clients")}
            className={`rounded-lg py-2 px-6 text-sm font-semibold transition-colors duration-150 ${
              activeTab === "clients"
                ? "bg-[#E8735A] text-white"
                : "text-gray-600 hover:bg-gray-100"
            }`}
          >
            Clients{!statsLoading && stats?.total_clients != null ? ` (${stats.total_clients.toLocaleString()})` : ""}
          </button>
        </div>
      </div>

      {/* ----------------------------------------------------------------- */}
      {/* COACHES TABLE                                                      */}
      {/* ----------------------------------------------------------------- */}
      {activeTab === "coaches" && (
        <div>
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
                className="font-body w-full sm:w-64 rounded-xl border-2 border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#E8735A] focus:border-transparent transition-colors duration-150"
              />
              <button
                type="submit"
                className="font-body rounded-xl bg-brand-50 px-4 py-2.5 text-sm font-bold text-brand-600 transition-colors duration-150 hover:bg-brand-100"
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
                  {/* Relationship Score column hidden — revisit later */}
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
                    </tr>
                  ))}

                {!coachesLoading && sortedCoaches.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-6">
                      {search ? (
                        <EmptyState icon={"\uD83D\uDD0D"} title="No coaches match your search" subtitle="Try clearing your search" />
                      ) : (
                        <EmptyState icon={"\uD83C\uDFE2"} title="No coaches in your organization yet" subtitle="Import your organization CSV to get started" />
                      )}
                    </td>
                  </tr>
                )}

                {!coachesLoading &&
                  sortedCoaches.map((coach) => (
                    <tr
                      key={coach.id}
                      className="cursor-pointer border-b border-gray-50 transition-colors duration-100 last:border-0 hover:bg-brand-50/50"
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
                      {/* Score cell hidden */}
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
      )}

      {/* ----------------------------------------------------------------- */}
      {/* CLIENTS TABLE                                                      */}
      {/* ----------------------------------------------------------------- */}
      {activeTab === "clients" && <ClientsView coachList={coachList} />}
    </div>
  );
}
