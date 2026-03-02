"use client";

import { useState, useRef, useCallback, useMemo } from "react";
import { useCoach } from "../layout";
import Papa from "papaparse";
import { normalizeOrgCsvPhone } from "@/lib/phone";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const VALID_STATUSES = new Set(["Active", "Reverted"]);

function isPlaceholderEmail(email) {
  if (!email) return true;
  return email.trim().toLowerCase().endsWith("@medifastinc.com");
}

function cleanRow(raw) {
  const status = (raw.AccountStatus || "").trim();
  // Skip rows with corrupt/unrecognized status
  if (status && !VALID_STATUSES.has(status)) return null;

  const email = (raw.Email || "").trim();
  const phone = normalizeOrgCsvPhone(raw.Phone || "");

  return {
    optaviaId: (raw.OPTAVIAID || "").trim(),
    firstName: (raw.FirstName || "").trim(),
    lastName: (raw.LastName || "").trim(),
    countryCode: (raw.CountryCode || "").trim(),
    level: (raw.Level || "").trim(),
    email,
    emailValid: !!email && !isPlaceholderEmail(email),
    phone,
    lastOrderDate: (raw.LastOrderDate || "").trim(),
    entryDate: (raw.EntryDate || "").trim(),
    accountStatus: status || "Unknown",
    pqv: (raw.PQV || "").trim(),
    premierMember: (raw["Premier+Member"] || "").trim(),
    coachName: (raw.CurrentCoachName || "").trim(),
    coachId: (raw.CurrentCoachID || "").trim(),
    globalDirector: (raw.GlobalDirector || "").trim(),
    presidentialDirector: (raw.PresidentialDirector || "").trim(),
  };
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function OrgImportPage() {
  const { coach } = useCoach();
  const fileInputRef = useRef(null);
  const [file, setFile] = useState(null);
  const [parsing, setParsing] = useState(false);
  const [records, setRecords] = useState([]);
  const [parseError, setParseError] = useState(null);
  const [importReady, setImportReady] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  // --- Derived stats ---
  const stats = useMemo(() => {
    if (records.length === 0) return null;

    const coaches = new Set();
    let validEmail = 0;
    let validPhone = 0;
    let active = 0;
    let reverted = 0;

    for (const r of records) {
      if (r.coachName) coaches.add(r.coachName);
      if (r.emailValid) validEmail++;
      if (r.phone) validPhone++;
      if (r.accountStatus === "Active") active++;
      if (r.accountStatus === "Reverted") reverted++;
    }

    return {
      total: records.length,
      uniqueCoaches: coaches.size,
      validEmail,
      validPhone,
      active,
      reverted,
    };
  }, [records]);

  // --- File handling ---
  const handleFile = useCallback((f) => {
    if (!f.name.toLowerCase().endsWith(".csv")) {
      setParseError("Please select a .csv file.");
      return;
    }
    setFile(f);
    setParseError(null);
    setRecords([]);
    setImportReady(false);
    setParsing(true);

    Papa.parse(f, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (header) => {
        const h = header.trim();
        if (h === '="Phone"' || h === "Phone") return "Phone";
        return h;
      },
      complete(results) {
        const cleaned = [];
        for (const row of results.data) {
          const rec = cleanRow(row);
          if (rec) cleaned.push(rec);
        }
        setRecords(cleaned);
        setParsing(false);
      },
      error(err) {
        setParseError("Failed to parse CSV: " + err.message);
        setParsing(false);
      },
    });
  }, []);

  const onDrop = useCallback(
    (e) => {
      e.preventDefault();
      setDragOver(false);
      const f = e.dataTransfer.files[0];
      if (f) handleFile(f);
    },
    [handleFile],
  );

  const onFileChange = useCallback(
    (e) => {
      const f = e.target.files?.[0];
      if (f) handleFile(f);
    },
    [handleFile],
  );

  // --- Preview rows ---
  const previewRows = records.slice(0, 20);

  // --- Render ---
  return (
    <div className="animate-fade-up">
      <h1 className="font-display text-2xl md:text-3xl font-bold mb-1">
        Org Import
      </h1>
      <p className="text-gray-400 font-body text-base mb-8">
        Upload your full organization CSV to preview and import your team data.
      </p>

      {/* --------------------------------------------------------------- */}
      {/* UPLOAD ZONE                                                      */}
      {/* --------------------------------------------------------------- */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`flex cursor-pointer flex-col items-center justify-center rounded-2xl border-3 border-dashed px-6 py-16 text-center transition-all bg-white shadow-sm ${
          dragOver
            ? "border-brand-500 bg-brand-50"
            : "border-gray-200 hover:border-brand-300"
        }`}
      >
        {/* Upload icon */}
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-4xl mb-4 bg-brand-50">
          📥
        </div>

        {file ? (
          <div>
            <p className="text-lg font-bold text-gray-800">{file.name}</p>
            <p className="mt-1 text-sm text-gray-400 font-body">
              {(file.size / 1024).toFixed(1)} KB
            </p>
          </div>
        ) : (
          <div>
            <p className="text-xl font-bold text-gray-700">
              Drag &amp; drop your CSV file here
            </p>
            <p className="mt-2 text-base text-gray-400 font-body">
              or click to browse your computer
            </p>
            <p className="mt-1 text-sm text-gray-300 font-body">
              Accepts .csv files only
            </p>
          </div>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept=".csv"
          onChange={onFileChange}
          className="hidden"
        />
      </div>

      {/* Error */}
      {parseError && (
        <div className="mt-4 rounded-xl border-2 border-red-200 bg-red-50 px-5 py-3 text-sm font-semibold text-red-600">
          {parseError}
        </div>
      )}

      {/* Parsing spinner */}
      {parsing && (
        <div className="mt-10 flex flex-col items-center gap-3 text-center">
          <div className="w-12 h-12 rounded-2xl bg-brand-50 flex items-center justify-center text-2xl animate-bounce">
            📂
          </div>
          <p className="text-base text-gray-400 font-body font-semibold">
            Reading file&hellip; this may take a moment for large files
          </p>
        </div>
      )}

      {/* --------------------------------------------------------------- */}
      {/* PREVIEW SECTION                                                  */}
      {/* --------------------------------------------------------------- */}
      {stats && !parsing && (
        <div className="mt-8 animate-fade-up">
          {/* Summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            <SummaryCard
              label="Total Records"
              value={stats.total.toLocaleString()}
              emoji="📊"
              color="brand"
            />
            <SummaryCard
              label="Unique Coaches"
              value={stats.uniqueCoaches.toLocaleString()}
              emoji="🧑‍🏫"
              color="coral"
            />
            <SummaryCard
              label="Valid Emails"
              value={stats.validEmail.toLocaleString()}
              emoji="📧"
              color="warm"
            />
            <SummaryCard
              label="Valid Phones"
              value={stats.validPhone.toLocaleString()}
              emoji="📱"
              color="brand"
            />
            <SummaryCard
              label="Active / Reverted"
              value={`${stats.active.toLocaleString()} / ${stats.reverted.toLocaleString()}`}
              emoji="✅"
              color="brand"
            />
          </div>

          {/* Preview table */}
          <div className="mt-6 overflow-x-auto rounded-2xl bg-white shadow-sm border-2 border-gray-100">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b-2 border-gray-100">
                  <th className="whitespace-nowrap px-4 py-3 text-xs font-bold text-gray-400 uppercase">
                    First Name
                  </th>
                  <th className="whitespace-nowrap px-4 py-3 text-xs font-bold text-gray-400 uppercase">
                    Last Name
                  </th>
                  <th className="whitespace-nowrap px-4 py-3 text-xs font-bold text-gray-400 uppercase">
                    Email
                  </th>
                  <th className="whitespace-nowrap px-4 py-3 text-xs font-bold text-gray-400 uppercase">
                    Phone
                  </th>
                  <th className="whitespace-nowrap px-4 py-3 text-xs font-bold text-gray-400 uppercase">
                    Coach
                  </th>
                  <th className="whitespace-nowrap px-4 py-3 text-xs font-bold text-gray-400 uppercase">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody>
                {previewRows.map((r, i) => (
                  <tr
                    key={i}
                    className="border-b border-gray-50 last:border-0"
                  >
                    <td className="whitespace-nowrap px-4 py-3 font-semibold text-gray-800">
                      {r.firstName}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 font-semibold text-gray-800">
                      {r.lastName}
                    </td>
                    <td className="px-4 py-3">
                      {r.emailValid ? (
                        <span className="text-gray-700">{r.email}</span>
                      ) : (
                        <span className="text-gray-300 italic">no email</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      {r.phone ? (
                        <span className="text-gray-700">{r.phone}</span>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-gray-600">
                      {r.coachName}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <StatusBadge status={r.accountStatus} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {records.length > 20 && (
              <div className="border-t-2 border-gray-100 px-4 py-3 text-center text-xs text-gray-400 font-semibold">
                Showing first 20 of {records.length.toLocaleString()} records
              </div>
            )}
          </div>

          {/* Start Import button */}
          <div className="mt-8 flex justify-center">
            <button
              onClick={() => setImportReady(true)}
              disabled={importReady}
              className="px-10 py-4 bg-brand-500 text-white rounded-2xl text-lg font-bold shadow-lg hover:bg-brand-600 hover:shadow-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {importReady ? "✅ Ready to Import" : "🚀 Start Import"}
            </button>
          </div>
          {importReady && (
            <p className="mt-3 text-center text-sm text-gray-400 font-body">
              Import engine will be connected in the next step.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

const cardColors = {
  brand: { bg: "bg-brand-50", text: "text-brand-500" },
  warm: { bg: "bg-warm-50", text: "text-warm-500" },
  coral: { bg: "bg-coral-50", text: "text-coral-500" },
};

function SummaryCard({ label, value, emoji, color }) {
  const c = cardColors[color] || cardColors.brand;
  return (
    <div className="bg-white rounded-2xl border-2 border-gray-100 p-4 shadow-sm">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-lg">{emoji}</span>
        <p className="text-xs font-bold text-gray-400 uppercase">{label}</p>
      </div>
      <p className={`text-2xl font-bold ${c.text}`}>{value}</p>
    </div>
  );
}

function StatusBadge({ status }) {
  const config = {
    Active: { bg: "bg-brand-50", text: "text-brand-500" },
    Reverted: { bg: "bg-red-50", text: "text-red-500" },
  };
  const c = config[status] || { bg: "bg-gray-100", text: "text-gray-400" };
  return (
    <span
      className={`inline-block rounded-lg px-3 py-1 text-xs font-bold ${c.bg} ${c.text}`}
    >
      {status}
    </span>
  );
}
