"use client";

import { useState, useEffect } from "react";
import ErrorBanner from "../components/ErrorBanner";
import PageHeader from "../components/PageHeader";

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------
function Skeleton({ className = "" }) {
  return <div className={`animate-pulse rounded-lg bg-gray-200 ${className}`} />;
}

// ---------------------------------------------------------------------------
// Rate pill — color-coded by threshold
// ---------------------------------------------------------------------------
function RatePill({ value, greenAt = 30, yellowAt = 15 }) {
  if (value === null || value === undefined) {
    return <span className="text-xs text-gray-400">—</span>;
  }
  let classes;
  if (value >= greenAt) {
    classes = "bg-green-100 text-green-700";
  } else if (value >= yellowAt) {
    classes = "bg-yellow-100 text-yellow-700";
  } else {
    classes = "bg-red-100 text-red-700";
  }
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${classes}`}>
      {value}%
    </span>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------
export default function AnalyticsPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/org/analytics");
      if (!res.ok) throw new Error("Failed to load analytics");
      const json = await res.json();
      setData(json);
    } catch (err) {
      console.error("Analytics load error:", err);
      setError("Something went wrong loading analytics data.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  if (error && !data) {
    return (
      <div className="animate-fade-up">
        <PageHeader title="Analytics" subtitle="Email performance across your organization" />
        <ErrorBanner message={error} onRetry={loadData} />
      </div>
    );
  }

  const funnel = data?.funnel || {};
  const byTrigger = data?.byTrigger || [];
  const conversion = data?.conversion || [];
  const volumeOverTime = data?.volumeOverTime || [];
  const topCoaches = data?.topCoaches || [];

  // Chart helpers
  const maxVolume = Math.max(1, ...volumeOverTime.map((w) => w.sent));
  const bestConversion = conversion.length > 0 ? conversion[0]?.slug : null;

  return (
    <div className="animate-fade-up">
      <PageHeader title="Analytics" subtitle="Email performance across your organization" />

      {/* ================================================================= */}
      {/* SECTION 1: Funnel stat cards                                      */}
      {/* ================================================================= */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {loading ? (
          <>
            <Skeleton className="h-28 rounded-2xl" />
            <Skeleton className="h-28 rounded-2xl" />
            <Skeleton className="h-28 rounded-2xl" />
            <Skeleton className="h-28 rounded-2xl" />
          </>
        ) : (
          <>
            <FunnelCard
              icon="📤"
              label="Sent"
              value={funnel.total_sent}
              color="#2563EB"
            />
            <FunnelCard
              icon="📬"
              label="Delivered"
              value={funnel.delivered}
              color="#16A34A"
              rate={funnel.total_sent > 0 ? Math.round((funnel.delivered / funnel.total_sent) * 100) : null}
              rateLabel="delivery rate"
            />
            <FunnelCard
              icon="👁️"
              label="Opened"
              value={funnel.opened}
              color="#E8735A"
              rate={funnel.delivered > 0 ? Math.round((funnel.opened / funnel.delivered) * 100) : null}
              rateLabel="open rate"
            />
            <FunnelCard
              icon="🖱️"
              label="Clicked"
              value={funnel.clicked}
              color="#7C3AED"
              rate={funnel.delivered > 0 ? Math.round((funnel.clicked / funnel.delivered) * 100) : null}
              rateLabel="click rate"
            />
          </>
        )}
      </div>

      {/* ================================================================= */}
      {/* SECTION 2: Performance by trigger                                 */}
      {/* ================================================================= */}
      <div className="bg-white rounded-2xl border-2 border-gray-100 p-6 mb-8">
        <h2 className="font-display text-lg font-bold text-gray-900 mb-4">Performance by Trigger</h2>
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
          </div>
        ) : byTrigger.length === 0 || byTrigger.every((t) => t.sent === 0) ? (
          <p className="text-sm text-gray-400 text-center py-8">
            No email data yet — emails will appear here once sending is active
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left">
                  <th className="pb-3 font-bold text-gray-500 text-xs uppercase">Trigger</th>
                  <th className="pb-3 font-bold text-gray-500 text-xs uppercase text-right">Sent</th>
                  <th className="pb-3 font-bold text-gray-500 text-xs uppercase text-right">Open Rate</th>
                  <th className="pb-3 font-bold text-gray-500 text-xs uppercase text-right">Click Rate</th>
                  <th className="pb-3 font-bold text-gray-500 text-xs uppercase text-right">Conversion</th>
                </tr>
              </thead>
              <tbody>
                {byTrigger.filter((t) => t.sent > 0).map((trigger) => {
                  const conv = conversion.find((c) => c.slug === trigger.slug);
                  return (
                    <tr key={trigger.slug} className="border-b border-gray-50 hover:bg-gray-50 transition-colors duration-100">
                      <td className="py-3 flex items-center gap-2">
                        <span>{trigger.icon}</span>
                        <span className="font-medium text-gray-900">{trigger.trigger_name}</span>
                      </td>
                      <td className="py-3 text-right text-gray-600">{trigger.sent.toLocaleString()}</td>
                      <td className="py-3 text-right">
                        <RatePill value={trigger.open_rate} greenAt={30} yellowAt={15} />
                      </td>
                      <td className="py-3 text-right">
                        <RatePill value={trigger.click_rate} greenAt={15} yellowAt={5} />
                      </td>
                      <td className="py-3 text-right">
                        <RatePill value={conv?.conversion_rate} greenAt={10} yellowAt={5} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ================================================================= */}
      {/* SECTION 3: Volume over time                                       */}
      {/* ================================================================= */}
      <div className="bg-white rounded-2xl border-2 border-gray-100 p-6 mb-8">
        <h2 className="font-display text-lg font-bold text-gray-900 mb-1">
          Emails Sent vs Opened — Last 12 Weeks
        </h2>
        <p className="text-xs text-gray-400 mb-6">Weekly email volume and engagement</p>
        {loading ? (
          <Skeleton className="h-48 w-full rounded-xl" />
        ) : volumeOverTime.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-8">
            Volume data will appear after emails start sending
          </p>
        ) : (
          <div className="overflow-x-auto">
            <div className="min-w-[600px]">
              {/* Y-axis max */}
              <div className="text-xs text-gray-400 mb-1 text-right">{maxVolume}</div>
              {/* Bars */}
              <div className="flex items-end gap-2 h-48 border-b border-gray-200">
                {volumeOverTime.map((week) => {
                  const sentH = (week.sent / maxVolume) * 100;
                  const openedH = (week.opened / maxVolume) * 100;
                  return (
                    <div key={week.week} className="flex-1 flex items-end justify-center gap-1">
                      <div
                        className="w-3 rounded-t bg-blue-400"
                        style={{ height: Math.max(2, sentH) + "%" }}
                        title={`Sent: ${week.sent}`}
                      />
                      <div
                        className="w-3 rounded-t bg-[#E8735A]"
                        style={{ height: Math.max(2, openedH) + "%" }}
                        title={`Opened: ${week.opened}`}
                      />
                    </div>
                  );
                })}
              </div>
              {/* X-axis labels */}
              <div className="flex gap-2 mt-2">
                {volumeOverTime.map((week) => {
                  const d = new Date(week.week + "T00:00:00");
                  const label = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
                  return (
                    <div key={week.week} className="flex-1 text-center text-[10px] text-gray-400">
                      {label}
                    </div>
                  );
                })}
              </div>
              {/* Legend */}
              <div className="flex items-center gap-4 mt-4 justify-center">
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded bg-blue-400" />
                  <span className="text-xs text-gray-500">Sent</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded bg-[#E8735A]" />
                  <span className="text-xs text-gray-500">Opened</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ================================================================= */}
      {/* SECTION 4: Conversion insight                                     */}
      {/* ================================================================= */}
      <div className="bg-white rounded-2xl border-2 border-gray-100 p-6 mb-8">
        <h2 className="font-display text-lg font-bold text-gray-900 mb-1">
          Did Emails Lead to Orders?
        </h2>
        <p className="text-xs text-gray-400 mb-4">
          Clients who placed an order within 30 days of receiving an email
        </p>
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
          </div>
        ) : conversion.length === 0 || conversion.every((c) => c.emails_sent === 0) ? (
          <p className="text-sm text-gray-400 text-center py-8">
            Conversion data will appear once emails have been sent
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left">
                  <th className="pb-3 font-bold text-gray-500 text-xs uppercase">Trigger</th>
                  <th className="pb-3 font-bold text-gray-500 text-xs uppercase text-right">Emails Sent</th>
                  <th className="pb-3 font-bold text-gray-500 text-xs uppercase text-right">Orders (30d)</th>
                  <th className="pb-3 font-bold text-gray-500 text-xs uppercase text-right">Conversion Rate</th>
                </tr>
              </thead>
              <tbody>
                {conversion.filter((c) => c.emails_sent > 0).map((row) => (
                  <tr
                    key={row.slug}
                    className={`border-b border-gray-50 hover:bg-gray-50 transition-colors duration-100 ${
                      row.slug === bestConversion && row.conversion_rate > 0 ? "bg-green-50" : ""
                    }`}
                  >
                    <td className="py-3 font-medium text-gray-900">{row.trigger_name}</td>
                    <td className="py-3 text-right text-gray-600">{row.emails_sent.toLocaleString()}</td>
                    <td className="py-3 text-right text-gray-600">{row.orders_within_30_days}</td>
                    <td className="py-3 text-right">
                      <RatePill value={row.conversion_rate} greenAt={10} yellowAt={5} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ================================================================= */}
      {/* SECTION 5: Top coaches by open rate                               */}
      {/* ================================================================= */}
      {!loading && topCoaches.length > 0 && (
        <div className="bg-white rounded-2xl border-2 border-gray-100 p-6">
          <h2 className="font-display text-lg font-bold text-gray-900 mb-4">
            Top Coaches by Open Rate
          </h2>
          <div className="space-y-3">
            {topCoaches.map((coach, i) => (
              <div key={coach.id} className="flex items-center gap-4">
                <span className="text-xs font-bold text-gray-400 w-5 text-right">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium text-sm text-gray-900 truncate">{coach.full_name}</span>
                    <span className="text-xs text-gray-500 shrink-0 ml-2">
                      {coach.open_rate}% open rate · {coach.sent} sent
                    </span>
                  </div>
                  <div className="h-2 w-full bg-gray-200 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full bg-[#E8735A] transition-all duration-700"
                      style={{ width: Math.min(100, coach.open_rate) + "%" }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Funnel stat card
// ---------------------------------------------------------------------------
function FunnelCard({ icon, label, value, color, rate, rateLabel }) {
  return (
    <div className="bg-white rounded-2xl border-2 border-gray-100 p-5">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xl">{icon}</span>
        <span className="text-xs font-bold text-gray-400 uppercase tracking-wide">{label}</span>
      </div>
      <div className="text-3xl font-bold" style={{ color }}>
        {(value || 0).toLocaleString()}
      </div>
      {rate !== null && rate !== undefined && (
        <div className="text-sm font-medium mt-1" style={{ color }}>
          {rate}% {rateLabel}
        </div>
      )}
    </div>
  );
}
