"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useParams } from "next/navigation";
import { useCoach } from "../../../layout";
import Link from "next/link";
import BulkAssignModal from "../../../components/BulkAssignModal";

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------
function Skeleton({ className = "" }) {
  return (
    <div className={`animate-pulse rounded-lg bg-gray-200 ${className}`} />
  );
}

// ---------------------------------------------------------------------------
// Stat card (same pattern as org dashboard)
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
// Status badge
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
// Sort arrow
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
// Main page
// ---------------------------------------------------------------------------
export default function CoachDetailPage() {
  const { id } = useParams();
  const { supabase } = useCoach();

  const [coach, setCoach] = useState(null);
  const [stats, setStats] = useState(null);
  const [clients, setClients] = useState([]);
  const [totalClientCount, setTotalClientCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Table controls
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortBy, setSortBy] = useState("full_name");
  const [sortDir, setSortDir] = useState("asc");

  const LIMIT = 25;

  // Selection state
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [showModal, setShowModal] = useState(false);

  // ── Fetch data ────────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(LIMIT),
      });
      if (search) params.set("search", search);
      if (statusFilter !== "all") params.set("status", statusFilter);

      const res = await fetch(`/api/org/coaches/${id}?${params}`);
      if (res.status === 404) {
        setError("Coach not found.");
        setLoading(false);
        return;
      }
      if (!res.ok) {
        setError("Failed to load coach data.");
        setLoading(false);
        return;
      }
      const data = await res.json();
      setCoach(data.coach);
      setStats(data.stats);
      setClients(data.clients ?? []);
      setTotalClientCount(data.total_client_count ?? 0);
    } catch (err) {
      console.error("Coach detail fetch error:", err);
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [id, page, search, statusFilter]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ── Search / filter handlers ──────────────────────────────────────
  function handleSearch(e) {
    e.preventDefault();
    setPage(1);
    setSearch(searchInput);
  }

  function handleStatusChange(e) {
    setPage(1);
    setStatusFilter(e.target.value);
  }

  function handleSort(column) {
    if (sortBy === column) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(column);
      setSortDir(column === "full_name" ? "asc" : "desc");
    }
  }

  // Client-side sort of the current page
  const sortedClients = [...clients].sort((a, b) => {
    let aVal = a[sortBy];
    let bVal = b[sortBy];
    // Nulls to bottom
    if (aVal == null && bVal == null) return 0;
    if (aVal == null) return 1;
    if (bVal == null) return -1;
    if (typeof aVal === "string") {
      return sortDir === "asc"
        ? aVal.localeCompare(bVal)
        : bVal.localeCompare(aVal);
    }
    return sortDir === "asc" ? aVal - bVal : bVal - aVal;
  });

  // ── Selection helpers ──────────────────────────────────────────────
  const selectedClients = useMemo(
    () => sortedClients.filter((c) => selectedIds.has(c.id)),
    [sortedClients, selectedIds]
  );

  const allOnPageSelected =
    sortedClients.length > 0 && sortedClients.every((c) => selectedIds.has(c.id));

  function toggleSelectAll() {
    if (allOnPageSelected) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        for (const c of sortedClients) next.delete(c.id);
        return next;
      });
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        for (const c of sortedClients) next.add(c.id);
        return next;
      });
    }
  }

  function toggleOne(clientId) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(clientId)) next.delete(clientId);
      else next.add(clientId);
      return next;
    });
  }

  function clearSelection() {
    setSelectedIds(new Set());
  }

  function handleAssignComplete() {
    clearSelection();
    fetchData();
  }

  const totalPages = Math.ceil(totalClientCount / LIMIT);
  const statsLoading = loading && !stats;

  // ── Error state ───────────────────────────────────────────────────
  if (error && !coach) {
    return (
      <div className="animate-fade-up">
        <Link
          href="/dashboard/organization"
          className="font-body mb-6 inline-flex items-center gap-1 text-sm font-semibold text-brand-500 hover:text-brand-600"
        >
          ← Back to Organization
        </Link>
        <div className="rounded-2xl border-2 border-gray-100 bg-white px-8 py-16 text-center">
          <p className="text-5xl">😕</p>
          <p className="font-display mt-4 text-xl font-bold text-gray-900">
            {error}
          </p>
          <p className="font-body mt-2 text-sm text-gray-500">
            The coach you're looking for doesn't exist or couldn't be loaded.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-up pb-24">
      {/* ── Back link ──────────────────────────────────────────────── */}
      <Link
        href="/dashboard/organization"
        className="font-body mb-6 inline-flex items-center gap-1 text-sm font-semibold text-brand-500 hover:text-brand-600"
      >
        ← Back to Organization
      </Link>

      {/* ── Coach header card ──────────────────────────────────────── */}
      <div className="mb-8 rounded-2xl border-2 border-gray-100 bg-white p-6 sm:p-8">
        {statsLoading ? (
          <div>
            <Skeleton className="h-8 w-64" />
            <Skeleton className="mt-3 h-4 w-40" />
          </div>
        ) : (
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-3">
                <h1 className="font-display text-2xl font-bold text-gray-900">
                  {coach?.full_name}
                </h1>
                {coach?.is_stub && (
                  <span className="rounded-full bg-warm-100 px-3 py-0.5 text-xs font-bold text-warm-500">
                    Pending Signup
                  </span>
                )}
              </div>
              <div className="font-body mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-500">
                <span>ID: {coach?.optavia_id}</span>
                {coach?.email && <span>📧 {coach.email}</span>}
                {coach?.phone && <span>📱 {coach.phone}</span>}
                {coach?.rank && coach.rank !== "New Coach" && (
                  <span>🏅 {coach.rank}</span>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Stat cards ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          emoji="👥"
          value={stats?.total_clients}
          label="Total Clients"
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
          emoji="📵"
          value={stats?.never_contacted}
          label="Never Contacted"
          loading={statsLoading}
        />
      </div>

      {/* ── Client table ───────────────────────────────────────────── */}
      <div className="mt-8">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="font-display text-xl font-bold text-gray-900">
            Clients
          </h2>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            {/* Status filter */}
            <select
              value={statusFilter}
              onChange={handleStatusChange}
              className="font-body rounded-xl border-2 border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-700 focus:border-brand-400 focus:outline-none"
            >
              <option value="all">All Statuses</option>
              <option value="Active">Active</option>
              <option value="Reverted">Reverted</option>
            </select>
            {/* Search */}
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

        <div className="overflow-x-auto rounded-2xl border-2 border-gray-100 bg-white">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="w-10 px-3 py-3">
                  <input
                    type="checkbox"
                    checked={allOnPageSelected && sortedClients.length > 0}
                    onChange={toggleSelectAll}
                    className="h-4 w-4 cursor-pointer rounded border-gray-300 accent-brand-500"
                  />
                </th>
                <th
                  onClick={() => handleSort("full_name")}
                  className="font-body cursor-pointer whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500 select-none hover:text-gray-700"
                >
                  Name
                  <SortArrow column="full_name" sortBy={sortBy} sortDir={sortDir} />
                </th>
                <th className="font-body whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Email
                </th>
                <th className="font-body whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Phone
                </th>
                <th className="font-body whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Status
                </th>
                <th
                  onClick={() => handleSort("last_order_date")}
                  className="font-body cursor-pointer whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500 select-none hover:text-gray-700"
                >
                  Last Order
                  <SortArrow column="last_order_date" sortBy={sortBy} sortDir={sortDir} />
                </th>
                <th
                  onClick={() => handleSort("pqv")}
                  className="font-body cursor-pointer whitespace-nowrap px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500 select-none hover:text-gray-700"
                >
                  PQV
                  <SortArrow column="pqv" sortBy={sortBy} sortDir={sortDir} />
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
                  <tr key={`skel-${i}`} className="border-b border-gray-50 last:border-0">
                    <td className="px-3 py-3"><Skeleton className="h-4 w-4" /></td>
                    <td className="px-4 py-3"><Skeleton className="h-5 w-36" /></td>
                    <td className="px-4 py-3"><Skeleton className="h-5 w-32" /></td>
                    <td className="px-4 py-3"><Skeleton className="h-5 w-24" /></td>
                    <td className="px-4 py-3"><Skeleton className="h-5 w-16" /></td>
                    <td className="px-4 py-3"><Skeleton className="h-5 w-20" /></td>
                    <td className="px-4 py-3 text-right"><Skeleton className="ml-auto h-5 w-14" /></td>
                    <td className="px-4 py-3 text-center"><Skeleton className="mx-auto h-5 w-6" /></td>
                  </tr>
                ))}

              {/* Empty state */}
              {!loading && sortedClients.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-14 text-center">
                    <p className="text-4xl">📭</p>
                    <p className="font-display mt-3 text-lg font-bold text-gray-900">
                      {search || statusFilter !== "all"
                        ? "No clients match your filters"
                        : "No clients yet"}
                    </p>
                    <p className="font-body mt-1 text-sm text-gray-500">
                      {search || statusFilter !== "all"
                        ? "Try adjusting your search or status filter."
                        : "This coach doesn't have any imported clients."}
                    </p>
                  </td>
                </tr>
              )}

              {/* Client rows */}
              {!loading &&
                sortedClients.map((client) => (
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
                    <td className="font-body max-w-[180px] truncate whitespace-nowrap px-4 py-3 text-gray-500">
                      {client.email || "—"}
                    </td>
                    <td className="font-body whitespace-nowrap px-4 py-3 text-gray-500">
                      {client.phone || "—"}
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
                    <td className="whitespace-nowrap px-4 py-3 text-center text-brand-500">
                      {client.is_premier_member ? "✓" : ""}
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
              Page {page} of {totalPages} ({totalClientCount.toLocaleString()}{" "}
              clients)
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
