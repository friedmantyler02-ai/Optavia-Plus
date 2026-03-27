"use client";

import { useState, useEffect } from "react";
import { useCoach } from "../layout";
import PageHeader from "../components/PageHeader";

const SEGMENTS = [
  {
    key: "warm",
    label: "Warm",
    range: "2–6 months",
    emoji: "\uD83D\uDD25",
    description: "They remember you — just need a nudge",
    accent: "border-orange-300 bg-orange-50",
    badge: "bg-orange-500 text-white",
  },
  {
    key: "moderate",
    label: "Moderate",
    range: "6–12 months",
    emoji: "\u23F0",
    description: "A friendly reconnection works well here",
    accent: "border-amber-300 bg-amber-50",
    badge: "bg-amber-500 text-white",
  },
  {
    key: "cold",
    label: "Cold",
    range: "12–24 months",
    emoji: "\u2744\uFE0F",
    description: "Reintroduce yourself gently",
    accent: "border-blue-300 bg-blue-50",
    badge: "bg-blue-500 text-white",
  },
  {
    key: "dormant",
    label: "Dormant",
    range: "24+ months",
    emoji: "\uD83D\uDCA4",
    description: "May not know who you are — introduce yourself",
    accent: "border-purple-300 bg-purple-50",
    badge: "bg-purple-500 text-white",
  },
];

export default function OutreachPage() {
  const { coach } = useCoach();
  const [segments, setSegments] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!coach?.id) return;
    fetch(`/api/outreach/segments?coach_id=${coach.id}`)
      .then((r) => r.json())
      .then((data) => {
        setSegments(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [coach?.id]);

  return (
    <div className="animate-fade-up">
      <PageHeader title="Outreach" />
      <p className="font-body text-gray-500 -mt-4 mb-6">
        Reconnect with past clients using personal email campaigns
      </p>

      {/* Gmail connection status */}
      <div className="mb-6 flex items-center gap-3 rounded-2xl border-2 border-gray-100 bg-white px-5 py-4">
        <span className="text-xl">✉️</span>
        <div className="flex-1">
          <p className="font-body text-sm font-semibold text-gray-400">
            Gmail not connected
          </p>
          <p className="font-body text-xs text-gray-400">
            Connect your Gmail to send campaigns
          </p>
        </div>
        <button
          disabled
          className="font-body rounded-xl bg-gray-200 px-4 py-2 text-sm font-semibold text-gray-400 cursor-not-allowed"
        >
          Connect
        </button>
      </div>

      {/* Segment cards */}
      {loading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="rounded-2xl border-2 border-gray-100 bg-white p-5 animate-pulse h-40"
            />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {SEGMENTS.map((seg) => {
            const count = segments?.segments?.[seg.key] || 0;
            return (
              <button
                key={seg.key}
                onClick={() => console.log(seg.key)}
                className={`rounded-2xl border-2 p-5 text-left transition-shadow hover:shadow-md ${seg.accent}`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-2xl">{seg.emoji}</span>
                  <span
                    className={`rounded-full px-3 py-0.5 text-sm font-bold ${seg.badge}`}
                  >
                    {count}
                  </span>
                </div>
                <h3 className="font-display text-lg font-bold text-gray-900">
                  {seg.label}
                </h3>
                <p className="font-body text-xs text-gray-500 mt-0.5">
                  {seg.range}
                </p>
                <p className="font-body text-xs text-gray-600 mt-2 leading-snug">
                  {seg.description}
                </p>
              </button>
            );
          })}
        </div>
      )}

      {/* Active clients info */}
      <div className="rounded-2xl border-2 border-gray-100 bg-gray-50 px-5 py-4 mb-6">
        <p className="font-body text-sm text-gray-500">
          <span className="font-semibold text-gray-600">
            Active clients (ordered in last 60 days):{" "}
            {segments?.segments?.active ?? "—"}
          </span>{" "}
          — no outreach needed
        </p>
      </div>

      {/* Active Campaigns */}
      <div className="rounded-2xl border-2 border-gray-100 bg-white p-6 mb-6">
        <h2 className="font-display text-xl font-bold text-gray-900 mb-3">
          Active Campaigns
        </h2>
        <p className="font-body text-sm text-gray-400">
          No active campaigns yet. Choose a segment above to start.
        </p>
      </div>

      {/* Needs Attention */}
      <div className="rounded-2xl border-2 border-gray-100 bg-white p-6">
        <h2 className="font-display text-xl font-bold text-gray-900 mb-3">
          Needs Attention
        </h2>
        <p className="font-body text-sm text-gray-400">
          Replies and follow-ups will appear here.
        </p>
      </div>
    </div>
  );
}
