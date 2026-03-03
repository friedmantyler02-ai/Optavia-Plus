"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

// ---------------------------------------------------------------------------
// Skeleton pulse
// ---------------------------------------------------------------------------
function Skeleton({ className = "" }) {
  return (
    <div className={`animate-pulse rounded-lg bg-gray-200 ${className}`} />
  );
}

// ---------------------------------------------------------------------------
// Status badge (Active / Reverted)
// ---------------------------------------------------------------------------
function StatusBadge({ status }) {
  const config = {
    Active: { bg: "#f0f7f2", text: "#4a7c59" },
    Reverted: { bg: "#faf0e8", text: "#a86b47" },
  };
  const c = config[status] ?? { bg: "#f3f4f6", text: "#6b7280" };
  return (
    <span
      className="inline-block rounded-full px-2.5 py-0.5 text-xs font-bold"
      style={{ backgroundColor: c.bg, color: c.text }}
    >
      {status}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Tier badge (Critical / Warning / Watch)
// ---------------------------------------------------------------------------
function TierBadge({ tier }) {
  const config = {
    critical: { bg: "#fef2f2", text: "#dc2626", label: "Critical" },
    warning: { bg: "#fffbeb", text: "#d97706", label: "Warning" },
    watch: { bg: "#fff7ed", text: "#ea580c", label: "Watch" },
  };
  const c = config[tier] ?? config.watch;
  return (
    <span
      className="inline-block rounded-full px-2.5 py-0.5 text-xs font-bold"
      style={{ backgroundColor: c.bg, color: c.text }}
    >
      {c.label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Format helpers
// ---------------------------------------------------------------------------
function fmtDate(dateStr) {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function fmtPqv(val) {
  if (val == null) return "—";
  return Number(val).toLocaleString();
}

// ---------------------------------------------------------------------------
// Tier summary card
// ---------------------------------------------------------------------------
function TierCard({ emoji, label, count, description, active, onClick, loading }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-2xl border-2 bg-white p-5 text-left transition-all hover:shadow-md ${
        active
          ? "border-coral-400 shadow-md"
          : "border-gray-100 hover:border-gray-200"
      }`}
    >
      <div className="mb-2 text-2xl">{emoji}</div>
      {loading ? (
        <Skeleton className="h-8 w-16" />
      ) : (
        <p className="font-display text-2xl font-bold text-gray-900">
          {(count ?? 0).toLocaleString()}
        </p>
      )}
      <p className="font-display mt-1 text-sm font-bold text-gray-700">
        {label}
      </p>
      <p className="font-body mt-1 text-xs text-gray-500">{description}</p>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------
export default function NeglectedClientsPage() {
  const [clients, setClients] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [tierCounts, setTierCounts] = useState({
    critical: 0,
    warning: 0,
    watch: 0,
  });
  const [loading, setLoading] = useState(true);

  // Filters
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [tier, setTier] = useState("all");
  const [coachFilter, setCoachFilter] = useState("");

  const LIMIT = 25;

  // ── Fetch data ──────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(LIMIT),
      });
      if (search) params.set("search", search);
      if (tier !== "all") params.set("tier", tier);
      if (coachFilter) params.set("coach_id", coachFilter);

      const res = await fetch(`/api/org/neglected?${params}`);
      if (res.ok) {
        const data = await res.json();
        setClients(data.clients ?? []);
        setTotalCount(data.total_count ?? 0);
        setTierCounts(
          data.tier_counts ?? { critical: 0, warning: 0, watch: 0 }
        );
      }
    } catch (err) {
      console.error("Failed to fetch neglected clients:", err);
    } finally {
      setLoading(false);
    }
  }, [page, search, tier, coachFilter]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ── Handlers ────────────────────────────────────────────────────
  function handleSearch(e) {
    e.preventDefault();
    setPage(1);
    setSearch(searchInput);
  }

  function handleTierClick(newTier) {
    setPage(1);
    setTier(tier === newTier ? "all" : newTier);
  }

  function handleTierButton(newTier) {
    setPage(1);
    setTier(newTier);
  }

  // Build unique coaches from results for filter dropdown
  const coachOptions = [];
  const seenCoaches = new Set();
  for (const c of clients) {
    if (c.coach_id && !seenCoaches.has(c.coach_id)) {
      seenCoaches.add(c.coach_id);
      coachOptions.push({ id: c.coach_id, name: c.coach_name });
    }
  }
  coachOptions.sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));

  const totalPages = Math.ceil(totalCount / LIMIT);
  const totalNeglected =
    tierCounts.critical + tierCounts.warning + tierCounts.watch;

  return (
    <div className="animate-fade-up">
      {/* ── Back link ──────────────────────────────────────────────── */}
      <Link
        href="/dashboard/organization"
        className="font-body mb-6 inline-flex items-center gap-1 text-sm font-semibold text-brand-500 hover:text-brand-600"
      >
        ← Back to Organization
      </Link>

      {/* ── Header ─────────────────────────────────────────────────── */}
      <div className="mb-8">
        <h1 className="font-display text-2xl font-bold text-gray-900">
          Needs Attention
        </h1>
        <p className="font-body mt-1 text-sm text-gray-500">
          People who haven&apos;t been contacted and may be slipping away
        </p>
      </div>

      {/* ── Tier summary cards ─────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <TierCard
          emoji="🔴"
          label="Critical"
          count={tierCounts.critical}
          description="No contact, no order in 12+ months"
          active={tier === "critical"}
          onClick={() => handleTierClick("critical")}
          loading={loading && totalNeglected === 0}
        />
        <TierCard
          emoji="🟡"
          label="Warning"
          count={tierCounts.warning}
          description="No contact, no order in 6-12 months"
          active={tier === "warning"}
          onClick={() => handleTierClick("warning")}
          loading={loading && totalNeglected === 0}
        />
        <TierCard
          emoji="🟠"
          label="Watch"
          count={tierCounts.watch}
          description="No contact, no order in 3-6 months"
          active={tier === "watch"}
          onClick={() => handleTierClick("watch")}
          loading={loading && totalNeglected === 0}
        />
      </div>

      {/* ── Filters bar ────────────────────────────────────────────── */}
      <div className="mt-8">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          {/* Tier filter buttons */}
          <div className="flex gap-2">
            {[
              { key: "all", label: "All" },
              { key: "critical", label: "Critical" },
              { key: "warning", label: "Warning" },
              { key: "watch", label: "Watch" },
            ].map((t) => (
              <button
                key={t.key}
                onClick={() => handleTierButton(t.key)}
                className={`font-body rounded-xl px-4 py-2 text-sm font-bold transition-colors ${
                  tier === t.key
                    ? "bg-brand-500 text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Search + coach filter */}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            {coachOptions.length > 1 && (
              <select
                value={coachFilter}
                onChange={(e) => {
                  setPage(1);
                  setCoachFilter(e.target.value);
                }}
                className="font-body rounded-xl border-2 border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-700 focus:border-brand-400 focus:outline-none"
              >
                <option value="">All Coaches</option>
                {coachOptions.map((co) => (
                  <option key={co.id} value={co.id}>
                    {co.name}
                  </option>
                ))}
              </select>
            )}
            <form onSubmit={handleSearch} className="flex gap-2">
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search by name..."
                className="font-body w-56 rounded-xl border-2 border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-brand-400 focus:outline-none"
              />
              <button
                type="submit"
                className="font-body rounded-xl bg-brand-50 px-4 py-2.5 text-sm font-bold text-brand-600 transition-colors hover:bg-brand-100"
              >
                Search
              </button>
            </form>
          </div>
        </div>

        {/* ── Client table ───────────────────────────────────────── */}
        <div className="overflow-x-auto rounded-2xl border-2 border-gray-100 bg-white">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="font-body whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Name
                </th>
                <th className="font-body whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Coach
                </th>
                <th className="font-body whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Status
                </th>
                <th className="font-body whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Last Order
                </th>
                <th className="font-body whitespace-nowrap px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">
                  PQV
                </th>
                <th className="font-body whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Tier
                </th>
                <th className="font-body whitespace-nowrap px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Premier
                </th>
              </tr>
            </thead>
            <tbody>
              {/* Loading skeletons */}
              {loading &&
                clients.length === 0 &&
                Array.from({ length: 5 }).map((_, i) => (
                  <tr
                    key={`skel-${i}`}
                    className="border-b border-gray-50 last:border-0"
                  >
                    <td className="px-4 py-3">
                      <Skeleton className="h-5 w-36" />
                    </td>
                    <td className="px-4 py-3">
                      <Skeleton className="h-5 w-28" />
                    </td>
                    <td className="px-4 py-3">
                      <Skeleton className="h-5 w-16" />
                    </td>
                    <td className="px-4 py-3">
                      <Skeleton className="h-5 w-20" />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Skeleton className="ml-auto h-5 w-14" />
                    </td>
                    <td className="px-4 py-3">
                      <Skeleton className="h-5 w-16" />
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Skeleton className="mx-auto h-5 w-6" />
                    </td>
                  </tr>
                ))}

              {/* Empty state */}
              {!loading && clients.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-14 text-center">
                    <p className="text-4xl">🎉</p>
                    <p className="font-display mt-3 text-lg font-bold text-gray-900">
                      {search || tier !== "all"
                        ? "No one matches your filters"
                        : "No one in this category — great news!"}
                    </p>
                    <p className="font-body mt-1 text-sm text-gray-500">
                      {search || tier !== "all"
                        ? "Try adjusting your search or tier filter."
                        : "Everyone is being taken care of."}
                    </p>
                  </td>
                </tr>
              )}

              {/* Client rows */}
              {!loading &&
                clients.map((client) => (
                  <tr
                    key={client.id}
                    className="cursor-pointer border-b border-gray-50 transition-colors last:border-0 hover:bg-brand-50/50"
                  >
                    <td className="px-4 py-3">
                      <Link
                        href={`/dashboard/clients/${client.id}`}
                        className="font-body font-semibold text-gray-900 hover:text-brand-500"
                      >
                        {client.full_name}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      {client.coach_id ? (
                        <Link
                          href={`/dashboard/organization/coach/${client.coach_id}`}
                          className="font-body text-sm text-gray-600 hover:text-brand-500"
                        >
                          {client.coach_name}
                        </Link>
                      ) : (
                        <span className="font-body text-sm text-gray-400">
                          —
                        </span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <StatusBadge status={client.account_status} />
                    </td>
                    <td className="font-body whitespace-nowrap px-4 py-3 text-gray-500">
                      {fmtDate(client.last_order_date)}
                    </td>
                    <td className="font-body whitespace-nowrap px-4 py-3 text-right font-semibold text-gray-900">
                      {fmtPqv(client.pqv)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <TierBadge tier={client.neglect_tier} />
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-center text-brand-500">
                      {client.is_premier_member ? "✓" : ""}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>

        {/* ── Pagination ─────────────────────────────────────────── */}
        {!loading && totalPages > 1 && (
          <div className="mt-4 flex items-center justify-between">
            <p className="font-body text-sm text-gray-500">
              Page {page} of {totalPages} ({totalCount.toLocaleString()}{" "}
              people)
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
