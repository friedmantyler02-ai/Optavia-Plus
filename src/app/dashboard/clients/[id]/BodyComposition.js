"use client";

import { useState, useEffect, useRef } from "react";

const METRIC_FIELDS = [
  { key: "weight", label: "Weight", unit: "lbs", direction: "down" },
  { key: "bmi", label: "BMI", unit: "", direction: "down" },
  { key: "body_fat_pct", label: "Body Fat", unit: "%", direction: "down" },
  { key: "skeletal_muscle_pct", label: "Skeletal Muscle", unit: "%", direction: "up" },
  { key: "fat_free_mass", label: "Fat-Free Mass", unit: "lbs", direction: "up" },
  { key: "subcutaneous_fat_pct", label: "Subcutaneous Fat", unit: "%", direction: "down" },
  { key: "visceral_fat", label: "Visceral Fat", unit: "", direction: "down" },
  { key: "body_water_pct", label: "Body Water", unit: "%", direction: "up" },
  { key: "muscle_mass", label: "Muscle Mass", unit: "lbs", direction: "up" },
  { key: "bone_mass", label: "Bone Mass", unit: "lbs", direction: "neutral" },
  { key: "protein_pct", label: "Protein", unit: "%", direction: "up" },
  { key: "bmr", label: "BMR", unit: "kcal", direction: "neutral" },
  { key: "metabolic_age", label: "Metabolic Age", unit: "yrs", direction: "down" },
];

function getChangeIndicator(current, previous, direction) {
  if (current == null || previous == null) return null;
  const diff = current - previous;
  if (Math.abs(diff) < 0.01) return null;
  const isUp = diff > 0;
  let color;
  if (direction === "up") {
    color = isUp ? "text-green-600" : "text-red-500";
  } else if (direction === "down") {
    color = isUp ? "text-red-500" : "text-green-600";
  } else {
    color = "text-gray-500";
  }
  return (
    <span className={`text-xs font-bold ${color}`}>
      {isUp ? "↑" : "↓"} {Math.abs(diff).toFixed(1)}
    </span>
  );
}

function TrendChart({ history, metricKey, label, color }) {
  if (!history || history.length < 2) return null;
  const points = [...history].reverse().slice(-10);
  const values = points.map((p) => p[metricKey]).filter((v) => v != null);
  if (values.length < 2) return null;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const w = 200;
  const h = 50;
  const pad = 4;

  const pts = values.map((v, i) => {
    const x = pad + (i / (values.length - 1)) * (w - pad * 2);
    const y = h - pad - ((v - min) / range) * (h - pad * 2);
    return `${x},${y}`;
  });

  return (
    <div className="mt-2">
      <div className="text-xs font-bold text-gray-400 mb-1">{label}</div>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ maxWidth: 200, height: 50 }}>
        <polyline
          points={pts.join(" ")}
          fill="none"
          stroke={color}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {values.map((v, i) => {
          const x = pad + (i / (values.length - 1)) * (w - pad * 2);
          const y = h - pad - ((v - min) / range) * (h - pad * 2);
          return <circle key={i} cx={x} cy={y} r="3" fill={color} />;
        })}
      </svg>
      <div className="flex justify-between text-[10px] text-gray-400 font-semibold">
        <span>{values[0]}</span>
        <span>{values[values.length - 1]}</span>
      </div>
    </div>
  );
}

export default function BodyComposition({ client, coach, supabase, showToast, onWeightUpdate }) {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [parsing, setParsing] = useState(false);
  const [parsedMetrics, setParsedMetrics] = useState(null);
  const [editMetrics, setEditMetrics] = useState({});
  const [measuredAt, setMeasuredAt] = useState(new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);
  const [expandedId, setExpandedId] = useState(null);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    loadHistory();
  }, [client.id]);

  const loadHistory = async () => {
    try {
      const res = await fetch(`/api/body-comp/history?client_id=${client.id}`);
      const json = await res.json();
      if (json.data) setHistory(json.data);
    } catch (err) {
      console.error("Error loading body comp history:", err);
    } finally {
      setLoading(false);
    }
  };

  const processFile = async (file) => {
    if (!file) return;
    setParsing(true);
    setParsedMetrics(null);

    try {
      const formData = new FormData();
      formData.append("image", file);
      formData.append("client_id", client.id);
      formData.append("coach_id", coach.id);

      const res = await fetch("/api/body-comp/parse", {
        method: "POST",
        body: formData,
      });

      const json = await res.json();
      if (json.error) {
        showToast({ message: json.error, variant: "error" });
        return;
      }

      setParsedMetrics(json.metrics);
      setEditMetrics({ ...json.metrics });
      setMeasuredAt(new Date().toISOString().slice(0, 10));
    } catch (err) {
      showToast({ message: "Failed to analyze screenshot", variant: "error" });
    } finally {
      setParsing(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleFileSelect = (e) => {
    processFile(e.target.files?.[0]);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file && /^image\//i.test(file.type)) {
      processFile(file);
    } else {
      showToast({ message: "Please drop an image file (jpg, png, heic, webp)", variant: "error" });
    }
  };

  const handleDelete = async (entryId) => {
    if (!window.confirm("Delete this body composition entry?")) return;
    try {
      const res = await fetch("/api/body-comp/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: entryId, coach_id: coach.id }),
      });
      const json = await res.json();
      if (json.error) {
        showToast({ message: json.error, variant: "error" });
        return;
      }
      showToast({ message: "Entry deleted", variant: "success" });
      await loadHistory();
    } catch {
      showToast({ message: "Failed to delete — please try again", variant: "error" });
    }
  };

  function formatEntryDate(measured_at) {
    if (!measured_at) return "Unknown date";
    // Handle both date-only ("2026-03-27") and full timestamps ("2026-03-27T00:00:00+00:00")
    const dateStr = measured_at.includes("T") ? measured_at : measured_at + "T12:00:00";
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return measured_at;
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/body-comp/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: client.id,
          coach_id: coach.id,
          measured_at: measuredAt,
          ...editMetrics,
        }),
      });

      const json = await res.json();
      if (json.error) {
        showToast({ message: json.error, variant: "error" });
        return;
      }

      showToast({ message: "Body composition saved!", variant: "success" });
      setParsedMetrics(null);
      setEditMetrics({});

      // Update parent's weight if available
      if (editMetrics.weight && onWeightUpdate) {
        onWeightUpdate(editMetrics.weight);
      }

      await loadHistory();
    } catch (err) {
      showToast({ message: "Failed to save body composition", variant: "error" });
    } finally {
      setSaving(false);
    }
  };

  const handleMetricChange = (key, value) => {
    setEditMetrics((prev) => ({
      ...prev,
      [key]: value === "" ? null : Number(value),
    }));
  };

  const previousEntry = history.length > 0 ? history[0] : null;

  return (
    <div className="bg-white rounded-2xl p-6 shadow-sm mb-5">
      <h2 className="text-lg font-extrabold font-display mb-4">📊 Body Composition</h2>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/heic,image/webp"
        onChange={handleFileSelect}
        className="hidden"
      />
      {!parsedMetrics && !parsing && (
        <div
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          className={`mb-4 border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors min-h-[44px] touch-manipulation ${
            dragging
              ? "border-[#E8735A] bg-[#E8735A]/5"
              : "border-gray-300 hover:border-[#E8735A]/50 hover:bg-[#faf7f2]"
          }`}
        >
          <svg className="w-8 h-8 mx-auto mb-2 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <p className="text-sm font-bold text-gray-500">Drop Renpho screenshot here or click to upload</p>
          <p className="text-xs text-gray-400 mt-1">Supports jpg, png, heic, webp</p>
        </div>
      )}

      {/* Parsing state */}
      {parsing && (
        <div className="text-center py-8">
          <div className="text-3xl mb-3 animate-pulse">🔬</div>
          <p className="text-sm font-semibold text-gray-500 font-body">Analyzing screenshot...</p>
          <p className="text-xs text-gray-400 mt-1">Gemini is extracting your health metrics</p>
        </div>
      )}

      {/* Confirmation / Edit View */}
      {parsedMetrics && !parsing && (
        <div className="mb-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-extrabold text-gray-700 font-display">Confirm Metrics</h3>
            <input
              type="date"
              value={measuredAt}
              onChange={(e) => setMeasuredAt(e.target.value)}
              className="px-3 py-2 text-sm border-2 border-gray-200 rounded-xl focus:border-[#E8735A] focus:ring-1 focus:ring-[#E8735A]/30 focus:outline-none transition-colors font-body"
            />
          </div>
          <div className="grid grid-cols-3 gap-2.5">
            {METRIC_FIELDS.map(({ key, label, unit }) => (
              <div key={key} className="bg-[#faf7f2] rounded-xl p-3 text-center">
                <label className="text-[10px] font-bold text-gray-400 uppercase block mb-1">
                  {label}
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={editMetrics[key] ?? ""}
                  onChange={(e) => handleMetricChange(key, e.target.value)}
                  className="w-full text-center text-sm font-bold bg-white rounded-lg border border-gray-200 px-2 py-1.5 focus:outline-none focus:border-[#E8735A] focus:ring-1 focus:ring-[#E8735A]/30 transition-colors font-body"
                  placeholder="—"
                />
                {unit && (
                  <span className="text-[10px] text-gray-400 font-semibold">{unit}</span>
                )}
              </div>
            ))}
          </div>
          <div className="flex gap-3 mt-4">
            <button
              onClick={() => {
                setParsedMetrics(null);
                setEditMetrics({});
              }}
              className="flex-1 py-2.5 rounded-xl border-2 border-gray-200 font-bold text-sm text-gray-600 hover:bg-gray-50 transition-colors min-h-[44px] touch-manipulation"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className={
                "flex-1 py-2.5 rounded-xl font-bold text-sm transition-colors min-h-[44px] touch-manipulation " +
                (saving
                  ? "bg-gray-200 text-gray-400"
                  : "bg-[#E8735A] text-white hover:bg-[#d4654e]")
              }
            >
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
        </div>
      )}

      {/* Trend Charts */}
      {history.length >= 2 && !parsedMetrics && (
        <div className="grid grid-cols-2 gap-4 mb-4 p-3 bg-[#faf7f2] rounded-xl">
          <TrendChart
            history={history}
            metricKey="weight"
            label="Weight (lbs)"
            color="#E8735A"
          />
          <TrendChart
            history={history}
            metricKey="body_fat_pct"
            label="Body Fat (%)"
            color="#4a7c59"
          />
        </div>
      )}

      {/* History */}
      {loading ? (
        <div className="text-center py-6 text-gray-400 text-sm">Loading history...</div>
      ) : history.length === 0 && !parsedMetrics ? (
        <div className="text-center py-8 text-gray-400">
          <div className="text-3xl mb-3">📷</div>
          <p className="text-sm font-body">No body composition data yet.</p>
          <p className="text-xs mt-1">Upload a Renpho screenshot to get started!</p>
        </div>
      ) : !parsedMetrics && (
        <div className="space-y-2">
          {history.map((entry, idx) => {
            const prev = history[idx + 1] || null;
            const isExpanded = expandedId === entry.id;

            return (
              <div key={entry.id} className="bg-[#faf7f2] rounded-xl overflow-hidden">
                <div className="p-3 flex items-center justify-between gap-2">
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : entry.id)}
                    className="flex-1 flex items-center gap-3 min-w-0 text-left touch-manipulation"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="text-xs font-bold text-gray-400">
                        {formatEntryDate(entry.measured_at)}
                      </span>
                      {entry.weight && (
                        <span className="text-sm font-bold text-gray-800">
                          {entry.weight} lbs
                          {prev && getChangeIndicator(entry.weight, prev.weight, "down")}
                        </span>
                      )}
                      {entry.body_fat_pct && (
                        <span className="text-sm font-semibold text-gray-600">
                          {entry.body_fat_pct}% BF
                          {prev && getChangeIndicator(entry.body_fat_pct, prev.body_fat_pct, "down")}
                        </span>
                      )}
                    </div>
                    <svg
                      className={`w-4 h-4 text-gray-400 transition-transform ml-auto shrink-0 ${isExpanded ? "rotate-180" : ""}`}
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  <button
                    onClick={() => handleDelete(entry.id)}
                    className="shrink-0 p-1.5 text-gray-300 hover:text-red-500 transition-colors touch-manipulation"
                    title="Delete entry"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
                {isExpanded && (
                  <div className="px-3 pb-3">
                    <div className="grid grid-cols-3 gap-2">
                      {METRIC_FIELDS.map(({ key, label, unit, direction }) => {
                        const val = entry[key];
                        if (val == null) return null;
                        return (
                          <div
                            key={key}
                            className="bg-white rounded-lg p-2 text-center"
                          >
                            <div className="text-[10px] font-bold text-gray-400 uppercase">
                              {label}
                            </div>
                            <div className="text-sm font-bold text-gray-800">
                              {val}
                              {unit && (
                                <span className="text-[10px] text-gray-400 ml-0.5">{unit}</span>
                              )}
                            </div>
                            {prev && (
                              <div className="mt-0.5">
                                {getChangeIndicator(val, prev[key], direction)}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
