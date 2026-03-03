"use client";

import { useState, useRef, useCallback, useMemo, useEffect } from "react";
import { useCoach } from "../layout";
import Papa from "papaparse";
import { normalizeOrgCsvPhone } from "@/lib/phone";
import {
  extractUniqueCoaches,
  upsertCoachStubs,
  buildClientRecord,
  batchUpsertClients,
  linkClientsToCoaches,
} from "@/lib/import-engine";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const VALID_STATUSES = new Set(["Active", "Reverted"]);

function isPlaceholderEmail(email) {
  if (!email) return true;
  return email.trim().toLowerCase().endsWith("@medifastinc.com");
}

function cleanRow(raw) {
  // Skip the header row if Papa Parse accidentally included it as data
  const id = (raw.OPTAVIAID || raw["\uFEFFOPTAVIAID"] || "").trim();
  if (!id || id === "OPTAVIAID") return null;

  const status = (raw.AccountStatus || "").trim();
  // Skip rows with corrupt/unrecognized status
  if (status && !VALID_STATUSES.has(status)) return null;

  const email = (raw.Email || "").trim();
  const phone = normalizeOrgCsvPhone(raw.Phone || "");

  return {
    optaviaId: id,
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
  const { supabase } = useCoach();
  const fileInputRef = useRef(null);

  // --- Upload / parse state ---
  const [file, setFile] = useState(null);
  const [parsing, setParsing] = useState(false);
  const [records, setRecords] = useState([]);
  const [rawRows, setRawRows] = useState([]);
  const [parseError, setParseError] = useState(null);
  const [dragOver, setDragOver] = useState(false);

  // --- Import processing state ---
  const [phase, setPhase] = useState("upload"); // upload | preview | processing | complete
  const [steps, setSteps] = useState([
    { status: "pending", label: "Creating coach records..." },
    { status: "pending", label: "Importing client records..." },
    { status: "pending", label: "Linking clients to coaches..." },
  ]);
  const [clientProgress, setClientProgress] = useState({ completed: 0, total: 0 });
  const [importResults, setImportResults] = useState(null);
  const [importError, setImportError] = useState(null);
  const [partialProgress, setPartialProgress] = useState(null);

  // --- Warn before leaving during import ---
  useEffect(() => {
    if (phase !== "processing") return;
    const handler = (e) => { e.preventDefault(); };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [phase]);

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
    setRawRows([]);
    setPhase("upload");
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
        const raw = [];
        for (const row of results.data) {
          const rec = cleanRow(row);
          if (rec) {
            cleaned.push(rec);
            raw.push(row);
          }
        }
        setRecords(cleaned);
        setRawRows(raw);
        setPhase("preview");
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

  // --- Helper to update a single step ---
  function updateStep(index, patch) {
    setSteps((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  }

  // --- Start import ---
  const startImport = useCallback(async () => {
    console.log("START IMPORT CLICKED", { rawRowsLength: rawRows.length, hasFile: !!file });
    if (rawRows.length === 0 || !file) return;

    setPhase("processing");
    setImportError(null);
    setPartialProgress(null);
    setSteps([
      { status: "pending", label: "Creating coach records..." },
      { status: "pending", label: "Importing client records..." },
      { status: "pending", label: "Linking clients to coaches..." },
    ]);

    let coachResult = null;
    let clientResult = null;
    let totalClientRecords = 0;
    let linked = 0;
    let batchId = null;

    try {
      // --- Get authenticated user (once, reused below) ---
      const { data: { user: authUser }, error: userError } = await supabase.auth.getUser();
      if (userError || !authUser) {
        throw new Error("Your session has expired. Please refresh the page and sign in again.");
      }

      // --- Create import_batches record ---
      const { data: batchData, error: batchError } = await supabase
        .from("import_batches")
        .insert({ filename: file.name, total_records: rawRows.length, coach_id: authUser.id })
        .select("id")
        .single();

      if (batchError || !batchData) {
        throw new Error(
          "Could not start the import. Please check your connection and try again.",
        );
      }

      batchId = batchData.id;

      // --- Step 1: Coaches ---
      updateStep(0, { status: "active" });

      const coaches = extractUniqueCoaches(rawRows);
      coachResult = await upsertCoachStubs(supabase, coaches);

      updateStep(0, {
        status: "done",
        result: `Created ${coachResult.created} coaches (${coachResult.existing} already existed)`,
      });

      // --- Step 2: Clients ---
      updateStep(1, { status: "active" });

      const clientRecords = rawRows
        .map((row) => buildClientRecord(row, batchId))
        .filter((r) => r !== null);

      totalClientRecords = clientRecords.length;
      setClientProgress({ completed: 0, total: totalClientRecords });

      clientResult = await batchUpsertClients(supabase, clientRecords, (progress) => {
        setClientProgress({ completed: progress.completed, total: progress.total });
      });

      updateStep(1, {
        status: clientResult.errors > 0 ? "error" : "done",
        result: `${clientResult.inserted.toLocaleString()} records processed${clientResult.errors > 0 ? ` (${clientResult.errors} errors)` : ""}`,
      });

      // --- Step 3: Link ---
      updateStep(2, { status: "active" });

      linked = await linkClientsToCoaches(supabase, batchId);

      updateStep(2, {
        status: "done",
        result: `Linked ${linked.toLocaleString()} records`,
      });

      // --- Store results ---
      setImportResults({
        totalRecords: totalClientRecords,
        coachesCreated: coachResult.created,
        coachesExisting: coachResult.existing,
        clientsProcessed: clientResult.inserted + clientResult.updated,
        clientErrors: clientResult.errors,
        recordsLinked: linked,
        errorDetails: clientResult.errorDetails,
      });

      setPhase("complete");
    } catch (err) {
      const rawMsg = err instanceof Error ? err.message : String(err);
      let userMessage;

      if (rawMsg.includes("Failed to fetch") || rawMsg.includes("NetworkError")) {
        userMessage = "Lost connection to the server. Please check your internet and try again.";
      } else if (rawMsg.includes("JWT") || rawMsg.includes("auth")) {
        userMessage = "Your session has expired. Please refresh the page and sign in again.";
      } else {
        userMessage = rawMsg;
      }

      const parts = [];
      if (coachResult) {
        parts.push(`${coachResult.created} coaches created`);
      }
      if (clientResult) {
        parts.push(`${clientResult.inserted.toLocaleString()} client records saved`);
      }
      if (parts.length > 0) {
        setPartialProgress(
          `Before the error, ${parts.join(" and ")} were successfully processed. These changes have been saved.`,
        );
      }

      setImportError(userMessage);
    } finally {
      if (batchId) {
        const orphanedCount = totalClientRecords - linked;
        await supabase
          .from("import_batches")
          .update({
            new_records: clientResult?.inserted ?? 0,
            duplicates_skipped: clientResult?.updated ?? 0,
            orphaned_count: orphanedCount > 0 ? orphanedCount : 0,
          })
          .eq("id", batchId);
      }
    }
  }, [supabase, rawRows, file]);

  // --- Reset to initial state ---
  const resetPage = useCallback(() => {
    setFile(null);
    setRecords([]);
    setRawRows([]);
    setParseError(null);
    setPhase("upload");
    setImportResults(null);
    setImportError(null);
    setPartialProgress(null);
    setClientProgress({ completed: 0, total: 0 });
    setSteps([
      { status: "pending", label: "Creating coach records..." },
      { status: "pending", label: "Importing client records..." },
      { status: "pending", label: "Linking clients to coaches..." },
    ]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

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
      {(phase === "upload" || phase === "preview") && (
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
      )}

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
      {phase === "preview" && stats && !parsing && (
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
              onClick={startImport}
              className="px-10 py-4 bg-brand-500 text-white rounded-2xl text-lg font-bold shadow-lg hover:bg-brand-600 hover:shadow-xl transition-all"
            >
              Start Import
            </button>
          </div>
        </div>
      )}

      {/* --------------------------------------------------------------- */}
      {/* PROCESSING PHASE                                                 */}
      {/* --------------------------------------------------------------- */}
      {phase === "processing" && (
        <div className="mt-8 animate-fade-up">
          <div className="rounded-2xl bg-white shadow-sm border-2 border-gray-100 px-8 py-10">
            <h2 className="font-display text-2xl font-bold text-center text-gray-800 mb-8">
              Processing Import&hellip;
            </h2>

            <div className="max-w-lg mx-auto space-y-6">
              {steps.map((step, i) => (
                <div key={i} className="flex items-start gap-4">
                  {/* Icon */}
                  <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center">
                    {step.status === "pending" && (
                      <div className="h-4 w-4 rounded-full border-2 border-gray-200" />
                    )}
                    {step.status === "active" && (
                      <div className="h-5 w-5 rounded-full border-2 border-brand-500 border-t-transparent animate-spin" />
                    )}
                    {step.status === "done" && (
                      <span className="text-xl text-brand-500">✓</span>
                    )}
                    {step.status === "error" && (
                      <span className="text-xl text-red-500">✗</span>
                    )}
                  </div>

                  {/* Text */}
                  <div className="flex-1">
                    <p className={`text-base font-semibold ${
                      step.status === "pending"
                        ? "text-gray-300"
                        : step.status === "error"
                          ? "text-red-500"
                          : "text-gray-800"
                    }`}>
                      {step.result
                        ? (step.status === "done" ? "✓ " : "") + step.result
                        : step.label}
                    </p>

                    {/* Progress bar for Step 2 while active */}
                    {i === 1 && step.status === "active" && clientProgress.total > 0 && (
                      <div className="mt-3">
                        <div className="h-3 w-full overflow-hidden rounded-full bg-gray-100">
                          <div
                            className="h-full rounded-full bg-brand-500 transition-all duration-300"
                            style={{
                              width: `${Math.round(
                                (clientProgress.completed / clientProgress.total) * 100,
                              )}%`,
                            }}
                          />
                        </div>
                        <p className="mt-1.5 text-sm text-gray-400 font-body">
                          {clientProgress.completed.toLocaleString()} of{" "}
                          {clientProgress.total.toLocaleString()} records processed
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Import error */}
            {importError && (
              <div className="max-w-lg mx-auto mt-8 space-y-4">
                <div className="rounded-xl border-2 border-red-200 bg-red-50 px-5 py-4">
                  <p className="text-base font-bold text-red-600">
                    Something went wrong
                  </p>
                  <p className="mt-1 text-sm text-red-500 font-body">
                    {importError}
                  </p>
                  {partialProgress && (
                    <p className="mt-3 text-sm text-gray-600 font-body">
                      {partialProgress}
                    </p>
                  )}
                </div>
                <div className="flex justify-center">
                  <button
                    onClick={resetPage}
                    className="px-8 py-3 bg-brand-500 text-white rounded-2xl text-base font-bold shadow-lg hover:bg-brand-600 hover:shadow-xl transition-all"
                  >
                    Try Again
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* --------------------------------------------------------------- */}
      {/* COMPLETION SUMMARY                                               */}
      {/* --------------------------------------------------------------- */}
      {phase === "complete" && importResults && (
        <div className="mt-8 animate-fade-up">
          <div className="rounded-2xl bg-white shadow-sm border-2 border-gray-100 px-8 py-10">
            <h2 className="font-display text-2xl font-bold text-center text-brand-500 mb-2">
              Import Complete ✓
            </h2>
            <p className="text-center text-sm text-gray-400 font-body mb-8">
              Your organization data has been imported successfully.
            </p>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <ResultCard
                label="Total Records"
                value={importResults.totalRecords.toLocaleString()}
                emoji="📊"
                color="brand"
              />
              <ResultCard
                label="Processed"
                value={importResults.clientsProcessed.toLocaleString()}
                emoji="✅"
                color="brand"
              />
              <ResultCard
                label="Coaches Created"
                value={importResults.coachesCreated.toLocaleString()}
                emoji="🧑‍🏫"
                color="coral"
              />
              <ResultCard
                label="Linked to Coaches"
                value={importResults.recordsLinked.toLocaleString()}
                emoji="🔗"
                color="warm"
              />
              {importResults.clientErrors > 0 && (
                <ResultCard
                  label="Errors"
                  value={importResults.clientErrors.toLocaleString()}
                  emoji="⚠️"
                  color="coral"
                />
              )}
            </div>

            {/* Error details */}
            {importResults.errorDetails.length > 0 && (
              <div className="max-w-lg mx-auto mt-6 rounded-xl border-2 border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
                <p className="mb-1 font-bold">Error details:</p>
                <ul className="list-inside list-disc space-y-1">
                  {importResults.errorDetails.map((err, i) => (
                    <li key={i}>
                      Batch {err.batch + 1}: {err.message}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Import Another button */}
            <div className="mt-8 flex justify-center">
              <button
                onClick={resetPage}
                className="px-10 py-4 bg-brand-500 text-white rounded-2xl text-lg font-bold shadow-lg hover:bg-brand-600 hover:shadow-xl transition-all"
              >
                Import Another
              </button>
            </div>
          </div>
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

function ResultCard({ label, value, emoji, color }) {
  const c = cardColors[color] || cardColors.brand;
  return (
    <div className="bg-white rounded-2xl border-2 border-gray-100 p-5 shadow-sm text-center">
      <div className="flex items-center justify-center gap-2 mb-1">
        <span className="text-lg">{emoji}</span>
        <p className="text-xs font-bold text-gray-400 uppercase">{label}</p>
      </div>
      <p className={`text-3xl font-bold ${c.text}`}>{value}</p>
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
