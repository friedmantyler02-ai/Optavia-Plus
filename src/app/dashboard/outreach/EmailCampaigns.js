"use client";

import { useState, useEffect, useCallback, useRef } from "react";
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

// ─── New Campaign Modal ─────────────────────────────────────────────

function NewCampaignModal({ isOpen, onClose, onCreated }) {
  const showToast = useShowToast();
  const [step, setStep] = useState(1);
  const [triggers, setTriggers] = useState([]);
  const [loadingTriggers, setLoadingTriggers] = useState(true);
  const [selectedTrigger, setSelectedTrigger] = useState(null);
  const [selectedTone, setSelectedTone] = useState(null);
  const [campaignName, setCampaignName] = useState("");
  const [templatePreview, setTemplatePreview] = useState(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [creating, setCreating] = useState(false);
  const hasChanges = step > 1 && (selectedTrigger || selectedTone || campaignName);

  useEffect(() => {
    if (isOpen) {
      fetchTriggers();
      // Reset state
      setStep(1);
      setSelectedTrigger(null);
      setSelectedTone(null);
      setCampaignName("");
      setTemplatePreview(null);
    }
  }, [isOpen]);

  const fetchTriggers = async () => {
    setLoadingTriggers(true);
    try {
      const res = await fetch("/api/email/triggers", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setTriggers(data.triggers || []);
      }
    } catch {
      // ignore
    }
    setLoadingTriggers(false);
  };

  const fetchTemplatePreview = async (triggerId, tone) => {
    setLoadingPreview(true);
    try {
      const res = await fetch(
        `/api/email/templates/preview?trigger_id=${triggerId}&tone=${tone}`,
        { credentials: "include" }
      );
      if (res.ok) {
        const data = await res.json();
        setTemplatePreview(data.template || null);
      }
    } catch {
      setTemplatePreview(null);
    }
    setLoadingPreview(false);
  };

  const handleToneSelect = (tone) => {
    setSelectedTone(tone);
    if (selectedTrigger) {
      fetchTemplatePreview(selectedTrigger.id, tone);
    }
  };

  const handleCreate = async () => {
    if (!selectedTrigger || !selectedTone) return;
    setCreating(true);
    try {
      const res = await fetch("/api/email/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          trigger_id: selectedTrigger.id,
          tone: selectedTone,
          name: campaignName || undefined,
          send_mode: "review",
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast({ message: data.error || "Failed to create campaign", variant: "error" });
        setCreating(false);
        return;
      }
      showToast({ message: "Campaign created!", variant: "success" });
      onCreated(data.campaign);
    } catch {
      showToast({ message: "Something went wrong", variant: "error" });
    }
    setCreating(false);
  };

  const handleClose = () => {
    if (hasChanges && !confirm("You have unsaved changes. Discard them?")) return;
    onClose();
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40 bg-black/30" onClick={handleClose} />

      {/* Modal */}
      <div className="fixed z-50 bg-white rounded-2xl shadow-xl w-[calc(100%-2rem)] max-w-2xl max-h-[90vh] overflow-y-auto"
        style={{ top: "50%", left: "50%", transform: "translate(-50%, -50%)" }}>

        {/* Header */}
        <div className="sticky top-0 z-10 bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between rounded-t-2xl">
          <h2 className="font-display text-xl font-bold text-gray-900">
            New Email Campaign
          </h2>
          <button
            onClick={handleClose}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
          >
            &times;
          </button>
        </div>

        {/* Step indicator */}
        <div className="px-6 pt-4 flex items-center gap-2">
          {[1, 2].map((s) => (
            <div key={s} className="flex items-center gap-2">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center font-body text-xs font-bold ${
                step >= s ? "bg-[#E8735A] text-white" : "bg-gray-100 text-gray-400"
              }`}>
                {s}
              </div>
              <span className={`font-body text-sm ${step >= s ? "text-gray-700" : "text-gray-400"}`}>
                {s === 1 ? "Campaign Type" : "Tone & Preview"}
              </span>
              {s < 2 && <div className="w-8 h-px bg-gray-200" />}
            </div>
          ))}
        </div>

        <div className="px-6 py-5">
          {/* Step 1: Choose trigger */}
          {step === 1 && (
            <>
              <p className="font-body text-sm text-gray-500 mb-4">
                Choose who to reach out to
              </p>
              {loadingTriggers ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="h-24 animate-pulse rounded-2xl bg-gray-100" />
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {triggers.map((trigger) => {
                    const isSelected = selectedTrigger?.id === trigger.id;
                    return (
                      <button
                        key={trigger.id}
                        onClick={() => setSelectedTrigger(trigger)}
                        className={`rounded-2xl border-2 p-4 text-left transition-all ${
                          isSelected
                            ? "border-[#E8735A] bg-orange-50 ring-2 ring-[#E8735A]/30"
                            : "border-gray-100 bg-white hover:border-gray-300"
                        }`}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xl">
                            {TRIGGER_ICONS[trigger.trigger_type] || "📧"}
                          </span>
                          <span className="font-display text-sm font-bold text-gray-900">
                            {trigger.name}
                          </span>
                        </div>
                        <p className="font-body text-xs text-gray-500">
                          {trigger.description || `${trigger.trigger_type} trigger`}
                        </p>
                      </button>
                    );
                  })}
                </div>
              )}
              <div className="mt-6 flex justify-end">
                <button
                  onClick={() => setStep(2)}
                  disabled={!selectedTrigger}
                  className="rounded-xl bg-[#E8735A] px-6 py-2.5 font-body text-sm font-semibold text-white hover:bg-[#d4634d] disabled:opacity-40 disabled:cursor-not-allowed transition-all active:scale-95"
                >
                  Next
                </button>
              </div>
            </>
          )}

          {/* Step 2: Choose tone + preview */}
          {step === 2 && (
            <>
              <p className="font-body text-sm text-gray-500 mb-4">
                Pick the vibe for your emails
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {TONE_CARDS.map((tone) => {
                  const isSelected = selectedTone === tone.key;
                  return (
                    <button
                      key={tone.key}
                      onClick={() => handleToneSelect(tone.key)}
                      className={`rounded-2xl border-2 p-4 text-left transition-all ${
                        isSelected ? tone.selectedBg : tone.bg
                      }`}
                    >
                      <p className="font-display text-sm font-bold text-gray-900 mb-1">
                        {tone.label}
                      </p>
                      <p className="font-body text-xs text-gray-600">
                        {tone.desc}
                      </p>
                    </button>
                  );
                })}
              </div>

              {/* Template preview */}
              {selectedTone && (
                <div className="mt-4 rounded-2xl border-2 border-gray-100 bg-gray-50 p-5">
                  <p className="font-body text-xs font-semibold uppercase tracking-wide text-gray-400 mb-3">
                    Email Preview
                  </p>
                  {loadingPreview ? (
                    <div className="animate-pulse space-y-2">
                      <div className="h-4 w-3/4 rounded bg-gray-200" />
                      <div className="h-3 w-full rounded bg-gray-200" />
                      <div className="h-3 w-5/6 rounded bg-gray-200" />
                      <div className="h-3 w-4/6 rounded bg-gray-200" />
                    </div>
                  ) : templatePreview ? (
                    <>
                      <p className="font-body text-sm font-semibold text-gray-900 mb-2">
                        Subject: {templatePreview.subject}
                      </p>
                      <div className="font-body text-sm text-gray-600 whitespace-pre-line leading-relaxed">
                        {templatePreview.body}
                      </div>
                    </>
                  ) : (
                    <p className="font-body text-sm text-gray-400">
                      No preview available for this combination
                    </p>
                  )}
                </div>
              )}

              {/* Campaign name */}
              <div className="mt-4">
                <label className="font-body text-xs text-gray-500">
                  Campaign name (optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Spring check-in"
                  value={campaignName}
                  onChange={(e) => setCampaignName(e.target.value)}
                  className="mt-1 w-full rounded-xl border-2 border-gray-200 px-4 py-2.5 font-body text-sm focus:border-[#E8735A] focus:outline-none transition-colors"
                />
              </div>

              <div className="mt-6 flex items-center justify-between">
                <button
                  onClick={() => setStep(1)}
                  className="rounded-xl border-2 border-gray-200 px-5 py-2.5 font-body text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
                >
                  Back
                </button>
                <button
                  onClick={handleCreate}
                  disabled={!selectedTone || creating}
                  className="rounded-xl bg-[#E8735A] px-6 py-2.5 font-body text-sm font-semibold text-white hover:bg-[#d4634d] disabled:opacity-40 disabled:cursor-not-allowed transition-all active:scale-95"
                >
                  {creating ? "Creating..." : "Create Campaign"}
                </button>
              </div>
            </>
          )}
        </div>
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
    // Update local state immediately
    setRecipients((prev) =>
      prev.map((r) => (r.client_id === clientId ? { ...r, included: newIncluded } : r))
    );
    pendingChanges.current[clientId] = newIncluded;
  };

  const handleSelectAll = () => {
    setRecipients((prev) => prev.map((r) => ({ ...r, included: true })));
    // We'll use include_all action on launch
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
      // Flush any pending recipient changes first
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
                                className="w-4 h-4 rounded border-gray-300 text-[#E8735A] focus:ring-[#E8735A] shrink-0"
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

export default function EmailCampaigns() {
  const { coach } = useCoach();
  const showToast = useShowToast();

  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showNewModal, setShowNewModal] = useState(false);
  const [detailId, setDetailId] = useState(null);

  useEffect(() => {
    if (coach?.id) fetchCampaigns();
  }, [coach?.id]);

  const fetchCampaigns = async () => {
    try {
      const res = await fetch("/api/email/campaigns", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setCampaigns(data.campaigns || []);
      }
    } catch {
      // ignore
    }
    setLoading(false);
  };

  const handleCreated = (campaign) => {
    setShowNewModal(false);
    // Open detail view immediately to review recipients
    setCampaigns((prev) => [campaign, ...prev]);
    setDetailId(campaign.id);
  };

  const handleDeleted = (id) => {
    setCampaigns((prev) => prev.filter((c) => c.id !== id));
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
          onClick={() => setShowNewModal(true)}
          className="rounded-xl bg-[#E8735A] px-4 py-2.5 font-body text-sm font-semibold text-white hover:bg-[#d4634d] transition-all active:scale-95"
        >
          + New Campaign
        </button>
      </div>

      {/* Campaign list */}
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
                    {canDelete && (
                      <button
                        onClick={() => setDetailId(c.id)}
                        className="rounded-xl border-2 border-red-100 px-3 py-1.5 font-body text-xs font-semibold text-red-500 hover:bg-red-50 transition-colors"
                      >
                        Delete
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
      <NewCampaignModal
        isOpen={showNewModal}
        onClose={() => setShowNewModal(false)}
        onCreated={handleCreated}
      />

      <CampaignDetailModal
        campaignId={detailId}
        isOpen={!!detailId}
        onClose={() => setDetailId(null)}
        onDeleted={handleDeleted}
        onLaunched={handleLaunched}
      />
    </div>
  );
}
