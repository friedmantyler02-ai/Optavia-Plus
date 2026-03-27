"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useCoach } from "../layout";
import PageHeader from "../components/PageHeader";
import { SEGMENTS } from "./segments";

export default function OutreachPage() {
  const { coach } = useCoach();
  const router = useRouter();

  const [segments, setSegments] = useState(null);
  const [loadingSegments, setLoadingSegments] = useState(true);
  const [activeCampaigns, setActiveCampaigns] = useState([]);
  const [loadingCampaigns, setLoadingCampaigns] = useState(true);

  useEffect(() => {
    if (!coach?.id) return;
    fetchSegments();
    fetchCampaigns();
  }, [coach?.id]);

  const fetchSegments = async () => {
    try {
      const res = await fetch(`/api/outreach/segments?coach_id=${coach.id}`);
      const data = await res.json();
      setSegments(data);
    } catch {
      // ignore
    }
    setLoadingSegments(false);
  };

  const fetchCampaigns = async () => {
    try {
      const res = await fetch(
        `/api/outreach/campaigns?coach_id=${coach.id}&status=active`
      );
      const data = await res.json();
      setActiveCampaigns(data.campaigns || []);
    } catch {
      // ignore
    }
    setLoadingCampaigns(false);
  };

  // Build a map of segment key → active campaign
  const campaignBySegment = {};
  for (const c of activeCampaigns) {
    campaignBySegment[c.segment] = c;
  }

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
          className="cursor-not-allowed rounded-xl bg-gray-200 px-4 py-2 font-body text-sm font-semibold text-gray-400"
        >
          Connect
        </button>
      </div>

      {/* Segment cards */}
      {loadingSegments ? (
        <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="h-44 animate-pulse rounded-2xl border-2 border-gray-100 bg-white p-5"
            />
          ))}
        </div>
      ) : (
        <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
          {SEGMENTS.map((seg) => {
            const count = segments?.segments?.[seg.key] || 0;
            const campaign = campaignBySegment[seg.key];

            return (
              <button
                key={seg.key}
                onClick={() =>
                  router.push(`/dashboard/outreach/campaign/${seg.key}`)
                }
                className={`rounded-2xl border-2 p-5 text-left transition-shadow hover:shadow-md ${seg.accent}`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-2xl">{seg.emoji}</span>
                  {campaign ? (
                    <span className="rounded-full bg-green-500 px-2.5 py-0.5 font-body text-xs font-bold text-white">
                      Active
                    </span>
                  ) : (
                    <span
                      className={`rounded-full px-3 py-0.5 font-body text-sm font-bold ${seg.badge}`}
                    >
                      {count}
                    </span>
                  )}
                </div>
                <h3 className="font-display text-lg font-bold text-gray-900">
                  {seg.label}
                </h3>
                <p className="font-body text-xs text-gray-500 mt-0.5">
                  {seg.range}
                </p>
                {campaign ? (
                  <div className="mt-2">
                    <p className="font-body text-xs font-semibold text-gray-700">
                      {campaign.total_sent}/{campaign.total_queued} sent
                    </p>
                    <div className="mt-1 h-1.5 w-full rounded-full bg-white/60">
                      <div
                        className="h-1.5 rounded-full bg-green-500 transition-all duration-300"
                        style={{
                          width:
                            campaign.total_queued > 0
                              ? `${Math.round((campaign.total_sent / campaign.total_queued) * 100)}%`
                              : "0%",
                        }}
                      />
                    </div>
                  </div>
                ) : (
                  <p className="font-body text-xs text-gray-600 mt-2 leading-snug">
                    {seg.description}
                  </p>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Active clients info */}
      <div className="mb-6 rounded-2xl border-2 border-gray-100 bg-gray-50 px-5 py-4">
        <p className="font-body text-sm text-gray-500">
          <span className="font-semibold text-gray-600">
            Active clients (ordered in last 60 days):{" "}
            {segments?.segments?.active ?? "—"}
          </span>{" "}
          — no outreach needed
        </p>
      </div>

      {/* Active Campaigns */}
      <div className="mb-6 rounded-2xl border-2 border-gray-100 bg-white p-6">
        <h2 className="font-display text-xl font-bold text-gray-900 mb-4">
          Active Campaigns
        </h2>

        {loadingCampaigns ? (
          <div className="animate-pulse space-y-3">
            <div className="h-16 rounded-xl bg-gray-100" />
            <div className="h-16 rounded-xl bg-gray-100" />
          </div>
        ) : activeCampaigns.length === 0 ? (
          <p className="font-body text-sm text-gray-400">
            No active campaigns yet. Choose a segment above to start.
          </p>
        ) : (
          <div className="space-y-3">
            {activeCampaigns.map((campaign) => {
              const seg = SEGMENTS.find((s) => s.key === campaign.segment);
              const pct =
                campaign.total_queued > 0
                  ? Math.round((campaign.total_sent / campaign.total_queued) * 100)
                  : 0;
              return (
                <button
                  key={campaign.id}
                  onClick={() =>
                    router.push(
                      `/dashboard/outreach/campaign/${campaign.segment}`
                    )
                  }
                  className="w-full rounded-2xl border-2 border-gray-100 bg-gray-50 px-5 py-4 text-left hover:bg-gray-100 transition-colors duration-150"
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{seg?.emoji}</span>
                      <span className="font-display font-bold text-gray-900">
                        {seg?.label} Campaign
                      </span>
                    </div>
                    <span className="rounded-full bg-green-100 px-3 py-0.5 font-body text-xs font-semibold text-green-700">
                      Active
                    </span>
                  </div>
                  <div className="flex items-center justify-between mb-1.5">
                    <p className="font-body text-xs text-gray-500">
                      {campaign.total_sent} of {campaign.total_queued} emails sent
                    </p>
                    <p className="font-body text-xs font-semibold text-gray-600">
                      {pct}%
                    </p>
                  </div>
                  <div className="h-2 w-full rounded-full bg-gray-200">
                    <div
                      className="h-2 rounded-full bg-green-500 transition-all duration-300"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  {campaign.started_at && (
                    <p className="mt-2 font-body text-xs text-gray-400">
                      Started{" "}
                      {new Date(campaign.started_at).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </p>
                  )}
                </button>
              );
            })}
          </div>
        )}
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
