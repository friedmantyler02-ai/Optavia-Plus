"use client";

import { useState, useEffect, useContext } from "react";
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

  // Edit modal
  const [showEdit, setShowEdit] = useState(false);
  const [editData, setEditData] = useState({});
  const [editError, setEditError] = useState(null);
  const [saving, setSaving] = useState(false);

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

  // --- Edit Lead ---
  const openEdit = () => {
    setEditData({
      full_name: lead.full_name || "",
      email: lead.email || "",
      phone: lead.phone || "",
      facebook_url: lead.facebook_url || "",
      source: lead.source || "",
      stage: lead.stage || "prospect",
      groups: lead.groups || "",
      notes: lead.notes || "",
      next_followup_date: lead.next_followup_date ? lead.next_followup_date.slice(0, 10) : "",
      originally_met_date: lead.originally_met_date ? lead.originally_met_date.slice(0, 10) : "",
    });
    setEditError(null);
    setShowEdit(true);
  };

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

  const handleEditSave = async (e) => {
    e.preventDefault();
    if (!editData.full_name.trim()) {
      setEditError("Name is required");
      return;
    }
    setSaving(true);
    setEditError(null);
    try {
      const body = { ...editData };
      Object.keys(body).forEach((k) => {
        if (body[k] === "") body[k] = null;
      });
      body.full_name = editData.full_name.trim();
      await patchLead(body);
      setShowEdit(false);
      fetchLead();
    } catch (err) {
      setEditError(err.message);
    } finally {
      setSaving(false);
    }
  };

  // --- Stage Change ---
  const handleStageClick = (stage) => {
    if (!lead || stage === lead.stage) return;
    const currentIdx = STAGE_INDEX[lead.stage] ?? -1;
    const targetIdx = STAGE_INDEX[stage] ?? -1;
    if (targetIdx <= currentIdx) return; // Only forward moves via progression bar
    setHaDateInput("");
    setHaOutcomeInput("");
    setStageConfirm({ stage, label: STAGE_MAP[stage]?.label || stage });
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

  const quickFbAction = async (action) => {
    try {
      await postActivity(action, null);
      showToast({ message: "Activity logged" });
      fetchLead();
    } catch (err) {
      showToast({ message: err.message, variant: "error" });
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
      fetchLead();
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

      {/* Lead Info Card */}
      <div className="bg-white rounded-2xl border-2 border-gray-100 p-6 mb-4">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h1 className="font-display text-2xl font-bold text-gray-900">{lead.full_name}</h1>
              {stageInfo && (
                <span className={`inline-block rounded-full px-3 py-1 text-xs font-bold ${stageInfo.color}`}>
                  {stageInfo.label}
                </span>
              )}
            </div>

            {/* Contact info */}
            <div className="flex flex-wrap items-center gap-3 text-sm mb-3">
              {lead.email && (
                <a href={`mailto:${lead.email}`} className="text-[#E8735A] hover:underline flex items-center gap-1">
                  <span className="text-xs">{"\u2709\uFE0F"}</span> {lead.email}
                </a>
              )}
              {lead.phone && (
                <a href={`tel:${lead.phone}`} className="text-[#E8735A] hover:underline flex items-center gap-1">
                  <span className="text-xs">{"\uD83D\uDCDE"}</span> {formatPhoneDisplay(lead.phone)}
                </a>
              )}
              {lead.facebook_url && (
                <a href={lead.facebook_url} target="_blank" rel="noopener noreferrer" className="text-[#E8735A] underline hover:text-[#d4634d] flex items-center gap-1 truncate max-w-[300px]">
                  <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                  {lead.facebook_url}
                </a>
              )}
            </div>

            {/* Source & Groups */}
            <div className="flex flex-wrap items-center gap-2 text-sm text-gray-500">
              {lead.source && (
                <span className="bg-gray-100 rounded-full px-2.5 py-0.5 text-xs font-semibold text-gray-600">
                  {SOURCE_MAP[lead.source] || lead.source}
                </span>
              )}
              {lead.groups && <span className="text-gray-400">|</span>}
              {lead.groups && <span>{lead.groups}</span>}
            </div>

            {/* Notes */}
            {lead.notes && (
              <div className="mt-3 p-3 bg-gray-50 rounded-xl text-sm text-gray-600">
                {lead.notes}
              </div>
            )}

            <div className="flex flex-wrap items-center gap-3 text-xs text-gray-400 mt-3">
              <span>Added {formatDate(lead.created_at)}</span>
              <span>Originally met: {lead.originally_met_date ? formatDate(lead.originally_met_date) : "Not set"}</span>
            </div>
          </div>

          <button
            onClick={openEdit}
            className="flex-shrink-0 px-4 py-2 rounded-xl text-sm font-bold text-[#E8735A] border-2 border-[#E8735A]/20 hover:bg-[#E8735A]/5 transition-colors duration-150"
          >
            Edit
          </button>
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
                    onClick={() => isFuture && handleStageClick(s.value)}
                    disabled={!isFuture}
                    className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all duration-150 ${
                      isCurrent
                        ? "bg-[#E8735A] border-[#E8735A] text-white shadow-md"
                        : isCompleted
                        ? "bg-[#E8735A]/20 border-[#E8735A] text-[#E8735A]"
                        : "bg-white border-gray-200 text-gray-400 hover:border-[#E8735A]/50 hover:text-[#E8735A] cursor-pointer"
                    } ${!isFuture ? "cursor-default" : ""}`}
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
          {[
            { action: "call", label: "Log Call", icon: "\uD83D\uDCDE" },
            { action: "text", label: "Log Text", icon: "\uD83D\uDCAC" },
            { action: "email", label: "Log Email", icon: "\uD83D\uDCE7" },
            { action: "facebook_message", label: "Log Message", icon: "\uD83D\uDCAC" },
            { action: "meeting", label: "Log Meeting", icon: "\uD83E\uDD1D" },
            { action: "note", label: "Add Note", icon: "\uD83D\uDCDD" },
          ].map((a) => (
            <button
              key={a.action}
              onClick={() => openAction(a.action, a.label, a.icon)}
              className="px-4 py-2.5 rounded-xl text-sm font-bold border-2 border-gray-100 hover:border-[#E8735A]/30 hover:bg-[#E8735A]/5 text-gray-600 hover:text-[#E8735A] transition-all duration-150"
            >
              <span className="mr-1">{a.icon}</span> {a.label}
            </button>
          ))}
        </div>
      </div>

      {/* Facebook Engagement */}
      <div className="bg-white rounded-2xl border-2 border-gray-100 p-4 mb-4">
        <h3 className="font-display text-base font-bold text-gray-900 mb-3 flex items-center gap-2">
          <span className="w-5 h-5 rounded-full bg-[#1877F2]/10 flex items-center justify-center text-[10px]">{"\uD83D\uDCAC"}</span>
          Facebook Engagement
        </h3>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => openAction("facebook_comment", "Comment on Facebook", "\uD83D\uDCAC")}
            className="px-4 py-2 rounded-full text-sm font-bold bg-[#1877F2]/5 border-2 border-[#1877F2]/20 text-[#1877F2] hover:bg-[#1877F2]/10 transition-colors duration-150"
          >
            {"\uD83D\uDCAC"} Comment
          </button>
          <button
            onClick={() => quickFbAction("facebook_group_invite_sent")}
            className="px-4 py-2 rounded-full text-sm font-bold bg-[#1877F2]/5 border-2 border-[#1877F2]/20 text-[#1877F2] hover:bg-[#1877F2]/10 transition-colors duration-150"
          >
            {"\uD83D\uDC65"} Group Invite Sent
          </button>
          <button
            onClick={() => quickFbAction("facebook_group_invite_accepted")}
            className="px-4 py-2 rounded-full text-sm font-bold bg-[#1877F2]/5 border-2 border-[#1877F2]/20 text-[#1877F2] hover:bg-[#1877F2]/10 transition-colors duration-150"
          >
            {"\u2705"} Group Invite Accepted
          </button>
          <button
            onClick={() => quickFbAction("facebook_friend_request_sent")}
            className="px-4 py-2 rounded-full text-sm font-bold bg-[#1877F2]/5 border-2 border-[#1877F2]/20 text-[#1877F2] hover:bg-[#1877F2]/10 transition-colors duration-150"
          >
            {"\uD83E\uDD1D"} Friend Request Sent
          </button>
          <button
            onClick={() => quickFbAction("facebook_friend_request_accepted")}
            className="px-4 py-2 rounded-full text-sm font-bold bg-[#1877F2]/5 border-2 border-[#1877F2]/20 text-[#1877F2] hover:bg-[#1877F2]/10 transition-colors duration-150"
          >
            {"\u2705"} Friend Request Accepted
          </button>
          <button
            onClick={() => openAction("facebook_tag", "Tagged on Post", "\uD83C\uDFF7\uFE0F")}
            className="px-4 py-2 rounded-full text-sm font-bold bg-[#1877F2]/5 border-2 border-[#1877F2]/20 text-[#1877F2] hover:bg-[#1877F2]/10 transition-colors duration-150"
          >
            {"\uD83C\uDFF7\uFE0F"} Tagged on Post
          </button>
          <button
            onClick={() => openAction("facebook_message", "Facebook Message", "\uD83D\uDCAC")}
            className="px-4 py-2 rounded-full text-sm font-bold bg-[#1877F2]/5 border-2 border-[#1877F2]/20 text-[#1877F2] hover:bg-[#1877F2]/10 transition-colors duration-150"
          >
            {"\uD83D\uDCAC"} FB Message
          </button>
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
            <h2 className="font-display text-lg font-bold text-gray-900 mb-2">Change Stage</h2>
            <p className="text-sm text-gray-500 mb-4">
              Move <strong>{lead.full_name}</strong> to <strong>{stageConfirm.label}</strong>?
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

      {/* Edit Lead Modal */}
      {showEdit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/30 backdrop-blur-sm" onClick={() => setShowEdit(false)} />
          <div className="relative bg-white rounded-2xl shadow-xl border-2 border-gray-100 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <h2 className="font-display text-xl font-bold text-gray-900 mb-1">Edit Lead</h2>
              <p className="text-sm text-gray-500 mb-5">Update {lead.full_name}&apos;s information</p>

              {editError && (
                <div className="bg-red-50 border-2 border-red-200 rounded-xl px-4 py-2.5 mb-4">
                  <p className="text-sm text-red-700">{editError}</p>
                </div>
              )}

              <form onSubmit={handleEditSave} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase tracking-wide mb-1">Full Name *</label>
                  <input
                    type="text"
                    value={editData.full_name}
                    onChange={(e) => setEditData((d) => ({ ...d, full_name: e.target.value }))}
                    className="w-full rounded-xl border-2 border-gray-200 px-4 py-2.5 font-body text-sm focus:outline-none focus:border-[#E8735A] focus:ring-1 focus:ring-[#E8735A]/30 transition-colors"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-400 uppercase tracking-wide mb-1">Email</label>
                    <input
                      type="email"
                      value={editData.email}
                      onChange={(e) => setEditData((d) => ({ ...d, email: e.target.value }))}
                      className="w-full rounded-xl border-2 border-gray-200 px-4 py-2.5 font-body text-sm focus:outline-none focus:border-[#E8735A] focus:ring-1 focus:ring-[#E8735A]/30 transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-400 uppercase tracking-wide mb-1">Phone</label>
                    <input
                      type="tel"
                      value={editData.phone}
                      onChange={(e) => setEditData((d) => ({ ...d, phone: e.target.value }))}
                      className="w-full rounded-xl border-2 border-gray-200 px-4 py-2.5 font-body text-sm focus:outline-none focus:border-[#E8735A] focus:ring-1 focus:ring-[#E8735A]/30 transition-colors"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase tracking-wide mb-1">Facebook Profile URL</label>
                  <input
                    type="url"
                    value={editData.facebook_url}
                    onChange={(e) => setEditData((d) => ({ ...d, facebook_url: e.target.value }))}
                    className="w-full rounded-xl border-2 border-gray-200 px-4 py-2.5 font-body text-sm focus:outline-none focus:border-[#E8735A] focus:ring-1 focus:ring-[#E8735A]/30 transition-colors"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-400 uppercase tracking-wide mb-1">Source</label>
                    <select
                      value={editData.source}
                      onChange={(e) => setEditData((d) => ({ ...d, source: e.target.value }))}
                      className="w-full rounded-xl border-2 border-gray-200 px-3 py-2.5 font-body text-sm bg-white focus:outline-none focus:border-[#E8735A] focus:ring-1 focus:ring-[#E8735A]/30 transition-colors"
                    >
                      <option value="">Select source...</option>
                      {SOURCE_OPTIONS.map((s) => (
                        <option key={s.value} value={s.value}>{s.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-400 uppercase tracking-wide mb-1">Stage</label>
                    <select
                      value={editData.stage}
                      onChange={(e) => setEditData((d) => ({ ...d, stage: e.target.value }))}
                      className="w-full rounded-xl border-2 border-gray-200 px-3 py-2.5 font-body text-sm bg-white focus:outline-none focus:border-[#E8735A] focus:ring-1 focus:ring-[#E8735A]/30 transition-colors"
                    >
                      {STAGES.map((s) => (
                        <option key={s.value} value={s.value}>{s.label}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-400 uppercase tracking-wide mb-1">Next Follow-up</label>
                    <input
                      type="date"
                      value={editData.next_followup_date}
                      onChange={(e) => setEditData((d) => ({ ...d, next_followup_date: e.target.value }))}
                      className="w-full rounded-xl border-2 border-gray-200 px-3 py-2.5 font-body text-sm focus:outline-none focus:border-[#E8735A] focus:ring-1 focus:ring-[#E8735A]/30 transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-400 uppercase tracking-wide mb-1">Originally Met</label>
                    <input
                      type="date"
                      value={editData.originally_met_date}
                      onChange={(e) => setEditData((d) => ({ ...d, originally_met_date: e.target.value }))}
                      className="w-full rounded-xl border-2 border-gray-200 px-3 py-2.5 font-body text-sm focus:outline-none focus:border-[#E8735A] focus:ring-1 focus:ring-[#E8735A]/30 transition-colors"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase tracking-wide mb-1">Groups</label>
                  <input
                    type="text"
                    value={editData.groups}
                    onChange={(e) => setEditData((d) => ({ ...d, groups: e.target.value }))}
                    placeholder="e.g. Local running club, Mom's group on FB"
                    className="w-full rounded-xl border-2 border-gray-200 px-4 py-2.5 font-body text-sm focus:outline-none focus:border-[#E8735A] focus:ring-1 focus:ring-[#E8735A]/30 transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase tracking-wide mb-1">Notes</label>
                  <textarea
                    value={editData.notes}
                    onChange={(e) => setEditData((d) => ({ ...d, notes: e.target.value }))}
                    rows={3}
                    className="w-full rounded-xl border-2 border-gray-200 px-4 py-2.5 font-body text-sm focus:outline-none focus:border-[#E8735A] focus:ring-1 focus:ring-[#E8735A]/30 transition-colors resize-none"
                  />
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    type="submit"
                    disabled={saving}
                    className="flex-1 bg-[#E8735A] hover:bg-[#d4634d] disabled:bg-gray-300 text-white px-5 py-2.5 rounded-xl text-sm font-bold transition-all duration-150 active:scale-95"
                  >
                    {saving ? "Saving..." : "Save Changes"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowEdit(false)}
                    className="px-5 py-2.5 rounded-xl text-sm font-bold text-gray-500 border-2 border-gray-200 hover:border-gray-300 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
