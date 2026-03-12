"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useCoach } from "../layout";
import { useRouter } from "next/navigation";
import Papa from "papaparse";
import { importCSVChunked } from "@/lib/chunked-import";
import PageHeader from "../components/PageHeader";
import LoadingSpinner from "../components/LoadingSpinner";
import EmptyState from "../components/EmptyState";

// ── Helpers ──────────────────────────────────────────────

function timeAgo(dateStr) {
  if (!dateStr) return "Never";
  const now = new Date();
  const then = new Date(dateStr);
  const diffMs = now - then;
  if (diffMs < 0) return "Just now";
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

function formatDate(dateStr) {
  if (!dateStr) return "Never";
  const d = new Date(dateStr.includes("T") ? dateStr : dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function getMonthsAgo(dateStr) {
  if (!dateStr) return Infinity;
  const now = new Date();
  const d = new Date(dateStr.includes("T") ? dateStr : dateStr + "T00:00:00");
  return (now - d) / (1000 * 60 * 60 * 24 * 30.44);
}

function bucketClient(c) {
  const months = getMonthsAgo(c.last_order_date);
  if (months <= 2) return "active";
  if (months <= 3) return "at_risk";
  return "past";
}

function getAlertBadges(alerts) {
  if (!alerts || !Array.isArray(alerts) || alerts.length === 0) return [];
  const badges = [];
  const types = new Set(alerts.map((a) => a.type));
  if (types.has("cancellation"))
    badges.push({ emoji: "\uD83D\uDD34", label: "Cancelled", cls: "bg-red-100 text-red-700" });
  if (types.has("date_change"))
    badges.push({ emoji: "\uD83D\uDFE1", label: "Date Changed", cls: "bg-yellow-100 text-yellow-700" });
  if (types.has("qv_drop"))
    badges.push({ emoji: "\uD83D\uDFE0", label: "QV Drop", cls: "bg-orange-100 text-orange-700" });
  return badges;
}

function cleanHeader(h) {
  if (!h) return "";
  return h.replace(/^\uFEFF/, "").replace(/^="?/, "").replace(/"$/, "").trim();
}

// ── Import Modal ──────────────────────────────────────────

const IMPORT_TYPES = {
  clients: {
    title: "Upload Client List",
    subtitle: "Import a Frontline Report CSV to add or update clients.",
    dropLabel: "Frontline Report CSV",
    buttonLabel: (n) => `Import ${n} Clients`,
    previewCols: [
      { key: "name", label: "Name", render: (r) => `${r.FirstName || ""} ${r.LastName || ""}`.trim() },
      { key: "id", label: "Optavia ID", render: (r) => r.OPTAVIAID },
      { key: "email", label: "Email", render: (r) => r.Email || "\u2014" },
      { key: "status", label: "Status", render: (r) => r.AccountStatus || r.OrderStatus || "\u2014" },
    ],
  },
  orders: {
    title: "Upload Recent Orders",
    subtitle: "Import a Client Orders CSV to update order dates and detect alerts.",
    dropLabel: "Client Orders export CSV",
    buttonLabel: (n) => `Import ${n} Orders`,
    previewCols: [
      { key: "name", label: "Name", render: (r) => `${r.FirstName || ""} ${r.LastName || ""}`.trim() },
      { key: "id", label: "Optavia ID", render: (r) => r.OPTAVIAID },
      { key: "date", label: "Order Date", render: (r) => r.OrderDate || r.LastOrderDate || "\u2014" },
      { key: "qv", label: "QV", align: "right", render: (r) => r.QV || r.PQV || "\u2014" },
      { key: "status", label: "Status", render: (r) => r.OrderStatus || "\u2014" },
    ],
  },
};

function ImportModal({ onClose, onComplete }) {
  const [importType, setImportType] = useState(null);
  const [file, setFile] = useState(null);
  const [parsedRows, setParsedRows] = useState([]);
  const [preview, setPreview] = useState([]);
  const [importing, setImporting] = useState(false);
  const [batchProgress, setBatchProgress] = useState(null);
  const [result, setResult] = useState(null);
  const [parseError, setParseError] = useState("");
  const fileRef = useRef(null);
  const [dragging, setDragging] = useState(false);

  const config = importType ? IMPORT_TYPES[importType] : null;

  const resetUpload = () => {
    setFile(null);
    setParsedRows([]);
    setPreview([]);
    setResult(null);
    setParseError("");
    setBatchProgress(null);
  };

  const handleFile = (f) => {
    if (!f || !f.name.toLowerCase().endsWith(".csv")) {
      setParseError("Please select a CSV file.");
      return;
    }
    setFile(f);
    setParseError("");
    setResult(null);

    Papa.parse(f, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        if (results.errors.length > 0 && results.data.length === 0) {
          setParseError("Could not parse CSV. Check the file format.");
          return;
        }
        const rows = results.data;
        setParsedRows(rows);
        setPreview(rows.slice(0, 5).map((row) => {
          const clean = {};
          for (const [k, v] of Object.entries(row)) {
            clean[cleanHeader(k)] = v;
          }
          return clean;
        }));
      },
    });
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
  };

  const handleImport = async () => {
    setImporting(true);
    setBatchProgress(null);
    setResult(null);

    try {
      const data = await importCSVChunked(parsedRows, (progress) => {
        setBatchProgress(progress);
      });
      setResult(data);
    } catch {
      setResult({ error: "Network error. Please try again." });
    } finally {
      setImporting(false);
      setBatchProgress(null);
    }
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-50" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div
          className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="p-6">
            {/* Header */}
            <div className="flex items-center justify-between mb-1">
              <h3 className="font-display text-xl font-bold text-gray-900">
                {config ? config.title : "Import CSV"}
              </h3>
              <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg">
                &times;
              </button>
            </div>

            {/* Type picker */}
            {!importType && (
              <>
                <p className="text-sm text-gray-500 mb-5">
                  What would you like to import?
                </p>
                <div className="space-y-3">
                  <button
                    onClick={() => setImportType("clients")}
                    className="w-full flex items-center gap-4 p-4 rounded-xl border-2 border-gray-200 hover:border-[#E8735A] hover:bg-[#faf7f2] transition text-left"
                  >
                    <span className="text-2xl">&#128101;</span>
                    <div>
                      <p className="font-bold text-sm text-gray-800">Upload Client List</p>
                      <p className="text-xs text-gray-500">Frontline Report CSV &mdash; adds new clients and updates existing ones</p>
                    </div>
                  </button>
                  <button
                    onClick={() => setImportType("orders")}
                    className="w-full flex items-center gap-4 p-4 rounded-xl border-2 border-gray-200 hover:border-[#E8735A] hover:bg-[#faf7f2] transition text-left"
                  >
                    <span className="text-2xl">&#128230;</span>
                    <div>
                      <p className="font-bold text-sm text-gray-800">Upload Recent Orders</p>
                      <p className="text-xs text-gray-500">Client Orders CSV &mdash; updates order dates and detects alerts</p>
                    </div>
                  </button>
                </div>
              </>
            )}

            {/* Upload zone (after type selected) */}
            {config && (
              <>
                {!result && (
                  <button
                    onClick={() => { setImportType(null); resetUpload(); }}
                    className="text-xs font-semibold text-gray-400 hover:text-gray-600 mb-3 transition-colors"
                  >
                    &larr; Change import type
                  </button>
                )}
                {!result && (
                  <p className="text-sm text-gray-500 mb-4">{config.subtitle}</p>
                )}

                {/* Success */}
                {result && !result.error && (
                  <div className="bg-green-50 border-2 border-green-200 rounded-xl p-4 mb-4 mt-3">
                    <p className="text-sm font-semibold text-green-700 mb-1">Import complete!</p>
                    <p className="text-sm text-green-600">
                      Updated {result.updated} clients, Created {result.created} new
                      {result.alerts > 0 && `, ${result.alerts} alerts detected`}
                      {result.errors?.length > 0 && `, ${result.errors.length} errors`}
                      {result.failedBatches > 0 && ` (${result.failedBatches} batch${result.failedBatches !== 1 ? "es" : ""} failed)`}
                    </p>
                    <button
                      onClick={() => { onComplete(); onClose(); }}
                      className="mt-3 bg-[#E8735A] hover:bg-[#d4634d] text-white px-4 py-2.5 rounded-xl text-sm font-bold transition-all duration-150 active:scale-95 shadow-sm"
                    >
                      Done
                    </button>
                  </div>
                )}

                {result?.error && (
                  <div className="bg-red-50 border-2 border-red-200 text-red-700 px-4 py-3 rounded-xl mb-4 text-sm font-semibold">
                    {result.error}
                  </div>
                )}
                {parseError && (
                  <div className="bg-red-50 border-2 border-red-200 text-red-700 px-4 py-3 rounded-xl mb-4 text-sm font-semibold">
                    {parseError}
                  </div>
                )}

                {!result?.updated && !result?.created && (
                  <>
                    {/* Drop zone */}
                    <div
                      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                      onDragLeave={() => setDragging(false)}
                      onDrop={handleDrop}
                      onClick={() => fileRef.current?.click()}
                      className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-colors duration-150 ${
                        dragging ? "border-[#E8735A] bg-[#E8735A]/5" : "border-gray-200 hover:border-gray-300 bg-gray-50"
                      }`}
                    >
                      <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={(e) => handleFile(e.target.files[0])} />
                      <div className="text-3xl mb-2">&#128196;</div>
                      {file ? (
                        <p className="text-sm font-semibold text-gray-700">
                          {file.name} <span className="text-gray-400 font-normal">({parsedRows.length} rows)</span>
                        </p>
                      ) : (
                        <>
                          <p className="text-sm font-semibold text-gray-600">Drop CSV here or click to browse</p>
                          <p className="text-xs text-gray-400 mt-1">{config.dropLabel}</p>
                        </>
                      )}
                    </div>

                    {/* Preview table */}
                    {preview.length > 0 && (
                      <div className="mt-4">
                        <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">
                          Preview (first {preview.length} rows)
                        </p>
                        <div className="overflow-x-auto rounded-xl border-2 border-gray-100">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="bg-gray-50 border-b border-gray-100">
                                {config.previewCols.map((col) => (
                                  <th key={col.key} className={`${col.align === "right" ? "text-right" : "text-left"} px-3 py-2 text-gray-400 font-bold`}>
                                    {col.label}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {preview.map((row, i) => (
                                <tr key={i} className="border-b border-gray-50">
                                  {config.previewCols.map((col) => (
                                    <td key={col.key} className={`px-3 py-2 ${col.align === "right" ? "text-right" : ""} text-gray-500`}>
                                      {col.render(row)}
                                    </td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {/* Import / Cancel buttons */}
                    {parsedRows.length > 0 && (
                      <div className="mt-4 flex gap-3">
                        <button onClick={onClose} className="flex-1 px-4 py-2.5 text-sm font-bold rounded-xl border-2 border-gray-200 text-gray-600 hover:bg-gray-50 transition">
                          Cancel
                        </button>
                        <button
                          onClick={handleImport}
                          disabled={importing}
                          className="flex-1 bg-[#E8735A] hover:bg-[#d4634d] text-white px-4 py-2.5 rounded-xl text-sm font-bold transition-all duration-150 active:scale-95 disabled:opacity-50"
                        >
                          {importing
                            ? batchProgress
                              ? `Importing... batch ${batchProgress.current} of ${batchProgress.total}`
                              : "Importing..."
                            : config.buttonLabel(parsedRows.length)}
                        </button>
                      </div>
                    )}
                  </>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

// ── Client Row (List View) ───────────────────────────────

function ClientRow({ client, muted, router, dismissedAlerts, onDismissAlert, showLastOrderSubtitle }) {
  const clientDismissed = dismissedAlerts[String(client.id)] || [];
  const alerts = getAlertBadges(client.order_alerts).filter((a) => !clientDismissed.includes(a.label));
  const qv = client.pqv;
  const isPremier = client.order_type?.toLowerCase()?.includes("premier");

  const contactDate = client.last_checkin_date || client.last_contact_date;

  return (
    <div
      onClick={() => router.push(`/dashboard/clients/${client.id}`)}
      className={`flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-0 px-4 py-3 border-b border-gray-50 hover:bg-[#faf7f2]/60 transition-colors cursor-pointer ${muted ? "opacity-70" : ""}`}
    >
      {/* Name + badges */}
      <div className="flex-1 min-w-0 sm:pr-4">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-body text-base font-semibold text-gray-800 truncate">
            {client.full_name}
          </span>
          {showLastOrderSubtitle && client.last_order_date && (
            <span className={`text-xs font-semibold ${getMonthsAgo(client.last_order_date) >= 6 ? "text-red-400" : "text-amber-500"}`}>
              Last ordered: {timeAgo(client.last_order_date.includes("T") ? client.last_order_date : client.last_order_date + "T00:00:00")}
            </span>
          )}
          {isPremier ? (
            <span className="inline-block rounded-full px-2 py-0.5 text-[10px] font-bold bg-blue-100 text-blue-700">Premier+</span>
          ) : client.order_type ? (
            <span className="inline-block rounded-full px-2 py-0.5 text-[10px] font-bold bg-gray-100 text-gray-500">On Demand</span>
          ) : null}
          {client.account_type?.toLowerCase()?.includes("health coach") && (
            <span className="inline-block rounded-full px-2 py-0.5 text-[10px] font-bold bg-purple-100 text-purple-600">Coach</span>
          )}
          {alerts.map((a, i) => (
            <span key={i} className={`inline-flex items-center gap-1 rounded-full pl-2 pr-1 py-0.5 text-[10px] font-bold ${a.cls}`}>
              {a.emoji} {a.label}
              <button
                onClick={(e) => { e.stopPropagation(); onDismissAlert(client.id, a.label); }}
                className="ml-0.5 w-3.5 h-3.5 rounded-full inline-flex items-center justify-center hover:bg-black/10 transition"
                title="Dismiss"
              >
                &times;
              </button>
            </span>
          ))}
        </div>
      </div>

      {/* QV */}
      <div className="hidden sm:block w-20 text-right shrink-0">
        <span className={`text-sm font-bold ${qv != null ? (qv >= 350 ? "text-green-600" : "text-orange-500") : "text-gray-300"}`}>
          {qv != null ? qv.toLocaleString() : "\u2014"}
        </span>
      </div>

      {/* Last order */}
      <div className="hidden sm:block w-28 text-right shrink-0">
        {client.last_order_date ? (
          <div className="flex items-center justify-end gap-1.5">
            {getMonthsAgo(client.last_order_date) >= 3 && (
              <span className="inline-block rounded-full px-1.5 py-0.5 text-[10px] font-bold bg-amber-50 text-amber-600">90+</span>
            )}
            <span className={`text-sm ${getMonthsAgo(client.last_order_date) >= 3 ? "text-amber-500 font-semibold" : "text-gray-500"}`}>
              {timeAgo(client.last_order_date.includes("T") ? client.last_order_date : client.last_order_date + "T00:00:00")}
            </span>
          </div>
        ) : (
          <span className="text-sm text-gray-300">{"\u2014"}</span>
        )}
      </div>

      {/* Last Contact */}
      <div className="hidden md:block w-28 text-right shrink-0">
        <span className={`text-sm ${contactDate ? "text-gray-500" : "text-gray-300"}`}>
          {contactDate ? timeAgo(contactDate) : "\u2014"}
        </span>
      </div>

      {/* Mobile info row */}
      <div className="flex sm:hidden items-center gap-3 text-xs text-gray-400 flex-wrap">
        <span className={qv != null ? (qv >= 350 ? "text-green-600 font-bold" : "text-orange-500 font-bold") : ""}>
          QV: {qv != null ? qv : "\u2014"}
        </span>
        <span className={client.last_order_date && getMonthsAgo(client.last_order_date) >= 3 ? "text-amber-500 font-semibold" : ""}>
          {client.last_order_date
            ? timeAgo(client.last_order_date.includes("T") ? client.last_order_date : client.last_order_date + "T00:00:00")
            : "No orders"}
        </span>
        <span>
          {contactDate ? timeAgo(contactDate) : "\u2014"}
        </span>
      </div>
    </div>
  );
}

// ── Sorting helpers ──────────────────────────────────────

function sortClients(clients, sortKey, sortDir) {
  if (!sortKey) return clients;
  const dir = sortDir === "desc" ? -1 : 1;
  return [...clients].sort((a, b) => {
    let av, bv;
    switch (sortKey) {
      case "name":
        av = (a.full_name || "").toLowerCase();
        bv = (b.full_name || "").toLowerCase();
        return av < bv ? -1 * dir : av > bv ? 1 * dir : 0;
      case "qv":
        av = a.pqv ?? -Infinity;
        bv = b.pqv ?? -Infinity;
        return (av - bv) * dir;
      case "last_order":
        av = a.last_order_date ? new Date(a.last_order_date).getTime() : 0;
        bv = b.last_order_date ? new Date(b.last_order_date).getTime() : 0;
        return (av - bv) * dir;
      case "checkin":
        av = a.last_checkin_date ? new Date(a.last_checkin_date).getTime() : 0;
        bv = b.last_checkin_date ? new Date(b.last_checkin_date).getTime() : 0;
        return (av - bv) * dir;
      default:
        return 0;
    }
  });
}

function SortableHeader({ label, sortKey, currentSort, currentDir, onSort, className = "" }) {
  const isActive = currentSort === sortKey;
  return (
    <button
      onClick={() => onSort(sortKey)}
      className={`flex items-center gap-1 text-sm font-semibold tracking-wide transition-colors hover:text-gray-700 ${isActive ? "text-[#E8735A]" : "text-gray-500"} ${className}`}
    >
      {label}
      <span className="text-xs">
        {isActive ? (currentDir === "asc" ? "▲" : "▼") : ""}
      </span>
    </button>
  );
}

// ── Section Wrapper ──────────────────────────────────────

function ClientSection({ title, count, borderColor, clients, router, defaultCollapsed = false, muted = false, dismissedAlerts, onDismissAlert, showLastOrderSubtitle = false, sortKey, sortDir, onSort }) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  if (count === 0) return null;

  const sorted = sortClients(clients, sortKey, sortDir);

  return (
    <div className={`rounded-2xl border-2 border-gray-100 bg-white overflow-hidden mb-4 border-l-4 ${borderColor}`}>
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-gray-50 transition min-h-[44px] touch-manipulation"
      >
        <h3 className="font-display text-base font-bold text-gray-700">
          {title} <span className="text-gray-400 font-normal">({count})</span>
        </h3>
        <span className="text-gray-400 text-sm">{collapsed ? "▼" : "▲"}</span>
      </button>
      {!collapsed && (
        <div className="border-t border-gray-100">
          {/* Column headers - desktop */}
          <div className="hidden sm:flex items-center px-4 py-2.5 border-b border-gray-100 bg-gray-50/50">
            <div className="flex-1 pr-4">
              <SortableHeader label="Client Name" sortKey="name" currentSort={sortKey} currentDir={sortDir} onSort={onSort} />
            </div>
            <div className="w-20 text-right shrink-0">
              <SortableHeader label="QV" sortKey="qv" currentSort={sortKey} currentDir={sortDir} onSort={onSort} className="justify-end" />
            </div>
            <div className="w-28 text-right shrink-0">
              <SortableHeader label="Last Order" sortKey="last_order" currentSort={sortKey} currentDir={sortDir} onSort={onSort} className="justify-end" />
            </div>
            <div className="hidden md:block w-28 text-right shrink-0">
              <SortableHeader label="Last Contact" sortKey="checkin" currentSort={sortKey} currentDir={sortDir} onSort={onSort} className="justify-end" />
            </div>
          </div>
          {sorted.map((c) => (
            <ClientRow key={c.id} client={c} muted={muted} router={router} dismissedAlerts={dismissedAlerts} onDismissAlert={onDismissAlert} showLastOrderSubtitle={showLastOrderSubtitle} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────

export default function ClientsPage() {
  const { coach, supabase } = useCoach();
  const router = useRouter();
  const [allClients, setAllClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showImport, setShowImport] = useState(false);
  const [dismissedAlerts, setDismissedAlerts] = useState(() => {
    if (typeof window === "undefined") return {};
    try { return JSON.parse(localStorage.getItem("optavia_dismissed_alerts") || "{}"); } catch { return {}; }
  });

  const dismissAlert = (clientId, alertType) => {
    setDismissedAlerts((prev) => {
      const key = String(clientId);
      const next = { ...prev, [key]: [...(prev[key] || []), alertType] };
      localStorage.setItem("optavia_dismissed_alerts", JSON.stringify(next));
      return next;
    });
  };

  // Sorting
  const [sortKey, setSortKey] = useState("");
  const [sortDir, setSortDir] = useState("asc");

  const handleSort = useCallback((key) => {
    setSortKey((prev) => {
      if (prev === key) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
        return key;
      }
      setSortDir(key === "qv" || key === "last_order" || key === "checkin" ? "desc" : "asc");
      return key;
    });
  }, []);

  // Filters
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [qvFilter, setQvFilter] = useState("");
  const [showAlertOnly, setShowAlertOnly] = useState(false);
  const debounceRef = useRef(null);

  const handleSearchChange = useCallback((value) => {
    setSearch(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedSearch(value), 300);
  }, []);

  // Fetch clients and weekly checkins
  useEffect(() => {
    if (!coach) return;
    fetchClients();
  }, [coach]);

  const fetchClients = async () => {
    setLoading(true);
    setError(null);

    const { data, error: fetchError } = await supabase
      .from("clients")
      .select(
        "id, full_name, email, phone, optavia_id, account_status, last_order_date, pqv, order_type, cv, order_total, order_status, account_type, order_alerts, last_checkin_date, last_scale_pic_date, wants_weekly_checkin, wants_value_adds, level"
      )
      .eq("coach_id", coach.id)
      .order("full_name", { ascending: true });

    if (fetchError) {
      setError("Failed to load clients.");
    } else {
      setAllClients(data || []);
    }
    setLoading(false);
  };

  // Filter clients
  const filtered = allClients.filter((c) => {
    if (debouncedSearch) {
      const q = debouncedSearch.toLowerCase();
      if (!(c.full_name || "").toLowerCase().includes(q)) return false;
    }
    if (statusFilter) {
      const bucket = bucketClient(c);
      if (statusFilter === "active" && bucket !== "active") return false;
      if (statusFilter === "at_risk" && bucket !== "at_risk") return false;
      if (statusFilter === "past" && bucket !== "past") return false;
    }
    if (qvFilter === "over350" && (c.pqv == null || c.pqv < 350)) return false;
    if (qvFilter === "under350" && c.pqv != null && c.pqv >= 350) return false;
    if (qvFilter === "noqv" && c.pqv != null) return false;
    if (showAlertOnly) {
      if (!c.order_alerts || c.order_alerts.length === 0) return false;
      const cd = dismissedAlerts[String(c.id)] || [];
      const remaining = getAlertBadges(c.order_alerts).filter((a) => !cd.includes(a.label));
      if (remaining.length === 0) return false;
    }
    return true;
  });

  // Bucket into sections
  const active = filtered.filter((c) => bucketClient(c) === "active");
  const atRisk = filtered.filter((c) => bucketClient(c) === "at_risk");
  const past = filtered.filter((c) => bucketClient(c) === "past");

  // Alert count (exclude fully-dismissed clients)
  const alertClientCount = allClients.filter((c) => {
    if (!c.order_alerts || !Array.isArray(c.order_alerts) || c.order_alerts.length === 0) return false;
    const cd = dismissedAlerts[String(c.id)] || [];
    const remaining = getAlertBadges(c.order_alerts).filter((a) => !cd.includes(a.label));
    return remaining.length > 0;
  }).length;

  const activeCount = allClients.filter((c) => bucketClient(c) === "active").length;

  const hasFilters = debouncedSearch || statusFilter || qvFilter || showAlertOnly;

  return (
    <div>
      <PageHeader
        title="My Clients"
        subtitle={activeCount > 0 ? `${activeCount} active clients` : undefined}
        actions={
          <div className="flex gap-2">
            <button
              onClick={() => setShowImport(true)}
              className="px-4 py-2.5 rounded-xl text-sm font-bold border-2 border-[#E8735A] text-[#E8735A] hover:bg-[#E8735A]/10 transition-all duration-150 active:scale-95 min-h-[44px] touch-manipulation"
            >
              Import CSV
            </button>
          </div>
        }
      />

      {/* Alert banner / active filter bar */}
      {showAlertOnly ? (
        <div className="flex items-center justify-between mb-4 px-4 py-3 rounded-2xl bg-amber-50 border-2 border-amber-200">
          <span className="text-sm font-semibold text-amber-700">
            Showing {filtered.length} client{filtered.length !== 1 ? "s" : ""} with order alerts
          </span>
          <button
            onClick={() => setShowAlertOnly(false)}
            className="flex items-center gap-1 text-sm font-bold text-amber-600 hover:text-amber-800 transition-colors"
          >
            ← Back to all clients
          </button>
        </div>
      ) : alertClientCount > 0 && (
        <button
          onClick={() => setShowAlertOnly(true)}
          className="w-full mb-4 px-4 py-3 rounded-2xl bg-amber-50 border-2 border-amber-200 text-left hover:bg-amber-100/70 transition"
        >
          <span className="text-sm font-semibold text-amber-700">
            {alertClientCount} client{alertClientCount !== 1 ? "s have" : " has"} order alerts
          </span>
          <span className="text-xs text-amber-500 ml-2">Tap to review</span>
        </button>
      )}

      {/* Toolbar: search */}
      <div className="bg-white rounded-2xl border-2 border-gray-100 p-4 mb-4">
        <div className="flex gap-3 items-center">
          <input
            type="text"
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Search clients..."
            className="flex-1 rounded-xl border-2 border-gray-200 px-4 py-2.5 font-body text-base focus:outline-none focus:border-[#E8735A] focus:ring-1 focus:ring-[#E8735A]/30 transition-colors duration-150 min-h-[44px]"
          />

          {(hasFilters || showAlertOnly) && (
            <button
              onClick={() => {
                setSearch("");
                setDebouncedSearch("");
                setStatusFilter("");
                setQvFilter("");
                setShowAlertOnly(false);
              }}
              className="text-sm font-semibold text-[#E8735A] hover:text-[#d4644d] whitespace-nowrap transition-colors duration-150"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border-2 border-red-200 text-red-700 px-4 py-3 rounded-xl mb-4 text-sm font-semibold">
          {error}
          <button onClick={fetchClients} className="ml-2 underline">Retry</button>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="bg-white rounded-2xl border-2 border-gray-100">
          <LoadingSpinner message="Loading clients..." />
        </div>
      )}

      {/* Content */}
      {!loading && !error && (
        <>
          <ClientSection
            title="Active Clients"
            count={active.length}
            borderColor="border-l-green-500"
            clients={active}
            router={router}
            dismissedAlerts={dismissedAlerts}
            onDismissAlert={dismissAlert}
            sortKey={sortKey}
            sortDir={sortDir}
            onSort={handleSort}
          />
          <ClientSection
            title="At Risk"
            count={atRisk.length}
            borderColor="border-l-orange-500"
            clients={atRisk}
            router={router}
            dismissedAlerts={dismissedAlerts}
            onDismissAlert={dismissAlert}
            sortKey={sortKey}
            sortDir={sortDir}
            onSort={handleSort}
          />
          <ClientSection
            title="Past Clients"
            count={past.length}
            borderColor="border-l-gray-400"
            clients={past}
            router={router}
            defaultCollapsed={true}
            muted={true}
            dismissedAlerts={dismissedAlerts}
            onDismissAlert={dismissAlert}
            showLastOrderSubtitle={true}
            sortKey={sortKey}
            sortDir={sortDir}
            onSort={handleSort}
          />

          {filtered.length === 0 && (
            <EmptyState
              icon={hasFilters ? "\uD83D\uDD0D" : "\uD83D\uDC64"}
              title={hasFilters ? "No clients match your filters" : "No clients yet"}
              subtitle={
                hasFilters
                  ? "Try a different search or clear your filters"
                  : "Upload an order CSV to get started"
              }
              actionLabel={hasFilters ? "Clear filters" : undefined}
              onAction={
                hasFilters
                  ? () => {
                      setSearch("");
                      setDebouncedSearch("");
                      setStatusFilter("");
                      setQvFilter("");
                      setShowAlertOnly(false);
                    }
                  : undefined
              }
            />
          )}
        </>
      )}

      {/* Import modal */}
      {showImport && (
        <ImportModal
          onClose={() => setShowImport(false)}
          onComplete={fetchClients}
        />
      )}
    </div>
  );
}
