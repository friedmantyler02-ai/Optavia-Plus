"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useCoach } from "../layout";
import { useRouter } from "next/navigation";
import Papa from "papaparse";
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

function isThisWeek(dateStr) {
  if (!dateStr) return false;
  const now = new Date();
  const d = new Date(dateStr);
  const dayOfWeek = now.getDay();
  const mondayOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const monday = new Date(now);
  monday.setDate(now.getDate() - mondayOffset);
  monday.setHours(0, 0, 0, 0);
  return d >= monday;
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

// ── ImportOrdersModal (preserved exactly) ────────────────

function ImportOrdersModal({ onClose, onComplete }) {
  const [file, setFile] = useState(null);
  const [parsedRows, setParsedRows] = useState([]);
  const [preview, setPreview] = useState([]);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState("");
  const [result, setResult] = useState(null);
  const [parseError, setParseError] = useState("");
  const fileRef = useRef(null);
  const dragRef = useRef(null);
  const [dragging, setDragging] = useState(false);

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
        const previewRows = rows.slice(0, 5).map((row) => {
          const clean = {};
          for (const [k, v] of Object.entries(row)) {
            clean[cleanHeader(k)] = v;
          }
          return clean;
        });
        setPreview(previewRows);
      },
    });
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  };

  const handleImport = async () => {
    setImporting(true);
    setProgress("Uploading orders...");
    setResult(null);

    try {
      const res = await fetch("/api/clients/import-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orders: parsedRows }),
      });

      const data = await res.json();

      if (!res.ok) {
        setResult({ error: data.error || "Import failed" });
      } else {
        setResult(data);
      }
    } catch {
      setResult({ error: "Network error. Please try again." });
    } finally {
      setImporting(false);
      setProgress("");
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
            <div className="flex items-center justify-between mb-1">
              <h3 className="font-display text-xl font-bold text-gray-900">
                Upload Orders
              </h3>
              <button
                onClick={onClose}
                className="text-gray-400 hover:text-gray-600 text-lg"
              >
                &times;
              </button>
            </div>
            <p className="text-sm text-gray-500 mb-5">
              Import a Frontline order CSV to update client records.
            </p>

            {result && !result.error && (
              <div className="bg-green-50 border-2 border-green-200 rounded-xl p-4 mb-4">
                <p className="text-sm font-semibold text-green-700 mb-1">
                  Import complete!
                </p>
                <p className="text-sm text-green-600">
                  Updated {result.updated} clients, Created {result.created}{" "}
                  new, {result.alerts} alerts detected
                  {result.errors?.length > 0 &&
                    `, ${result.errors.length} errors`}
                </p>
                <button
                  onClick={() => {
                    onComplete();
                    onClose();
                  }}
                  className="mt-3 bg-[#E8735A] hover:bg-[#d4634d] text-white px-4 py-2 rounded-xl text-sm font-medium transition-all duration-150 active:scale-95"
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
                <div
                  ref={dragRef}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragging(true);
                  }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={handleDrop}
                  onClick={() => fileRef.current?.click()}
                  className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-colors duration-150 ${
                    dragging
                      ? "border-[#E8735A] bg-[#E8735A]/5"
                      : "border-gray-200 hover:border-gray-300 bg-gray-50"
                  }`}
                >
                  <input
                    ref={fileRef}
                    type="file"
                    accept=".csv"
                    className="hidden"
                    onChange={(e) => handleFile(e.target.files[0])}
                  />
                  <div className="text-3xl mb-2">📄</div>
                  {file ? (
                    <p className="text-sm font-semibold text-gray-700">
                      {file.name}{" "}
                      <span className="text-gray-400 font-normal">
                        ({parsedRows.length} rows)
                      </span>
                    </p>
                  ) : (
                    <>
                      <p className="text-sm font-semibold text-gray-600">
                        Drop CSV here or click to browse
                      </p>
                      <p className="text-xs text-gray-400 mt-1">
                        Frontline order export CSV
                      </p>
                    </>
                  )}
                </div>

                {preview.length > 0 && (
                  <div className="mt-4">
                    <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">
                      Preview (first {preview.length} rows)
                    </p>
                    <div className="overflow-x-auto rounded-xl border-2 border-gray-100">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="bg-gray-50 border-b border-gray-100">
                            <th className="text-left px-3 py-2 text-gray-400 font-bold">Name</th>
                            <th className="text-left px-3 py-2 text-gray-400 font-bold">Optavia ID</th>
                            <th className="text-left px-3 py-2 text-gray-400 font-bold">Order Date</th>
                            <th className="text-right px-3 py-2 text-gray-400 font-bold">QV</th>
                            <th className="text-left px-3 py-2 text-gray-400 font-bold">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {preview.map((row, i) => (
                            <tr key={i} className="border-b border-gray-50">
                              <td className="px-3 py-2 text-gray-700">{row.FirstName} {row.LastName}</td>
                              <td className="px-3 py-2 text-gray-500">{row.OPTAVIAID}</td>
                              <td className="px-3 py-2 text-gray-500">{row.OrderDate}</td>
                              <td className="px-3 py-2 text-gray-500 text-right">{row.QV}</td>
                              <td className="px-3 py-2 text-gray-500">{row.OrderStatus}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {parsedRows.length > 0 && (
                  <div className="mt-4 flex gap-3">
                    <button
                      onClick={onClose}
                      className="flex-1 px-4 py-2.5 text-sm font-medium rounded-xl border-2 border-gray-200 text-gray-600 hover:bg-gray-50 transition"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleImport}
                      disabled={importing}
                      className="flex-1 bg-[#E8735A] hover:bg-[#d4634d] text-white px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 active:scale-95 disabled:opacity-50"
                    >
                      {importing
                        ? progress || "Importing..."
                        : `Import ${parsedRows.length} Orders`}
                    </button>
                  </div>
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

function ClientRow({ client, onAction, muted, router }) {
  const [noteInput, setNoteInput] = useState("");
  const [showNote, setShowNote] = useState(false);
  const alerts = getAlertBadges(client.order_alerts);
  const qv = client.pqv;
  const isPremier = client.order_type?.toLowerCase()?.includes("premier");

  return (
    <div className={`flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 px-4 py-3 border-b border-gray-50 hover:bg-[#faf7f2]/60 transition-colors ${muted ? "opacity-70" : ""}`}>
      {/* Name + badges */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => router.push(`/dashboard/clients/${client.id}`)}
            className="font-body text-sm font-semibold text-gray-800 hover:text-[#E8735A] transition-colors truncate text-left"
          >
            {client.full_name}
          </button>
          {isPremier ? (
            <span className="inline-block rounded-full px-2 py-0.5 text-[10px] font-bold bg-blue-100 text-blue-700">Premier+</span>
          ) : client.order_type ? (
            <span className="inline-block rounded-full px-2 py-0.5 text-[10px] font-bold bg-gray-100 text-gray-500">On Demand</span>
          ) : null}
          {client.account_type?.toLowerCase()?.includes("health coach") && (
            <span className="inline-block rounded-full px-2 py-0.5 text-[10px] font-bold bg-purple-100 text-purple-600">Coach</span>
          )}
          {alerts.map((a, i) => (
            <span key={i} className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-bold ${a.cls}`}>
              {a.emoji} {a.label}
            </span>
          ))}
        </div>
      </div>

      {/* QV */}
      <div className="hidden sm:block w-16 text-right">
        <span className={`text-sm font-bold ${qv != null ? (qv >= 350 ? "text-green-600" : "text-orange-500") : "text-gray-300"}`}>
          {qv != null ? qv.toLocaleString() : "\u2014"}
        </span>
      </div>

      {/* Last order */}
      <div className="hidden sm:block w-20 text-right">
        <span className="text-xs text-gray-400">{formatDate(client.last_order_date)}</span>
      </div>

      {/* Last check-in */}
      <div className="hidden md:block w-24 text-right">
        <span className={`text-xs ${client.last_checkin_date ? "text-gray-400" : "text-red-400 font-semibold"}`}>
          {client.last_checkin_date ? timeAgo(client.last_checkin_date) : "Never"}
        </span>
      </div>

      {/* Quick actions */}
      <div className="flex items-center gap-1 shrink-0">
        <button
          onClick={() => onAction(client, "checkin")}
          className="px-2 py-1 rounded-lg text-xs hover:bg-green-50 transition"
          title="Check In"
        >
          ✅
        </button>
        <button
          onClick={() => onAction(client, "scale_pic")}
          className="px-2 py-1 rounded-lg text-xs hover:bg-blue-50 transition"
          title="Scale Pic"
        >
          📸
        </button>
        <button
          onClick={() => setShowNote(!showNote)}
          className="px-2 py-1 rounded-lg text-xs hover:bg-yellow-50 transition"
          title="Add Note"
        >
          📝
        </button>
      </div>

      {/* Mobile info row */}
      <div className="flex sm:hidden items-center gap-3 text-xs text-gray-400">
        <span className={qv != null ? (qv >= 350 ? "text-green-600 font-bold" : "text-orange-500 font-bold") : ""}>
          QV: {qv != null ? qv : "\u2014"}
        </span>
        <span>{formatDate(client.last_order_date)}</span>
        <span className={!client.last_checkin_date ? "text-red-400" : ""}>
          {client.last_checkin_date ? timeAgo(client.last_checkin_date) : "No check-in"}
        </span>
      </div>

      {/* Inline note input */}
      {showNote && (
        <div className="w-full flex gap-2 mt-1 sm:mt-0">
          <input
            type="text"
            value={noteInput}
            onChange={(e) => setNoteInput(e.target.value)}
            placeholder="Quick note..."
            className="flex-1 px-3 py-1.5 text-xs border-2 border-gray-200 rounded-lg focus:border-brand-500 focus:outline-none"
            onKeyDown={(e) => {
              if (e.key === "Enter" && noteInput.trim()) {
                onAction(client, "note", noteInput.trim());
                setNoteInput("");
                setShowNote(false);
              }
            }}
          />
          <button
            onClick={() => {
              if (noteInput.trim()) {
                onAction(client, "note", noteInput.trim());
                setNoteInput("");
                setShowNote(false);
              }
            }}
            className="px-3 py-1.5 text-xs font-medium bg-[#E8735A] text-white rounded-lg hover:bg-[#d4634d] transition"
          >
            Save
          </button>
        </div>
      )}
    </div>
  );
}

// ── Section Wrapper ──────────────────────────────────────

function ClientSection({ title, count, borderColor, clients, onAction, router, defaultCollapsed = false, muted = false }) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  if (count === 0) return null;

  return (
    <div className={`rounded-2xl border-2 border-gray-100 bg-white overflow-hidden mb-4 border-l-4 ${borderColor}`}>
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition"
      >
        <h3 className="text-sm font-bold text-gray-700">
          {title} <span className="text-gray-400 font-normal">({count})</span>
        </h3>
        <span className="text-gray-400 text-xs">{collapsed ? "▼" : "▲"}</span>
      </button>
      {!collapsed && (
        <div className="border-t border-gray-100">
          {/* Column headers - desktop */}
          <div className="hidden sm:flex items-center gap-4 px-4 py-2 border-b border-gray-100 text-[10px] font-bold text-gray-400 uppercase tracking-wider">
            <div className="flex-1">Name</div>
            <div className="w-16 text-right">QV</div>
            <div className="w-20 text-right">Last Order</div>
            <div className="hidden md:block w-24 text-right">Check-in</div>
            <div className="w-[88px]">Actions</div>
          </div>
          {clients.map((c) => (
            <ClientRow key={c.id} client={c} onAction={onAction} muted={muted} router={router} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Checklist View ───────────────────────────────────────

function ChecklistView({ clients, onAction, supabase, coachId }) {
  const weeklyClients = clients.filter((c) => c.wants_weekly_checkin !== false);
  const valueAddClients = clients.filter(
    (c) => c.wants_weekly_checkin === false && c.wants_value_adds !== false
  );

  const checkedInCount = weeklyClients.filter((c) =>
    isThisWeek(c.last_checkin_date)
  ).length;

  const handleToggle = async (client, field) => {
    const alreadyDone = isThisWeek(client[field]);
    if (alreadyDone) return;
    onAction(client, field === "last_checkin_date" ? "checkin" : "scale_pic");
  };

  const handleValueAdd = async (client) => {
    onAction(client, "value_add");
  };

  function CheckRow({ client, showValueAdd }) {
    const checkedIn = isThisWeek(client.last_checkin_date);
    const scalePic = isThisWeek(client.last_scale_pic_date);
    const allDone = showValueAdd ? checkedIn : checkedIn;

    return (
      <div className={`flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 px-4 py-3 border-b border-gray-50 transition-colors ${allDone ? "bg-green-50/50" : ""}`}>
        <div className="flex-1 min-w-0">
          <span className="text-sm font-semibold text-gray-800">{client.full_name}</span>
          <span className={`ml-2 text-xs font-bold ${client.pqv != null ? (client.pqv >= 350 ? "text-green-600" : "text-orange-500") : "text-gray-300"}`}>
            {client.pqv != null ? `${client.pqv} QV` : ""}
          </span>
        </div>
        <div className="hidden sm:block w-24 text-right text-xs text-gray-400">
          {client.last_checkin_date ? timeAgo(client.last_checkin_date) : "Never"}
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={checkedIn}
              onChange={() => handleToggle(client, "last_checkin_date")}
              className="w-4 h-4 rounded border-gray-300 text-green-600 focus:ring-green-500"
            />
            <span className="text-xs text-gray-500">Check-in</span>
          </label>
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={scalePic}
              onChange={() => handleToggle(client, "last_scale_pic_date")}
              className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="text-xs text-gray-500">Scale Pic</span>
          </label>
          {showValueAdd && (
            <button
              onClick={() => handleValueAdd(client)}
              className="px-2 py-1 rounded-lg text-xs hover:bg-purple-50 transition"
              title="Send Value Add"
            >
              💌
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Progress bar */}
      <div className="rounded-2xl border-2 border-gray-100 bg-white p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-bold text-gray-700">
            Weekly Progress
          </span>
          <span className="text-sm text-gray-500">
            {checkedInCount} of {weeklyClients.length} clients checked in
          </span>
        </div>
        <div className="w-full bg-gray-100 rounded-full h-2.5">
          <div
            className="bg-green-500 h-2.5 rounded-full transition-all duration-300"
            style={{
              width: `${weeklyClients.length > 0 ? (checkedInCount / weeklyClients.length) * 100 : 0}%`,
            }}
          />
        </div>
      </div>

      {/* Weekly check-in clients */}
      {weeklyClients.length > 0 && (
        <div className="rounded-2xl border-2 border-gray-100 bg-white overflow-hidden border-l-4 border-l-green-500">
          <div className="px-4 py-3 border-b border-gray-100">
            <h3 className="text-sm font-bold text-gray-700">
              Weekly Check-In Clients <span className="text-gray-400 font-normal">({weeklyClients.length})</span>
            </h3>
          </div>
          <div className="hidden sm:flex items-center gap-4 px-4 py-2 border-b border-gray-100 text-[10px] font-bold text-gray-400 uppercase tracking-wider">
            <div className="flex-1">Name</div>
            <div className="w-24 text-right">Last Check-in</div>
            <div className="w-[220px]">This Week</div>
          </div>
          {weeklyClients.map((c) => (
            <CheckRow key={c.id} client={c} showValueAdd={false} />
          ))}
        </div>
      )}

      {/* Value-add only clients */}
      {valueAddClients.length > 0 && (
        <div className="rounded-2xl border-2 border-gray-100 bg-white overflow-hidden border-l-4 border-l-purple-400">
          <div className="px-4 py-3 border-b border-gray-100">
            <h3 className="text-sm font-bold text-gray-700">
              Value Add Only <span className="text-gray-400 font-normal">({valueAddClients.length})</span>
            </h3>
          </div>
          {valueAddClients.map((c) => (
            <CheckRow key={c.id} client={c} showValueAdd={true} />
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
  const [showImportModal, setShowImportModal] = useState(false);

  // View & filters
  const [viewMode, setViewMode] = useState("list");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [orderTypeFilter, setOrderTypeFilter] = useState("");
  const [qvFilter, setQvFilter] = useState("");
  const [showAlertOnly, setShowAlertOnly] = useState(false);
  const [pastExpanded, setPastExpanded] = useState(false);

  const debounceRef = useRef(null);

  const handleSearchChange = useCallback((value) => {
    setSearch(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedSearch(value), 300);
  }, []);

  // Fetch clients directly from Supabase
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

  // Quick actions
  const handleAction = async (client, action, noteText) => {
    const now = new Date().toISOString();

    if (action === "checkin") {
      await supabase
        .from("clients")
        .update({ last_checkin_date: now })
        .eq("id", client.id);
      await supabase.from("activities").insert({
        coach_id: coach.id,
        client_id: client.id,
        action: "Logged a check-in",
        details: client.full_name,
      });
      setAllClients((prev) =>
        prev.map((c) => (c.id === client.id ? { ...c, last_checkin_date: now } : c))
      );
    } else if (action === "scale_pic") {
      await supabase
        .from("clients")
        .update({ last_scale_pic_date: now })
        .eq("id", client.id);
      await supabase.from("activities").insert({
        coach_id: coach.id,
        client_id: client.id,
        action: "Logged a scale pic",
        details: client.full_name,
      });
      setAllClients((prev) =>
        prev.map((c) => (c.id === client.id ? { ...c, last_scale_pic_date: now } : c))
      );
    } else if (action === "value_add") {
      await supabase.from("activities").insert({
        coach_id: coach.id,
        client_id: client.id,
        action: "value_add_sent",
        details: client.full_name,
      });
    } else if (action === "note" && noteText) {
      await supabase.from("activities").insert({
        coach_id: coach.id,
        client_id: client.id,
        action: "Logged a note",
        details: noteText,
      });
    }
  };

  // Filter clients
  const filtered = allClients.filter((c) => {
    if (debouncedSearch) {
      const q = debouncedSearch.toLowerCase();
      if (!(c.full_name || "").toLowerCase().includes(q)) return false;
    }
    if (orderTypeFilter === "premier" && !c.order_type?.toLowerCase()?.includes("premier")) return false;
    if (orderTypeFilter === "ondemand" && c.order_type?.toLowerCase()?.includes("premier")) return false;
    if (qvFilter === "over350" && (c.pqv == null || c.pqv < 350)) return false;
    if (qvFilter === "under350" && c.pqv != null && c.pqv >= 350) return false;
    if (showAlertOnly && (!c.order_alerts || c.order_alerts.length === 0)) return false;
    return true;
  });

  // Bucket into sections
  const active = filtered.filter((c) => bucketClient(c) === "active");
  const atRisk = filtered.filter((c) => bucketClient(c) === "at_risk");
  const past = filtered.filter((c) => bucketClient(c) === "past");

  // Alert count
  const alertClientCount = allClients.filter(
    (c) => c.order_alerts && Array.isArray(c.order_alerts) && c.order_alerts.length > 0
  ).length;

  const activeCount = allClients.filter((c) => bucketClient(c) === "active").length;

  const hasFilters = debouncedSearch || orderTypeFilter || qvFilter || showAlertOnly;

  return (
    <div>
      <PageHeader
        title="My Clients"
        subtitle={activeCount > 0 ? `${activeCount} active clients` : undefined}
        actions={
          <div className="flex gap-2">
            <button
              onClick={() => setShowImportModal(true)}
              className="px-4 py-2 rounded-xl text-sm font-medium border-2 border-[#E8735A] text-[#E8735A] hover:bg-[#E8735A]/10 transition-all duration-150 active:scale-95"
            >
              Upload Orders
            </button>
          </div>
        }
      />

      {/* Alert banner */}
      {alertClientCount > 0 && !showAlertOnly && (
        <button
          onClick={() => setShowAlertOnly(true)}
          className="w-full mb-4 px-4 py-3 rounded-2xl bg-red-50 border-2 border-red-200 text-left hover:bg-red-100 transition"
        >
          <span className="text-sm font-semibold text-red-700">
            ⚠️ {alertClientCount} client{alertClientCount !== 1 ? "s have" : " has"} order alerts
          </span>
          <span className="text-xs text-red-500 ml-2">Click to view</span>
        </button>
      )}

      {/* Toolbar: search + filters + view toggle */}
      <div className="bg-white rounded-2xl border-2 border-gray-100 p-4 mb-4">
        <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
          <input
            type="text"
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Search clients..."
            className="flex-1 rounded-xl border-2 border-gray-200 px-4 py-2.5 font-body text-sm focus:outline-none focus:border-[#E8735A] focus:ring-1 focus:ring-[#E8735A]/30 transition-colors duration-150"
          />

          <select
            value={orderTypeFilter}
            onChange={(e) => setOrderTypeFilter(e.target.value)}
            className="rounded-xl border-2 border-gray-200 px-3 py-2.5 font-body text-sm bg-white focus:outline-none focus:border-[#E8735A] focus:ring-1 focus:ring-[#E8735A]/30 transition-colors duration-150"
          >
            <option value="">All Types</option>
            <option value="premier">Premier+</option>
            <option value="ondemand">On Demand</option>
          </select>

          <select
            value={qvFilter}
            onChange={(e) => setQvFilter(e.target.value)}
            className="rounded-xl border-2 border-gray-200 px-3 py-2.5 font-body text-sm bg-white focus:outline-none focus:border-[#E8735A] focus:ring-1 focus:ring-[#E8735A]/30 transition-colors duration-150"
          >
            <option value="">All QV</option>
            <option value="over350">Over 350</option>
            <option value="under350">Under 350</option>
          </select>

          {/* View toggle */}
          <div className="flex rounded-xl border-2 border-gray-200 overflow-hidden">
            <button
              onClick={() => setViewMode("list")}
              className={`px-3 py-2 text-xs font-bold transition ${
                viewMode === "list" ? "bg-brand-500 text-white" : "text-gray-400 hover:bg-gray-50"
              }`}
            >
              List
            </button>
            <button
              onClick={() => setViewMode("checklist")}
              className={`px-3 py-2 text-xs font-bold transition ${
                viewMode === "checklist" ? "bg-brand-500 text-white" : "text-gray-400 hover:bg-gray-50"
              }`}
            >
              Checklist
            </button>
          </div>

          {(hasFilters || showAlertOnly) && (
            <button
              onClick={() => {
                setSearch("");
                setDebouncedSearch("");
                setOrderTypeFilter("");
                setQvFilter("");
                setShowAlertOnly(false);
              }}
              className="text-sm font-semibold text-[#E8735A] hover:text-[#d4644d] whitespace-nowrap transition-colors duration-150"
            >
              Clear filters
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
          {viewMode === "list" ? (
            <>
              <ClientSection
                title="Active Clients"
                count={active.length}
                borderColor="border-l-green-500"
                clients={active}
                onAction={handleAction}
                router={router}
              />
              <ClientSection
                title="At Risk"
                count={atRisk.length}
                borderColor="border-l-orange-500"
                clients={atRisk}
                onAction={handleAction}
                router={router}
              />
              <ClientSection
                title="Past Clients"
                count={past.length}
                borderColor="border-l-gray-400"
                clients={past}
                onAction={handleAction}
                router={router}
                defaultCollapsed={true}
                muted={true}
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
                          setOrderTypeFilter("");
                          setQvFilter("");
                          setShowAlertOnly(false);
                        }
                      : undefined
                  }
                />
              )}
            </>
          ) : (
            <ChecklistView
              clients={active}
              onAction={handleAction}
              supabase={supabase}
              coachId={coach.id}
            />
          )}
        </>
      )}

      {/* Import modal */}
      {showImportModal && (
        <ImportOrdersModal
          onClose={() => setShowImportModal(false)}
          onComplete={fetchClients}
        />
      )}
    </div>
  );
}
