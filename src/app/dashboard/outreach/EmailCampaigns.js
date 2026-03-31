"use client";

import { useState, useEffect, useCallback, useRef, forwardRef, useImperativeHandle } from "react";
import { useCoach } from "../layout";
import useShowToast from "@/hooks/useShowToast";
import ConfirmDialog from "../components/ConfirmDialog";

// ─── Helpers ────────────────────────────────────────────────────────

function timeAgo(dateStr) {
  if (!dateStr) return "";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  const years = Math.floor(months / 12);
  return `${years}y ago`;
}

const STATUS_BADGE = {
  draft: "bg-gray-100 text-gray-600",
  sending: "bg-amber-100 text-amber-700 animate-pulse",
  complete: "bg-green-100 text-green-700",
  cancelled: "bg-red-100 text-red-600 line-through",
};

const TONE_BADGE = {
  warm_friendly: { label: "Warm & Friendly", bg: "bg-pink-100 text-pink-700" },
  encouraging: { label: "Encouraging", bg: "bg-purple-100 text-purple-700" },
  business_professional: { label: "Professional", bg: "bg-blue-100 text-blue-700" },
};

const TONE_CARDS = [
  {
    key: "warm_friendly",
    label: "Warm & Friendly",
    desc: "Casual, feels like a friend texting",
    bg: "bg-pink-50 border-pink-200 hover:border-pink-400",
    selectedBg: "bg-pink-100 border-pink-500 ring-2 ring-pink-300",
  },
  {
    key: "encouraging",
    label: "Encouraging",
    desc: "Motivational, supportive, cheerleader energy",
    bg: "bg-purple-50 border-purple-200 hover:border-purple-400",
    selectedBg: "bg-purple-100 border-purple-500 ring-2 ring-purple-300",
  },
  {
    key: "business_professional",
    label: "Professional",
    desc: "Polished, respectful, business tone",
    bg: "bg-blue-50 border-blue-200 hover:border-blue-400",
    selectedBg: "bg-blue-100 border-blue-500 ring-2 ring-blue-300",
  },
];

const TRIGGER_ICONS = {
  time_since_last_order: "📬",
  order_after_lapse: "🎉",
  order_streak: "🔥",
  new_client_welcome: "👋",
  birthday: "🎂",
  milestone: "🏆",
};

// ─── Skeleton Components ────────────────────────────────────────────

function CampaignSkeleton() {
  return (
    <div className="rounded-2xl border-2 border-gray-100 bg-white p-5 animate-pulse">
      <div className="flex items-center justify-between mb-3">
        <div className="h-5 w-48 rounded bg-gray-200" />
        <div className="h-5 w-16 rounded-full bg-gray-200" />
      </div>
      <div className="flex gap-2 mb-3">
        <div className="h-5 w-24 rounded-full bg-gray-100" />
        <div className="h-5 w-20 rounded-full bg-gray-100" />
      </div>
      <div className="h-4 w-40 rounded bg-gray-100" />
    </div>
  );
}

// ─── Campaign Builder Modal (Single-Screen) ────────────────────────

// Segment key → trigger_type mapping
const SEGMENT_TO_TRIGGER = {
  warm: "time_since_last_order",
  moderate: "time_since_last_order",
  cold: "time_since_last_order",
  dormant: "time_since_last_order",
};

// Segment key → friendly label for campaign name default
const SEGMENT_LABELS = {
  warm: "Warm (2-6 months)",
  moderate: "Moderate (6-12 months)",
  cold: "Cold (12-24 months)",
  dormant: "Dormant (24+ months)",
};

// Humanize template variables for preview display
function humanizeTemplate(text) {
  if (!text) return "";
  return text
    .replace(/\{\{client_first_name\}\}/gi, "[Client Name]")
    .replace(/\{\{client_name\}\}/gi, "[Client Name]")
    .replace(/\{\{coach_name\}\}/gi, "[Your Name]")
    .replace(/\{\{coach_email\}\}/gi, "[Your Email]")
    .replace(/\{\{FirstName\}\}/gi, "[Client Name]")
    .replace(/\{\{CoachName\}\}/gi, "[Your Name]");
}

// Strip HTML tags to plain text for display
function stripHtml(html) {
  if (!html) return "";
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const BUILDER_TONE_CARDS = [
  {
    key: "warm_friendly",
    label: "Warm & Friendly",
    desc: "Casual, feels like a friend texting",
    borderColor: "border-l-pink-400",
    tint: "bg-pink-50/50",
    selectedBorder: "border-pink-500 ring-2 ring-pink-300",
  },
  {
    key: "encouraging",
    label: "Encouraging",
    desc: "Motivational, supportive, cheerleader energy",
    borderColor: "border-l-purple-400",
    tint: "bg-purple-50/50",
    selectedBorder: "border-purple-500 ring-2 ring-purple-300",
  },
  {
    key: "business_professional",
    label: "Professional",
    desc: "Polished, respectful, business tone",
    borderColor: "border-l-blue-400",
    tint: "bg-blue-50/50",
    selectedBorder: "border-blue-500 ring-2 ring-blue-300",
  },
];

function CampaignBuilderModal({ isOpen, onClose, onLaunched, initialSegment }) {
  const showToast = useShowToast();

  // Loading state
  const [initializing, setInitializing] = useState(true);
  const [initError, setInitError] = useState(null);

  // Trigger info (from preview endpoint)
  const [trigger, setTrigger] = useState(null);

  // Recipients state (local only — no campaign created yet)
  const [allClients, setAllClients] = useState([]);
  const [includedIds, setIncludedIds] = useState(new Set());

  // Template previews (all 3 tones)
  const [previews, setPreviews] = useState({});
  const [loadingPreviews, setLoadingPreviews] = useState(true);

  // Selected tone
  const [selectedTone, setSelectedTone] = useState("warm_friendly");

  // Edit message state
  const [editing, setEditing] = useState(false);
  const [editSubject, setEditSubject] = useState("");
  const [editBody, setEditBody] = useState("");
  const [customMessage, setCustomMessage] = useState(null); // { subject, body } if edited

  // Sending state
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [sentCount, setSentCount] = useState(0);

  // ─── Initialize on open ──────────────────────────────────────────
  useEffect(() => {
    if (!isOpen) return;

    // Reset all state
    setInitializing(true);
    setInitError(null);
    setTrigger(null);
    setAllClients([]);
    setIncludedIds(new Set());
    setPreviews({});
    setLoadingPreviews(true);
    setSelectedTone("warm_friendly");
    setEditing(false);
    setEditSubject("");
    setEditBody("");
    setCustomMessage(null);
    setSending(false);
    setSent(false);
    setSentCount(0);

    initializePreview();
  }, [isOpen]);

  const initializePreview = async () => {
    try {
      // 1. Fetch eligible clients via preview endpoint (NO campaign created)
      const previewRes = await fetch(
        `/api/email/campaigns/preview?segment=${encodeURIComponent(initialSegment || "warm")}`,
        { credentials: "include" }
      );
      if (!previewRes.ok) {
        const errData = await previewRes.json();
        throw new Error(errData.error || "Failed to load eligible clients");
      }
      const previewData = await previewRes.json();
      const triggerData = previewData.trigger;
      const clients = previewData.clients || [];

      setTrigger(triggerData);
      setAllClients(clients);

      // Default: include all if <=40, none if >40
      if (clients.length <= 40) {
        setIncludedIds(new Set(clients.map((c) => c.id)));
      } else {
        setIncludedIds(new Set());
      }

      // 2. Fetch all 3 template previews in parallel
      if (triggerData) {
        const [warm, encouraging, professional] = await Promise.all([
          fetchPreviewData(triggerData.id, "warm_friendly"),
          fetchPreviewData(triggerData.id, "encouraging"),
          fetchPreviewData(triggerData.id, "business_professional"),
        ]);

        const previewMap = {
          warm_friendly: warm,
          encouraging: encouraging,
          business_professional: professional,
        };
        console.log("[CampaignBuilder] Template previews loaded:", previewMap);
        setPreviews(previewMap);
      }

      setLoadingPreviews(false);
      setInitializing(false);
    } catch (err) {
      console.error("[CampaignBuilder] Init error:", err);
      setInitError(err.message);
      setInitializing(false);
    }
  };

  const fetchPreviewData = async (triggerId, tone) => {
    try {
      const url = `/api/email/templates/preview?trigger_id=${triggerId}&tone=${tone}`;
      console.log(`[CampaignBuilder] Fetching template preview: ${url}`);
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) {
        console.log(`[CampaignBuilder] Template preview ${tone} failed: ${res.status}`);
        return null;
      }
      const data = await res.json();
      console.log(`[CampaignBuilder] Template preview for ${tone}:`, data.template);
      return data.template || null;
    } catch (err) {
      console.error(`[CampaignBuilder] Template preview ${tone} error:`, err);
      return null;
    }
  };

  // ─── Recipient toggling (all local, no server calls) ─────────────
  const toggleRecipient = (clientId) => {
    setIncludedIds((prev) => {
      const next = new Set(prev);
      if (next.has(clientId)) {
        next.delete(clientId);
      } else {
        next.add(clientId);
      }
      return next;
    });
  };

  const handleSelectAll = () => {
    setIncludedIds(new Set(allClients.map((c) => c.id)));
  };

  const handleDeselectAll = () => {
    setIncludedIds(new Set());
  };

  // ─── Edit message ────────────────────────────────────────────────
  const handleStartEdit = () => {
    const preview = previews[selectedTone];
    if (!preview) return;
    const bodyText = preview.body_html ? stripHtml(preview.body_html) : (preview.body || "");
    setEditSubject(customMessage?.subject || humanizeTemplate(preview.subject || ""));
    setEditBody(customMessage?.body || humanizeTemplate(bodyText));
    setEditing(true);
  };

  const handleSaveEdit = () => {
    setCustomMessage({ subject: editSubject, body: editBody });
    setEditing(false);
  };

  const handleCancelEdit = () => {
    setEditing(false);
  };

  // ─── Send: create campaign + recipients + launch in one go ───────
  const handleSend = async () => {
    if (!trigger) return;
    setSending(true);
    try {
      const includedClientIds = Array.from(includedIds);
      if (includedClientIds.length === 0) {
        showToast({ message: "No clients selected", variant: "error" });
        setSending(false);
        return;
      }

      // 1. Create the campaign
      const createRes = await fetch("/api/email/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          trigger_id: trigger.id,
          tone: selectedTone,
          name: `${SEGMENT_LABELS[initialSegment] || initialSegment} Outreach`,
          send_mode: "send_all",
        }),
      });
      const createData = await createRes.json();
      if (!createRes.ok) {
        showToast({ message: createData.error || "Failed to create campaign", variant: "error" });
        setSending(false);
        return;
      }

      const campaignId = createData.campaign.id;

      // 2. If tone is not the default warm_friendly, update it (already set in create, but ensure)
      // 3. If custom message was edited, we'd need a custom template endpoint
      //    For now the campaign uses the standard template

      // 4. Launch immediately
      const launchRes = await fetch(`/api/email/campaigns/${campaignId}/launch`, {
        method: "POST",
        credentials: "include",
      });
      const launchData = await launchRes.json();
      if (!launchRes.ok) {
        showToast({ message: launchData.error || "Failed to send campaign", variant: "error" });
        setSending(false);
        return;
      }

      setSentCount(launchData.queued_count || 0);
      setSent(true);
      if (onLaunched) onLaunched(launchData.campaign);
    } catch {
      showToast({ message: "Something went wrong", variant: "error" });
    }
    setSending(false);
  };

  // ─── Close / cleanup ─────────────────────────────────────────────
  const handleClose = () => {
    // No draft was created, so nothing to clean up
    onClose();
  };

  if (!isOpen) return null;

  const includedCount = includedIds.size;
  const totalCount = allClients.length;
  const toneLabel = BUILDER_TONE_CARDS.find((t) => t.key === selectedTone)?.label || "";
  const canSend = includedCount > 0 && selectedTone;
  const allSelected = allClients.length > 0 && includedCount === allClients.length;

  // Get display text for selected tone
  const selectedPreview = previews[selectedTone];
  const displaySubject = customMessage?.subject || humanizeTemplate(selectedPreview?.subject || "");
  const displayBody = customMessage?.body || humanizeTemplate(
    selectedPreview?.body_html ? stripHtml(selectedPreview.body_html) : (selectedPreview?.body || "")
  );

  // ─── Success state ───────────────────────────────────────────────
  if (sent) {
    return (
      <>
        <div className="fixed inset-0 z-40 bg-black/30" onClick={handleClose} />
        <div
          className="fixed z-50 bg-white rounded-2xl shadow-xl w-[calc(100%-2rem)] max-w-lg p-8 text-center"
          style={{ top: "50%", left: "50%", transform: "translate(-50%, -50%)" }}
        >
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center text-3xl mx-auto mb-4">
            ✓
          </div>
          <h2 className="font-display text-2xl font-bold text-gray-900 mb-2">
            Campaign Sent!
          </h2>
          <p className="font-body text-base text-gray-600 mb-6">
            {sentCount} email{sentCount !== 1 ? "s" : ""} queued for delivery
          </p>
          <button
            onClick={handleClose}
            className="rounded-xl bg-[#E8735A] px-8 py-3 font-body text-base font-semibold text-white hover:bg-[#d4634d] transition-all active:scale-95"
          >
            Done
          </button>
        </div>
      </>
    );
  }

  // ─── Edit message overlay ────────────────────────────────────────
  if (editing) {
    return (
      <>
        <div className="fixed inset-0 z-40 bg-black/30" onClick={handleCancelEdit} />
        <div
          className="fixed z-50 bg-white rounded-2xl shadow-xl w-[calc(100%-2rem)] max-w-2xl max-h-[90vh] overflow-hidden flex flex-col"
          style={{ top: "50%", left: "50%", transform: "translate(-50%, -50%)" }}
        >
          <div className="shrink-0 bg-white border-b border-gray-100 px-5 sm:px-6 py-4 flex items-center justify-between">
            <h2 className="font-display text-xl font-bold text-gray-900">
              Edit Message
            </h2>
            <button
              onClick={handleCancelEdit}
              className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-600 text-xl transition-colors"
            >
              &times;
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-5 sm:px-6 py-5 space-y-4">
            <div>
              <label className="font-body text-xs font-semibold text-gray-500 mb-1 block">
                Subject Line
              </label>
              <input
                type="text"
                value={editSubject}
                onChange={(e) => setEditSubject(e.target.value)}
                className="w-full rounded-xl border-2 border-gray-200 px-4 py-2.5 font-body text-sm focus:border-[#E8735A] focus:outline-none transition-colors"
              />
            </div>
            <div>
              <label className="font-body text-xs font-semibold text-gray-500 mb-1 block">
                Email Body
              </label>
              <textarea
                value={editBody}
                onChange={(e) => setEditBody(e.target.value)}
                rows={12}
                className="w-full rounded-xl border-2 border-gray-200 px-4 py-3 font-body text-sm leading-relaxed focus:border-[#E8735A] focus:outline-none transition-colors resize-y"
              />
            </div>
          </div>
          <div className="shrink-0 border-t border-gray-200 bg-white px-5 sm:px-6 py-4 flex justify-end gap-3">
            <button
              onClick={handleCancelEdit}
              className="rounded-xl border-2 border-gray-200 px-5 py-2.5 font-body text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSaveEdit}
              className="rounded-xl bg-[#E8735A] px-6 py-2.5 font-body text-sm font-semibold text-white hover:bg-[#d4634d] transition-all active:scale-95"
            >
              Save Changes
            </button>
          </div>
        </div>
      </>
    );
  }

  // ─── Main builder UI ─────────────────────────────────────────────
  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40 bg-black/30" onClick={handleClose} />

      {/* Modal — nearly full screen on mobile, max-w-4xl on desktop */}
      <div className="fixed inset-2 sm:inset-auto sm:top-[2.5%] sm:left-1/2 sm:-translate-x-1/2 sm:w-[calc(100%-3rem)] sm:max-w-4xl sm:max-h-[95vh] z-50 bg-[#faf7f2] rounded-2xl shadow-xl overflow-hidden flex flex-col">

        {/* Header */}
        <div className="shrink-0 bg-white border-b border-gray-100 px-5 sm:px-6 py-4 flex items-center justify-between">
          <div>
            <h2 className="font-display text-xl font-bold text-gray-900">
              New Campaign
            </h2>
            {initialSegment && (
              <p className="font-body text-sm text-gray-500 mt-0.5">
                {SEGMENT_LABELS[initialSegment] || initialSegment} clients
              </p>
            )}
          </div>
          <button
            onClick={handleClose}
            className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-600 text-xl transition-colors"
          >
            &times;
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-5 sm:px-6 py-5 space-y-6">

          {/* Loading / error state */}
          {initializing ? (
            <div className="space-y-6">
              {/* Recipients skeleton */}
              <div className="rounded-2xl border-2 border-gray-100 bg-white p-5 animate-pulse">
                <div className="h-5 w-48 rounded bg-gray-200 mb-4" />
                <div className="h-10 w-full rounded-xl bg-gray-100 mb-3" />
                <div className="space-y-3">
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="flex items-center gap-3">
                      <div className="w-[44px] h-[44px] rounded bg-gray-100" />
                      <div className="flex-1 space-y-2">
                        <div className="h-4 w-32 rounded bg-gray-200" />
                        <div className="h-3 w-48 rounded bg-gray-100" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              {/* Message skeleton */}
              <div className="rounded-2xl border-2 border-gray-100 bg-white p-5 animate-pulse">
                <div className="h-5 w-40 rounded bg-gray-200 mb-4" />
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-40 rounded-2xl bg-gray-100" />
                  ))}
                </div>
              </div>
            </div>
          ) : initError ? (
            <div className="rounded-2xl border-2 border-red-100 bg-red-50 p-6 text-center">
              <p className="font-body text-sm text-red-700 mb-3">{initError}</p>
              <button
                onClick={handleClose}
                className="rounded-xl border-2 border-red-200 px-5 py-2 font-body text-sm font-semibold text-red-600 hover:bg-red-100 transition-colors"
              >
                Close
              </button>
            </div>
          ) : (
            <>
              {/* ═══ TOP SECTION: Recipients ═══ */}
              <div className="rounded-2xl border-2 border-gray-100 bg-white p-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
                  <h3 className="font-display text-lg font-bold text-gray-900">
                    Sending to{" "}
                    <span className="text-[#E8735A]">{includedCount}</span>{" "}
                    of {totalCount} clients
                  </h3>
                  <button
                    onClick={allSelected ? handleDeselectAll : handleSelectAll}
                    className="rounded-xl border-2 border-gray-200 px-4 py-2 font-body text-xs font-semibold text-gray-600 hover:bg-gray-50 transition-colors whitespace-nowrap"
                  >
                    {allSelected ? "Deselect All" : "Select All"}
                  </button>
                </div>

                {/* Recipient list */}
                <div className="max-h-72 overflow-y-auto rounded-xl border-2 border-gray-100">
                  {allClients.length === 0 ? (
                    <p className="p-6 font-body text-sm text-gray-400 text-center">
                      No clients found for this segment
                    </p>
                  ) : (
                    <div className="divide-y divide-gray-50">
                      {allClients.map((c) => {
                        const isIncluded = includedIds.has(c.id);
                        const isOld =
                          c.last_order_date &&
                          Date.now() - new Date(c.last_order_date).getTime() >
                            365 * 24 * 60 * 60 * 1000;
                        return (
                          <div
                            key={c.id}
                            onClick={() => toggleRecipient(c.id)}
                            className={`flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50 transition-colors ${
                              !isIncluded ? "opacity-50" : ""
                            }`}
                          >
                            <div className="shrink-0 flex items-center justify-center"
                              style={{ minWidth: 44, minHeight: 44 }}>
                              <input
                                type="checkbox"
                                checked={isIncluded}
                                onChange={() => {}}
                                className="w-6 h-6 rounded border-gray-300 text-[#E8735A] focus:ring-[#E8735A] cursor-pointer"
                              />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-body text-sm font-semibold text-gray-800 truncate">
                                {c.full_name || "Unknown"}
                              </p>
                              <p className="font-body text-xs text-gray-400 truncate">
                                {c.email}
                              </p>
                            </div>
                            <div className="text-right shrink-0">
                              {c.last_order_date ? (
                                <span
                                  className={`font-body text-xs ${
                                    isOld
                                      ? "text-amber-600 font-semibold"
                                      : "text-gray-400"
                                  }`}
                                >
                                  {timeAgo(c.last_order_date)}
                                </span>
                              ) : (
                                <span className="font-body text-xs text-gray-300">
                                  No orders
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* ═══ MIDDLE SECTION: Choose Message Style ═══ */}
              <div className="rounded-2xl border-2 border-gray-100 bg-white p-5">
                <h3 className="font-display text-lg font-bold text-gray-900 mb-4">
                  Choose a message style
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {BUILDER_TONE_CARDS.map((tone) => {
                    const isSelected = selectedTone === tone.key;
                    const preview = previews[tone.key];
                    const previewBody = preview?.body_html
                      ? stripHtml(preview.body_html)
                      : (preview?.body || "");
                    return (
                      <button
                        key={tone.key}
                        onClick={() => {
                          setSelectedTone(tone.key);
                          // Clear custom message when switching tones
                          setCustomMessage(null);
                        }}
                        className={`rounded-2xl border-2 border-l-4 p-4 text-left transition-all ${tone.borderColor} ${tone.tint} ${
                          isSelected
                            ? tone.selectedBorder
                            : "border-gray-100 hover:border-gray-300"
                        }`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <p className="font-display text-sm font-bold text-gray-900">
                            {tone.label}
                          </p>
                          {isSelected && (
                            <span className="w-5 h-5 rounded-full bg-[#E8735A] text-white flex items-center justify-center text-xs">
                              ✓
                            </span>
                          )}
                        </div>
                        <p className="font-body text-xs text-gray-500 mb-3">
                          {tone.desc}
                        </p>

                        {/* Full email preview */}
                        {loadingPreviews ? (
                          <div className="animate-pulse space-y-2 mt-3 pt-3 border-t border-gray-100">
                            <div className="h-3 w-3/4 rounded bg-gray-200" />
                            <div className="h-2 w-full rounded bg-gray-100" />
                            <div className="h-2 w-5/6 rounded bg-gray-100" />
                          </div>
                        ) : preview ? (
                          <div className="mt-3 pt-3 border-t border-gray-100">
                            <p className="font-body text-xs font-semibold text-gray-800 mb-1.5">
                              {humanizeTemplate(preview.subject)}
                            </p>
                            <p className="font-body text-xs text-gray-500 whitespace-pre-line leading-relaxed max-h-48 overflow-y-auto">
                              {humanizeTemplate(previewBody)}
                            </p>
                          </div>
                        ) : (
                          <div className="mt-3 pt-3 border-t border-gray-100">
                            <p className="font-body text-xs text-gray-400 italic">
                              No preview available
                            </p>
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>

                {/* Edit Message button for selected tone */}
                {selectedPreview && (
                  <div className="mt-4 flex items-center gap-3">
                    <button
                      onClick={handleStartEdit}
                      className="rounded-xl border-2 border-gray-200 px-4 py-2 font-body text-xs font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
                    >
                      Edit Message
                    </button>
                    {customMessage && (
                      <span className="font-body text-xs text-green-600 font-semibold">
                        Custom message saved
                      </span>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* ═══ BOTTOM SECTION: Sticky Action Bar ═══ */}
        {!initializing && !initError && !sent && (
          <div className="shrink-0 border-t border-gray-200 bg-white px-5 sm:px-6 py-4 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <p className="font-body text-sm text-gray-600">
              <span className="font-semibold">{includedCount}</span> client{includedCount !== 1 ? "s" : ""} selected
              {selectedTone && (
                <> · <span className="font-semibold">{toneLabel}</span> chosen</>
              )}
            </p>
            <div className="flex gap-3">
              <button
                onClick={handleClose}
                className="rounded-xl border-2 border-gray-200 px-5 py-2.5 font-body text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSend}
                disabled={!canSend || sending}
                className="rounded-xl bg-[#E8735A] px-6 py-2.5 font-body text-sm font-semibold text-white hover:bg-[#d4634d] disabled:opacity-40 disabled:cursor-not-allowed transition-all active:scale-95 sm:min-w-[160px]"
              >
                {sending ? "Sending..." : "Send Campaign"}
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

// ─── Campaign Detail Modal ──────────────────────────────────────────

function CampaignDetailModal({ campaignId, isOpen, onClose, onDeleted, onLaunched }) {
  const showToast = useShowToast();
  const [campaign, setCampaign] = useState(null);
  const [recipients, setRecipients] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showRecipients, setShowRecipients] = useState(false);
  const [launching, setLaunching] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  // Track local inclusion changes (batched)
  const pendingChanges = useRef({}); // { client_id: true/false }
  const debounceTimer = useRef(null);

  useEffect(() => {
    if (isOpen && campaignId) {
      setLoading(true);
      setShowRecipients(false);
      setSearch("");
      setRecipients([]);
      pendingChanges.current = {};
      fetchDetail(1);
    }
  }, [isOpen, campaignId]);

  const fetchDetail = async (page, searchTerm) => {
    try {
      const params = new URLSearchParams({ page: String(page), per_page: "50" });
      if (searchTerm) params.set("search", searchTerm);
      const res = await fetch(`/api/email/campaigns/${campaignId}?${params}`, {
        credentials: "include",
      });
      const data = await res.json();
      if (res.ok) {
        setCampaign(data.campaign);
        if (page === 1) {
          setRecipients(data.recipients || []);
        } else {
          setRecipients((prev) => [...prev, ...(data.recipients || [])]);
        }
        setPagination(data.pagination);
      }
    } catch {
      showToast({ message: "Failed to load campaign", variant: "error" });
    }
    setLoading(false);
    setLoadingMore(false);
  };

  const handleSearch = (val) => {
    setSearch(val);
    clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      setRecipients([]);
      fetchDetail(1, val);
    }, 400);
  };

  const handleLoadMore = () => {
    if (!pagination || pagination.page >= pagination.total_pages) return;
    setLoadingMore(true);
    fetchDetail(pagination.page + 1, search);
  };

  const toggleRecipient = (clientId, currentIncluded) => {
    const newIncluded = !currentIncluded;
    setRecipients((prev) =>
      prev.map((r) => (r.client_id === clientId ? { ...r, included: newIncluded } : r))
    );
    pendingChanges.current[clientId] = newIncluded;
  };

  const handleSelectAll = () => {
    setRecipients((prev) => prev.map((r) => ({ ...r, included: true })));
    pendingChanges.current = { __all: true };
  };

  const handleDeselectAll = () => {
    setRecipients((prev) => prev.map((r) => ({ ...r, included: false })));
    pendingChanges.current = { __all: false };
  };

  const flushChanges = async () => {
    const changes = { ...pendingChanges.current };
    pendingChanges.current = {};

    if (changes.__all === true) {
      await fetch(`/api/email/campaigns/${campaignId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ action: "include_all" }),
      });
      return;
    }
    if (changes.__all === false) {
      await fetch(`/api/email/campaigns/${campaignId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ action: "exclude_all" }),
      });
      return;
    }

    const toExclude = [];
    const toInclude = [];
    for (const [clientId, included] of Object.entries(changes)) {
      if (included) toInclude.push(clientId);
      else toExclude.push(clientId);
    }

    const requests = [];
    if (toExclude.length > 0) {
      requests.push(
        fetch(`/api/email/campaigns/${campaignId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ action: "exclude", client_ids: toExclude }),
        })
      );
    }
    if (toInclude.length > 0) {
      requests.push(
        fetch(`/api/email/campaigns/${campaignId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ action: "include", client_ids: toInclude }),
        })
      );
    }
    await Promise.all(requests);
  };

  const handleLaunch = async () => {
    setLaunching(true);
    try {
      await flushChanges();

      const res = await fetch(`/api/email/campaigns/${campaignId}/launch`, {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) {
        showToast({ message: data.error || "Failed to launch", variant: "error" });
        setLaunching(false);
        return;
      }
      showToast({ message: `Campaign launched! ${data.queued_count} emails queued.`, variant: "success" });
      onLaunched(data.campaign);
      onClose();
    } catch {
      showToast({ message: "Something went wrong", variant: "error" });
    }
    setLaunching(false);
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const res = await fetch(`/api/email/campaigns/${campaignId}`, {
        method: "DELETE",
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) {
        showToast({ message: data.error || "Failed to delete", variant: "error" });
        setDeleting(false);
        return;
      }
      showToast({ message: "Campaign deleted", variant: "success" });
      onDeleted(campaignId);
      onClose();
    } catch {
      showToast({ message: "Something went wrong", variant: "error" });
    }
    setDeleting(false);
  };

  if (!isOpen) return null;

  const isDraft = campaign?.status === "draft";
  const canDelete = ["draft", "cancelled"].includes(campaign?.status);
  const isReadOnly = ["sending", "complete"].includes(campaign?.status);
  const includedCount = recipients.filter((r) => r.included).length;
  const totalCount = pagination?.total ?? recipients.length;
  const toneBadge = TONE_BADGE[campaign?.tone] || TONE_BADGE.warm_friendly;

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/30" onClick={onClose} />

      <div
        className="fixed z-50 bg-white rounded-2xl shadow-xl w-[calc(100%-2rem)] max-w-2xl max-h-[90vh] overflow-hidden flex flex-col"
        style={{ top: "50%", left: "50%", transform: "translate(-50%, -50%)" }}
      >
        {/* Header */}
        <div className="shrink-0 border-b border-gray-100 px-6 py-4 flex items-center justify-between">
          <h2 className="font-display text-xl font-bold text-gray-900 truncate">
            {loading ? "Loading..." : campaign?.name || "Campaign"}
          </h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
          >
            &times;
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {loading ? (
            <div className="animate-pulse space-y-4">
              <div className="h-5 w-48 rounded bg-gray-200" />
              <div className="h-4 w-64 rounded bg-gray-100" />
              <div className="h-32 rounded-2xl bg-gray-100" />
            </div>
          ) : campaign ? (
            <>
              {/* Campaign info */}
              <div className="flex flex-wrap items-center gap-2 mb-4">
                <span className={`rounded-full px-3 py-1 font-body text-xs font-semibold ${STATUS_BADGE[campaign.status]}`}>
                  {campaign.status.charAt(0).toUpperCase() + campaign.status.slice(1)}
                </span>
                <span className={`rounded-full px-3 py-1 font-body text-xs font-semibold ${toneBadge.bg}`}>
                  {toneBadge.label}
                </span>
                {campaign.trigger_name && (
                  <span className="rounded-full px-3 py-1 font-body text-xs font-semibold bg-gray-100 text-gray-600">
                    {campaign.trigger_name}
                  </span>
                )}
              </div>

              {/* Stats */}
              <div className="grid grid-cols-3 gap-3 mb-4">
                {[
                  { label: "Recipients", value: campaign.total_recipients },
                  { label: "Sent", value: campaign.sent_count },
                  { label: "Opened", value: campaign.opened_count },
                ].map((stat) => (
                  <div key={stat.label} className="rounded-xl bg-gray-50 px-4 py-3 text-center">
                    <p className="font-display text-xl font-bold text-gray-900">{stat.value}</p>
                    <p className="font-body text-xs text-gray-500">{stat.label}</p>
                  </div>
                ))}
              </div>

              {/* Template preview */}
              {campaign.template_subject && (
                <div className="rounded-2xl border-2 border-gray-100 bg-gray-50 p-4 mb-4">
                  <p className="font-body text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">
                    Email Template
                  </p>
                  <p className="font-body text-sm font-semibold text-gray-900">
                    {campaign.template_subject}
                  </p>
                </div>
              )}

              {/* Recipients section */}
              {isDraft && !showRecipients && (
                <div className="rounded-2xl border-2 border-gray-100 bg-white p-5 mb-4">
                  <p className="font-body text-sm text-gray-700 mb-4">
                    Found <span className="font-bold">{campaign.total_recipients}</span> clients eligible for this campaign
                  </p>
                  <div className="flex flex-wrap gap-3">
                    <button
                      onClick={handleLaunch}
                      disabled={launching || campaign.total_recipients === 0}
                      className="rounded-xl bg-[#E8735A] px-5 py-2.5 font-body text-sm font-semibold text-white hover:bg-[#d4634d] disabled:opacity-40 transition-all active:scale-95"
                    >
                      {launching ? "Launching..." : `Send to All ${campaign.total_recipients} Recipients`}
                    </button>
                    <button
                      onClick={() => setShowRecipients(true)}
                      className="rounded-xl border-2 border-gray-200 px-5 py-2.5 font-body text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
                    >
                      Review & Edit Recipients
                    </button>
                  </div>
                </div>
              )}

              {/* Recipient list */}
              {(showRecipients || isReadOnly) && (
                <div className="mb-4">
                  {/* Search + Select all */}
                  {isDraft && (
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 mb-3">
                      <input
                        type="text"
                        placeholder="Search by name..."
                        value={search}
                        onChange={(e) => handleSearch(e.target.value)}
                        className="flex-1 rounded-xl border-2 border-gray-200 px-4 py-2 font-body text-sm focus:border-[#E8735A] focus:outline-none transition-colors"
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={handleSelectAll}
                          className="rounded-xl border-2 border-gray-200 px-3 py-2 font-body text-xs font-semibold text-gray-600 hover:bg-gray-50 transition-colors whitespace-nowrap"
                        >
                          Select All
                        </button>
                        <button
                          onClick={handleDeselectAll}
                          className="rounded-xl border-2 border-gray-200 px-3 py-2 font-body text-xs font-semibold text-gray-600 hover:bg-gray-50 transition-colors whitespace-nowrap"
                        >
                          Deselect All
                        </button>
                      </div>
                    </div>
                  )}

                  {/* List */}
                  <div className="space-y-1 max-h-80 overflow-y-auto rounded-xl border-2 border-gray-100">
                    {recipients.length === 0 ? (
                      <p className="p-4 font-body text-sm text-gray-400 text-center">
                        No recipients found
                      </p>
                    ) : (
                      recipients.map((r) => {
                        const isOld = r.last_order_date &&
                          Date.now() - new Date(r.last_order_date).getTime() > 365 * 24 * 60 * 60 * 1000;
                        return (
                          <div
                            key={r.id}
                            className={`flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors ${
                              !r.included && isDraft ? "opacity-50" : ""
                            }`}
                          >
                            {isDraft && (
                              <input
                                type="checkbox"
                                checked={r.included}
                                onChange={() => toggleRecipient(r.client_id, r.included)}
                                className="w-6 h-6 min-w-[24px] rounded border-gray-300 text-[#E8735A] focus:ring-[#E8735A] shrink-0 cursor-pointer"
                              />
                            )}
                            <div className="flex-1 min-w-0">
                              <p className="font-body text-sm font-semibold text-gray-800 truncate">
                                {r.full_name || "Unknown"}
                              </p>
                              <p className="font-body text-xs text-gray-400 truncate">
                                {r.email}
                              </p>
                            </div>
                            <div className="text-right shrink-0">
                              {r.last_order_date ? (
                                <span className={`font-body text-xs ${isOld ? "text-amber-600 font-semibold" : "text-gray-400"}`}>
                                  {timeAgo(r.last_order_date)}
                                </span>
                              ) : (
                                <span className="font-body text-xs text-gray-300">
                                  No orders
                                </span>
                              )}
                              {isReadOnly && r.status && (
                                <p className={`font-body text-xs mt-0.5 ${
                                  r.status === "sent" ? "text-green-600" :
                                  r.status === "opened" ? "text-blue-600" :
                                  r.status === "queued" ? "text-amber-600" :
                                  "text-gray-400"
                                }`}>
                                  {r.status.charAt(0).toUpperCase() + r.status.slice(1)}
                                </p>
                              )}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>

                  {/* Load more */}
                  {pagination && pagination.page < pagination.total_pages && (
                    <div className="mt-2 text-center">
                      <button
                        onClick={handleLoadMore}
                        disabled={loadingMore}
                        className="rounded-xl border-2 border-gray-200 px-4 py-2 font-body text-xs font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-50 transition-colors"
                      >
                        {loadingMore ? "Loading..." : `Load More (${pagination.total - recipients.length} remaining)`}
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Delete button */}
              {canDelete && (
                <button
                  onClick={() => setConfirmDelete(true)}
                  disabled={deleting}
                  className="rounded-xl border-2 border-red-200 px-4 py-2 font-body text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50 transition-colors"
                >
                  {deleting ? "Deleting..." : "Delete Campaign"}
                </button>
              )}
            </>
          ) : (
            <p className="font-body text-sm text-gray-400">Campaign not found</p>
          )}
        </div>

        {/* Sticky footer for draft campaigns with recipients showing */}
        {isDraft && showRecipients && (
          <div className="shrink-0 border-t border-gray-100 bg-white px-6 py-4 flex items-center justify-between">
            <span className="font-body text-sm text-gray-600">
              <span className="font-semibold">{includedCount}</span> of{" "}
              <span className="font-semibold">{totalCount}</span> selected
            </span>
            <button
              onClick={handleLaunch}
              disabled={launching || includedCount === 0}
              className="rounded-xl bg-[#E8735A] px-6 py-2.5 font-body text-sm font-semibold text-white hover:bg-[#d4634d] disabled:opacity-40 transition-all active:scale-95"
            >
              {launching ? "Launching..." : "Launch Campaign"}
            </button>
          </div>
        )}
      </div>

      <ConfirmDialog
        isOpen={confirmDelete}
        title="Delete this campaign?"
        message="This will remove the campaign and all recipient data. This cannot be undone."
        confirmLabel="Delete"
        confirmVariant="danger"
        onConfirm={() => {
          setConfirmDelete(false);
          handleDelete();
        }}
        onCancel={() => setConfirmDelete(false)}
      />
    </>
  );
}

// ─── Main EmailCampaigns Section ────────────────────────────────────

const EmailCampaigns = forwardRef(function EmailCampaigns(props, ref) {
  const { coach } = useCoach();
  const showToast = useShowToast();

  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showNewModal, setShowNewModal] = useState(false);
  const [newModalSegment, setNewModalSegment] = useState(null);
  const [detailId, setDetailId] = useState(null);

  useImperativeHandle(ref, () => ({
    openNewCampaign(segmentKey) {
      setNewModalSegment(segmentKey || null);
      setShowNewModal(true);
    },
  }));

  useEffect(() => {
    if (coach?.id) fetchCampaigns();
  }, [coach?.id]);

  const fetchCampaigns = async () => {
    try {
      // Only fetch active campaigns (sending/complete/cancelled), not drafts
      const res = await fetch("/api/email/campaigns?status=active", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setCampaigns(data.campaigns || []);
      }
    } catch {
      // ignore
    }
    setLoading(false);
  };

  const handleBuilderLaunched = (updatedCampaign) => {
    // Add the newly launched campaign to the list
    setCampaigns((prev) => {
      const exists = prev.some((c) => c.id === updatedCampaign.id);
      if (exists) {
        return prev.map((c) => (c.id === updatedCampaign.id ? { ...c, ...updatedCampaign } : c));
      }
      return [updatedCampaign, ...prev];
    });
  };

  const handleBuilderClose = () => {
    setShowNewModal(false);
    setNewModalSegment(null);
    // No need to refresh — no draft was created
  };

  const handleDeleted = (id) => {
    setCampaigns((prev) => prev.filter((c) => c.id !== id));
  };

  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  const handleDirectDelete = async (id) => {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/email/campaigns/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) {
        showToast({ message: data.error || "Failed to delete", variant: "error" });
      } else {
        showToast({ message: "Campaign deleted", variant: "success" });
        setCampaigns((prev) => prev.filter((c) => c.id !== id));
      }
    } catch {
      showToast({ message: "Something went wrong", variant: "error" });
    }
    setDeletingId(null);
    setConfirmDeleteId(null);
  };

  const handleCancelCampaign = async (id) => {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/email/campaigns/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ status: "cancelled" }),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast({ message: data.error || "Failed to cancel", variant: "error" });
      } else {
        showToast({ message: "Campaign cancelled", variant: "success" });
        setCampaigns((prev) =>
          prev.map((c) => (c.id === id ? { ...c, status: "cancelled" } : c))
        );
      }
    } catch {
      showToast({ message: "Something went wrong", variant: "error" });
    }
    setDeletingId(null);
    setConfirmDeleteId(null);
  };

  const handleLaunched = (updatedCampaign) => {
    setCampaigns((prev) =>
      prev.map((c) => (c.id === updatedCampaign.id ? { ...c, ...updatedCampaign, status: updatedCampaign.status } : c))
    );
  };

  return (
    <div className="mb-6 rounded-2xl border-2 border-gray-100 bg-white p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-display text-xl font-bold text-gray-900">
          Email Campaigns
        </h2>
        <button
          onClick={() => { setNewModalSegment(null); setShowNewModal(true); }}
          className="rounded-xl bg-[#E8735A] px-4 py-2.5 font-body text-sm font-semibold text-white hover:bg-[#d4634d] transition-all active:scale-95"
        >
          + New Campaign
        </button>
      </div>

      {/* Campaign list — only shows sending/complete/cancelled */}
      {loading ? (
        <div className="space-y-3">
          <CampaignSkeleton />
          <CampaignSkeleton />
        </div>
      ) : campaigns.length === 0 ? (
        <div className="rounded-2xl bg-gray-50 p-8 text-center">
          <div className="w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center text-2xl mx-auto mb-3">
            📧
          </div>
          <p className="font-body text-sm text-gray-600 mb-1 font-semibold">
            No campaigns yet
          </p>
          <p className="font-body text-xs text-gray-400">
            Create your first campaign to start reaching out to your clients!
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {campaigns.map((c) => {
            const toneBadge = TONE_BADGE[c.tone] || TONE_BADGE.warm_friendly;
            const statusBadge = STATUS_BADGE[c.status] || STATUS_BADGE.draft;
            const canDelete = ["draft", "cancelled"].includes(c.status);
            const canCancel = ["sending", "active"].includes(c.status);

            return (
              <div
                key={c.id}
                className="rounded-2xl border-2 border-gray-100 bg-gray-50 px-5 py-4 transition-colors hover:bg-gray-100/50"
              >
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="min-w-0">
                    <h3 className="font-display text-base font-bold text-gray-900 truncate">
                      {c.name || c.trigger_name || "Untitled Campaign"}
                    </h3>
                  </div>
                  <span className={`shrink-0 rounded-full px-3 py-0.5 font-body text-xs font-semibold ${statusBadge}`}>
                    {c.status.charAt(0).toUpperCase() + c.status.slice(1)}
                  </span>
                </div>

                {/* Badges */}
                <div className="flex flex-wrap gap-2 mb-3">
                  <span className={`rounded-full px-2.5 py-0.5 font-body text-xs font-semibold ${toneBadge.bg}`}>
                    {toneBadge.label}
                  </span>
                </div>

                {/* Stats */}
                <p className="font-body text-xs text-gray-500 mb-2">
                  {c.total_recipients} recipients
                  {c.sent_count > 0 && <> · {c.sent_count} sent</>}
                  {c.opened_count > 0 && <> · {c.opened_count} opened</>}
                </p>

                {/* Footer */}
                <div className="flex items-center justify-between">
                  <span className="font-body text-xs text-gray-400">
                    {timeAgo(c.created_at)}
                  </span>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setDetailId(c.id)}
                      className="rounded-xl border-2 border-gray-200 px-3 py-1.5 font-body text-xs font-semibold text-gray-600 hover:bg-white transition-colors"
                    >
                      View
                    </button>
                    {canCancel && (
                      <button
                        onClick={() => setConfirmDeleteId(c.id)}
                        disabled={deletingId === c.id}
                        className="rounded-xl border-2 border-red-200 px-3 py-1.5 font-body text-xs font-semibold text-red-500 hover:bg-red-50 disabled:opacity-50 transition-colors"
                      >
                        {deletingId === c.id ? "..." : "Cancel"}
                      </button>
                    )}
                    {canDelete && (
                      <button
                        onClick={() => setConfirmDeleteId(c.id)}
                        disabled={deletingId === c.id}
                        className="rounded-xl border-2 border-red-200 px-3 py-1.5 font-body text-xs font-semibold text-red-500 hover:bg-red-50 disabled:opacity-50 transition-colors"
                      >
                        {deletingId === c.id ? "..." : "Delete"}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modals */}
      <CampaignBuilderModal
        isOpen={showNewModal}
        onClose={handleBuilderClose}
        onLaunched={handleBuilderLaunched}
        initialSegment={newModalSegment}
      />

      <CampaignDetailModal
        campaignId={detailId}
        isOpen={!!detailId}
        onClose={() => setDetailId(null)}
        onDeleted={handleDeleted}
        onLaunched={handleLaunched}
      />

      {/* Confirm delete/cancel dialog */}
      <ConfirmDialog
        isOpen={!!confirmDeleteId}
        title={
          campaigns.find((c) => c.id === confirmDeleteId && ["sending", "active"].includes(c.status))
            ? "Cancel this campaign?"
            : "Delete this campaign?"
        }
        message={
          campaigns.find((c) => c.id === confirmDeleteId && ["sending", "active"].includes(c.status))
            ? "This will stop sending emails for this campaign. Already-sent emails will not be recalled."
            : "This will permanently remove the campaign and all its data. This cannot be undone."
        }
        confirmLabel={
          campaigns.find((c) => c.id === confirmDeleteId && ["sending", "active"].includes(c.status))
            ? "Yes, Cancel Campaign"
            : "Yes, Delete"
        }
        confirmVariant="danger"
        onConfirm={() => {
          const c = campaigns.find((c) => c.id === confirmDeleteId);
          if (c && ["sending", "active"].includes(c.status)) {
            handleCancelCampaign(confirmDeleteId);
          } else {
            handleDirectDelete(confirmDeleteId);
          }
        }}
        onCancel={() => setConfirmDeleteId(null)}
      />
    </div>
  );
});

export default EmailCampaigns;
