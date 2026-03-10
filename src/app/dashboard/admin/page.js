"use client";

import { useState, useEffect } from "react";
import { useCoach } from "../layout";
import PageHeader from "../components/PageHeader";
import Link from "next/link";

function timeAgo(dateStr) {
  if (!dateStr) return "Never";
  const now = new Date();
  const then = new Date(dateStr);
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDays = Math.floor(diffHr / 24);
  if (diffDays < 30) return `${diffDays}d ago`;
  const diffMonths = Math.floor(diffDays / 30);
  return `${diffMonths}mo ago`;
}

function getStatusBadge(coach) {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  if (coach.is_stub) {
    if (coach.invite_status === "invited") {
      return { label: "Invited", className: "bg-yellow-100 text-yellow-700" };
    }
    return { label: "Stub", className: "bg-gray-100 text-gray-500" };
  }

  if (coach.last_sign_in_at && new Date(coach.last_sign_in_at) > sevenDaysAgo) {
    return { label: "Active", className: "bg-green-100 text-green-700" };
  }

  return { label: "Signed Up", className: "bg-blue-100 text-blue-700" };
}

const PAGE_SIZE = 50;

export default function AdminPage() {
  const { coach, supabase } = useCoach();
  const [coaches, setCoaches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteError, setInviteError] = useState("");
  const [inviteSuccess, setInviteSuccess] = useState(false);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    if (!coach?.is_admin) return;
    fetchCoaches();
  }, [coach, debouncedSearch]);

  const fetchCoaches = async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (debouncedSearch) params.set("search", debouncedSearch);

    const res = await fetch(`/api/admin/coaches?${params}`);
    if (res.ok) {
      const data = await res.json();
      setCoaches(data.coaches || []);
    }
    setLoading(false);
  };

  const handleInvite = async (e) => {
    e.preventDefault();
    setInviteError("");
    setInviteSuccess(false);
    setInviteLoading(true);

    const res = await fetch("/api/admin/invite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: inviteEmail }),
    });

    const data = await res.json();
    setInviteLoading(false);

    if (!res.ok) {
      setInviteError(data.error || "Failed to send invite");
      return;
    }

    setInviteSuccess(true);
    setInviteEmail("");
    setTimeout(() => {
      setShowInviteModal(false);
      setInviteSuccess(false);
      fetchCoaches();
    }, 1500);
  };

  if (!coach?.is_admin) {
    return (
      <div className="text-center py-20">
        <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center text-3xl mx-auto mb-4">🚫</div>
        <h2 className="text-lg font-semibold text-gray-900 mb-1">Access Denied</h2>
        <p className="text-sm text-gray-500 mb-6">You don't have permission to view this page.</p>
        <Link href="/dashboard" className="text-[#E8735A] font-semibold hover:underline">
          ← Back to Dashboard
        </Link>
      </div>
    );
  }

  // Compute summary stats
  const totalCoaches = coaches.length;
  const signedUp = coaches.filter((c) => !c.is_stub).length;
  const stubs = coaches.filter((c) => c.is_stub).length;
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const activeThisWeek = coaches.filter(
    (c) => c.last_sign_in_at && new Date(c.last_sign_in_at) > sevenDaysAgo
  ).length;

  // Pagination
  const totalPages = Math.ceil(coaches.length / PAGE_SIZE);
  const paginatedCoaches = coaches.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const summaryCards = [
    { label: "Total Coaches", value: totalCoaches, icon: "👥" },
    { label: "Signed Up", value: signedUp, icon: "✅" },
    { label: "Stubs", value: stubs, icon: "👤" },
    { label: "Active This Week", value: activeThisWeek, icon: "🟢" },
  ];

  return (
    <>
      <PageHeader
        title="Admin"
        subtitle="Manage coaches and users"
        actions={
          <button
            onClick={() => setShowInviteModal(true)}
            className="bg-[#E8735A] hover:bg-[#d4634d] text-white px-5 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 active:scale-95"
          >
            + Invite Coach
          </button>
        }
      />

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {summaryCards.map((card) => (
          <div key={card.label} className="rounded-2xl border-2 border-gray-100 bg-white p-5">
            <div className="flex items-center gap-3 mb-2">
              <span className="text-2xl">{card.icon}</span>
              <span className="text-xs font-bold text-gray-400 uppercase tracking-wide">{card.label}</span>
            </div>
            <p className="text-3xl font-bold text-gray-900">{card.value}</p>
          </div>
        ))}
      </div>

      {/* Search Bar */}
      <div className="mb-4">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name or email..."
          className="w-full md:w-96 px-4 py-3 text-sm border-2 border-gray-200 rounded-xl font-body focus:border-brand-500 focus:outline-none transition bg-white"
        />
      </div>

      {/* Coaches Table */}
      <div className="rounded-2xl border-2 border-gray-100 bg-white overflow-hidden">
        {loading ? (
          <div className="p-12 text-center">
            <p className="text-gray-400 font-semibold">Loading coaches...</p>
          </div>
        ) : paginatedCoaches.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-gray-400 font-semibold">No coaches found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b-2 border-gray-100">
                  <th className="text-left px-5 py-3 text-xs font-bold text-gray-400 uppercase tracking-wide">Name</th>
                  <th className="text-left px-5 py-3 text-xs font-bold text-gray-400 uppercase tracking-wide">Email</th>
                  <th className="text-left px-5 py-3 text-xs font-bold text-gray-400 uppercase tracking-wide">Status</th>
                  <th className="text-left px-5 py-3 text-xs font-bold text-gray-400 uppercase tracking-wide">Last Active</th>
                  <th className="text-right px-5 py-3 text-xs font-bold text-gray-400 uppercase tracking-wide">Clients</th>
                </tr>
              </thead>
              <tbody>
                {paginatedCoaches.map((c) => {
                  const badge = getStatusBadge(c);
                  return (
                    <tr key={c.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                      <td className="px-5 py-3">
                        <div className="font-semibold text-gray-900">{c.full_name || "—"}</div>
                        {c.optavia_id && <div className="text-xs text-gray-400">ID: {c.optavia_id}</div>}
                      </td>
                      <td className="px-5 py-3 text-gray-500">{c.email || "—"}</td>
                      <td className="px-5 py-3">
                        <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${badge.className}`}>
                          {badge.label}
                        </span>
                        {c.is_admin && (
                          <span className="inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold bg-purple-100 text-purple-700 ml-1">
                            Admin
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-gray-500">{timeAgo(c.last_sign_in_at)}</td>
                      <td className="px-5 py-3 text-right font-semibold text-gray-900">{c.client_count}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-5 py-3 border-t-2 border-gray-100">
            <p className="text-xs text-gray-400">
              Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, coaches.length)} of {coaches.length}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition"
              >
                ← Prev
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition"
              >
                Next →
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Invite Modal */}
      {showInviteModal && (
        <>
          <div className="fixed inset-0 bg-black/40 z-50" onClick={() => setShowInviteModal(false)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
              <h3 className="font-display text-xl font-bold text-gray-900 mb-1">Invite Coach</h3>
              <p className="text-sm text-gray-500 mb-5">Send an email invitation to join Optavia Plus.</p>

              {inviteSuccess ? (
                <div className="text-center py-4">
                  <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center text-2xl mx-auto mb-3">✅</div>
                  <p className="text-sm font-semibold text-green-700">Invite sent!</p>
                </div>
              ) : (
                <form onSubmit={handleInvite}>
                  {inviteError && (
                    <div className="bg-red-50 border-2 border-red-200 text-red-700 px-4 py-3 rounded-xl mb-4 text-sm font-semibold">
                      {inviteError}
                    </div>
                  )}
                  <div className="mb-4">
                    <label className="block text-xs font-bold text-gray-400 uppercase tracking-wide mb-1">Email Address</label>
                    <input
                      type="email"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      placeholder="coach@example.com"
                      className="w-full px-4 py-3 text-sm border-2 border-gray-200 rounded-xl font-body focus:border-brand-500 focus:outline-none transition"
                      required
                    />
                  </div>
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => setShowInviteModal(false)}
                      className="flex-1 px-4 py-2.5 text-sm font-medium rounded-xl border-2 border-gray-200 text-gray-600 hover:bg-gray-50 transition"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={inviteLoading}
                      className="flex-1 bg-[#E8735A] hover:bg-[#d4634d] text-white px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 active:scale-95 disabled:opacity-50"
                    >
                      {inviteLoading ? "Sending..." : "Send Invite"}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </>
      )}
    </>
  );
}
