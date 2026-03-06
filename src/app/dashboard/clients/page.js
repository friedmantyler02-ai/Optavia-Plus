"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useCoach } from "../layout";
import { useRouter } from "next/navigation";
import PageHeader from "../components/PageHeader";
import LoadingSpinner from "../components/LoadingSpinner";
import EmptyState from "../components/EmptyState";
import ErrorBanner from "../components/ErrorBanner";

const STATUS_OPTIONS = ["Active", "Reverted", "Inactive", "New"];

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

export default function ClientsPage() {
  const { coach } = useCoach();
  const router = useRouter();

  const [clients, setClients] = useState([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(50);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filters
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [coachFilter, setCoachFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  // Coach list for dropdown
  const [coaches, setCoaches] = useState([]);

  const debounceRef = useRef(null);

  // Debounce search input
  const handleSearchChange = useCallback((value) => {
    setSearch(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedSearch(value);
      setPage(1);
    }, 400);
  }, []);

  // Load coach names for filter dropdown
  useEffect(() => {
    fetch("/api/org/coaches?limit=500")
      .then((r) => r.json())
      .then((data) => {
        if (data.coaches) {
          setCoaches(
            data.coaches
              .map((c) => ({ id: c.id, name: c.full_name }))
              .sort((a, b) => a.name.localeCompare(b.name))
          );
        }
      })
      .catch(() => {});
  }, []);

  // Fetch clients when filters or page change
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
      <PageHeader
        title="Clients"
        subtitle={
          total > 0
            ? `${total.toLocaleString()} clients in your organization`
            : undefined
        }
      />

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
            {coaches.map((c) => (
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
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
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

      {/* Error */}
      {error && <ErrorBanner message={error} onRetry={fetchClients} />}

      {/* Loading */}
      {loading && (
        <div className="bg-white rounded-2xl border-2 border-gray-100">
          <LoadingSpinner message="Loading clients..." />
        </div>
      )}

      {/* Results table */}
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

      {/* Empty state */}
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
