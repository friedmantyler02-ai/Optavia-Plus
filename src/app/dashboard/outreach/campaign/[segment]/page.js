"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { useCoach } from "../../../layout";
import ConfirmDialog from "../../../components/ConfirmDialog";
import { SEGMENTS } from "../../segments";

export default function CampaignSetupPage() {
  const params = useParams();
  const segmentKey = params.segment;
  const seg = SEGMENTS.find((s) => s.key === segmentKey);

  const { coach } = useCoach();
  const router = useRouter();

  const [template, setTemplate] = useState(null);
  const [loadingTemplate, setLoadingTemplate] = useState(true);
  const [clients, setClients] = useState([]);
  const [clientCount, setClientCount] = useState(0);
  const [loadingClients, setLoadingClients] = useState(true);

  const [editing, setEditing] = useState(false);
  const [editSubject, setEditSubject] = useState("");
  const [editBody, setEditBody] = useState("");
  const [saving, setSaving] = useState(false);

  const [showConfirm, setShowConfirm] = useState(false);
  const [launching, setLaunching] = useState(false);
  const [launchError, setLaunchError] = useState(null);

  // Gmail always not connected for now
  const gmailConnected = false;

  useEffect(() => {
    if (!coach?.id || !segmentKey) return;
    fetchTemplate();
    fetchClients();
  }, [coach?.id, segmentKey]);

  const fetchTemplate = async () => {
    setLoadingTemplate(true);
    try {
      const res = await fetch(
        `/api/outreach/templates?coach_id=${coach.id}&segment=${segmentKey}`
      );
      const data = await res.json();
      setTemplate(data.template || null);
    } catch {
      // ignore — hardcoded defaults handle the no-template case
    }
    setLoadingTemplate(false);
  };

  const fetchClients = async () => {
    setLoadingClients(true);
    try {
      const res = await fetch(
        `/api/outreach/segments?coach_id=${coach.id}&segment=${segmentKey}`
      );
      const data = await res.json();
      setClients(data.clients || []);
      setClientCount(data.count || 0);
    } catch {
      // ignore
    }
    setLoadingClients(false);
  };

  const handleEdit = () => {
    setEditSubject(template?.subject || "");
    setEditBody(template?.body || "");
    setEditing(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/outreach/templates", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          coach_id: coach.id,
          segment: segmentKey,
          subject: editSubject,
          body: editBody,
        }),
      });
      const data = await res.json();
      if (data.template) setTemplate(data.template);
      setEditing(false);
    } catch {
      // ignore
    }
    setSaving(false);
  };

  const handleReset = async () => {
    await fetch(
      `/api/outreach/templates?coach_id=${coach.id}&segment=${segmentKey}`,
      { method: "DELETE" }
    );
    fetchTemplate();
  };

  const handleLaunch = async () => {
    setLaunching(true);
    setLaunchError(null);
    try {
      const res = await fetch("/api/outreach/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          coach_id: coach.id,
          segment: segmentKey,
          template_subject: template?.subject,
          template_body: template?.body,
        }),
      });
      const data = await res.json();
      if (data.campaign) {
        router.push("/dashboard/outreach");
      } else {
        setLaunchError(data.error || "Something went wrong. Please try again.");
      }
    } catch {
      setLaunchError("Something went wrong. Please try again.");
    }
    setLaunching(false);
    setShowConfirm(false);
  };

  // Preview with placeholder substitution
  const previewSubject = (template?.subject || "")
    .replace(/\{\{FirstName\}\}/g, "Sarah")
    .replace(/\{\{CoachName\}\}/g, coach?.full_name || "Your Coach");
  const previewBody = (template?.body || "")
    .replace(/\{\{FirstName\}\}/g, "Sarah")
    .replace(/\{\{CoachName\}\}/g, coach?.full_name || "Your Coach");

  const weeksEstimate = Math.max(1, Math.ceil(clientCount / 100));

  if (!seg) {
    return (
      <div className="animate-fade-up">
        <Link
          href="/dashboard/outreach"
          className="inline-flex items-center gap-1 font-body text-sm text-gray-500 hover:text-gray-700 mb-4"
        >
          ← Back to Outreach
        </Link>
        <p className="font-body text-gray-500">Invalid segment.</p>
      </div>
    );
  }

  return (
    <div className="animate-fade-up">
      {/* Back link */}
      <Link
        href="/dashboard/outreach"
        className="inline-flex items-center gap-1 font-body text-sm text-gray-500 hover:text-gray-700 mb-5"
      >
        ← Back to Outreach
      </Link>

      {/* Segment header */}
      <div className={`rounded-2xl border-2 p-5 mb-6 ${seg.accent}`}>
        <div className="flex items-center gap-3">
          <span className="text-4xl">{seg.emoji}</span>
          <div>
            <h1 className="font-display text-2xl font-bold text-gray-900">
              {seg.label} Clients
            </h1>
            <p className="font-body text-sm text-gray-600">
              {seg.range} — {seg.description}
            </p>
          </div>
        </div>
      </div>

      {/* Email Preview */}
      <div className="rounded-2xl border-2 border-gray-100 bg-white p-6 mb-6">
        <h2 className="font-display text-lg font-bold text-gray-900 mb-4">
          Email Preview
        </h2>

        {loadingTemplate ? (
          <div className="animate-pulse space-y-3">
            <div className="h-10 bg-gray-100 rounded-xl" />
            <div className="h-36 bg-gray-100 rounded-xl" />
          </div>
        ) : editing ? (
          <div className="space-y-4">
            <div>
              <label className="font-body text-xs font-semibold uppercase tracking-wide text-gray-500">
                Subject
              </label>
              <input
                className="mt-1 w-full rounded-xl border-2 border-gray-200 px-4 py-2 font-body text-sm focus:border-[#E8735A] focus:outline-none"
                value={editSubject}
                onChange={(e) => setEditSubject(e.target.value)}
              />
            </div>
            <div>
              <label className="font-body text-xs font-semibold uppercase tracking-wide text-gray-500">
                Message
              </label>
              <textarea
                className="mt-1 min-h-[200px] w-full resize-y rounded-xl border-2 border-gray-200 px-4 py-2 font-body text-sm focus:border-[#E8735A] focus:outline-none"
                value={editBody}
                onChange={(e) => setEditBody(e.target.value)}
              />
              <p className="mt-1 font-body text-xs text-gray-400">
                Use {"{{"+"FirstName}}"} and {"{{"+"CoachName}}"} as placeholders
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleSave}
                disabled={saving}
                className="rounded-xl bg-[#E8735A] px-5 py-2 font-body text-sm font-semibold text-white hover:bg-[#d4634d] disabled:opacity-50 transition-colors duration-150"
              >
                {saving ? "Saving…" : "Save"}
              </button>
              <button
                onClick={() => setEditing(false)}
                className="rounded-xl border-2 border-gray-200 px-5 py-2 font-body text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors duration-150"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="rounded-t-xl bg-gray-100 px-4 py-2.5 font-body text-sm font-semibold text-gray-700">
              {previewSubject || "(No subject)"}
            </div>
            <div className="min-h-[140px] rounded-b-xl border-2 border-t-0 border-gray-100 px-4 py-4 font-body text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
              {previewBody || "(No message)"}
            </div>
            <p className="mt-2 font-body text-xs text-gray-400">
              Preview shown with sample name "Sarah" — real emails use each client's first name
            </p>
            <div className="mt-4 flex gap-2 flex-wrap">
              <button
                onClick={handleEdit}
                className="rounded-xl border-2 border-gray-200 px-4 py-2 font-body text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors duration-150"
              >
                Edit Message
              </button>
              {template && !template.is_default && (
                <button
                  onClick={handleReset}
                  className="rounded-xl border-2 border-gray-200 px-4 py-2 font-body text-sm font-semibold text-gray-500 hover:bg-gray-50 transition-colors duration-150"
                >
                  Reset to Default
                </button>
              )}
            </div>
          </>
        )}
      </div>

      {/* Client Preview */}
      <div className="rounded-2xl border-2 border-gray-100 bg-white p-6 mb-6">
        <h2 className="font-display text-lg font-bold text-gray-900 mb-1">
          Client Preview
        </h2>
        <p className="font-body text-sm text-gray-500 mb-4">
          {loadingClients
            ? "Loading…"
            : clientCount === 0
            ? "No eligible clients in this segment"
            : `${clientCount} client${clientCount !== 1 ? "s" : ""} will receive this email`}
        </p>

        {loadingClients ? (
          <div className="animate-pulse space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-10 rounded-xl bg-gray-100" />
            ))}
          </div>
        ) : clients.length === 0 ? (
          <p className="font-body text-sm text-gray-400">
            No eligible clients in this segment.
          </p>
        ) : (
          <>
            <div className="max-h-64 overflow-y-auto space-y-1 pr-1">
              {clients.slice(0, 20).map((c) => (
                <div
                  key={c.id}
                  className="flex items-center justify-between rounded-xl bg-gray-50 px-3 py-2.5 font-body text-sm"
                >
                  <span className="text-gray-800 font-medium">
                    {c.first_name} {c.last_name}
                  </span>
                  <span className="text-gray-400 text-xs">
                    {c.last_order_date
                      ? `Last order: ${new Date(c.last_order_date).toLocaleDateString("en-US", {
                          month: "short",
                          year: "numeric",
                        })}`
                      : "No orders"}
                  </span>
                </div>
              ))}
            </div>
            {clientCount > 20 && (
              <p className="mt-2 font-body text-xs text-gray-400">
                and {clientCount - 20} more…
              </p>
            )}
          </>
        )}
      </div>

      {/* Launch error */}
      {launchError && (
        <div className="mb-4 rounded-2xl border-2 border-red-200 bg-red-50 px-5 py-3">
          <p className="font-body text-sm text-red-600">{launchError}</p>
        </div>
      )}

      {/* Start Campaign button */}
      <div className="relative group mb-8">
        <button
          disabled={!gmailConnected || clientCount === 0}
          onClick={() => setShowConfirm(true)}
          className="w-full rounded-2xl bg-green-500 py-4 font-display text-lg font-bold text-white transition-colors duration-150 hover:bg-green-600 disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-400"
        >
          Start Campaign
        </button>
        {!gmailConnected && (
          <div className="pointer-events-none absolute -top-11 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-lg bg-gray-800 px-3 py-2 font-body text-xs text-white invisible group-hover:visible">
            Connect Gmail first
            <div className="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-gray-800" />
          </div>
        )}
      </div>

      <ConfirmDialog
        isOpen={showConfirm}
        title="Launch Campaign?"
        message={`This will send ${clientCount} email${clientCount !== 1 ? "s" : ""} over the next ${weeksEstimate} week${weeksEstimate !== 1 ? "s" : ""} from your Gmail. Emails are sent weekday mornings, starting with 20/day and ramping up. Continue?`}
        confirmLabel={launching ? "Launching…" : "Launch Campaign"}
        onConfirm={handleLaunch}
        onCancel={() => setShowConfirm(false)}
      />
    </div>
  );
}
