"use client";

import { useState, useEffect, useContext, useRef, useCallback } from "react";
import { useCoach, ToastContext } from "../../layout";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import LoadingSpinner from "../../components/LoadingSpinner";
import ConfirmDialog from "../../components/ConfirmDialog";
import { formatPhoneDisplay } from "@/lib/phone";

const STAGES = [
  { value: "prospect", label: "Prospect", color: "bg-gray-100 text-gray-700" },
  { value: "conversation", label: "Conversation", color: "bg-blue-100 text-blue-700" },
  { value: "ha_scheduled", label: "HA Scheduled", color: "bg-yellow-100 text-yellow-700" },
  { value: "ha_completed", label: "HA Completed", color: "bg-purple-100 text-purple-700" },
  { value: "client", label: "Client", color: "bg-green-100 text-green-700" },
  { value: "potential_coach", label: "Potential Coach", color: "bg-teal-100 text-teal-700" },
];

const STAGE_MAP = Object.fromEntries(STAGES.map((s) => [s.value, s]));
const STAGE_INDEX = Object.fromEntries(STAGES.map((s, i) => [s.value, i]));

const SOURCE_OPTIONS = [
  { value: "facebook_post", label: "Facebook Post" },
  { value: "facebook_group", label: "Facebook Group" },
  { value: "instagram", label: "Instagram" },
  { value: "referral", label: "Referral" },
  { value: "in_person", label: "In Person" },
  { value: "past_client", label: "Past Client" },
  { value: "other", label: "Other" },
];

const SOURCE_MAP = Object.fromEntries(SOURCE_OPTIONS.map((s) => [s.value, s.label]));

const HA_OUTCOMES = [
  { value: "client", label: "Client" },
  { value: "thinking", label: "Thinking About It" },
  { value: "not_now", label: "Not Now" },
  { value: "no_show", label: "No Show" },
];

const ACTION_ICONS = {
  call: "\uD83D\uDCDE",
  text: "\uD83D\uDCAC",
  email: "\uD83D\uDCE7",
  meeting: "\uD83E\uDD1D",
  facebook_message: "\uD83D\uDCAC",
  facebook_comment: "\uD83D\uDCAC",
  facebook_group_invite_sent: "\uD83D\uDC65",
  facebook_group_invite_accepted: "\u2705",
  facebook_friend_request_sent: "\uD83E\uDD1D",
  facebook_friend_request_accepted: "\u2705",
  facebook_tag: "\uD83C\uDFF7\uFE0F",
  note: "\uD83D\uDCDD",
  stage_change: "\u27A1\uFE0F",
  other: "\uD83D\uDCCC",
};

const ACTION_LABELS = {
  call: "Call",
  text: "Text",
  email: "Email",
  meeting: "Meeting",
  facebook_message: "Facebook message",
  facebook_comment: "Commented on Facebook",
  facebook_group_invite_sent: "Group invite sent",
  facebook_group_invite_accepted: "Group invite accepted",
  facebook_friend_request_sent: "Friend request sent",
  facebook_friend_request_accepted: "Friend request accepted",
  facebook_tag: "Tagged on post",
  note: "Note",
  stage_change: "Stage Change",
  other: "Other",
};

function relativeTime(dateStr) {
  if (!dateStr) return "Never";
  const now = new Date();
  const d = new Date(dateStr);
  const diffMs = now - d;
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHrs = Math.floor(diffMin / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  const diffDays = Math.floor(diffHrs / 24);
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 30) return `${diffDays}d ago`;
  const diffMonths = Math.floor(diffDays / 30);
  return `${diffMonths}mo ago`;
}

function daysBetween(dateStr) {
  if (!dateStr) return null;
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const d = new Date(dateStr);
  d.setHours(0, 0, 0, 0);
  return Math.round((now - d) / 86400000);
}

function formatDate(dateStr) {
  if (!dateStr) return null;
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function PhonePopover({ digits, display, className }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    document.addEventListener("touchstart", handler);
    return () => { document.removeEventListener("mousedown", handler); document.removeEventListener("touchstart", handler); };
  }, [open]);

  return (
    <span ref={ref} className="relative inline-block">
      <button
        onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
        className={className || "text-[#E8735A] hover:underline font-semibold"}
      >
        {display}
      </button>
      {open && (
        <span className="absolute left-0 top-full mt-1.5 z-30 bg-white rounded-xl shadow-lg border border-gray-100 flex flex-col min-w-[130px] overflow-hidden">
          <a href={`tel:${digits}`} onClick={() => setOpen(false)} className="flex items-center gap-2 px-4 py-3 text-sm font-semibold text-gray-700 hover:bg-[#faf7f2] transition-colors">
            📞 Call
          </a>
          <a href={`sms:${digits}`} onClick={() => setOpen(false)} className="flex items-center gap-2 px-4 py-3 text-sm font-semibold text-gray-700 hover:bg-[#faf7f2] transition-colors border-t border-gray-100">
            💬 Text
          </a>
        </span>
      )}
    </span>
  );
}

function InlineEditField({ value, field, onSave, type = "text", placeholder, displayRender, suffix }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  const [saveState, setSaveState] = useState(null);
  const inputRef = useRef(null);
  const timerRef = useRef(null);

  useEffect(() => { if (!editing) setDraft(value ?? ""); }, [value, editing]);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      if (type === "textarea") {
        inputRef.current.style.height = "auto";
        inputRef.current.style.height = inputRef.current.scrollHeight + "px";
      }
    }
  }, [editing]);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  const flash = (state) => {
    setSaveState(state);
    timerRef.current = setTimeout(() => setSaveState(null), 1500);
  };

  const save = useCallback(async () => {
    const trimmed = typeof draft === "string" ? draft.trim() : draft;
    if (trimmed === (value ?? "")) { setEditing(false); return; }
    try {
      await onSave(field, trimmed || null);
      flash("saved");
      setEditing(false);
    } catch {
      flash("error");
      setDraft(value ?? "");
      setEditing(false);
    }
  }, [draft, value, field, onSave]);

  const cancel = () => { setDraft(value ?? ""); setEditing(false); };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && type !== "textarea") { e.preventDefault(); save(); }
    if (e.key === "Enter" && type === "textarea" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); save(); }
    if (e.key === "Escape") cancel();
  };

  if (editing) {
    const cls = "w-full text-sm font-semibold bg-white px-3 py-2 rounded-lg border-2 border-[#E8735A] focus:outline-none focus:ring-2 focus:ring-[#E8735A]/30 transition-colors duration-150 min-h-[44px] font-body";
    return type === "textarea" ? (
      <textarea
        ref={inputRef}
        value={draft}
        onChange={(e) => { setDraft(e.target.value); e.target.style.height = "auto"; e.target.style.height = e.target.scrollHeight + "px"; }}
        onBlur={save}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        rows={2}
        className={cls + " resize-none text-left"}
      />
    ) : (
      <input
        ref={inputRef}
        type={type === "phone" ? "tel" : "text"}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={save}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className={cls}
      />
    );
  }

  const hasValue = value !== null && value !== undefined && value !== "";
  const isTextarea = type === "textarea";

  return (
    <button
      onClick={() => setEditing(true)}
      className={`group flex items-center gap-1.5 min-h-[44px] touch-manipulation ${isTextarea ? "w-full text-left" : ""}`}
    >
      {saveState === "saved" && <span className="text-green-500 text-sm font-bold animate-fade-up shrink-0">✓</span>}
      {saveState === "error" && <span className="text-red-500 text-xs font-bold animate-fade-up shrink-0">Failed</span>}
      {displayRender ? displayRender(value) : hasValue ? (
        <span className={`text-sm font-semibold text-gray-800 ${isTextarea ? "whitespace-pre-wrap" : "truncate"}`}>{value}{suffix || ""}</span>
      ) : (
        <span className="text-sm italic text-gray-400">{placeholder || "Add..."}</span>
      )}
      <svg className="w-3.5 h-3.5 text-gray-300 group-hover:text-gray-500 transition-colors shrink-0 ml-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
      </svg>
    </button>
  );
}

function InlineSelectField({ value, field, onSave, options, displayRender }) {
  const [saveState, setSaveState] = useState(null);
  const timerRef = useRef(null);
  useEffect(() => () => clearTimeout(timerRef.current), []);

  const flash = (state) => {
    setSaveState(state);
    timerRef.current = setTimeout(() => setSaveState(null), 1500);
  };

  return (
    <div className="flex items-center gap-1.5">
      {saveState === "saved" && <span className="text-green-500 text-sm font-bold animate-fade-up shrink-0">✓</span>}
      {saveState === "error" && <span className="text-red-500 text-xs font-bold animate-fade-up shrink-0">Failed</span>}
      <select
        value={value || ""}
        onChange={async (e) => {
          const newVal = e.target.value || null;
          try {
            await onSave(field, newVal);
            flash("saved");
          } catch {
            flash("error");
          }
        }}
        className="text-sm font-semibold bg-white px-3 py-2 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#E8735A] focus:border-transparent transition-colors duration-150 min-h-[44px] cursor-pointer font-body"
      >
        {options.map((o) =>
          typeof o === "string" ? (
            <option key={o} value={o}>{o}</option>
          ) : (
            <option key={o.value} value={o.value}>{o.label}</option>
          )
        )}
      </select>
    </div>
  );
}

export default function LeadDetailPage() {
  const { coach } = useCoach();
  const router = useRouter();
  const params = useParams();
  const leadId = params.id;
  const showToast = useContext(ToastContext);

  const [lead, setLead] = useState(null);
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Backdate modal
  const [backdateModal, setBackdateModal] = useState(null); // "call" | "text" | null
  const [backdateDate, setBackdateDate] = useState("");
  const [backdateExpanded, setBackdateExpanded] = useState(false);

  // Stage change
  const [stageConfirm, setStageConfirm] = useState(null); // { stage, label }
  const [haDateInput, setHaDateInput] = useState("");
  const [haOutcomeInput, setHaOutcomeInput] = useState("");
  const [stageChanging, setStageChanging] = useState(false);

  // Quick action modal
  const [actionModal, setActionModal] = useState(null); // { action, label, icon }
  const [actionDetails, setActionDetails] = useState("");
  const [actionSaving, setActionSaving] = useState(false);

  // Follow-up
  const [followupDate, setFollowupDate] = useState("");
  const [followupSaving, setFollowupSaving] = useState(false);

  // Meeting modal
  const [meetingModal, setMeetingModal] = useState(false);
  const [meetingDesc, setMeetingDesc] = useState("");
  const [meetingDate, setMeetingDate] = useState("");
  const [meetingTime, setMeetingTime] = useState("");
  const [loggingMeeting, setLoggingMeeting] = useState(false);

  // Convert
  const [showConvertConfirm, setShowConvertConfirm] = useState(false);
  const [converting, setConverting] = useState(false);

  useEffect(() => {
    fetchLead();
  }, [leadId]);

  const fetchLead = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/leads/${leadId}`);
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to load lead");
        return;
      }
      setLead(data.lead);
      setActivities(data.activities || []);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const patchLead = async (body) => {
    const res = await fetch(`/api/leads/${leadId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Update failed");
    return data;
  };

  const postActivity = async (action, details) => {
    const res = await fetch(`/api/leads/${leadId}/activities`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, details: details || null }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to log activity");
    return data;
  };

  // --- Inline Save ---
  const saveField = useCallback(async (field, value) => {
    await patchLead({ [field]: value });
    setLead((prev) => ({ ...prev, [field]: value }));
  }, [leadId]);

  const handleDeleteLead = async () => {
    setDeleting(true);
    try {
      const res = await fetch(`/api/leads/${leadId}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to delete lead");
      }
      showToast({ message: "Lead deleted" });
      router.push("/dashboard/leads");
    } catch (err) {
      showToast({ message: err.message, variant: "error" });
    } finally {
      setDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  // --- Stage Change ---
  const handleStageClick = (stage) => {
    if (!lead || stage === lead.stage) return;
    const currentIdx = STAGE_INDEX[lead.stage] ?? -1;
    const targetIdx = STAGE_INDEX[stage] ?? -1;
    setHaDateInput("");
    setHaOutcomeInput("");
    setStageConfirm({ stage, label: STAGE_MAP[stage]?.label || stage, isBackward: targetIdx < currentIdx });
  };

  const confirmStageChange = async () => {
    setStageChanging(true);
    try {
      const body = { stage: stageConfirm.stage };
      if (stageConfirm.stage === "ha_scheduled" && haDateInput) {
        body.ha_date = haDateInput;
      }
      if (stageConfirm.stage === "ha_completed" && haOutcomeInput) {
        body.ha_outcome = haOutcomeInput;
      }
      await patchLead(body);
      if (stageConfirm.isBackward) {
        await postActivity("stage_change", `Stage moved back to ${stageConfirm.label}`);
      }
      setStageConfirm(null);
      fetchLead();
    } catch (err) {
      alert(err.message);
    } finally {
      setStageChanging(false);
    }
  };

  // --- Quick Actions ---
  const openAction = (action, label, icon) => {
    setActionDetails("");
    setActionModal({ action, label, icon });
  };

  const submitAction = async () => {
    setActionSaving(true);
    try {
      await postActivity(actionModal.action, actionDetails);
      setActionModal(null);
      showToast({ message: "Activity logged" });
      fetchLead();
    } catch (err) {
      alert(err.message);
    } finally {
      setActionSaving(false);
    }
  };

  const deleteActivity = async (actId) => {
    if (!window.confirm("Delete this activity entry?")) return;
    setActivities((prev) => prev.filter((a) => a.id !== actId));
    try {
      const res = await fetch(`/api/leads/${leadId}/activities?activityId=${actId}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      showToast({ message: "Activity deleted" });
    } catch {
      showToast({ message: "Failed to delete — please try again", variant: "error" });
      fetchLead();
    }
  };

  // --- Log Quick Action (with optional backdate) ---
  const logQuickAction = async (actionType, details, overrideDate) => {
    try {
      const activityDate = overrideDate || null;
      await postActivity(actionType, details || null);
      // Update last_contact_date only if the date is more recent than existing
      const newTs = overrideDate ? new Date(overrideDate).toISOString() : new Date().toISOString();
      const existingContact = lead.last_contact_date ? new Date(lead.last_contact_date) : null;
      const newContact = new Date(newTs);
      if (!existingContact || newContact > existingContact) {
        await patchLead({ last_contact_date: newTs });
        setLead((prev) => ({ ...prev, last_contact_date: newTs }));
      }
      showToast({ message: actionType === "call" ? "Call logged" : "Text logged" });
      fetchLead();
    } catch (err) {
      showToast({ message: err.message || "Something went wrong", variant: "error" });
    }
  };

  // --- Follow-up ---
  const saveFollowup = async () => {
    setFollowupSaving(true);
    try {
      await patchLead({ next_followup_date: followupDate || null });
      setFollowupDate("");
      fetchLead();
    } catch (err) {
      alert(err.message);
    } finally {
      setFollowupSaving(false);
    }
  };

  // --- Convert to Client ---
  const handleConvert = async () => {
    setConverting(true);
    try {
      const res = await fetch(`/api/leads/${leadId}/convert`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Conversion failed");
      setShowConvertConfirm(false);
      if (data.returning && data.client_id) {
        // Returning past client — redirect to the reactivated client profile
        router.push(`/dashboard/clients/${data.client_id}`);
      } else {
        fetchLead();
      }
    } catch (err) {
      alert(err.message);
    } finally {
      setConverting(false);
    }
  };

  // --- Loading / Error / 404 ---
  if (loading) {
    return (
      <div>
        <Link href="/dashboard/leads" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-[#E8735A] mb-4 transition-colors">
          &larr; Back to Leads
        </Link>
        <div className="bg-white rounded-2xl border-2 border-gray-100">
          <LoadingSpinner message="Loading lead..." />
        </div>
      </div>
    );
  }

  if (error || !lead) {
    return (
      <div>
        <Link href="/dashboard/leads" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-[#E8735A] mb-4 transition-colors">
          &larr; Back to Leads
        </Link>
        <div className="bg-white rounded-2xl border-2 border-gray-100 p-12 text-center">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center text-3xl mx-auto mb-4">
            {error ? "\u26A0\uFE0F" : "\uD83D\uDD0D"}
          </div>
          <h3 className="font-display text-lg font-bold text-gray-900 mb-1">{error || "Lead not found"}</h3>
          <p className="text-base text-gray-500 mb-6">This lead may have been deleted or you may not have access.</p>
          <button onClick={() => router.push("/dashboard/leads")} className="bg-[#E8735A] hover:bg-[#d4634d] text-white px-6 py-2.5 rounded-xl text-sm font-bold transition-all duration-150 shadow-sm">
            Back to Leads
          </button>
        </div>
      </div>
    );
  }

  const currentStageIdx = STAGE_INDEX[lead.stage] ?? 0;
  const stageInfo = STAGE_MAP[lead.stage];
  const followupDays = daysBetween(lead.next_followup_date);
  const lastContactDays = daysBetween(lead.last_contact_date);
  const showHA = currentStageIdx >= STAGE_INDEX["ha_scheduled"];

  return (
    <div>
      {/* Back nav */}
      <Link href="/dashboard/leads" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-[#E8735A] mb-4 transition-colors">
        &larr; Back to Leads
      </Link>

      {/* Returning past client banner */}
      {lead.source === "past_client" && lead.converted_client_id && (
        <div className="flex items-center gap-3 px-4 py-3 mb-4 bg-blue-50 border-2 border-blue-100 rounded-2xl">
          <span className="text-lg flex-shrink-0">🔄</span>
          <div className="flex-1 min-w-0">
            <span className="text-sm font-bold text-blue-700">Returning past client</span>
            <span className="text-sm text-blue-600"> — this lead came from an existing client profile.</span>
          </div>
          <Link
            href={`/dashboard/clients/${lead.converted_client_id}`}
            className="flex-shrink-0 text-xs font-bold text-blue-700 hover:underline whitespace-nowrap"
          >
            View Client →
          </Link>
        </div>
      )}

      {/* Lead Info Card */}
      <div className="bg-white rounded-2xl border-2 border-gray-100 p-6 mb-4">
        <div className="flex items-center gap-3 mb-4">
          <InlineEditField value={lead.full_name} field="full_name" onSave={saveField} placeholder="Full name"
            displayRender={(v) => <h1 className="font-display text-2xl font-bold text-gray-900">{v}</h1>}
          />
          {stageInfo && (
            <span className={`inline-block rounded-full px-3 py-1 text-xs font-bold ${stageInfo.color}`}>
              {stageInfo.label}
            </span>
          )}
        </div>

        {/* Inline editable fields */}
        <div className="space-y-2">
          <div className="flex items-center justify-between py-1">
            <span className="text-xs font-bold text-gray-400 uppercase tracking-wide w-24 shrink-0">Email</span>
            <InlineEditField value={lead.email} field="email" onSave={saveField} placeholder="Add email..." />
          </div>
          <div className="flex items-center justify-between py-1">
            <span className="text-xs font-bold text-gray-400 uppercase tracking-wide w-24 shrink-0">Phone</span>
            {lead.phone ? (
              <div className="flex items-center gap-2">
                <PhonePopover digits={String(lead.phone).replace(/\D/g, "")} display={formatPhoneDisplay(lead.phone)} className="text-[#E8735A] hover:underline font-semibold text-sm" />
                <InlineEditField value={lead.phone} field="phone" onSave={saveField} type="phone" placeholder="Add phone..."
                  displayRender={() => (
                    <svg className="w-3.5 h-3.5 text-gray-300 hover:text-gray-500 transition-colors cursor-pointer" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                    </svg>
                  )}
                />
              </div>
            ) : (
              <InlineEditField value={lead.phone} field="phone" onSave={saveField} type="phone" placeholder="Add phone..." />
            )}
          </div>
          <div className="flex items-center justify-between py-1">
            <span className="text-xs font-bold text-gray-400 uppercase tracking-wide w-24 shrink-0">Facebook</span>
            <InlineEditField value={lead.facebook_url} field="facebook_url" onSave={saveField} placeholder="Add Facebook URL..."
              displayRender={(v) => (
                <a href={v} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="text-[#E8735A] hover:underline text-sm font-semibold truncate max-w-[200px]">
                  Facebook ↗
                </a>
              )}
            />
          </div>
          <div className="flex items-center justify-between py-1">
            <span className="text-xs font-bold text-gray-400 uppercase tracking-wide w-24 shrink-0">Instagram</span>
            <InlineEditField value={lead.instagram_url} field="instagram_url" onSave={saveField} placeholder="Add Instagram URL..."
              displayRender={(v) => (
                <a href={v} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="text-[#E8735A] hover:underline text-sm font-semibold truncate max-w-[200px]">
                  Instagram ↗
                </a>
              )}
            />
          </div>
          <div className="flex items-center justify-between py-1">
            <span className="text-xs font-bold text-gray-400 uppercase tracking-wide w-24 shrink-0">Source</span>
            <InlineSelectField value={lead.source} field="source" onSave={saveField}
              options={[{ value: "", label: "Select source..." }, ...SOURCE_OPTIONS]}
            />
          </div>
          <div className="flex items-center justify-between py-1">
            <span className="text-xs font-bold text-gray-400 uppercase tracking-wide w-24 shrink-0">Groups</span>
            <InlineEditField value={lead.groups} field="groups" onSave={saveField} placeholder="Add groups..." />
          </div>
        </div>

        {/* Notes */}
        <div className="mt-4 border-t border-gray-100 pt-4">
          <span className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2 block">Notes</span>
          <InlineEditField value={lead.notes} field="notes" onSave={saveField} type="textarea" placeholder="Add notes..." />
        </div>

        <div className="flex flex-wrap items-center gap-3 text-xs text-gray-400 mt-3 border-t border-gray-100 pt-3">
          <span>Added {formatDate(lead.created_at)}</span>
          <span>Originally met: {lead.originally_met_date ? formatDate(lead.originally_met_date) : "Not set"}</span>
        </div>
      </div>

      {/* Stage Progression Bar */}
      <div className="bg-white rounded-2xl border-2 border-gray-100 p-5 mb-4 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="flex items-center min-w-[500px]">
          {STAGES.map((s, i) => {
            const isCompleted = i < currentStageIdx;
            const isCurrent = i === currentStageIdx;
            const isFuture = i > currentStageIdx;
            return (
              <div key={s.value} className="flex items-center flex-1">
                <div className="flex flex-col items-center w-full">
                  <button
                    onClick={() => !isCurrent && handleStageClick(s.value)}
                    disabled={isCurrent}
                    className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all duration-150 ${
                      isCurrent
                        ? "bg-[#E8735A] border-[#E8735A] text-white shadow-md cursor-default"
                        : isCompleted
                        ? "bg-[#E8735A]/20 border-[#E8735A] text-[#E8735A] hover:bg-[#E8735A]/30 cursor-pointer"
                        : "bg-white border-gray-200 text-gray-400 hover:border-[#E8735A]/50 hover:text-[#E8735A] cursor-pointer"
                    }`}
                  >
                    {isCompleted ? "\u2713" : i + 1}
                  </button>
                  <span className={`text-xs mt-1.5 font-bold text-center leading-tight ${
                    isCurrent ? "text-[#E8735A]" : isCompleted ? "text-gray-600" : "text-gray-400"
                  }`}>
                    {s.label}
                  </span>
                </div>
                {i < STAGES.length - 1 && (
                  <div className={`flex-1 h-0.5 mx-1 mt-[-16px] ${
                    i < currentStageIdx ? "bg-[#E8735A]" : "bg-gray-200"
                  }`} />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Health Assessment Section */}
      {showHA && (
        <div className="bg-white rounded-2xl border-2 border-gray-100 p-5 mb-4">
          <h3 className="font-display text-base font-bold text-gray-900 mb-3">Health Assessment</h3>
          <div className="flex flex-wrap gap-4 text-sm">
            {lead.ha_date && (
              <div>
                <span className="text-gray-400">Scheduled:</span>{" "}
                <span className="font-semibold text-gray-700">{formatDate(lead.ha_date)}</span>
              </div>
            )}
            {lead.ha_outcome && (
              <div>
                <span className="text-gray-400">Outcome:</span>{" "}
                <span className={`font-semibold ${
                  lead.ha_outcome === "client" ? "text-green-600"
                  : lead.ha_outcome === "thinking" ? "text-yellow-600"
                  : lead.ha_outcome === "no_show" ? "text-red-600"
                  : "text-gray-600"
                }`}>
                  {HA_OUTCOMES.find((o) => o.value === lead.ha_outcome)?.label || lead.ha_outcome}
                </span>
              </div>
            )}
          </div>
          {lead.ha_outcome === "thinking" && (
            <p className="text-xs text-yellow-600 mt-2 bg-yellow-50 rounded-lg px-3 py-2">
              {"\uD83D\uDCA1"} Consider scheduling a follow-up to check in
            </p>
          )}
        </div>
      )}

      {/* Follow-up & Last Contact */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
        <div className="bg-white rounded-2xl border-2 border-gray-100 p-5">
          <h3 className="font-display text-base font-bold text-gray-900 mb-3">Next Follow-up</h3>
          {lead.next_followup_date ? (
            <div>
              <p className={`text-lg font-bold ${
                followupDays !== null && followupDays > 0 ? "text-red-600"
                : followupDays === 0 ? "text-orange-500"
                : "text-green-600"
              }`}>
                {formatDate(lead.next_followup_date)}
              </p>
              {followupDays !== null && followupDays > 0 && (
                <p className="text-xs text-red-500 mt-0.5">Overdue by {followupDays} day{followupDays !== 1 ? "s" : ""}</p>
              )}
              {followupDays === 0 && (
                <p className="text-xs text-orange-500 mt-0.5">Due today</p>
              )}
            </div>
          ) : (
            <p className="text-sm text-gray-400">No follow-up scheduled</p>
          )}
          <div className="flex items-center gap-2 mt-3">
            <input
              type="date"
              value={followupDate}
              onChange={(e) => setFollowupDate(e.target.value)}
              className="rounded-xl border-2 border-gray-200 px-4 py-2 font-body text-sm focus:outline-none focus:border-[#E8735A] focus:ring-1 focus:ring-[#E8735A]/30 transition-colors"
            />
            <button
              onClick={saveFollowup}
              disabled={followupSaving || !followupDate}
              className="px-4 py-2 rounded-xl text-sm font-bold bg-[#E8735A] text-white hover:bg-[#d4634d] disabled:bg-gray-300 transition-colors shadow-sm"
            >
              {followupSaving ? "..." : "Set"}
            </button>
          </div>
        </div>

        <div className="bg-white rounded-2xl border-2 border-gray-100 p-5">
          <h3 className="font-display text-base font-bold text-gray-900 mb-3">Last Contact</h3>
          {lead.last_contact_date ? (
            <div>
              <p className="text-lg font-bold text-gray-700">{relativeTime(lead.last_contact_date)}</p>
              <p className="text-xs text-gray-400 mt-0.5">{formatDate(lead.last_contact_date)}</p>
              {lastContactDays !== null && (
                <p className="text-sm text-gray-500 mt-1">{lastContactDays} day{lastContactDays !== 1 ? "s" : ""} since last contact</p>
              )}
            </div>
          ) : (
            <p className="text-sm text-gray-400">No contact recorded yet</p>
          )}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="bg-white rounded-2xl border-2 border-gray-100 p-4 mb-4">
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => { setBackdateDate(new Date().toISOString().slice(0, 10)); setBackdateExpanded(false); setBackdateModal("call"); }}
            className="px-4 py-2.5 rounded-xl text-sm font-bold border-2 border-gray-100 hover:border-[#E8735A]/30 hover:bg-[#E8735A]/5 text-gray-600 hover:text-[#E8735A] transition-all duration-150"
          >
            <span className="mr-1">📞</span> Log Call
          </button>
          <button
            onClick={() => { setBackdateDate(new Date().toISOString().slice(0, 10)); setBackdateExpanded(false); setBackdateModal("text"); }}
            className="px-4 py-2.5 rounded-xl text-sm font-bold border-2 border-gray-100 hover:border-[#E8735A]/30 hover:bg-[#E8735A]/5 text-gray-600 hover:text-[#E8735A] transition-all duration-150"
          >
            <span className="mr-1">💬</span> Log Text
          </button>
          {[
            { action: "email", label: "Log Email", icon: "📧" },
            { action: "facebook_message", label: "Log FB Message", icon: "💬" },
            { action: "note", label: "Add Note", icon: "📝" },
          ].map((a) => (
            <button
              key={a.action}
              onClick={() => openAction(a.action, a.label, a.icon)}
              className="px-4 py-2.5 rounded-xl text-sm font-bold border-2 border-gray-100 hover:border-[#E8735A]/30 hover:bg-[#E8735A]/5 text-gray-600 hover:text-[#E8735A] transition-all duration-150"
            >
              <span className="mr-1">{a.icon}</span> {a.label}
            </button>
          ))}
          <button
            onClick={() => {
              const now = new Date();
              const mins = now.getMinutes();
              const rounded = mins < 15 ? 0 : mins < 45 ? 30 : 60;
              const d = new Date(now);
              d.setMinutes(rounded, 0, 0);
              if (rounded === 60) d.setHours(d.getHours());
              setMeetingDate(now.toISOString().slice(0, 10));
              setMeetingTime(d.toTimeString().slice(0, 5));
              setMeetingDesc("");
              setMeetingModal(true);
            }}
            className="px-4 py-2.5 rounded-xl text-sm font-bold border-2 border-gray-100 hover:border-[#E8735A]/30 hover:bg-[#E8735A]/5 text-gray-600 hover:text-[#E8735A] transition-all duration-150"
          >
            <span className="mr-1">📅</span> Log Meeting
          </button>
        </div>
      </div>

      {/* Social Engagement */}
      <div className="bg-white rounded-2xl border-2 border-gray-100 p-5 mb-4">
        <h3 className="font-display text-base font-bold text-gray-900 mb-3">Social Engagement</h3>
        <div className="space-y-3">
          <div className="flex items-center justify-between p-3 bg-[#faf7f2] rounded-xl">
            <span className="text-sm font-semibold text-gray-700">Friends on Facebook</span>
            <button
              onClick={async () => {
                const newVal = !lead.is_facebook_friend;
                try {
                  await patchLead({ is_facebook_friend: newVal });
                  setLead(prev => ({ ...prev, is_facebook_friend: newVal }));
                  showToast({ message: newVal ? "Marked as Facebook friend" : "Unmarked Facebook friend" });
                } catch {
                  showToast({ message: "Something went wrong — please try again", variant: "error" });
                }
              }}
              className={`w-11 h-6 rounded-full transition-colors duration-200 relative ${lead.is_facebook_friend ? "bg-green-500" : "bg-gray-300"}`}
            >
              <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${lead.is_facebook_friend ? "translate-x-5" : ""}`} />
            </button>
          </div>
          <div className="flex items-center justify-between p-3 bg-[#faf7f2] rounded-xl">
            <span className="text-sm font-semibold text-gray-700">Follows on Instagram</span>
            <button
              onClick={async () => {
                const newVal = !lead.is_instagram_follower;
                try {
                  await patchLead({ is_instagram_follower: newVal });
                  setLead(prev => ({ ...prev, is_instagram_follower: newVal }));
                  showToast({ message: newVal ? "Marked as Instagram follower" : "Unmarked Instagram follower" });
                } catch {
                  showToast({ message: "Something went wrong — please try again", variant: "error" });
                }
              }}
              className={`w-11 h-6 rounded-full transition-colors duration-200 relative ${lead.is_instagram_follower ? "bg-green-500" : "bg-gray-300"}`}
            >
              <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${lead.is_instagram_follower ? "translate-x-5" : ""}`} />
            </button>
          </div>
        </div>
      </div>

      {/* Facebook Group Engagement Tracker */}
      {(() => {
        const hasGroupInviteSent = activities.some((a) => a.action === "facebook_group_invite_sent");
        const hasGroupInviteAccepted = activities.some((a) => a.action === "facebook_group_invite_accepted");
        const hasTagged = activities.some((a) => a.action === "facebook_tag");
        const steps = [
          { label: "Group Invite Sent", done: hasGroupInviteSent },
          { label: "Group Invite Accepted", done: hasGroupInviteAccepted },
          { label: "Tagged on Post", done: hasTagged },
        ];
        // Find the furthest completed step index
        let furthest = -1;
        for (let i = steps.length - 1; i >= 0; i--) {
          if (steps[i].done) { furthest = i; break; }
        }
        if (!hasGroupInviteSent && !hasGroupInviteAccepted && !hasTagged) return null;
        return (
          <div className="bg-white rounded-2xl border-2 border-gray-100 p-5 mb-4">
            <h3 className="font-display text-base font-bold text-gray-900 mb-4 flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-[#1877F2]/10 flex items-center justify-center text-[10px]">{"\uD83D\uDC65"}</span>
              Facebook Group Pipeline
            </h3>
            <div className="flex items-center">
              {steps.map((step, i) => (
                <div key={step.label} className="flex items-center flex-1">
                  <div className="flex flex-col items-center w-full">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border-2 ${
                      step.done
                        ? "bg-green-500 border-green-500 text-white"
                        : "bg-white border-gray-200 text-gray-400"
                    }`}>
                      {step.done ? "\u2713" : i + 1}
                    </div>
                    <span className={`text-xs mt-1 font-bold text-center leading-tight ${
                      step.done ? "text-green-600" : "text-gray-400"
                    }`}>
                      {step.label}
                    </span>
                  </div>
                  {i < steps.length - 1 && (
                    <div className={`flex-1 h-0.5 mx-1 mt-[-14px] ${
                      steps[i].done && steps[i + 1].done ? "bg-green-500" : steps[i].done ? "bg-green-500/30" : "bg-gray-200"
                    }`} />
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {/* Convert to Client */}
      {lead.stage === "client" && (
        <div className="mb-4">
          {lead.converted_client_id ? (
            <Link
              href={`/dashboard/clients/${lead.converted_client_id}`}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold bg-green-50 text-green-700 border-2 border-green-200 hover:bg-green-100 transition-colors"
            >
              {"\u2713"} Converted &mdash; View Client Record
            </Link>
          ) : (
            <button
              onClick={() => setShowConvertConfirm(true)}
              className="px-5 py-2.5 rounded-xl text-sm font-bold bg-green-500 hover:bg-green-600 text-white transition-colors shadow-sm"
            >
              Convert to Client Record
            </button>
          )}
        </div>
      )}

      {/* Activity Timeline */}
      <div className="bg-white rounded-2xl border-2 border-gray-100 p-5">
        <h3 className="font-display text-base font-bold text-gray-900 mb-4">Activity Timeline</h3>
        {activities.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-6">No activities yet. Use the quick actions above to log your first interaction.</p>
        ) : (
          <div className="space-y-0">
            {activities.map((act, idx) => (
              <div key={act.id} className="flex gap-3">
                {/* Timeline line + dot */}
                <div className="flex flex-col items-center">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm flex-shrink-0 ${
                    act.action === "stage_change" ? "bg-[#E8735A]/10" : "bg-gray-100"
                  }`}>
                    {ACTION_ICONS[act.action] || "\uD83D\uDCCC"}
                  </div>
                  {idx < activities.length - 1 && (
                    <div className="w-px h-full bg-gray-100 min-h-[16px]" />
                  )}
                </div>
                {/* Content */}
                <div className="pb-4 flex-1 min-w-0 group">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-gray-700">
                      {ACTION_LABELS[act.action] || act.action}
                    </span>
                    <span className="text-xs text-gray-400">{relativeTime(act.created_at)}</span>
                    <button
                      onClick={() => deleteActivity(act.id)}
                      className="opacity-0 group-hover:opacity-100 focus:opacity-100 text-gray-400 hover:text-red-500 text-sm font-bold px-1.5 py-0.5 rounded transition-all ml-auto"
                      title="Delete this entry"
                    >
                      &times;
                    </button>
                  </div>
                  {act.details && (
                    <p className="text-sm text-gray-500 mt-0.5">{act.details}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Danger Zone */}
      <div className="mt-4 border-2 border-red-100 rounded-2xl p-5">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-display text-sm font-bold text-red-600">Delete This Lead</h3>
            <p className="text-xs text-gray-500 mt-0.5">This action cannot be undone.</p>
          </div>
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="px-4 py-2 rounded-xl text-sm font-bold text-red-600 border-2 border-red-200 hover:bg-red-50 transition-colors duration-150"
          >
            Delete Lead
          </button>
        </div>
      </div>

      {/* Delete Confirm Dialog */}
      <ConfirmDialog
        isOpen={showDeleteConfirm}
        title="Delete Lead"
        message={`Are you sure you want to delete ${lead.full_name}? This cannot be undone.`}
        confirmLabel="Delete"
        confirmVariant="danger"
        onConfirm={handleDeleteLead}
        onCancel={() => setShowDeleteConfirm(false)}
      />

      {/* --- Modals --- */}

      {/* Stage Confirm Modal */}
      {stageConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/30 backdrop-blur-sm" onClick={() => setStageConfirm(null)} />
          <div className="relative bg-white rounded-2xl shadow-xl border-2 border-gray-100 w-full max-w-sm p-6">
            <h2 className="font-display text-lg font-bold text-gray-900 mb-2">{stageConfirm.isBackward ? "Move Back" : "Change Stage"}</h2>
            <p className="text-sm text-gray-500 mb-4">
              {stageConfirm.isBackward
                ? <>Move <strong>{lead.full_name}</strong> back to <strong>{stageConfirm.label}</strong>? This will undo their current progress.</>
                : <>Move <strong>{lead.full_name}</strong> to <strong>{stageConfirm.label}</strong>?</>
              }
            </p>

            {stageConfirm.stage === "ha_scheduled" && (
              <div className="mb-4">
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-wide mb-1">Health Assessment Date</label>
                <input
                  type="date"
                  value={haDateInput}
                  onChange={(e) => setHaDateInput(e.target.value)}
                  className="w-full rounded-xl border-2 border-gray-200 px-3 py-2.5 font-body text-sm focus:outline-none focus:border-[#E8735A] focus:ring-1 focus:ring-[#E8735A]/30"
                />
              </div>
            )}

            {stageConfirm.stage === "ha_completed" && (
              <div className="mb-4">
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-wide mb-1">Outcome</label>
                <select
                  value={haOutcomeInput}
                  onChange={(e) => setHaOutcomeInput(e.target.value)}
                  className="w-full rounded-xl border-2 border-gray-200 px-3 py-2.5 font-body text-sm bg-white focus:outline-none focus:border-[#E8735A] focus:ring-1 focus:ring-[#E8735A]/30"
                >
                  <option value="">Select outcome...</option>
                  {HA_OUTCOMES.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={confirmStageChange}
                disabled={stageChanging || (stageConfirm.stage === "ha_completed" && !haOutcomeInput)}
                className="flex-1 bg-[#E8735A] hover:bg-[#d4634d] disabled:bg-gray-300 text-white px-4 py-2.5 rounded-xl text-sm font-bold transition-all duration-150"
              >
                {stageChanging ? "Updating..." : "Confirm"}
              </button>
              <button
                onClick={() => setStageConfirm(null)}
                className="px-4 py-2.5 rounded-xl text-sm font-bold text-gray-500 border-2 border-gray-200 hover:border-gray-300 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Quick Action Modal */}
      {actionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/30 backdrop-blur-sm" onClick={() => setActionModal(null)} />
          <div className="relative bg-white rounded-2xl shadow-xl border-2 border-gray-100 w-full max-w-sm p-6">
            <h2 className="font-display text-lg font-bold text-gray-900 mb-1">
              {actionModal.icon} {actionModal.label}
            </h2>
            <p className="text-sm text-gray-500 mb-4">Log this interaction with {lead.full_name}</p>
            <textarea
              value={actionDetails}
              onChange={(e) => setActionDetails(e.target.value)}
              placeholder="Add details (optional)..."
              rows={3}
              className="w-full rounded-xl border-2 border-gray-200 px-4 py-2.5 font-body text-sm focus:outline-none focus:border-[#E8735A] focus:ring-1 focus:ring-[#E8735A]/30 transition-colors resize-none mb-4"
              autoFocus
            />
            <div className="flex gap-3">
              <button
                onClick={submitAction}
                disabled={actionSaving}
                className="flex-1 bg-[#E8735A] hover:bg-[#d4634d] disabled:bg-gray-300 text-white px-4 py-2.5 rounded-xl text-sm font-bold transition-all duration-150"
              >
                {actionSaving ? "Saving..." : "Save"}
              </button>
              <button
                onClick={() => setActionModal(null)}
                className="px-4 py-2.5 rounded-xl text-sm font-bold text-gray-500 border-2 border-gray-200 hover:border-gray-300 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Convert Confirm Modal */}
      {showConvertConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/30 backdrop-blur-sm" onClick={() => setShowConvertConfirm(false)} />
          <div className="relative bg-white rounded-2xl shadow-xl border-2 border-gray-100 w-full max-w-sm p-6">
            <h2 className="font-display text-lg font-bold text-gray-900 mb-2">Convert to Client</h2>
            <p className="text-sm text-gray-500 mb-4">
              Convert <strong>{lead.full_name}</strong> to a client record? This will create them in your client list.
            </p>
            <div className="flex gap-3">
              <button
                onClick={handleConvert}
                disabled={converting}
                className="flex-1 bg-green-500 hover:bg-green-600 disabled:bg-gray-300 text-white px-4 py-2.5 rounded-xl text-sm font-bold transition-all duration-150"
              >
                {converting ? "Converting..." : "Convert"}
              </button>
              <button
                onClick={() => setShowConvertConfirm(false)}
                className="px-4 py-2.5 rounded-xl text-sm font-bold text-gray-500 border-2 border-gray-200 hover:border-gray-300 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Meeting Modal */}
      {meetingModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/50" onClick={() => setMeetingModal(false)} />
          <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <h2 className="font-display text-lg font-bold text-gray-900 mb-1">{"\uD83D\uDCC5"} Log a Meeting</h2>
            <p className="text-sm text-gray-500 mb-4">Record a meeting with {lead.full_name}</p>
            <div className="space-y-3 mb-4">
              <input
                type="text"
                value={meetingDesc}
                onChange={(e) => setMeetingDesc(e.target.value)}
                placeholder="Meeting description..."
                className="w-full rounded-xl border-2 border-gray-200 px-4 py-2.5 font-body text-sm focus:outline-none focus:border-[#E8735A] focus:ring-1 focus:ring-[#E8735A]/30 transition-colors min-h-[44px]"
                autoFocus
              />
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase tracking-wide mb-1">Date</label>
                  <input
                    type="date"
                    value={meetingDate}
                    onChange={(e) => setMeetingDate(e.target.value)}
                    className="w-full rounded-xl border-2 border-gray-200 px-3 py-2.5 font-body text-sm focus:outline-none focus:border-[#E8735A] focus:ring-1 focus:ring-[#E8735A]/30 transition-colors min-h-[44px]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase tracking-wide mb-1">Time</label>
                  <input
                    type="time"
                    value={meetingTime}
                    onChange={(e) => setMeetingTime(e.target.value)}
                    className="w-full rounded-xl border-2 border-gray-200 px-3 py-2.5 font-body text-sm focus:outline-none focus:border-[#E8735A] focus:ring-1 focus:ring-[#E8735A]/30 transition-colors min-h-[44px]"
                  />
                </div>
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setMeetingModal(false)} className="flex-1 py-2.5 rounded-xl border-2 border-gray-200 font-bold text-sm text-gray-600 hover:bg-gray-50 transition-colors">
                Cancel
              </button>
              <button
                onClick={async () => {
                  setLoggingMeeting(true);
                  try {
                    const desc = meetingDesc.trim() || "Meeting";
                    await postActivity("meeting", desc);
                    try {
                      await fetch("/api/calendar/events", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          title: `${desc} — ${lead.full_name}`,
                          date: meetingDate,
                          time: meetingTime,
                          lead_id: lead.id,
                        }),
                      });
                    } catch {
                      // Calendar event creation is best-effort
                    }
                    // Sync to Google Calendar (best-effort)
                    try {
                      await fetch("/api/calendar/sync", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          summary: `Meeting with ${lead.full_name}`,
                          description: desc,
                          date: meetingDate,
                          time: meetingTime,
                          durationMinutes: 30,
                        }),
                      });
                    } catch {
                      // Google Calendar sync is best-effort
                    }
                    setMeetingModal(false);
                    showToast({ message: "Meeting logged" });
                    fetchLead();
                  } catch {
                    showToast({ message: "Something went wrong — please try again", variant: "error" });
                  } finally {
                    setLoggingMeeting(false);
                  }
                }}
                disabled={loggingMeeting}
                className={"flex-1 py-2.5 rounded-xl font-bold text-sm transition-colors " + (loggingMeeting ? "bg-gray-200 text-gray-400" : "bg-[#E8735A] text-white hover:bg-[#d4654e]")}
              >
                {loggingMeeting ? "Saving..." : "Log Meeting"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Backdate Modal */}
      {backdateModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/50" onClick={() => setBackdateModal(null)} />
          <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-xs p-5">
            <h2 className="font-display text-base font-bold text-gray-900 mb-1">
              {backdateModal === "call" ? "📞 Log a Call" : "💬 Log a Text"}
            </h2>
            <p className="text-xs text-gray-400 mb-4">When did this happen?</p>
            <button
              onClick={async () => { setBackdateModal(null); await logQuickAction(backdateModal); }}
              className="w-full py-3 rounded-xl bg-[#E8735A] text-white font-bold text-sm hover:bg-[#d4634d] transition-colors min-h-[44px] touch-manipulation mb-3"
            >
              Today
            </button>
            {!backdateExpanded ? (
              <button
                onClick={() => setBackdateExpanded(true)}
                className="w-full text-center text-sm text-gray-400 hover:text-gray-600 transition-colors py-1 touch-manipulation"
              >
                It was a different day →
              </button>
            ) : (
              <div className="space-y-3">
                <input
                  type="date"
                  value={backdateDate}
                  max={new Date().toISOString().slice(0, 10)}
                  onChange={(e) => setBackdateDate(e.target.value)}
                  className="w-full px-4 py-2.5 text-sm border-2 border-gray-200 rounded-xl focus:border-[#E8735A] focus:ring-1 focus:ring-[#E8735A]/30 focus:outline-none transition-colors min-h-[44px] font-body"
                  autoFocus
                />
                <button
                  onClick={async () => {
                    const type = backdateModal;
                    setBackdateModal(null);
                    await logQuickAction(type, undefined, backdateDate);
                  }}
                  disabled={!backdateDate}
                  className="w-full py-2.5 rounded-xl border-2 border-[#E8735A] text-[#E8735A] font-bold text-sm hover:bg-[#E8735A]/5 transition-colors min-h-[44px] touch-manipulation disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Log for {backdateDate ? new Date(backdateDate + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "selected date"}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
