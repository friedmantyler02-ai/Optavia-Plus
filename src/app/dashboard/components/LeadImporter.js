"use client";

import { useState, useRef } from "react";
import Papa from "papaparse";
import { formatPhoneDisplay } from "@/lib/phone";

// ── Lead field definitions ──────────────────────────────

const LEAD_FIELDS = [
  { value: "skip", label: "Skip this column" },
  { value: "full_name", label: "Full Name" },
  { value: "first_name", label: "First Name" },
  { value: "last_name", label: "Last Name" },
  { value: "phone", label: "Phone" },
  { value: "email", label: "Email" },
  { value: "facebook_url", label: "Facebook URL" },
  { value: "source", label: "Source" },
  { value: "notes", label: "Notes" },
];

// ── Fuzzy column matching ───────────────────────────────

const COLUMN_PATTERNS = [
  { field: "full_name", patterns: ["name", "full name", "full_name", "fullname", "contact", "contact name", "contact_name"] },
  { field: "first_name", patterns: ["first name", "first_name", "firstname", "first", "fname"] },
  { field: "last_name", patterns: ["last name", "last_name", "lastname", "last", "lname"] },
  { field: "phone", patterns: ["phone", "phone number", "phone_number", "mobile", "cell", "telephone", "tel"] },
  { field: "email", patterns: ["email", "e-mail", "email address", "email_address", "e_mail"] },
  { field: "facebook_url", patterns: ["facebook", "fb", "facebook url", "fb url", "facebook link", "facebook_url", "fb_url"] },
  { field: "source", patterns: ["source", "how met", "where met", "met", "how_met", "where_met"] },
  { field: "notes", patterns: ["notes", "note", "comments", "comment", "description", "desc"] },
];

function autoMapColumn(header) {
  const normalized = header.toLowerCase().trim();
  for (const { field, patterns } of COLUMN_PATTERNS) {
    for (const pattern of patterns) {
      if (normalized === pattern) return field;
    }
  }
  // Partial match fallback
  for (const { field, patterns } of COLUMN_PATTERNS) {
    for (const pattern of patterns) {
      if (normalized.includes(pattern) || pattern.includes(normalized)) return field;
    }
  }
  return "skip";
}

function cleanHeader(h) {
  if (!h) return "";
  return h.replace(/^\uFEFF/, "").replace(/^="?/, "").replace(/"$/, "").trim();
}

// ── LeadImporter Component ──────────────────────────────

export default function LeadImporter({ onImportComplete, compact = false }) {
  const [file, setFile] = useState(null);
  const [rawHeaders, setRawHeaders] = useState([]);
  const [parsedRows, setParsedRows] = useState([]);
  const [columnMap, setColumnMap] = useState({});
  const [preview, setPreview] = useState([]);
  const [importing, setImporting] = useState(false);
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

    Papa.parse(f, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        if (results.errors.length > 0 && results.data.length === 0) {
          setParseError("Could not parse CSV. Check the file format.");
          return;
        }
        const rows = results.data;
        const headers = results.meta.fields.map(cleanHeader).filter(Boolean);

        setRawHeaders(headers);
        setParsedRows(rows);
        setPreview(rows.slice(0, 5));

        // Auto-map columns
        const mapping = {};
        for (const header of headers) {
          mapping[header] = autoMapColumn(header);
        }
        setColumnMap(mapping);
      },
    });
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  };

  const updateMapping = (header, value) => {
    setColumnMap((prev) => ({ ...prev, [header]: value }));
  };

  // Build lead objects from rows using the column mapping
  const buildLeads = () => {
    return parsedRows.map((row) => {
      const lead = {};
      const cleanRow = {};
      for (const [k, v] of Object.entries(row)) {
        cleanRow[cleanHeader(k)] = typeof v === "string" ? v.trim() : v;
      }

      for (const [header, field] of Object.entries(columnMap)) {
        if (field === "skip") continue;
        const value = cleanRow[header] || "";
        if (value) {
          if (field === "first_name" || field === "last_name") {
            lead[field] = value;
          } else {
            lead[field] = value;
          }
        }
      }

      // Combine first_name + last_name into full_name if no full_name mapped
      if (!lead.full_name && (lead.first_name || lead.last_name)) {
        lead.full_name = `${lead.first_name || ""} ${lead.last_name || ""}`.trim();
      }
      delete lead.first_name;
      delete lead.last_name;

      return lead;
    }).filter((lead) => lead.full_name);
  };

  const handleImport = async () => {
    const leads = buildLeads();
    if (leads.length === 0) {
      setParseError("No valid leads found. Make sure at least a name column is mapped.");
      return;
    }

    setImporting(true);
    setResult(null);

    try {
      const res = await fetch("/api/leads/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leads }),
      });

      const data = await res.json();
      if (!res.ok) {
        setResult({ error: data.error || "Import failed" });
      } else {
        setResult(data);
        if (onImportComplete) onImportComplete(data);
      }
    } catch {
      setResult({ error: "Network error. Please try again." });
    } finally {
      setImporting(false);
    }
  };

  // Get mapped preview data for the preview table
  const getMappedPreview = () => {
    const mappedFields = Object.entries(columnMap)
      .filter(([, field]) => field !== "skip")
      .map(([header, field]) => ({ header, field }));

    return preview.map((row) => {
      const cleanRow = {};
      for (const [k, v] of Object.entries(row)) {
        cleanRow[cleanHeader(k)] = typeof v === "string" ? v.trim() : v;
      }

      const mapped = {};
      let firstName = "";
      let lastName = "";

      for (const { header, field } of mappedFields) {
        const value = cleanRow[header] || "";
        if (field === "first_name") firstName = value;
        else if (field === "last_name") lastName = value;
        else mapped[field] = value;
      }

      if (!mapped.full_name && (firstName || lastName)) {
        mapped.full_name = `${firstName} ${lastName}`.trim();
      }

      return mapped;
    });
  };

  const hasMappedFields = Object.values(columnMap).some((v) => v !== "skip");
  const validLeadCount = hasMappedFields ? buildLeads().length : 0;
  const mappedPreview = hasMappedFields ? getMappedPreview() : [];

  // Success state
  if (result && !result.error) {
    return (
      <div className="bg-green-50 border-2 border-green-200 rounded-xl p-4">
        <p className="text-sm font-semibold text-green-700">
          {"\u2705"} {result.imported} lead{result.imported !== 1 ? "s" : ""} imported!
        </p>
        {result.skipped > 0 && (
          <p className="text-xs text-green-600 mt-1">
            {result.skipped} skipped (duplicates or missing name)
          </p>
        )}
      </div>
    );
  }

  return (
    <div>
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

      {/* Drop zone */}
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
              Any CSV with names and contact info
            </p>
          </>
        )}
      </div>

      {/* Column mapping UI */}
      {rawHeaders.length > 0 && (
        <div className="mt-4">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">
            Map Your Columns
          </p>
          <div className="rounded-xl border-2 border-gray-100 divide-y divide-gray-50 overflow-hidden">
            {rawHeaders.map((header) => (
              <div
                key={header}
                className="flex items-center justify-between px-4 py-2.5 gap-3"
              >
                <span className="text-sm font-semibold text-gray-700 truncate min-w-0 flex-shrink">
                  {header}
                </span>
                <select
                  value={columnMap[header] || "skip"}
                  onChange={(e) => updateMapping(header, e.target.value)}
                  className="rounded-xl border-2 border-gray-200 px-3 py-2 font-body text-sm bg-white focus:outline-none focus:border-[#E8735A] focus:ring-1 focus:ring-[#E8735A]/30 transition-colors duration-150 flex-shrink-0"
                >
                  {LEAD_FIELDS.map((f) => (
                    <option key={f.value} value={f.value}>
                      {f.label}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Preview table */}
      {mappedPreview.length > 0 && (
        <div className="mt-4">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">
            Preview ({Math.min(5, parsedRows.length)} of {parsedRows.length} rows)
          </p>
          <div className="overflow-x-auto rounded-xl border-2 border-gray-100">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="text-left px-3 py-2 text-gray-400 font-bold">Name</th>
                  <th className="text-left px-3 py-2 text-gray-400 font-bold">Email</th>
                  <th className="text-left px-3 py-2 text-gray-400 font-bold">Phone</th>
                </tr>
              </thead>
              <tbody>
                {mappedPreview.map((row, i) => (
                  <tr key={i} className="border-b border-gray-50">
                    <td className="px-3 py-2 text-gray-700">{row.full_name || "\u2014"}</td>
                    <td className="px-3 py-2 text-gray-500">{row.email || "\u2014"}</td>
                    <td className="px-3 py-2 text-gray-500">{formatPhoneDisplay(row.phone) || "\u2014"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Import button */}
      {hasMappedFields && parsedRows.length > 0 && (
        <button
          onClick={(e) => { e.stopPropagation(); handleImport(); }}
          disabled={importing || validLeadCount === 0}
          className="mt-4 w-full bg-[#E8735A] hover:bg-[#d4634d] text-white px-4 py-2.5 rounded-xl text-sm font-bold transition-all duration-150 active:scale-95 disabled:opacity-50 shadow-sm"
        >
          {importing ? "Importing..." : `Import ${validLeadCount} Lead${validLeadCount !== 1 ? "s" : ""}`}
        </button>
      )}
    </div>
  );
}
