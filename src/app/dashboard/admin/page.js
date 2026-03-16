"use client";

import { useState, useEffect, useCallback, useRef } from "react";
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

  // Knowledge base state
  const [kbDocs, setKbDocs] = useState([]);
  const [kbLoading, setKbLoading] = useState(true);
  const [kbSelectedFiles, setKbSelectedFiles] = useState([]);
  const [kbUploading, setKbUploading] = useState(false);
  const [kbUploadResult, setKbUploadResult] = useState(null);
  const [kbDragOver, setKbDragOver] = useState(false);
  const [kbDeletingId, setKbDeletingId] = useState(null);
  const kbFileInputRef = useRef(null);

  const isAdmin = coach && ADMIN_EMAILS.includes(coach.email);

  const fetchKbDocs = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("knowledge_documents")
        .select("id, title, filename, created_at")
        .order("created_at", { ascending: false });
      if (!error) setKbDocs(data || []);
    } catch (err) {
      console.error("Failed to fetch knowledge docs:", err);
    } finally {
      setKbLoading(false);
    }
  }, [supabase]);

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

  // Fetch knowledge base docs
  useEffect(() => {
    if (!isAdmin) return;
    fetchKbDocs();
  }, [isAdmin, fetchKbDocs]);

  const handleKbFilesSelected = (files) => {
    const pdfs = Array.from(files).filter((f) =>
      f.name.toLowerCase().endsWith(".pdf")
    );
    if (pdfs.length === 0) return;
    setKbSelectedFiles(pdfs);
    setKbUploadResult(null);
  };

  const handleKbUpload = async () => {
    if (kbSelectedFiles.length === 0) return;
    setKbUploading(true);
    setKbUploadResult(null);
    const formData = new FormData();
    kbSelectedFiles.forEach((f) => formData.append("files", f));
    try {
      const res = await fetch("/api/knowledge/upload", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (res.ok) {
        setKbUploadResult({
          success: true,
          message: `${data.uploaded} uploaded${data.skipped ? `, ${data.skipped} skipped (already exist)` : ""}${data.errors?.length ? `, ${data.errors.length} failed` : ""}`,
          errors: data.errors,
        });
        setKbSelectedFiles([]);
        fetchKbDocs();
      } else {
        setKbUploadResult({ success: false, message: data.error || "Upload failed" });
      }
    } catch {
      setKbUploadResult({ success: false, message: "Something went wrong." });
    } finally {
      setKbUploading(false);
    }
  };

  const handleKbDelete = async (id) => {
    try {
      const res = await fetch("/api/knowledge/upload", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (res.ok) {
        setKbDocs((prev) => prev.filter((d) => d.id !== id));
        setKbDeletingId(null);
      }
    } catch (err) {
      console.error("Failed to delete document:", err);
    }
  };

  const handleKbDrop = (e) => {
    e.preventDefault();
    setKbDragOver(false);
    handleKbFilesSelected(e.dataTransfer.files);
  };

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

      {/* ── Section 4: Knowledge Base Management ── */}
      <section>
        <h2 className="font-display text-2xl font-bold text-gray-900 mb-4">
          Knowledge Base Management
        </h2>

        {/* Doc count */}
        <div className="rounded-2xl border-2 border-gray-100 bg-white p-5 mb-6">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-1">
            Total Documents
          </p>
          <p className="text-3xl font-bold text-gray-900">
            {kbLoading ? "..." : kbDocs.length}
          </p>
        </div>

        {/* Upload zone */}
        <div
          onDragOver={(e) => { e.preventDefault(); setKbDragOver(true); }}
          onDragLeave={() => setKbDragOver(false)}
          onDrop={handleKbDrop}
          onClick={() => !kbUploading && kbFileInputRef.current?.click()}
          className={`mb-6 rounded-2xl border-2 border-dashed p-6 text-center cursor-pointer transition-colors duration-150 ${
            kbDragOver
              ? "border-brand-400 bg-brand-50"
              : "border-gray-200 bg-gray-50 hover:border-brand-300 hover:bg-brand-50/50"
          }`}
        >
          <input
            ref={kbFileInputRef}
            type="file"
            accept=".pdf"
            multiple
            className="hidden"
            onChange={(e) => handleKbFilesSelected(e.target.files)}
          />
          <p className="text-2xl mb-2">📄</p>
          <p className="font-display text-sm font-bold text-gray-600">
            Drop PDFs here or click to browse
          </p>
          <p className="font-body text-xs text-gray-400 mt-1">
            PDF files only, up to 10MB each. Text will be extracted automatically.
          </p>
        </div>

        {/* Selected files */}
        {kbSelectedFiles.length > 0 && (
          <div className="mb-6 rounded-2xl border-2 border-brand-100 bg-white p-4">
            <p className="font-display text-sm font-bold text-gray-700 mb-3">
              {kbSelectedFiles.length} file{kbSelectedFiles.length > 1 ? "s" : ""} selected
            </p>
            <div className="space-y-1.5 mb-4">
              {kbSelectedFiles.map((f, i) => (
                <div key={i} className="flex items-center gap-2 text-sm text-gray-600">
                  <span className="text-brand-400 font-semibold">PDF</span>
                  <span className="truncate">{f.name}</span>
                  <span className="text-gray-400 text-xs ml-auto flex-shrink-0">
                    {(f.size / 1024 / 1024).toFixed(1)}MB
                  </span>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleKbUpload}
                disabled={kbUploading}
                className="px-4 py-2.5 rounded-xl text-sm font-bold bg-brand-500 text-white hover:bg-brand-600 transition-colors duration-150 min-h-[44px] touch-manipulation disabled:opacity-50"
              >
                {kbUploading ? "Uploading..." : "Upload"}
              </button>
              <button
                onClick={() => { setKbSelectedFiles([]); setKbUploadResult(null); }}
                disabled={kbUploading}
                className="px-4 py-2.5 rounded-xl text-sm font-bold text-gray-400 hover:bg-gray-50 transition-colors duration-150 min-h-[44px] touch-manipulation disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Upload progress */}
        {kbUploading && (
          <div className="mb-4 flex items-center gap-3">
            <div className="w-5 h-5 border-2 border-brand-200 border-t-brand-500 rounded-full animate-spin flex-shrink-0" />
            <p className="text-sm text-gray-500">
              Uploading {kbSelectedFiles.length} file{kbSelectedFiles.length > 1 ? "s" : ""}...
            </p>
          </div>
        )}

        {/* Upload result */}
        {kbUploadResult && (
          <div
            className={`mb-6 rounded-2xl border-2 p-4 ${
              kbUploadResult.success
                ? "bg-green-50 border-green-100"
                : "bg-red-50 border-red-100"
            }`}
          >
            <p className={`text-sm font-semibold ${kbUploadResult.success ? "text-green-700" : "text-red-500"}`}>
              {kbUploadResult.message}
            </p>
            {kbUploadResult.errors?.length > 0 && (
              <ul className="mt-2 space-y-1">
                {kbUploadResult.errors.map((e, i) => (
                  <li key={i} className="text-xs text-red-400">{e}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* Document list */}
        <div className="rounded-2xl border-2 border-gray-100 bg-white overflow-hidden">
          <div className="px-5 py-3 border-b-2 border-gray-100">
            <h3 className="font-display text-lg font-bold text-gray-900">
              All Documents
            </h3>
          </div>
          {kbLoading ? (
            <div className="p-12 text-center">
              <p className="text-gray-400 font-semibold">Loading...</p>
            </div>
          ) : kbDocs.length === 0 ? (
            <div className="p-12 text-center">
              <p className="text-gray-400 font-semibold">
                No documents yet. Upload PDFs above to get started.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b-2 border-gray-100">
                    <th className="text-left px-5 py-3 text-xs font-bold text-gray-400 uppercase tracking-wide">
                      Title
                    </th>
                    <th className="text-left px-5 py-3 text-xs font-bold text-gray-400 uppercase tracking-wide">
                      Filename
                    </th>
                    <th className="text-left px-5 py-3 text-xs font-bold text-gray-400 uppercase tracking-wide">
                      Added
                    </th>
                    <th className="text-right px-5 py-3 text-xs font-bold text-gray-400 uppercase tracking-wide">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {kbDocs.map((doc) => (
                    <tr
                      key={doc.id}
                      className="border-b border-gray-50 hover:bg-gray-50 transition-colors"
                    >
                      <td className="px-5 py-3 font-semibold text-gray-900">
                        {doc.title || "Untitled"}
                      </td>
                      <td className="px-5 py-3 text-gray-500 truncate max-w-[200px]">
                        {doc.filename || "—"}
                      </td>
                      <td className="px-5 py-3 text-gray-500">
                        {new Date(doc.created_at).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </td>
                      <td className="px-5 py-3 text-right">
                        {kbDeletingId === doc.id ? (
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => handleKbDelete(doc.id)}
                              className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-red-500 text-white hover:bg-red-600 transition"
                            >
                              Confirm
                            </button>
                            <button
                              onClick={() => setKbDeletingId(null)}
                              className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-gray-200 hover:bg-gray-50 transition"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setKbDeletingId(doc.id)}
                            className="px-3 py-1.5 text-xs font-semibold rounded-lg text-red-500 hover:bg-red-50 transition"
                          >
                            Delete
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
