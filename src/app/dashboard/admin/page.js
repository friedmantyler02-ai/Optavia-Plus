"use client";

import { useState, useEffect, useCallback } from "react";
import { useCoach } from "../layout";
import { formatPhoneDisplay } from "@/lib/phone";

const ADMIN_EMAILS = ["friedmantyler02@gmail.com"];

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

function orderDateColor(dateStr) {
  if (!dateStr) return "text-gray-400";
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const diffMonths = diffMs / (1000 * 60 * 60 * 24 * 30);
  if (diffMonths < 3) return "text-green-600";
  if (diffMonths < 6) return "text-amber-600";
  return "text-red-600";
}

export default function AdminPage() {
  const { coach, supabase } = useCoach();

  // Overview state
  const [overview, setOverview] = useState(null);
  const [overviewLoading, setOverviewLoading] = useState(true);

  // Coaches state
  const [coaches, setCoaches] = useState([]);
  const [coachesTotal, setCoachesTotal] = useState(0);
  const [coachesPage, setCoachesPage] = useState(1);
  const [coachesPerPage] = useState(20);
  const [coachSearch, setCoachSearch] = useState("");
  const [debouncedCoachSearch, setDebouncedCoachSearch] = useState("");
  const [coachesLoading, setCoachesLoading] = useState(true);

  // Selected coach clients state
  const [selectedCoach, setSelectedCoach] = useState(null);
  const [clients, setClients] = useState([]);
  const [clientsTotal, setClientsTotal] = useState(0);
  const [clientsPage, setClientsPage] = useState(1);
  const [clientsPerPage] = useState(50);
  const [clientSearch, setClientSearch] = useState("");
  const [debouncedClientSearch, setDebouncedClientSearch] = useState("");
  const [clientsLoading, setClientsLoading] = useState(false);

  const isAdmin = coach && ADMIN_EMAILS.includes(coach.email);

  const getToken = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    return data?.session?.access_token;
  }, [supabase]);

  // Debounce coach search
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedCoachSearch(coachSearch);
      setCoachesPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [coachSearch]);

  // Debounce client search
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedClientSearch(clientSearch);
      setClientsPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [clientSearch]);

  // Fetch overview
  useEffect(() => {
    if (!isAdmin) return;
    (async () => {
      setOverviewLoading(true);
      const token = await getToken();
      const res = await fetch("/api/admin/overview", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setOverview(await res.json());
      setOverviewLoading(false);
    })();
  }, [isAdmin]);

  // Fetch coaches
  useEffect(() => {
    if (!isAdmin) return;
    (async () => {
      setCoachesLoading(true);
      const token = await getToken();
      const params = new URLSearchParams({
        page: String(coachesPage),
        per_page: String(coachesPerPage),
      });
      if (debouncedCoachSearch) params.set("search", debouncedCoachSearch);
      const res = await fetch(`/api/admin/coaches?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setCoaches(data.coaches || []);
        setCoachesTotal(data.total || 0);
      }
      setCoachesLoading(false);
    })();
  }, [isAdmin, coachesPage, debouncedCoachSearch]);

  // Fetch clients for selected coach
  useEffect(() => {
    if (!selectedCoach) return;
    (async () => {
      setClientsLoading(true);
      const token = await getToken();
      const params = new URLSearchParams({
        page: String(clientsPage),
        per_page: String(clientsPerPage),
      });
      if (debouncedClientSearch) params.set("search", debouncedClientSearch);
      const res = await fetch(
        `/api/admin/coaches/${selectedCoach.id}/clients?${params}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.ok) {
        const data = await res.json();
        setClients(data.clients || []);
        setClientsTotal(data.total || 0);
      }
      setClientsLoading(false);
    })();
  }, [selectedCoach, clientsPage, debouncedClientSearch]);

  if (!isAdmin) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center text-3xl mx-auto mb-4">
            🚫
          </div>
          <h2 className="font-display text-xl font-bold text-gray-900 mb-1">
            Access Denied
          </h2>
          <p className="text-sm text-gray-500">
            You don&apos;t have permission to view this page.
          </p>
        </div>
      </div>
    );
  }

  const coachesTotalPages = Math.max(1, Math.ceil(coachesTotal / coachesPerPage));
  const clientsTotalPages = Math.max(1, Math.ceil(clientsTotal / clientsPerPage));

  return (
    <div className="space-y-8">
      {/* ── Section 1: App Health ── */}
      <section>
        <h2 className="font-display text-2xl font-bold text-gray-900 mb-4">
          App Health
        </h2>

        {overviewLoading ? (
          <p className="text-gray-400 font-semibold">Loading...</p>
        ) : overview ? (
          <>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
              {[
                { label: "Total Coaches", value: overview.total_coaches },
                { label: "Stub Coaches", value: overview.total_stub_coaches },
                { label: "Total Clients", value: overview.total_clients },
                { label: "Onboarded ✅", value: overview.coaches_onboarded },
                { label: "Not Yet Onboarded ⏳", value: overview.coaches_not_onboarded },
              ].map((card) => (
                <div
                  key={card.label}
                  className="rounded-2xl border-2 border-gray-100 bg-white p-5"
                >
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-1">
                    {card.label}
                  </p>
                  <p className="text-3xl font-bold text-gray-900">
                    {card.value}
                  </p>
                </div>
              ))}
            </div>

            <div className="rounded-2xl border-2 border-gray-100 bg-white overflow-hidden">
              <div className="px-5 py-3 border-b-2 border-gray-100">
                <h3 className="font-display text-lg font-bold text-gray-900">
                  Recent Signups (7 days)
                </h3>
              </div>
              {overview.recent_signups.length === 0 ? (
                <div className="p-8 text-center">
                  <p className="text-gray-400 font-semibold">
                    No new signups this week
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100">
                        <th className="text-left px-5 py-2.5 text-xs font-bold text-gray-400 uppercase tracking-wide">
                          Name
                        </th>
                        <th className="text-left px-5 py-2.5 text-xs font-bold text-gray-400 uppercase tracking-wide">
                          Email
                        </th>
                        <th className="text-left px-5 py-2.5 text-xs font-bold text-gray-400 uppercase tracking-wide">
                          Signed Up
                        </th>
                        <th className="text-center px-5 py-2.5 text-xs font-bold text-gray-400 uppercase tracking-wide">
                          Onboarded
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {overview.recent_signups.map((s) => (
                        <tr
                          key={s.id}
                          className="border-b border-gray-50 hover:bg-gray-50 transition-colors"
                        >
                          <td className="px-5 py-2.5 font-semibold text-gray-900">
                            {s.full_name || "—"}
                          </td>
                          <td className="px-5 py-2.5 text-gray-500">
                            {s.email}
                          </td>
                          <td className="px-5 py-2.5 text-gray-500">
                            {new Date(s.created_at).toLocaleDateString()}
                          </td>
                          <td className="px-5 py-2.5 text-center text-lg">
                            {s.onboarding_completed ? (
                              <span className="text-green-500">✓</span>
                            ) : (
                              <span className="text-red-400">✗</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        ) : null}
      </section>

      {/* ── Section 2: All Coaches ── */}
      <section>
        <h2 className="font-display text-2xl font-bold text-gray-900 mb-4">
          All Coaches
        </h2>

        <div className="mb-4">
          <input
            type="text"
            value={coachSearch}
            onChange={(e) => setCoachSearch(e.target.value)}
            placeholder="Search by name or email..."
            className="w-full md:w-96 px-4 py-3 text-sm border-2 border-gray-200 rounded-xl font-body focus:border-brand-500 focus:outline-none transition bg-white"
          />
        </div>

        <div className="rounded-2xl border-2 border-gray-100 bg-white overflow-hidden">
          {coachesLoading ? (
            <div className="p-12 text-center">
              <p className="text-gray-400 font-semibold">Loading...</p>
            </div>
          ) : coaches.length === 0 ? (
            <div className="p-12 text-center">
              <p className="text-gray-400 font-semibold">No coaches found</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b-2 border-gray-100">
                    <th className="text-left px-5 py-3 text-xs font-bold text-gray-400 uppercase tracking-wide">
                      Name
                    </th>
                    <th className="text-left px-5 py-3 text-xs font-bold text-gray-400 uppercase tracking-wide">
                      Email
                    </th>
                    <th className="text-left px-5 py-3 text-xs font-bold text-gray-400 uppercase tracking-wide">
                      Optavia ID
                    </th>
                    <th className="text-right px-5 py-3 text-xs font-bold text-gray-400 uppercase tracking-wide">
                      Clients
                    </th>
                    <th className="text-left px-5 py-3 text-xs font-bold text-gray-400 uppercase tracking-wide">
                      Last Activity
                    </th>
                    <th className="text-center px-5 py-3 text-xs font-bold text-gray-400 uppercase tracking-wide">
                      Onboarded
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {coaches.map((c) => (
                    <tr
                      key={c.id}
                      onClick={() => {
                        setSelectedCoach(
                          selectedCoach?.id === c.id ? null : c
                        );
                        setClients([]);
                        setClientsTotal(0);
                        setClientsPage(1);
                        setClientSearch("");
                        setDebouncedClientSearch("");
                      }}
                      className={`border-b border-gray-50 hover:bg-gray-50 transition-colors cursor-pointer ${
                        selectedCoach?.id === c.id ? "bg-brand-50" : ""
                      }`}
                    >
                      <td className="px-5 py-3 font-semibold text-gray-900">
                        {c.full_name || "—"}
                      </td>
                      <td className="px-5 py-3 text-gray-500">
                        {c.email || "—"}
                      </td>
                      <td className="px-5 py-3 text-gray-500">
                        {c.optavia_id || "—"}
                      </td>
                      <td className="px-5 py-3 text-right font-semibold text-gray-900">
                        {c.client_count}
                      </td>
                      <td className="px-5 py-3 text-gray-500">
                        {timeAgo(c.last_activity)}
                      </td>
                      <td className="px-5 py-3 text-center text-lg">
                        {c.onboarding_completed ? (
                          <span className="text-green-500">✅</span>
                        ) : (
                          <span className="text-gray-400">⏳</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {coachesTotalPages > 1 && (
            <div className="flex items-center justify-between px-5 py-3 border-t-2 border-gray-100">
              <p className="text-xs text-gray-400">
                Page {coachesPage} of {coachesTotalPages}
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setCoachesPage((p) => Math.max(1, p - 1))}
                  disabled={coachesPage === 1}
                  className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition"
                >
                  Previous
                </button>
                <button
                  onClick={() =>
                    setCoachesPage((p) => Math.min(coachesTotalPages, p + 1))
                  }
                  disabled={coachesPage === coachesTotalPages}
                  className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ── Section 3: Coach's Clients ── */}
      {selectedCoach && (
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display text-2xl font-bold text-gray-900">
              Clients for {selectedCoach.full_name || selectedCoach.email}
            </h2>
            <button
              onClick={() => setSelectedCoach(null)}
              className="px-3 py-1.5 text-sm font-semibold text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition"
            >
              ✕ Close
            </button>
          </div>

          <div className="mb-4">
            <input
              type="text"
              value={clientSearch}
              onChange={(e) => setClientSearch(e.target.value)}
              placeholder="Search clients by name or email..."
              className="w-full md:w-96 px-4 py-3 text-sm border-2 border-gray-200 rounded-xl font-body focus:border-brand-500 focus:outline-none transition bg-white"
            />
          </div>

          <div className="rounded-2xl border-2 border-gray-100 bg-white overflow-hidden">
            {clientsLoading ? (
              <div className="p-12 text-center">
                <p className="text-gray-400 font-semibold">Loading...</p>
              </div>
            ) : clients.length === 0 ? (
              <div className="p-12 text-center">
                <p className="text-gray-400 font-semibold">No clients found</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b-2 border-gray-100">
                      <th className="text-left px-5 py-3 text-xs font-bold text-gray-400 uppercase tracking-wide">
                        Name
                      </th>
                      <th className="text-left px-5 py-3 text-xs font-bold text-gray-400 uppercase tracking-wide">
                        Email
                      </th>
                      <th className="text-left px-5 py-3 text-xs font-bold text-gray-400 uppercase tracking-wide">
                        Phone
                      </th>
                      <th className="text-left px-5 py-3 text-xs font-bold text-gray-400 uppercase tracking-wide">
                        Status
                      </th>
                      <th className="text-left px-5 py-3 text-xs font-bold text-gray-400 uppercase tracking-wide">
                        Last Order
                      </th>
                      <th className="text-right px-5 py-3 text-xs font-bold text-gray-400 uppercase tracking-wide">
                        PQV
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {clients.map((c) => (
                      <tr
                        key={c.id}
                        className="border-b border-gray-50 hover:bg-gray-50 transition-colors"
                      >
                        <td className="px-5 py-3 font-semibold text-gray-900">
                          {c.full_name || "—"}
                        </td>
                        <td className="px-5 py-3 text-gray-500">
                          {c.email || "—"}
                        </td>
                        <td className="px-5 py-3 text-gray-500">
                          {formatPhoneDisplay(c.phone) || "—"}
                        </td>
                        <td className="px-5 py-3">
                          {c.status ? (
                            <span
                              className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                                c.status === "active"
                                  ? "bg-green-100 text-green-700"
                                  : c.status === "inactive"
                                  ? "bg-gray-100 text-gray-500"
                                  : "bg-blue-100 text-blue-700"
                              }`}
                            >
                              {c.status}
                            </span>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td
                          className={`px-5 py-3 font-semibold ${orderDateColor(
                            c.last_order_date
                          )}`}
                        >
                          {c.last_order_date
                            ? timeAgo(c.last_order_date)
                            : "—"}
                        </td>
                        <td className="px-5 py-3 text-right font-semibold text-gray-900">
                          {c.pqv ?? "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {clientsTotalPages > 1 && (
              <div className="flex items-center justify-between px-5 py-3 border-t-2 border-gray-100">
                <p className="text-xs text-gray-400">
                  Page {clientsPage} of {clientsTotalPages}
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() =>
                      setClientsPage((p) => Math.max(1, p - 1))
                    }
                    disabled={clientsPage === 1}
                    className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition"
                  >
                    Previous
                  </button>
                  <button
                    onClick={() =>
                      setClientsPage((p) =>
                        Math.min(clientsTotalPages, p + 1)
                      )
                    }
                    disabled={clientsPage === clientsTotalPages}
                    className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
