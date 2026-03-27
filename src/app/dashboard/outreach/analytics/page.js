"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useCoach } from "../../layout";
import { SEGMENTS } from "../segments";

// ── Helpers ──────────────────────────────────────────────────────────────────

function replyRateColor(rate) {
  if (rate >= 5) return "text-green-600 font-bold";
  if (rate >= 2) return "text-amber-600 font-bold";
  return "text-red-500 font-bold";
}

function fmt(n) {
  return (n ?? 0).toLocaleString();
}

function fmtPct(n) {
  return `${(n ?? 0).toFixed(1)}%`;
}

function segLabel(key) {
  return SEGMENTS.find((s) => s.key === key)?.label || key;
}

function segEmoji(key) {
  return SEGMENTS.find((s) => s.key === key)?.emoji || "";
}

// ── Donut chart (inline SVG, no library) ─────────────────────────────────────

const RESPONSE_COLORS = {
  interested: "#22c55e",
  curious: "#3b82f6",
  not_now: "#f59e0b",
  not_interested: "#9ca3af",
  unsubscribe: "#ef4444",
  uncategorized: "#d1d5db",
};

const RESPONSE_LABELS = {
  interested: "Interested",
  curious: "Curious",
  not_now: "Not Now",
  not_interested: "Not Interested",
  unsubscribe: "Unsubscribe",
  uncategorized: "Uncategorized",
};

function DonutChart({ data }) {
  const total = Object.values(data).reduce((a, b) => a + b, 0);
  if (total === 0) {
    return (
      <p className="font-body text-sm text-gray-400 py-4">No responses yet.</p>
    );
  }

  const cx = 80;
  const cy = 80;
  const r = 60;
  const innerR = 36;
  const circumference = 2 * Math.PI * r;

  let offset = 0;
  const slices = Object.entries(data)
    .filter(([, v]) => v > 0)
    .map(([key, value]) => {
      const fraction = value / total;
      const dashArray = `${fraction * circumference} ${circumference}`;
      const rotation = offset * 360 - 90;
      offset += fraction;
      return { key, value, dashArray, rotation };
    });

  return (
    <div className="flex flex-col sm:flex-row items-center gap-6">
      {/* SVG donut */}
      <svg width="160" height="160" viewBox="0 0 160 160" className="shrink-0">
        {slices.map((s) => (
          <circle
            key={s.key}
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke={RESPONSE_COLORS[s.key] || "#d1d5db"}
            strokeWidth="24"
            strokeDasharray={s.dashArray}
            transform={`rotate(${s.rotation} ${cx} ${cy})`}
          />
        ))}
        {/* inner hole label */}
        <circle cx={cx} cy={cy} r={innerR} fill="white" />
        <text
          x={cx}
          y={cy - 6}
          textAnchor="middle"
          className="font-display"
          style={{ fontFamily: "inherit", fontSize: 22, fontWeight: 700, fill: "#111827" }}
        >
          {total}
        </text>
        <text
          x={cx}
          y={cy + 13}
          textAnchor="middle"
          style={{ fontFamily: "inherit", fontSize: 10, fill: "#6b7280" }}
        >
          responses
        </text>
      </svg>

      {/* Legend */}
      <div className="flex flex-col gap-2 w-full">
        {Object.entries(data).map(([key, value]) => (
          <div key={key} className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <div
                className="w-3 h-3 rounded-full shrink-0"
                style={{ backgroundColor: RESPONSE_COLORS[key] || "#d1d5db" }}
              />
              <span className="font-body text-sm text-gray-700">
                {RESPONSE_LABELS[key]}
              </span>
            </div>
            <span className="font-body text-sm font-semibold text-gray-900">
              {fmt(value)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function Skeleton({ className }) {
  return <div className={`animate-pulse rounded-xl bg-gray-100 ${className}`} />;
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function OutreachAnalyticsPage() {
  const { coach } = useCoach();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!coach?.id) return;
    fetch(`/api/outreach/analytics?coach_id=${coach.id}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setError(d.error);
        else setData(d);
      })
      .catch(() => setError("Failed to load analytics."))
      .finally(() => setLoading(false));
  }, [coach?.id]);

  const { overall, campaigns, responses, insights } = data || {};

  return (
    <div className="animate-fade-up">
      {/* Back link */}
      <Link
        href="/dashboard/outreach"
        className="inline-flex items-center gap-1 font-body text-sm text-gray-500 hover:text-gray-700 mb-5"
      >
        ← Back to Outreach
      </Link>

      <h1 className="font-display text-3xl font-bold text-gray-900 mb-6">
        Outreach Analytics
      </h1>

      {error && (
        <div className="mb-6 rounded-2xl border-2 border-red-200 bg-red-50 px-5 py-4">
          <p className="font-body text-sm text-red-600">{error}</p>
        </div>
      )}

      {/* ── Section 1: Overall Performance ─────────────────────────────────── */}
      <div className="mb-6 rounded-2xl border-2 border-gray-100 bg-white p-6">
        <h2 className="font-display text-xl font-bold text-gray-900 mb-4">
          Overall Performance
        </h2>

        {loading ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <Skeleton key={i} className="h-20" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {/* Reply Rate — prominent */}
            <div className="col-span-2 sm:col-span-1 rounded-2xl bg-[#E8735A]/10 border-2 border-[#E8735A]/30 px-4 py-4 text-center">
              <p className="font-display text-3xl font-bold text-[#E8735A]">
                {fmtPct(overall?.reply_rate)}
              </p>
              <p className="font-body text-sm font-semibold text-gray-700 mt-0.5">
                Reply Rate
              </p>
              <p className="font-body text-xs text-gray-400 mt-0.5">
                {fmt(overall?.replied)} of {fmt(overall?.sent)} emails
              </p>
            </div>

            {[
              {
                label: "Emails Sent",
                value: fmt(overall?.sent),
                sub: null,
              },
              {
                label: "Open Rate",
                value: fmtPct(overall?.open_rate),
                sub: "Gmail may block some tracking",
                muted: true,
              },
              {
                label: "Positive Reply Rate",
                value: fmtPct(overall?.positive_reply_rate),
                sub: "Interested + Curious",
              },
              {
                label: "Bounce Rate",
                value: fmtPct(overall?.bounce_rate),
                sub: `${fmt(overall?.bounced)} addresses removed`,
              },
              {
                label: "Clients Reactivated",
                value: fmt(overall?.reactivated),
                sub: "Placed an order after email",
              },
            ].map((stat) => (
              <div
                key={stat.label}
                className="rounded-2xl bg-gray-50 border-2 border-gray-100 px-4 py-4 text-center"
              >
                <p className="font-display text-2xl font-bold text-gray-900">
                  {stat.value}
                </p>
                <p className="font-body text-sm font-semibold text-gray-700 mt-0.5">
                  {stat.label}
                </p>
                {stat.sub && (
                  <p className={`font-body text-xs mt-0.5 ${stat.muted ? "text-gray-400" : "text-gray-400"}`}>
                    {stat.sub}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Section 2: Campaign Breakdown ──────────────────────────────────── */}
      <div className="mb-6 rounded-2xl border-2 border-gray-100 bg-white p-6">
        <h2 className="font-display text-xl font-bold text-gray-900 mb-4">
          Campaign Breakdown
        </h2>

        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-12" />
            ))}
          </div>
        ) : !campaigns?.length ? (
          <p className="font-body text-sm text-gray-400">No campaigns yet.</p>
        ) : (
          <div className="overflow-x-auto -mx-6 px-6">
            <table className="w-full min-w-[640px]">
              <thead>
                <tr className="border-b border-gray-100">
                  {["Segment", "Status", "Sent", "Opened", "Replied", "Bounced", "DNC", "Reactivated", "Reply Rate", "Started"].map(
                    (h) => (
                      <th
                        key={h}
                        className="pb-2 pr-4 text-left font-body text-xs font-semibold uppercase tracking-wide text-gray-400"
                      >
                        {h}
                      </th>
                    )
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {campaigns.map((c) => (
                  <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                    <td className="py-3 pr-4 font-body text-sm font-semibold text-gray-800">
                      {segEmoji(c.segment)} {segLabel(c.segment)}
                    </td>
                    <td className="py-3 pr-4">
                      <span
                        className={`rounded-full px-2.5 py-0.5 font-body text-xs font-semibold ${
                          c.status === "active"
                            ? "bg-green-100 text-green-700"
                            : c.status === "paused"
                            ? "bg-amber-100 text-amber-700"
                            : "bg-gray-100 text-gray-500"
                        }`}
                      >
                        {c.status.charAt(0).toUpperCase() + c.status.slice(1)}
                      </span>
                    </td>
                    <td className="py-3 pr-4 font-body text-sm text-gray-700">
                      {fmt(c.total_sent)}
                    </td>
                    <td className="py-3 pr-4 font-body text-sm text-gray-700">
                      {fmt(c.total_opened)}
                    </td>
                    <td className="py-3 pr-4 font-body text-sm text-gray-700">
                      {fmt(c.total_replied)}
                    </td>
                    <td className="py-3 pr-4 font-body text-sm text-gray-700">
                      {fmt(c.total_bounced)}
                    </td>
                    <td className="py-3 pr-4 font-body text-sm text-gray-700">
                      {fmt(c.total_dnc)}
                    </td>
                    <td className="py-3 pr-4 font-body text-sm text-gray-700">
                      {fmt(c.total_reactivated)}
                    </td>
                    <td className={`py-3 pr-4 font-body text-sm ${replyRateColor(c.reply_rate)}`}>
                      {fmtPct(c.reply_rate)}
                    </td>
                    <td className="py-3 font-body text-xs text-gray-400 whitespace-nowrap">
                      {c.started_at
                        ? new Date(c.started_at).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Section 3: Response Breakdown ──────────────────────────────────── */}
      <div className="mb-6 rounded-2xl border-2 border-gray-100 bg-white p-6">
        <h2 className="font-display text-xl font-bold text-gray-900 mb-5">
          Response Breakdown
        </h2>

        {loading ? (
          <div className="flex gap-6">
            <Skeleton className="h-40 w-40 rounded-full" />
            <div className="flex-1 space-y-3">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <Skeleton key={i} className="h-5" />
              ))}
            </div>
          </div>
        ) : (
          <DonutChart data={responses || {}} />
        )}
      </div>

      {/* ── Section 4: Insights ────────────────────────────────────────────── */}
      {(loading || (insights && insights.length > 0)) && (
        <div className="mb-8 rounded-2xl border-2 border-gray-100 bg-white p-6">
          <h2 className="font-display text-xl font-bold text-gray-900 mb-4">
            Insights
          </h2>

          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-14" />
              ))}
            </div>
          ) : insights?.length === 0 ? (
            <p className="font-body text-sm text-gray-400">
              Send at least 20 emails to unlock insights.
            </p>
          ) : (
            <div className="space-y-3">
              {insights.map((insight, i) => (
                <div
                  key={i}
                  className="flex items-start gap-3 rounded-2xl bg-[#faf7f2] border border-[#f0e8dc] px-5 py-4"
                >
                  <span className="text-lg shrink-0 mt-0.5">
                    {insight.includes("performing well") || insight.includes("reactivated")
                      ? "🎉"
                      : insight.includes("bounced") || insight.includes("removed")
                      ? "📧"
                      : insight.includes("Consider")
                      ? "💡"
                      : "📊"}
                  </span>
                  <p className="font-body text-sm text-gray-700 leading-relaxed">
                    {insight}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
