"use client";

import { useState, useRef, useContext } from "react";
import { useCoach, ToastContext } from "../layout";
import { useRouter } from "next/navigation";
import Papa from "papaparse";
import { importCSVChunked } from "@/lib/chunked-import";
import LeadImporter from "../components/LeadImporter";

function cleanHeader(h) {
  if (!h) return "";
  return h.replace(/^\uFEFF/, "").replace(/^="?/, "").replace(/"$/, "").trim();
}

// ── Progress Bar ─────────────────────────────────────────

function ProgressBar({ currentStep, totalSteps }) {
  return (
    <div className="flex items-center justify-center gap-3 mb-8">
      {Array.from({ length: totalSteps }, (_, i) => {
        const step = i + 1;
        const isCompleted = step < currentStep;
        const isCurrent = step === currentStep;
        return (
          <div key={step} className="flex items-center gap-3">
            <div
              className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold transition-all duration-300 ${
                isCompleted
                  ? "bg-[#E8735A] text-white"
                  : isCurrent
                  ? "bg-[#E8735A] text-white ring-4 ring-[#E8735A]/20"
                  : "bg-gray-200 text-gray-400"
              }`}
            >
              {isCompleted ? (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                step
              )}
            </div>
            {step < totalSteps && (
              <div
                className={`w-10 h-1 rounded-full transition-colors duration-300 ${
                  step < currentStep ? "bg-[#E8735A]" : "bg-gray-200"
                }`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── CSV Upload Zone (with chunked import) ────────────────

function CsvUploadZone({ label, sublabel, onImportComplete }) {
  const [file, setFile] = useState(null);
  const [parsedRows, setParsedRows] = useState([]);
  const [preview, setPreview] = useState([]);
  const [importing, setImporting] = useState(false);
  const [batchProgress, setBatchProgress] = useState(null);
  const [result, setResult] = useState(null);
  const [parseError, setParseError] = useState("");
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef(null);

  const handleFile = (f) => {
    if (!f || !f.name.toLowerCase().endsWith(".csv")) {
      setParseError("Please select a CSV file.");
      return;
    }
    setFile(f);
    setParseError("");
    setResult(null);
    setBatchProgress(null);

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
    setResult(null);
    setBatchProgress(null);

    try {
      const data = await importCSVChunked(parsedRows, (progress) => {
        setBatchProgress(progress);
      });

      setResult(data);
      if (onImportComplete) onImportComplete(data);
    } catch {
      setResult({ error: "Network error. Please try again." });
    } finally {
      setImporting(false);
      setBatchProgress(null);
    }
  };

  return (
    <div>
      {label && (
        <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-1">{label}</p>
      )}
      {sublabel && (
        <p className="text-xs text-gray-400 mb-2">{sublabel}</p>
      )}

      {result && !result.error ? (
        <div className="bg-green-50 border-2 border-green-200 rounded-xl p-4">
          <p className="text-sm font-semibold text-green-700">
            {"\u2705"} {(result.updated || 0) + (result.created || 0)} clients imported!
          </p>
          <p className="text-xs text-green-600 mt-1">
            Updated {result.updated || 0}, Created {result.created || 0}
            {result.alerts > 0 && `, ${result.alerts} alerts`}
            {result.failedBatches > 0 && ` (${result.failedBatches} batch${result.failedBatches !== 1 ? "es" : ""} failed)`}
          </p>
        </div>
      ) : (
        <>
          {result?.error && (
            <div className="bg-red-50 border-2 border-red-200 text-red-700 px-4 py-3 rounded-xl mb-3 text-sm font-semibold">
              {result.error}
            </div>
          )}
          {parseError && (
            <div className="bg-red-50 border-2 border-red-200 text-red-700 px-4 py-3 rounded-xl mb-3 text-sm font-semibold">
              {parseError}
            </div>
          )}

          <div
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileRef.current?.click()}
            className={`border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-colors duration-150 ${
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
            <div className="text-3xl mb-2">{"\uD83D\uDCC4"}</div>
            {file ? (
              <p className="text-sm font-semibold text-gray-700">
                {file.name}{" "}
                <span className="text-gray-400 font-normal">
                  ({parsedRows.length} rows)
                </span>
              </p>
            ) : (
              <>
                <p className="text-base font-semibold text-gray-600">
                  Drop CSV here or click to browse
                </p>
                <p className="text-sm text-gray-400 mt-1">
                  Frontline order export CSV
                </p>
              </>
            )}
          </div>

          {preview.length > 0 && (
            <div className="mt-3">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">
                Found {parsedRows.length} clients
              </p>
              <div className="overflow-x-auto rounded-xl border-2 border-gray-100">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100">
                      <th className="text-left px-3 py-2 text-gray-400 font-bold">Name</th>
                      <th className="text-left px-3 py-2 text-gray-400 font-bold">Email</th>
                      <th className="text-left px-3 py-2 text-gray-400 font-bold">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.map((row, i) => (
                      <tr key={i} className="border-b border-gray-50">
                        <td className="px-3 py-2 text-gray-700">{row.FirstName} {row.LastName}</td>
                        <td className="px-3 py-2 text-gray-500">{row.Email || "\u2014"}</td>
                        <td className="px-3 py-2 text-gray-500">{row.OrderStatus || "\u2014"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {importing && batchProgress ? (
                <div className="mt-3">
                  <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[#E8735A] rounded-full transition-all duration-300"
                      style={{ width: `${(batchProgress.current / batchProgress.total) * 100}%` }}
                    />
                  </div>
                  <p className="text-xs text-gray-500 mt-1.5 text-center font-medium">
                    Importing... batch {batchProgress.current} of {batchProgress.total} ({batchProgress.rowsProcessed} of {batchProgress.totalRows} rows)
                  </p>
                </div>
              ) : (
                <button
                  onClick={(e) => { e.stopPropagation(); handleImport(); }}
                  disabled={importing}
                  className="mt-3 w-full bg-[#E8735A] hover:bg-[#d4634d] text-white px-4 py-2.5 rounded-xl text-sm font-bold transition-all duration-150 active:scale-95 disabled:opacity-50 shadow-sm"
                >
                  {importing ? "Preparing import..." : `Import ${parsedRows.length} Clients`}
                </button>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Step Components ──────────────────────────────────────

function StepProfile({ coach, setCoach, onNext }) {
  const [fullName, setFullName] = useState(coach?.full_name || "");
  const [phone, setPhone] = useState(coach?.phone || "");
  const [optaviaId, setOptaviaId] = useState(coach?.optavia_id || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleSave = async () => {
    if (!fullName.trim()) {
      setError("Please enter your name.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/onboarding/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          full_name: fullName,
          phone,
          optavia_id: optaviaId,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Something went wrong. Please try again.");
        setSaving(false);
        return;
      }
      setCoach((prev) => ({
        ...prev,
        full_name: fullName.trim(),
        phone: phone.trim() || null,
        optavia_id: optaviaId.trim() || null,
      }));
      onNext();
    } catch {
      setError("Network error. Please try again.");
      setSaving(false);
    }
  };

  return (
    <div>
      <h2 className="font-display text-2xl font-bold text-gray-900 mb-2">
        Tell Us About You
      </h2>
      <p className="text-gray-500 text-base mb-6">
        We just need a few details to set up your profile.
      </p>

      {error && (
        <div className="bg-red-50 border-2 border-red-200 text-red-700 px-4 py-3 rounded-xl mb-4 text-sm font-semibold">
          {error}
        </div>
      )}

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-bold text-gray-700 mb-1">
            Email
          </label>
          <input
            type="email"
            value={coach?.email || ""}
            readOnly
            className="w-full px-4 py-3 rounded-xl border-2 border-gray-100 bg-gray-50 text-gray-400 text-base cursor-not-allowed"
          />
        </div>

        <div>
          <label className="block text-sm font-bold text-gray-700 mb-1">
            Full Name <span className="text-red-400">*</span>
          </label>
          <input
            type="text"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="e.g. Jane Smith"
            className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-[#E8735A] focus:ring-2 focus:ring-[#E8735A]/20 outline-none text-base text-gray-900 placeholder:text-gray-300 transition"
          />
        </div>

        <div>
          <label className="block text-sm font-bold text-gray-700 mb-1">
            Phone Number
          </label>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="e.g. (555) 123-4567"
            className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-[#E8735A] focus:ring-2 focus:ring-[#E8735A]/20 outline-none text-base text-gray-900 placeholder:text-gray-300 transition"
          />
        </div>

        <div>
          <label className="block text-sm font-bold text-gray-700 mb-1">
            Optavia Coach ID
          </label>
          <input
            type="text"
            value={optaviaId}
            onChange={(e) => setOptaviaId(e.target.value)}
            placeholder="e.g. 12345678"
            className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-[#E8735A] focus:ring-2 focus:ring-[#E8735A]/20 outline-none text-base text-gray-900 placeholder:text-gray-300 transition"
          />
        </div>
      </div>

      <button
        onClick={handleSave}
        disabled={saving}
        className="mt-6 w-full bg-[#E8735A] hover:bg-[#d4634d] disabled:opacity-50 text-white px-4 py-3.5 rounded-xl text-lg font-bold transition-all duration-150 active:scale-95 shadow-sm"
      >
        {saving ? "Saving..." : "Next \u2192"}
      </button>
    </div>
  );
}

function StepWelcome({ onNext }) {
  return (
    <div className="text-center py-8">
      <h1 className="font-display text-3xl md:text-4xl font-bold text-gray-900 mb-4">
        Welcome to OPTAVIA Plus!
      </h1>
      <p className="text-gray-500 text-lg max-w-md mx-auto mb-8">
        Let's get you set up in just a few minutes. We'll import your clients and help you start tracking leads.
      </p>
      <button
        onClick={onNext}
        className="bg-[#E8735A] hover:bg-[#d4634d] text-white px-8 py-3.5 rounded-xl text-lg font-bold transition-all duration-150 active:scale-95 shadow-sm"
      >
        Let's Go {"\u2192"}
      </button>
    </div>
  );
}

function StepUploadClients({ onNext }) {
  const [imported, setImported] = useState(false);

  return (
    <div>
      <h2 className="font-display text-2xl font-bold text-gray-900 mb-2">
        Upload Your Frontline Report
      </h2>
      <p className="text-gray-500 text-base mb-6">
        This is your client list from the Optavia back office. Go to Client Report {"\u2192"} Frontline {"\u2192"} Export CSV.
      </p>

      <CsvUploadZone onImportComplete={() => setImported(true)} />

      <div className="flex gap-3 mt-6">
        <button
          onClick={onNext}
          className="flex-1 px-4 py-2.5 text-sm font-bold rounded-xl border-2 border-gray-200 text-gray-500 hover:bg-gray-50 transition"
        >
          Skip this step {"\u2192"}
        </button>
        {imported && (
          <button
            onClick={onNext}
            className="flex-1 bg-[#E8735A] hover:bg-[#d4634d] text-white px-4 py-2.5 rounded-xl text-sm font-bold transition-all duration-150 active:scale-95"
          >
            Next {"\u2192"}
          </button>
        )}
      </div>
    </div>
  );
}

function StepUploadOrders({ onNext }) {
  const [thisMonthDone, setThisMonthDone] = useState(false);
  const [lastMonthDone, setLastMonthDone] = useState(false);

  return (
    <div>
      <h2 className="font-display text-2xl font-bold text-gray-900 mb-2">
        Upload Your Recent Orders
      </h2>
      <p className="text-gray-500 text-base mb-6">
        Upload this month's and last month's order reports so we know who's active. Go to Client Orders {"\u2192"} Export CSV for each month.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <CsvUploadZone
          label="This Month's Orders"
          onImportComplete={() => setThisMonthDone(true)}
        />
        <CsvUploadZone
          label="Last Month's Orders"
          onImportComplete={() => setLastMonthDone(true)}
        />
      </div>

      <div className="flex gap-3 mt-6">
        <button
          onClick={onNext}
          className="flex-1 px-4 py-2.5 text-sm font-bold rounded-xl border-2 border-gray-200 text-gray-500 hover:bg-gray-50 transition"
        >
          Skip {"\u2192"}
        </button>
        {(thisMonthDone || lastMonthDone) && (
          <button
            onClick={onNext}
            className="flex-1 bg-[#E8735A] hover:bg-[#d4634d] text-white px-4 py-2.5 rounded-xl text-sm font-bold transition-all duration-150 active:scale-95"
          >
            Next {"\u2192"}
          </button>
        )}
      </div>
    </div>
  );
}

function StepImportHundredsList({ onNext }) {
  const [imported, setImported] = useState(false);

  return (
    <div>
      <h2 className="font-display text-2xl font-bold text-gray-900 mb-2">
        Import Your Hundreds List
      </h2>
      <p className="text-gray-500 text-base mb-6">
        Got a list of people you'd like to reach out to? Upload it as a CSV and we'll add them as leads. You can also add leads anytime from the Leads page.
      </p>

      <LeadImporter onImportComplete={() => setImported(true)} />

      <div className="flex gap-3 mt-6">
        <button
          onClick={onNext}
          className="flex-1 px-4 py-2.5 text-sm font-bold rounded-xl border-2 border-gray-200 text-gray-500 hover:bg-gray-50 transition"
        >
          Skip {"\u2192"}
        </button>
        {imported && (
          <button
            onClick={onNext}
            className="flex-1 bg-[#E8735A] hover:bg-[#d4634d] text-white px-4 py-2.5 rounded-xl text-sm font-bold transition-all duration-150 active:scale-95"
          >
            Next {"\u2192"}
          </button>
        )}
      </div>
    </div>
  );
}

function StepAllSet({ onFinish, finishing }) {
  const cards = [
    { icon: "\uD83D\uDC65", title: "Clients", desc: "See your active, at-risk, and past clients" },
    { icon: "\uD83C\uDFAF", title: "Leads", desc: "Track prospects through your pipeline" },
    { icon: "\uD83D\uDCC5", title: "Calendar", desc: "Follow-ups and check-ins in one place" },
  ];

  return (
    <div className="text-center">
      <h2 className="font-display text-3xl font-bold text-gray-900 mb-2">
        You're All Set! {"\uD83C\uDF89"}
      </h2>
      <p className="text-gray-500 text-lg mb-8">
        Your OPTAVIA Plus dashboard is ready. Here's what you can do:
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        {cards.map((card) => (
          <div
            key={card.title}
            className="rounded-2xl border-2 border-gray-100 bg-[#faf7f2] p-5 text-center"
          >
            <div className="text-3xl mb-2">{card.icon}</div>
            <p className="font-display text-base font-bold text-gray-900 mb-1">{card.title}</p>
            <p className="text-sm text-gray-500">{card.desc}</p>
          </div>
        ))}
      </div>

      <button
        onClick={onFinish}
        disabled={finishing}
        className="bg-[#E8735A] hover:bg-[#d4634d] disabled:opacity-50 text-white px-8 py-3.5 rounded-xl text-lg font-bold transition-all duration-150 active:scale-95 shadow-sm"
      >
        {finishing ? "Setting up..." : `Go to Dashboard ${"\u2192"}`}
      </button>
    </div>
  );
}

// ── Main Wizard Page ─────────────────────────────────────

export default function OnboardingPage() {
  const { coach, setCoach } = useCoach();
  const router = useRouter();
  const showToast = useContext(ToastContext);
  const [currentStep, setCurrentStep] = useState(1);
  const [finishing, setFinishing] = useState(false);

  const totalSteps = 6;

  const nextStep = () => {
    setCurrentStep((prev) => Math.min(prev + 1, totalSteps));
  };

  const handleFinish = async () => {
    setFinishing(true);
    try {
      const res = await fetch("/api/onboarding/complete", { method: "POST" });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        if (showToast) showToast({ message: data.error || "Failed to complete onboarding", variant: "error" });
        setFinishing(false);
        return;
      }

      // Update local state BEFORE navigating so the layout redirect doesn't kick in
      setCoach((prev) => ({ ...prev, onboarding_completed: true }));
      router.push("/dashboard");
    } catch {
      if (showToast) showToast({ message: "Network error. Please try again.", variant: "error" });
      setFinishing(false);
    }
  };

  // If coach already completed onboarding, redirect
  if (coach?.onboarding_completed) {
    router.push("/dashboard");
    return null;
  }

  return (
    <div className="min-h-screen bg-[#faf7f2] flex items-start justify-center px-4 py-8 md:py-16">
      <div className="w-full max-w-2xl">
        <ProgressBar currentStep={currentStep} totalSteps={totalSteps} />

        <div className="bg-white rounded-2xl shadow-sm border-2 border-gray-100 p-6 md:p-10">
          {currentStep === 1 && <StepProfile coach={coach} setCoach={setCoach} onNext={nextStep} />}
          {currentStep === 2 && <StepWelcome onNext={nextStep} />}
          {currentStep === 3 && <StepUploadClients onNext={nextStep} />}
          {currentStep === 4 && <StepUploadOrders onNext={nextStep} />}
          {currentStep === 5 && <StepImportHundredsList onNext={nextStep} />}
          {currentStep === 6 && <StepAllSet onFinish={handleFinish} finishing={finishing} />}
        </div>
      </div>
    </div>
  );
}
