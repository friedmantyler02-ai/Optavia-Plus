"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCoach } from "../layout";
import useShowToast from "@/hooks/useShowToast";
import PageHeader from "../components/PageHeader";
import ConfirmDialog from "../components/ConfirmDialog";
import { SEGMENTS } from "./segments";

function timeAgo(dateStr) {
  if (!dateStr) return "";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

const RESPONSE_TYPES = [
  { key: "interested", label: "Interested", color: "bg-green-500 hover:bg-green-600 text-white" },
  { key: "curious", label: "Curious", color: "bg-blue-500 hover:bg-blue-600 text-white" },
  { key: "not_now", label: "Not Now", color: "bg-amber-400 hover:bg-amber-500 text-white" },
  { key: "not_interested", label: "Not Interested", color: "bg-gray-400 hover:bg-gray-500 text-white" },
  { key: "unsubscribe", label: "Unsubscribe", color: "bg-red-500 hover:bg-red-600 text-white" },
];

function ReplyCard({ reply, onCategorize }) {
  const [categorizing, setCategorizing] = useState(null);
  const [visible, setVisible] = useState(true);
  const [confirmUnsubscribe, setConfirmUnsubscribe] = useState(false);
  const seg = SEGMENTS.find((s) => s.key === reply.segment);

  const handleCategory = async (responseType) => {
    if (responseType === "unsubscribe") {
      setConfirmUnsubscribe(true);
      return;
    }
    await doCategory(responseType);
  };

  const doCategory = async (responseType) => {
    setCategorizing(responseType);
    const ok = await onCategorize(reply.id, responseType);
    if (ok) {
      setVisible(false);
    } else {
      setCategorizing(null);
    }
  };

  if (!visible) return null;

  return (
    <>
      <div className="rounded-2xl border-2 border-gray-100 bg-white p-5 transition-all duration-300">
        {/* Header row */}
        <div className="flex items-start justify-between gap-3 mb-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-display font-bold text-gray-900">
              {reply.client_name}
            </span>
            {seg && (
              <span className={`rounded-full px-2.5 py-0.5 font-body text-xs font-semibold ${seg.badge}`}>
                {seg.emoji} {seg.label}
              </span>
            )}
          </div>
          <span className="font-body text-xs text-gray-400 whitespace-nowrap shrink-0">
            {timeAgo(reply.detected_at)}
          </span>
        </div>

        {/* Snippet */}
        {reply.reply_snippet && (
          <p className="font-body text-sm text-gray-600 italic mb-3 leading-relaxed">
            "{reply.reply_snippet}"
          </p>
        )}

        {/* Gmail link */}
        {reply.gmail_message_id && (
          <a
            href={`https://mail.google.com/mail/u/0/#inbox/${reply.gmail_message_id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="mb-3 inline-flex items-center gap-1.5 font-body text-xs font-semibold text-[#E8735A] hover:underline"
          >
            Open in Gmail ↗
          </a>
        )}

        {/* Category buttons */}
        <div className="flex flex-wrap gap-2 mt-1">
          {RESPONSE_TYPES.map((rt) => (
            <button
              key={rt.key}
              onClick={() => handleCategory(rt.key)}
              disabled={!!categorizing}
              className={`rounded-xl px-3 py-1.5 font-body text-xs font-semibold transition-colors duration-150 disabled:opacity-50 ${rt.color}`}
            >
              {categorizing === rt.key ? "..." : rt.label}
            </button>
          ))}
        </div>
      </div>

      <ConfirmDialog
        isOpen={confirmUnsubscribe}
        title="Unsubscribe this contact?"
        message={`This will permanently block all future emails to ${reply.client_name}. This cannot be undone.`}
        confirmLabel="Yes, Unsubscribe"
        confirmVariant="danger"
        onConfirm={() => {
          setConfirmUnsubscribe(false);
          doCategory("unsubscribe");
        }}
        onCancel={() => setConfirmUnsubscribe(false)}
      />
    </>
  );
}

export default function OutreachPage() {
  const { coach } = useCoach();
  const router = useRouter();
  const searchParams = useSearchParams();
  const showToast = useShowToast();

  const [segments, setSegments] = useState(null);
  const [loadingSegments, setLoadingSegments] = useState(true);

  const [campaigns, setCampaigns] = useState([]);
  const [loadingCampaigns, setLoadingCampaigns] = useState(true);

  const [replies, setReplies] = useState([]);
  const [loadingReplies, setLoadingReplies] = useState(true);

  const [stats, setStats] = useState(null);
  const [loadingStats, setLoadingStats] = useState(true);

  const [gmailStatus, setGmailStatus] = useState({ connected: false, gmail_address: null });
  const [gmailLoading, setGmailLoading] = useState(true);
  const [disconnecting, setDisconnecting] = useState(false);

  const [togglingCampaign, setTogglingCampaign] = useState(null);

  useEffect(() => {
    if (!coach?.id) return;
    fetchSegments();
    fetchCampaigns();
    fetchGmailStatus();
    fetchReplies();
    fetchStats();
  }, [coach?.id]);

  useEffect(() => {
    if (searchParams.get("connected") === "true") {
      showToast({ message: "Gmail connected!", variant: "success" });
      router.replace("/dashboard/outreach", { scroll: false });
    }
  }, [searchParams]);

  const fetchGmailStatus = async () => {
    try {
      const res = await fetch(`/api/gmail/status?coach_id=${coach.id}`);
      const data = await res.json();
      setGmailStatus(data);
    } catch {
      // ignore
    }
    setGmailLoading(false);
  };

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
      const res = await fetch(`/api/outreach/campaigns?coach_id=${coach.id}`);
      const data = await res.json();
      setCampaigns(data.campaigns || []);
    } catch {
      // ignore
    }
    setLoadingCampaigns(false);
  };

  const fetchReplies = async () => {
    try {
      const res = await fetch(`/api/outreach/replies?coach_id=${coach.id}`);
      const data = await res.json();
      setReplies(data.replies || []);
    } catch {
      // ignore
    }
    setLoadingReplies(false);
  };

  const fetchStats = async () => {
    try {
      const res = await fetch(`/api/outreach/stats?coach_id=${coach.id}`);
      const data = await res.json();
      setStats(data.stats || null);
    } catch {
      // ignore
    }
    setLoadingStats(false);
  };

  const handleGmailDisconnect = async () => {
    if (!confirm("Disconnect Gmail? Active campaigns will stop sending.")) return;
    setDisconnecting(true);
    try {
      await fetch("/api/gmail/disconnect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ coach_id: coach.id }),
      });
      setGmailStatus({ connected: false, gmail_address: null });
    } catch {
      // ignore
    }
    setDisconnecting(false);
  };

  const handleCategorize = useCallback(async (responseId, responseType) => {
    try {
      const res = await fetch("/api/outreach/replies", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ response_id: responseId, response_type: responseType }),
      });
      const data = await res.json();
      if (!data.success) {
        showToast({ message: data.error || "Failed to save.", variant: "error" });
        return false;
      }
      // Refresh stats after categorizing
      fetchStats();
      return true;
    } catch {
      showToast({ message: "Something went wrong.", variant: "error" });
      return false;
    }
  }, []);

  const handleToggleCampaign = async (campaign) => {
    const newStatus = campaign.status === "active" ? "paused" : "active";
    setTogglingCampaign(campaign.id);
    try {
      const res = await fetch(`/api/outreach/campaigns/${campaign.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      const data = await res.json();
      if (data.campaign) {
        setCampaigns((prev) =>
          prev.map((c) => (c.id === campaign.id ? data.campaign : c))
        );
        showToast({
          message: newStatus === "paused" ? "Campaign paused." : "Campaign resumed.",
          variant: "success",
        });
      } else {
        showToast({ message: data.error || "Failed to update campaign.", variant: "error" });
      }
    } catch {
      showToast({ message: "Something went wrong.", variant: "error" });
    }
    setTogglingCampaign(null);
  };

  // Build a map of segment key → campaign
  const campaignBySegment = {};
  for (const c of campaigns) {
    campaignBySegment[c.segment] = c;
  }

  const pendingReplies = replies.filter((r) => r.response_type === null);
  const activeCampaigns = campaigns.filter((c) => c.status === "active");
  const pausedCampaigns = campaigns.filter((c) => c.status === "paused");
  const allManagedCampaigns = [...activeCampaigns, ...pausedCampaigns];

  return (
    <div className="animate-fade-up">
      <PageHeader title="Outreach" />
      <p className="font-body text-gray-500 -mt-4 mb-6">
        Reconnect with past clients using personal email campaigns
      </p>

      {/* Gmail connection status */}
      <div className="mb-6 flex items-center gap-3 rounded-2xl border-2 border-gray-100 bg-white px-5 py-4">
        <span className="text-xl">✉️</span>
        {gmailLoading ? (
          <div className="flex-1">
            <div className="h-4 w-32 animate-pulse rounded bg-gray-100" />
            <div className="mt-1 h-3 w-48 animate-pulse rounded bg-gray-100" />
          </div>
        ) : gmailStatus.connected ? (
          <>
            <div className="flex-1">
              <p className="font-body text-sm font-semibold text-green-700">
                Gmail Connected
              </p>
              <p className="font-body text-xs text-gray-500">
                {gmailStatus.gmail_address}
              </p>
            </div>
            <button
              onClick={handleGmailDisconnect}
              disabled={disconnecting}
              className="rounded-xl border border-gray-200 px-4 py-2 font-body text-sm font-semibold text-gray-500 hover:bg-gray-50 transition-colors"
            >
              {disconnecting ? "..." : "Disconnect"}
            </button>
          </>
        ) : (
          <>
            <div className="flex-1">
              <p className="font-body text-sm font-semibold text-gray-400">
                Gmail not connected
              </p>
              <p className="font-body text-xs text-gray-400">
                Connect your Gmail to send campaigns
              </p>
            </div>
            <a
              href="/api/auth/google/connect?from=outreach"
              className="rounded-xl bg-brand-500 px-4 py-2 font-body text-sm font-semibold text-white hover:bg-brand-600 transition-colors"
            >
              Connect Gmail
            </a>
          </>
        )}
      </div>

      {/* Needs Attention */}
      <div className="mb-6 rounded-2xl border-2 border-gray-100 bg-white p-6">
        <h2 className="font-display text-xl font-bold text-gray-900 mb-4">
          Needs Attention
          {!loadingReplies && pendingReplies.length > 0 && (
            <span className="ml-2 rounded-full bg-[#E8735A] px-2.5 py-0.5 font-body text-sm font-bold text-white">
              {pendingReplies.length}
            </span>
          )}
        </h2>

        {loadingReplies ? (
          <div className="animate-pulse space-y-3">
            <div className="h-24 rounded-2xl bg-gray-100" />
            <div className="h-24 rounded-2xl bg-gray-100" />
          </div>
        ) : pendingReplies.length === 0 ? (
          <p className="font-body text-sm text-gray-400">
            No replies waiting — you're all caught up 👍
          </p>
        ) : (
          <div className="space-y-3">
            {pendingReplies.map((reply) => (
              <ReplyCard
                key={reply.id}
                reply={reply}
                onCategorize={handleCategorize}
              />
            ))}
          </div>
        )}
      </div>

      {/* Stats bar */}
      <div className="mb-6 rounded-2xl border-2 border-gray-100 bg-white px-5 py-4">
        {loadingStats ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-10 animate-pulse rounded-xl bg-gray-100" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: "Emails Sent", value: stats?.emails_sent ?? 0 },
              { label: "Replies", value: stats?.replies ?? 0 },
              { label: "Reactivated", value: stats?.reactivated ?? 0 },
              { label: "Active Campaigns", value: stats?.active_campaigns ?? 0 },
            ].map((stat) => (
              <div key={stat.label} className="rounded-xl bg-gray-50 px-4 py-3 text-center">
                <p className="font-display text-2xl font-bold text-gray-900">
                  {stat.value}
                </p>
                <p className="font-body text-xs text-gray-500 mt-0.5">{stat.label}</p>
              </div>
            ))}
          </div>
        )}
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
                    <span className={`rounded-full px-2.5 py-0.5 font-body text-xs font-bold text-white ${campaign.status === "paused" ? "bg-amber-400" : "bg-green-500"}`}>
                      {campaign.status === "paused" ? "Paused" : "Active"}
                    </span>
                  ) : (
                    <span className={`rounded-full px-3 py-0.5 font-body text-sm font-bold ${seg.badge}`}>
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

      {/* Campaigns (active + paused) */}
      {(loadingCampaigns || allManagedCampaigns.length > 0) && (
        <div className="mb-6 rounded-2xl border-2 border-gray-100 bg-white p-6">
          <h2 className="font-display text-xl font-bold text-gray-900 mb-4">
            Campaigns
          </h2>

          {loadingCampaigns ? (
            <div className="animate-pulse space-y-3">
              <div className="h-20 rounded-xl bg-gray-100" />
              <div className="h-20 rounded-xl bg-gray-100" />
            </div>
          ) : (
            <div className="space-y-3">
              {allManagedCampaigns.map((campaign) => {
                const seg = SEGMENTS.find((s) => s.key === campaign.segment);
                const pct =
                  campaign.total_queued > 0
                    ? Math.round((campaign.total_sent / campaign.total_queued) * 100)
                    : 0;
                const isActive = campaign.status === "active";
                const toggling = togglingCampaign === campaign.id;

                return (
                  <div
                    key={campaign.id}
                    className="rounded-2xl border-2 border-gray-100 bg-gray-50 px-5 py-4"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <button
                        onClick={() =>
                          router.push(`/dashboard/outreach/campaign/${campaign.segment}`)
                        }
                        className="flex items-center gap-2 text-left hover:opacity-80 transition-opacity"
                      >
                        <span className="text-lg">{seg?.emoji}</span>
                        <span className="font-display font-bold text-gray-900">
                          {seg?.label} Campaign
                        </span>
                      </button>
                      <div className="flex items-center gap-2">
                        <span
                          className={`rounded-full px-3 py-0.5 font-body text-xs font-semibold ${
                            isActive
                              ? "bg-green-100 text-green-700"
                              : "bg-amber-100 text-amber-700"
                          }`}
                        >
                          {isActive ? "Active" : "Paused"}
                        </span>
                        <button
                          onClick={() => handleToggleCampaign(campaign)}
                          disabled={toggling}
                          className={`rounded-xl border-2 px-3 py-1.5 font-body text-xs font-semibold transition-colors duration-150 disabled:opacity-50 ${
                            isActive
                              ? "border-gray-200 text-gray-600 hover:bg-gray-100"
                              : "border-green-300 text-green-700 hover:bg-green-50"
                          }`}
                        >
                          {toggling ? "..." : isActive ? "Pause" : "Resume"}
                        </button>
                      </div>
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
                        {campaign.total_replied > 0 && (
                          <> · {campaign.total_replied} {campaign.total_replied === 1 ? "reply" : "replies"}</>
                        )}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
