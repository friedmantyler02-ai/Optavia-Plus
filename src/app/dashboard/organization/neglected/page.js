"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import ErrorBanner from "../../components/ErrorBanner";
import EmptyState from "../../components/EmptyState";
import PageHeader from "../../components/PageHeader";
import useShowToast from "@/hooks/useShowToast";
import BulkAssignModal from "../../components/BulkAssignModal";

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
function TierCard({ emoji, label, count, description, active, onClick, loading, onSelectTier, tierSelected }) {
  return (
    <div
      className={`rounded-2xl border-2 bg-white p-5 text-left transition-all hover:shadow-md ${
        active
          ? "border-coral-400 shadow-md"
          : "border-gray-100 hover:border-gray-200"
      }`}
    >
      <button onClick={onClick} className="w-full text-left">
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
      {onSelectTier && count > 0 && (
        <button
          onClick={(e) => { e.stopPropagation(); onSelectTier(); }}
          className={`font-body mt-3 rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${
            tierSelected
              ? "bg-brand-100 text-brand-600"
              : "bg-gray-100 text-gray-500 hover:bg-brand-50 hover:text-brand-500"
          }`}
        >
          {tierSelected ? `Deselect ${label}` : `Select All ${label}`}
        </button>
      )}
    </div>
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
  const [error, setError] = useState(null);

  // Filters
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [tier, setTier] = useState("all");
  const [coachFilter, setCoachFilter] = useState("");

  const LIMIT = 25;

  // Selection state
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [showModal, setShowModal] = useState(false);
  const showToast = useShowToast();

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
      setError("Failed to load neglected clients.");
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

  // ── Selection helpers ─────────────────────────────────────────────
  const clientsByTier = useMemo(() => {
    const map = { critical: [], warning: [], watch: [] };
    for (const c of clients) {
      if (c.neglect_tier && map[c.neglect_tier]) map[c.neglect_tier].push(c);
    }
    return map;
  }, [clients]);

  const selectedClients = useMemo(
    () => clients.filter((c) => selectedIds.has(c.id)),
    [clients, selectedIds]
  );

  const allOnPageSelected =
    clients.length > 0 && clients.every((c) => selectedIds.has(c.id));

  function toggleSelectAll() {
    if (allOnPageSelected) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        for (const c of clients) next.delete(c.id);
        return next;
      });
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        for (const c of clients) next.add(c.id);
        return next;
      });
    }
  }

  function toggleOne(id) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectTier(tierKey) {
    const tierClients = clientsByTier[tierKey] ?? [];
    setSelectedIds((prev) => {
      const next = new Set(prev);
      const allAlready = tierClients.length > 0 && tierClients.every((c) => next.has(c.id));
      if (allAlready) {
        for (const c of tierClients) next.delete(c.id);
      } else {
        for (const c of tierClients) next.add(c.id);
      }
      return next;
    });
  }

  function isTierSelected(tierKey) {
    const tierClients = clientsByTier[tierKey] ?? [];
    return tierClients.length > 0 && tierClients.every((c) => selectedIds.has(c.id));
  }

  function clearSelection() {
    setSelectedIds(new Set());
  }

  function handleAssignComplete() {
    const count = selectedIds.size;
    clearSelection();
    fetchData();
    showToast({ message: `Sequence assigned to ${count} clients`, variant: "success" });
  }

  const totalPages = Math.ceil(totalCount / LIMIT);
  const totalNeglected =
    tierCounts.critical + tierCounts.warning + tierCounts.watch;

  return (
    <div className="animate-fade-up pb-24">
      <PageHeader
        title="Neglected Clients"
        breadcrumbs={[{ label: "Organization", href: "/dashboard/organization" }, { label: "Neglected Clients" }]}
      />

      {error && <ErrorBanner message={error} onRetry={() => { setError(null); fetchData(); }} />}

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
          onSelectTier={() => selectTier("critical")}
          tierSelected={isTierSelected("critical")}
        />
        <TierCard
          emoji="🟡"
          label="Warning"
          count={tierCounts.warning}
          description="No contact, no order in 6-12 months"
          active={tier === "warning"}
          onClick={() => handleTierClick("warning")}
          loading={loading && totalNeglected === 0}
          onSelectTier={() => selectTier("warning")}
          tierSelected={isTierSelected("warning")}
        />
        <TierCard
          emoji="🟠"
          label="Watch"
          count={tierCounts.watch}
          description="No contact, no order in 3-6 months"
          active={tier === "watch"}
          onClick={() => handleTierClick("watch")}
          loading={loading && totalNeglected === 0}
          onSelectTier={() => selectTier("watch")}
          tierSelected={isTierSelected("watch")}
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
                <th className="w-10 px-3 py-3">
                  <input
                    type="checkbox"
                    checked={allOnPageSelected && clients.length > 0}
                    onChange={toggleSelectAll}
                    className="h-4 w-4 cursor-pointer rounded border-gray-300 accent-brand-500"
                  />
                </th>
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
                    <td className="px-3 py-3"><Skeleton className="h-4 w-4" /></td>
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
                  <td colSpan={8} className="px-4 py-6">
                    <EmptyState icon="🎉" title="No neglected clients right now" subtitle="Everyone in this tier has been contacted recently." />
                  </td>
                </tr>
              )}

              {/* Client rows */}
              {!loading &&
                clients.map((client) => (
                  <tr
                    key={client.id}
                    className={`border-b border-gray-50 transition-colors last:border-0 ${
                      selectedIds.has(client.id) ? "bg-brand-50" : "hover:bg-brand-50/50"
                    }`}
                  >
                    <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selectedIds.has(client.id)}
                        onChange={() => toggleOne(client.id)}
                        className="h-4 w-4 cursor-pointer rounded border-gray-300 accent-brand-500"
                      />
                    </td>
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

      {/* ── Floating action bar ──────────────────────────────────────── */}
      <div
        className={`fixed bottom-6 left-1/2 z-50 -translate-x-1/2 transition-all duration-300 ease-out ${
          selectedIds.size > 0
            ? "translate-y-0 opacity-100"
            : "pointer-events-none translate-y-4 opacity-0"
        }`}
      >
        <div className="flex items-center gap-4 rounded-2xl border-2 border-gray-100 bg-white px-6 py-3 shadow-lg">
          <span className="font-body text-sm font-bold text-gray-900">
            {selectedIds.size.toLocaleString()} client{selectedIds.size !== 1 ? "s" : ""} selected
          </span>
          <button
            onClick={() => setShowModal(true)}
            className="font-display rounded-xl bg-brand-500 px-5 py-2 text-sm font-bold text-white shadow transition-all hover:bg-brand-600 hover:shadow-md"
          >
            Assign Sequence
          </button>
          <button
            onClick={clearSelection}
            className="font-body text-sm font-medium text-gray-400 transition-colors hover:text-gray-600"
          >
            Clear Selection
          </button>
        </div>
      </div>

      {/* ── Bulk assign modal ────────────────────────────────────────── */}
      <BulkAssignModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        selectedClients={selectedClients}
        onAssignComplete={handleAssignComplete}
      />
    </div>
  );
}
