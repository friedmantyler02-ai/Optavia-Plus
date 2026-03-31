"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useCoach } from "../layout";
import useShowToast from "@/hooks/useShowToast";
import PageHeader from "../components/PageHeader";
import ConfirmDialog from "../components/ConfirmDialog";
import EmailCampaigns from "./EmailCampaigns";
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

const DNC_REPLY_TEMPLATE =
  "Hi {{FirstName}}, Completely understand! This is just my personal email so I wanted to say hello. I hope you are doing well and wish you all the best. Take care, {{CoachName}}";

const RESPONSE_TYPES = [
  { key: "interested", label: "Interested", color: "bg-green-500 hover:bg-green-600 text-white" },
  { key: "curious", label: "Curious", color: "bg-blue-500 hover:bg-blue-600 text-white" },
  { key: "not_now", label: "Not Now", color: "bg-amber-400 hover:bg-amber-500 text-white" },
  { key: "not_interested", label: "Not Interested", color: "bg-gray-400 hover:bg-gray-500 text-white" },
  { key: "unsubscribe", label: "Unsubscribe", color: "bg-red-500 hover:bg-red-600 text-white" },
];

const RESPONSE_BADGE = {
  interested: "bg-green-100 text-green-700",
  curious: "bg-blue-100 text-blue-700",
  not_now: "bg-amber-100 text-amber-700",
  not_interested: "bg-gray-100 text-gray-600",
};

const FOLLOW_UP_TYPES = new Set(["interested", "curious"]);

function ReplyCard({ reply, onCategorize, onSaveFollowUp }) {
  const [categorizing, setCategorizing] = useState(null);
  const [visible, setVisible] = useState(true);
  const [confirmUnsubscribe, setConfirmUnsubscribe] = useState(false);
  // Follow-up form state (shown after categorizing as interested/curious)
  const [showFollowUpForm, setShowFollowUpForm] = useState(false);
  const [savedType, setSavedType] = useState(null);
  const [nextStep, setNextStep] = useState("");
  const [followUpDate, setFollowUpDate] = useState("");
  const [savingFollowUp, setSavingFollowUp] = useState(false);

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
      if (FOLLOW_UP_TYPES.has(responseType)) {
        setSavedType(responseType);
        setShowFollowUpForm(true);
        setCategorizing(null);
      } else {
        setVisible(false);
      }
    } else {
      setCategorizing(null);
    }
  };

  const handleSaveFollowUp = async () => {
    setSavingFollowUp(true);
    await onSaveFollowUp(reply.id, nextStep, followUpDate || null);
    setSavingFollowUp(false);
    setVisible(false);
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
            {savedType && (
              <span className={`rounded-full px-2.5 py-0.5 font-body text-xs font-semibold ${RESPONSE_BADGE[savedType] || "bg-gray-100 text-gray-600"}`}>
                {RESPONSE_TYPES.find((r) => r.key === savedType)?.label}
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

        {/* Inline follow-up form (shown after categorizing as interested/curious) */}
        {showFollowUpForm ? (
          <div className="mt-3 rounded-xl bg-green-50 border border-green-200 p-4 space-y-3">
            <p className="font-body text-xs font-semibold text-green-700">
              Great! When should you follow up?
            </p>
            <div>
              <label className="font-body text-xs text-gray-500">Next step (optional)</label>
              <input
                type="text"
                placeholder="e.g. Send details, Book a call"
                value={nextStep}
                onChange={(e) => setNextStep(e.target.value)}
                className="mt-1 w-full rounded-xl border-2 border-gray-200 px-3 py-2 font-body text-sm focus:border-[#E8735A] focus:outline-none"
              />
            </div>
            <div>
              <label className="font-body text-xs text-gray-500">Follow-up date (optional)</label>
              <input
                type="date"
                value={followUpDate}
                onChange={(e) => setFollowUpDate(e.target.value)}
                className="mt-1 w-full rounded-xl border-2 border-gray-200 px-3 py-2 font-body text-sm focus:border-[#E8735A] focus:outline-none"
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleSaveFollowUp}
                disabled={savingFollowUp}
                className="rounded-xl bg-[#E8735A] px-4 py-2 font-body text-sm font-semibold text-white hover:bg-[#d4634d] disabled:opacity-50 transition-colors"
              >
                {savingFollowUp ? "Saving…" : "Save & Done"}
              </button>
              <button
                onClick={() => setVisible(false)}
                className="rounded-xl border-2 border-gray-200 px-4 py-2 font-body text-sm font-semibold text-gray-500 hover:bg-gray-50 transition-colors"
              >
                Skip
              </button>
            </div>
          </div>
        ) : (
          /* Category buttons */
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
        )}
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

function FollowUpCard({ followUp, onMarkDone, onSnooze }) {
  const [acting, setActing] = useState(null);
  const rtLabel = RESPONSE_TYPES.find((r) => r.key === followUp.response_type)?.label;
  const badgeColor = RESPONSE_BADGE[followUp.response_type] || "bg-gray-100 text-gray-600";

  const handle = async (action) => {
    setActing(action);
    if (action === "done") await onMarkDone(followUp.response_id);
    else await onSnooze(followUp.response_id);
    setActing(null);
  };

  return (
    <div className="rounded-2xl border-2 border-gray-100 bg-white p-5">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-display font-bold text-gray-900">
            {followUp.client_name}
          </span>
          {rtLabel && (
            <span className={`rounded-full px-2.5 py-0.5 font-body text-xs font-semibold ${badgeColor}`}>
              {rtLabel}
            </span>
          )}
          {followUp.is_overdue && (
            <span className="rounded-full bg-red-100 px-2.5 py-0.5 font-body text-xs font-semibold text-red-600">
              Overdue
            </span>
          )}
        </div>
        <span className="font-body text-xs text-gray-400 whitespace-nowrap shrink-0">
          {new Date(followUp.follow_up_date).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
          })}
        </span>
      </div>

      {followUp.next_step && (
        <p className="font-body text-sm text-gray-600 mb-3">{followUp.next_step}</p>
      )}

      <div className="flex gap-2">
        <button
          onClick={() => handle("done")}
          disabled={!!acting}
          className="rounded-xl bg-green-500 px-3 py-1.5 font-body text-xs font-semibold text-white hover:bg-green-600 disabled:opacity-50 transition-colors"
        >
          {acting === "done" ? "..." : "Mark Done"}
        </button>
        <button
          onClick={() => handle("snooze")}
          disabled={!!acting}
          className="rounded-xl border-2 border-gray-200 px-3 py-1.5 font-body text-xs font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-50 transition-colors"
        >
          {acting === "snooze" ? "..." : "Snooze 3 Days"}
        </button>
      </div>
    </div>
  );
}

export default function OutreachPage() {
  const { coach } = useCoach();
  const router = useRouter();
  const searchParams = useSearchParams();
  const showToast = useShowToast();
  const emailCampaignsRef = useRef(null);

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



  const [followUps, setFollowUps] = useState([]);
  const [loadingFollowUps, setLoadingFollowUps] = useState(true);

  const [dncClients, setDncClients] = useState([]);
  const [loadingDnc, setLoadingDnc] = useState(false);
  const [showDnc, setShowDnc] = useState(false);
  const [undoingDnc, setUndoingDnc] = useState(null);
  const [copiedDncTemplate, setCopiedDncTemplate] = useState(false);

  useEffect(() => {
    if (!coach?.id) return;
    fetchSegments();
    fetchCampaigns();
    fetchGmailStatus();
    fetchReplies();
    fetchStats();
    fetchFollowUps();
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
      if (!res.ok) {
        console.error("[Outreach] segments API error:", res.status, data);
      } else {
        setSegments(data);
      }
    } catch (err) {
      console.error("[Outreach] segments fetch failed:", err);
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

  const fetchFollowUps = async () => {
    try {
      const res = await fetch(`/api/outreach/follow-ups?coach_id=${coach.id}`);
      const data = await res.json();
      setFollowUps(data.follow_ups || []);
    } catch {
      // ignore
    }
    setLoadingFollowUps(false);
  };

  const fetchDnc = async () => {
    setLoadingDnc(true);
    try {
      const res = await fetch(`/api/outreach/dnc?coach_id=${coach.id}`);
      const data = await res.json();
      setDncClients(data.clients || []);
    } catch {
      // ignore
    }
    setLoadingDnc(false);
  };

  const handleUndoDnc = async (clientId) => {
    setUndoingDnc(clientId);
    try {
      const res = await fetch(
        `/api/outreach/dnc?coach_id=${coach.id}&client_id=${clientId}`,
        { method: "DELETE" }
      );
      const data = await res.json();
      if (data.success) {
        setDncClients((prev) => prev.filter((c) => c.id !== clientId));
        showToast({ message: "Removed from DNC list.", variant: "success" });
      } else {
        showToast({ message: data.error || "Could not undo.", variant: "error" });
      }
    } catch {
      showToast({ message: "Something went wrong.", variant: "error" });
    }
    setUndoingDnc(null);
  };

  const handleToggleDnc = () => {
    if (!showDnc && dncClients.length === 0) fetchDnc();
    setShowDnc((v) => !v);
  };

  const handleCopyDncTemplate = () => {
    navigator.clipboard.writeText(DNC_REPLY_TEMPLATE).then(() => {
      setCopiedDncTemplate(true);
      setTimeout(() => setCopiedDncTemplate(false), 2000);
    });
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

  const handleSaveFollowUp = useCallback(async (responseId, nextStep, followUpDate) => {
    try {
      await fetch("/api/outreach/replies", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          response_id: responseId,
          next_step: nextStep || null,
          follow_up_date: followUpDate || null,
        }),
      });
    } catch {
      // best-effort — card will still close
    }
  }, []);

  const handleMarkFollowUpDone = useCallback(async (responseId) => {
    try {
      await fetch("/api/outreach/replies", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ response_id: responseId, follow_up_date: null }),
      });
      setFollowUps((prev) => prev.filter((f) => f.response_id !== responseId));
    } catch {
      showToast({ message: "Something went wrong.", variant: "error" });
    }
  }, []);

  const handleSnoozeFollowUp = useCallback(async (responseId) => {
    try {
      const followUp = followUps.find((f) => f.response_id === responseId);
      const base = followUp?.follow_up_date
        ? new Date(followUp.follow_up_date + "T00:00:00")
        : new Date();
      base.setDate(base.getDate() + 3);
      const newDate = base.toISOString().split("T")[0];

      await fetch("/api/outreach/replies", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ response_id: responseId, follow_up_date: newDate }),
      });
      setFollowUps((prev) => prev.filter((f) => f.response_id !== responseId));
    } catch {
      showToast({ message: "Something went wrong.", variant: "error" });
    }
  }, [followUps]);

  // Build a map of segment key → campaign
  const campaignBySegment = {};
  for (const c of campaigns) {
    campaignBySegment[c.segment] = c;
  }

  const pendingReplies = replies.filter((r) => r.response_type === null);
  const attentionCount = pendingReplies.length + followUps.length;
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
          {!loadingReplies && !loadingFollowUps && attentionCount > 0 && (
            <span className="ml-2 rounded-full bg-[#E8735A] px-2.5 py-0.5 font-body text-sm font-bold text-white">
              {attentionCount}
            </span>
          )}
        </h2>

        {/* Uncategorized replies */}
        {loadingReplies ? (
          <div className="animate-pulse space-y-3 mb-4">
            <div className="h-24 rounded-2xl bg-gray-100" />
            <div className="h-24 rounded-2xl bg-gray-100" />
          </div>
        ) : pendingReplies.length > 0 ? (
          <div className="space-y-3 mb-4">
            {pendingReplies.map((reply) => (
              <ReplyCard
                key={reply.id}
                reply={reply}
                onCategorize={handleCategorize}
                onSaveFollowUp={handleSaveFollowUp}
              />
            ))}
          </div>
        ) : null}

        {/* Follow-ups due */}
        {!loadingFollowUps && followUps.length > 0 && (
          <>
            <p className="font-body text-xs font-semibold uppercase tracking-wide text-gray-400 mb-3 mt-1">
              Follow-Ups Due
            </p>
            <div className="space-y-3 mb-4">
              {followUps.map((fu) => (
                <FollowUpCard
                  key={fu.response_id}
                  followUp={fu}
                  onMarkDone={handleMarkFollowUpDone}
                  onSnooze={handleSnoozeFollowUp}
                />
              ))}
            </div>
          </>
        )}

        {!loadingReplies && !loadingFollowUps && attentionCount === 0 && (
          <p className="font-body text-sm text-gray-400">
            No replies waiting — you're all caught up 👍
          </p>
        )}
      </div>

      {/* Stats bar */}
      <div className="mb-2 rounded-2xl border-2 border-gray-100 bg-white px-5 py-4">
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
        <div className="mt-3 flex justify-end">
          <Link
            href="/dashboard/outreach/analytics"
            className="font-body text-sm font-semibold text-[#E8735A] hover:underline"
          >
            View Analytics 📊
          </Link>
        </div>
      </div>

      {/* DNC toggle link */}
      <div className="mb-6 mt-2 px-1">
        <button
          onClick={handleToggleDnc}
          className="font-body text-sm text-gray-400 hover:text-gray-600 transition-colors underline underline-offset-2"
        >
          {showDnc ? "Hide" : "View"} Do Not Contact List
          {!loadingStats && (stats?.dnc_count ?? dncClients.length) > 0
            ? ` (${stats?.dnc_count ?? dncClients.length})`
            : ""}
        </button>
      </div>

      {/* DNC list panel */}
      {showDnc && (
        <div className="mb-6 rounded-2xl border-2 border-gray-100 bg-white p-6">
          <h2 className="font-display text-lg font-bold text-gray-900 mb-4">
            Do Not Contact List
          </h2>

          {/* Suggested reply template */}
          <div className="mb-5 rounded-xl bg-gray-50 border border-gray-200 p-4">
            <p className="font-body text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">
              Suggested reply when someone unsubscribes
            </p>
            <p className="font-body text-sm text-gray-700 italic leading-relaxed mb-3">
              "{DNC_REPLY_TEMPLATE}"
            </p>
            <button
              onClick={handleCopyDncTemplate}
              className="rounded-xl border-2 border-gray-200 px-4 py-1.5 font-body text-xs font-semibold text-gray-600 hover:bg-gray-100 transition-colors duration-150"
            >
              {copiedDncTemplate ? "Copied!" : "Copy"}
            </button>
          </div>

          {loadingDnc ? (
            <div className="animate-pulse space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-10 rounded-xl bg-gray-100" />
              ))}
            </div>
          ) : dncClients.length === 0 ? (
            <p className="font-body text-sm text-gray-400">
              No contacts on the DNC list.
            </p>
          ) : (
            <div className="space-y-2">
              {dncClients.map((client) => {
                const markedAt = client.do_not_contact_at
                  ? new Date(client.do_not_contact_at).getTime()
                  : 0;
                const canUndo =
                  markedAt > 0 &&
                  Date.now() - markedAt < 24 * 60 * 60 * 1000;

                return (
                  <div
                    key={client.id}
                    className="flex items-center justify-between rounded-xl bg-gray-50 px-4 py-3"
                  >
                    <div>
                      <p className="font-body text-sm font-semibold text-gray-800">
                        {client.full_name}
                      </p>
                      <p className="font-body text-xs text-gray-400">
                        {client.email}
                        {client.do_not_contact_at && (
                          <>
                            {" · "}
                            {new Date(client.do_not_contact_at).toLocaleDateString(
                              "en-US",
                              { month: "short", day: "numeric", year: "numeric" }
                            )}
                          </>
                        )}
                      </p>
                    </div>
                    {canUndo && (
                      <button
                        onClick={() => handleUndoDnc(client.id)}
                        disabled={undoingDnc === client.id}
                        className="ml-3 rounded-xl border-2 border-gray-200 px-3 py-1.5 font-body text-xs font-semibold text-gray-500 hover:bg-white disabled:opacity-50 transition-colors duration-150"
                      >
                        {undoingDnc === client.id ? "..." : "Undo"}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Email Campaigns */}
      <EmailCampaigns ref={emailCampaignsRef} />

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
                  emailCampaignsRef.current?.openNewCampaign(seg.key)
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

    </div>
  );
}
