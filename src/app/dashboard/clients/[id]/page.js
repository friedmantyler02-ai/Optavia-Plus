"use client";

import { useState, useEffect } from "react";
import { useCoach } from "../../layout";
import { useRouter, useParams } from "next/navigation";
import AssignSequence from "./AssignSequence";
import TouchpointTimeline from './TouchpointTimeline';
import ConfirmDialog from "../../components/ConfirmDialog";
import useShowToast from "@/hooks/useShowToast";
import { formatPhoneDisplay } from "@/lib/phone";
import { CHECKIN_MESSAGES, REENGAGEMENT_MESSAGES, personalizeMessage } from "@/lib/suggested-messages";

const statusOptions = ["new", "active", "plateau", "milestone", "lapsed", "archived"];
const statusEmojis = { active: "✅", new: "🌱", plateau: "🏔️", milestone: "🎉", lapsed: "💛", archived: "📦" };
const statusLabels = { active: "Active", new: "New Client", plateau: "Plateau", milestone: "Milestone!", lapsed: "Lapsed", archived: "Archived" };

const programPhaseOptions = [
  { value: "active_losing", label: "Active - Losing" },
  { value: "active_gaining", label: "Active - Gaining" },
  { value: "maintenance", label: "Maintenance" },
  { value: "paused", label: "Paused" },
];

const sourceOptions = [
  { value: "facebook_post", label: "Facebook Post" },
  { value: "facebook_group", label: "Facebook Group" },
  { value: "instagram", label: "Instagram" },
  { value: "referral", label: "Referral" },
  { value: "in_person", label: "In Person" },
  { value: "past_client", label: "Past Client" },
  { value: "other", label: "Other" },
];
const sourceMap = Object.fromEntries(sourceOptions.map((s) => [s.value, s.label]));

function phoneDigits(raw) {
  if (!raw) return "";
  return String(raw).replace(/\D/g, "");
}

function normalizeSocialUrl(value, base) {
  if (!value) return "";
  const trimmed = value.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  // Strip leading @ if present
  const username = trimmed.replace(/^@/, "");
  return `${base}${username}`;
}

function getRelationshipScore(client) {
  const daysSinceContact = client.last_contact_date
    ? Math.floor((Date.now() - new Date(client.last_contact_date)) / 86400000)
    : 999;
  let score = 0;
  if (client.weight_start && client.weight_current && client.weight_start > client.weight_current) {
    const pctLost = ((client.weight_start - client.weight_current) / client.weight_start) * 100;
    score += Math.min(35, Math.round(pctLost * 3.5));
  } else { score += 5; }
  const ss = { active: 25, new: 20, milestone: 30, plateau: 12, lapsed: 5, archived: 0 };
  score += ss[client.status] || 10;
  if (daysSinceContact < 3) score += 35;
  else if (daysSinceContact < 7) score += 28;
  else if (daysSinceContact < 14) score += 20;
  else if (daysSinceContact < 30) score += 10;
  else score += 2;
  return Math.min(100, score);
}

function getScoreColor(s) { return s >= 70 ? "#4a7c59" : s >= 40 ? "#c4855c" : "#c25b50"; }

function QuickMessageCard({ client }) {
  const isCheckin = ["active", "new", "milestone"].includes(client.status);
  const category = isCheckin ? "checkin" : "reengagement";
  const categoryLabel = isCheckin ? "Check-in" : "Re-engagement";
  const prewritten = isCheckin ? CHECKIN_MESSAGES : REENGAGEMENT_MESSAGES;
  const firstName = (client.full_name || "").split(" ")[0] || "there";

  const [customMessages, setCustomMessages] = useState([]);
  const [msgIndex, setMsgIndex] = useState(0);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch("/api/coach-messages")
      .then((r) => (r.ok ? r.json() : { data: [] }))
      .then(({ data }) => {
        setCustomMessages(
          (data || [])
            .filter((m) => m.category === category)
            .map((m) => m.message_text)
        );
      })
      .catch(() => {});
  }, [category]);

  const allMessages = [...customMessages, ...prewritten];
  const currentMessage = personalizeMessage(
    allMessages[msgIndex % allMessages.length] || "",
    firstName
  );
  const isCustom = msgIndex < customMessages.length;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(currentMessage);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = currentMessage;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleNext = () => {
    setMsgIndex((prev) => (prev + 1) % allMessages.length);
    setCopied(false);
  };

  if (allMessages.length === 0) return null;

  return (
    <div className="bg-white rounded-2xl p-5 shadow-sm mb-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-extrabold">💬 Quick Message</h2>
        <div className="flex items-center gap-2">
          <span className={`px-2.5 py-1 rounded-lg text-xs font-bold ${isCheckin ? "bg-green-50 text-green-600" : "bg-amber-50 text-amber-600"}`}>
            {categoryLabel}
          </span>
          {isCustom && (
            <span className="px-2.5 py-1 rounded-lg bg-brand-50 text-brand-500 text-xs font-bold">
              Custom
            </span>
          )}
        </div>
      </div>
      <p className="font-body text-gray-700 text-base leading-relaxed mb-4 whitespace-pre-wrap bg-[#faf7f2] rounded-xl p-4">
        {currentMessage}
      </p>
      <div className="flex gap-2">
        <button
          onClick={handleCopy}
          className={`px-4 py-2.5 rounded-xl text-sm font-bold transition-colors duration-150 min-h-[44px] touch-manipulation ${
            copied
              ? "bg-green-100 text-green-700"
              : "bg-brand-500 text-white hover:bg-brand-600"
          }`}
        >
          {copied ? "Copied!" : "Copy"}
        </button>
        {allMessages.length > 1 && (
          <button
            onClick={handleNext}
            className="px-4 py-2.5 rounded-xl text-sm font-bold border-2 border-gray-200 text-gray-500 hover:bg-gray-50 transition-colors duration-150 min-h-[44px] touch-manipulation"
          >
            Next Message
          </button>
        )}
        <span className="self-center text-xs text-gray-400 ml-auto">
          {msgIndex % allMessages.length + 1} of {allMessages.length}
        </span>
      </div>
    </div>
  );
}

const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

export default function ClientDetailPage() {
  const { coach, supabase } = useCoach();
  const router = useRouter();
  const params = useParams();
  const [client, setClient] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [activities, setActivities] = useState([]);
  const [showAssign, setShowAssign] = useState(false);
  const [timelineKey, setTimelineKey] = useState(0);
  const [hasSequences, setHasSequences] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [weightInput, setWeightInput] = useState("");
  const [scalePicChecked, setScalePicChecked] = useState(false);
  const [loggingWeight, setLoggingWeight] = useState(false);
  const [noteModal, setNoteModal] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [meetingModal, setMeetingModal] = useState(false);
  const [meetingDesc, setMeetingDesc] = useState("");
  const [meetingDate, setMeetingDate] = useState("");
  const [meetingTime, setMeetingTime] = useState("");
  const [loggingMeeting, setLoggingMeeting] = useState(false);
  const [reminderConfirm, setReminderConfirm] = useState(null);
  const [editingSocials, setEditingSocials] = useState(false);
  const [socialsForm, setSocialsForm] = useState({ facebook_url: "", instagram_url: "" });
  const showToast = useShowToast();

  useEffect(() => {
    if (!reminderConfirm) return;
    const t = setTimeout(() => setReminderConfirm(null), 2000);
    return () => clearTimeout(t);
  }, [reminderConfirm]);

  useEffect(() => { loadClient(); }, [params.id]);

  const loadClient = async () => {
    try {
      const { data, error: cErr } = await supabase.from("clients").select("*").eq("id", params.id).eq("coach_id", coach.id).single();
      if (cErr || !data) { router.push("/dashboard/clients"); return; }
      setClient(data); setForm(data);
      const { data: acts } = await supabase.from("activities").select("*").eq("coach_id", coach.id).eq("client_id", params.id).order("created_at", { ascending: false }).limit(20);
      if (acts) setActivities(acts);
      // Check if any sequences exist in the database
      const { data: seqs } = await supabase.from("touchpoint_sequences").select("id").eq("coach_id", coach.id).limit(1);
      setHasSequences(seqs && seqs.length > 0);
      setLoadError(null);
    } catch (err) {
      console.error("Error loading client:", err);
      setLoadError("Something went wrong loading this client.");
    } finally {
      setLoading(false);
    }
  };

  // Check if scale pic was already logged this week
  useEffect(() => {
    if (!client) return;
    fetch("/api/clients/checkin-weekly")
      .then(r => r.ok ? r.json() : { checkins: [] })
      .then(({ checkins }) => {
        setScalePicChecked(checkins.some(c => c.client_id === client.id && c.check_type === "scale_photo"));
      })
      .catch(() => {});
  }, [client?.id]);

  const logScalePicAndWeight = async () => {
    setLoggingWeight(true);
    try {
      // Toggle scale pic via existing API
      if (!scalePicChecked) {
        await fetch("/api/clients/checkin-weekly", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ client_id: client.id, check_type: "scale_photo" }),
        });
        setScalePicChecked(true);
      }

      // Update weight if provided
      if (weightInput) {
        const newWeight = Number(weightInput);
        await supabase.from("clients").update({
          weight_current: newWeight,
          updated_at: new Date().toISOString(),
        }).eq("id", client.id);

        await supabase.from("activities").insert({
          coach_id: coach.id,
          client_id: client.id,
          action: "Logged weight",
          details: `${newWeight} lbs`,
        });

        setClient(prev => ({ ...prev, weight_current: newWeight }));
        setForm(prev => ({ ...prev, weight_current: newWeight }));
        setWeightInput("");

        // Refresh activities
        const { data: acts } = await supabase.from("activities").select("*").eq("coach_id", coach.id).eq("client_id", client.id).order("created_at", { ascending: false }).limit(20);
        if (acts) setActivities(acts);
      }

      showToast({ message: "Scale pic & weight logged", variant: "success" });
    } catch {
      showToast({ message: "Something went wrong — please try again", variant: "error" });
    } finally {
      setLoggingWeight(false);
    }
  };

  const saveChanges = async () => {
    setSaving(true);
    try {
      // weight_goal and program_phase require migration:
      // ALTER TABLE clients ADD COLUMN IF NOT EXISTS weight_goal numeric;
      // ALTER TABLE clients ADD COLUMN IF NOT EXISTS program_phase text DEFAULT 'active_losing';
      const updates = {
        full_name: form.full_name,
        email: form.email || null,
        phone: form.phone || null,
        plan: form.plan || null,
        weight_current: form.weight_current ? Number(form.weight_current) : null,
        weight_start: form.weight_start ? Number(form.weight_start) : null,
        weight_goal: form.weight_goal ? Number(form.weight_goal) : null,
        program_phase: form.program_phase || null,
        facebook_url: form.facebook_url || null,
        instagram_url: form.instagram_url || null,
        is_facebook_friend: form.is_facebook_friend || false,
        is_instagram_follower: form.is_instagram_follower || false,
        source: form.source || null,
        groups: form.groups || null,
        originally_met_date: form.originally_met_date || null,
        notes: form.notes || null,
        status: form.status,
        updated_at: new Date().toISOString(),
      };
      const { data } = await supabase.from("clients").update(updates).eq("id", client.id).select().single();
      if (data) { setClient(data); setForm(data); }
      await supabase.from("activities").insert({ coach_id: coach.id, client_id: client.id, action: "Updated client info", details: client.full_name });
      setEditing(false);
      showToast({ message: "Client updated", variant: "success" });
    } catch (err) {
      console.error("Error saving client:", err);
      showToast({ message: "Something went wrong — please try again", variant: "error" });
    } finally {
      setSaving(false);
    }
  };

  const logQuickAction = async (actionType, details) => {
    try {
      const actionText = actionType === "call" ? "Logged a call" : actionType === "text" ? "Logged a text check-in" : actionType === "meeting" ? "Logged a meeting" : actionType === "comment" ? "Commented on client's post" : actionType === "shared_post" ? "Shared post with client" : "Logged a note";
      await supabase.from("activities").insert({ coach_id: coach.id, client_id: client.id, action: actionText, details: details || client.full_name });
      await supabase.from("clients").update({ last_contact_date: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", client.id);
      setClient(prev => ({ ...prev, last_contact_date: new Date().toISOString() }));
      const { data: acts } = await supabase.from("activities").select("*").eq("coach_id", coach.id).eq("client_id", params.id).order("created_at", { ascending: false }).limit(20);
      if (acts) setActivities(acts);
      const label = actionType === "call" ? "Call logged" : actionType === "text" ? "Text logged" : actionType === "meeting" ? "Meeting logged" : actionType === "comment" ? "Comment logged" : actionType === "shared_post" ? "Shared post logged" : "Note saved";
      showToast({ message: label, variant: "success" });
    } catch (err) {
      console.error("Error logging action:", err);
      showToast({ message: "Something went wrong — please try again", variant: "error" });
    }
  };

  const deleteActivity = async (actId) => {
    if (!window.confirm("Delete this activity entry?")) return;
    setActivities((prev) => prev.filter((a) => a.id !== actId));
    const { error } = await supabase.from("activities").delete().eq("id", actId).eq("coach_id", coach.id);
    if (error) {
      showToast({ message: "Failed to delete — please try again", variant: "error" });
      const { data: acts } = await supabase.from("activities").select("*").eq("coach_id", coach.id).eq("client_id", params.id).order("created_at", { ascending: false }).limit(20);
      if (acts) setActivities(acts);
    } else {
      showToast({ message: "Activity deleted", variant: "success" });
    }
  };

  const handleDeleteClick = () => setDeleteConfirm(true);
  const handleDeleteConfirm = async () => {
    setDeleteConfirm(false);
    await supabase.from("clients").delete().eq("id", client.id);
    await supabase.from("activities").insert({ coach_id: coach.id, action: "Deleted client", details: client.full_name });
    router.push("/dashboard/clients");
  };

  if (loading) return <div className="text-center py-20 text-gray-400 font-semibold" style={{ fontFamily: 'Nunito, sans-serif' }}>Loading client...</div>;
  if (loadError) return (
    <div className="text-center py-20">
      <p className="text-3xl mb-3">⚠️</p>
      <p className="text-gray-600 font-semibold" style={{ fontFamily: 'Nunito, sans-serif' }}>{loadError}</p>
      <button onClick={() => { setLoadError(null); setLoading(true); loadClient(); }} className="mt-3 px-4 py-2 bg-brand-500 text-white rounded-xl font-bold text-sm" style={{ fontFamily: 'Nunito, sans-serif' }}>Retry</button>
    </div>
  );
  if (!client) return null;

  // const score = getRelationshipScore(client); // hidden for now
  const weightLost = client.weight_start && client.weight_current ? client.weight_start - client.weight_current : 0;

  return (
    <div className="animate-fade-up">
      <button onClick={() => router.push("/dashboard/clients")} className="px-4 py-2 bg-white border-2 border-gray-200 rounded-xl font-bold text-sm text-gray-500 mb-5 hover:bg-gray-50 transition-colors duration-150 min-h-[44px] touch-manipulation">
        ← Back to All Clients
      </button>
      <div className="bg-white rounded-2xl p-6 shadow-sm mb-5">
        <div className="flex items-center gap-4 mb-4">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl flex-shrink-0" style={{ background: "linear-gradient(135deg, #e8f0ea, #eaf2f6)" }}>
            {statusEmojis[client.status]}
          </div>
          <div className="min-w-0">
            <h1 className="font-display text-2xl font-bold">{client.full_name}</h1>
            <p className="text-sm text-gray-400">
              {client.email || "No email"} ·{" "}
              {client.phone ? (
                <a href={`tel:${phoneDigits(client.phone)}`} className="text-[#E8735A] hover:underline">{formatPhoneDisplay(client.phone)}</a>
              ) : "No phone"}
            </p>
            <div className="flex items-center gap-2 mt-1">
              <span className="inline-block px-2.5 py-1 rounded-lg text-xs font-bold bg-[#faf7f2] text-gray-500">
                {statusEmojis[client.status]} {statusLabels[client.status]}
              </span>
              {client.facebook_url && (
                <a href={normalizeSocialUrl(client.facebook_url, "https://facebook.com/")} target="_blank" rel="noopener noreferrer" className="text-lg hover:opacity-70 transition-opacity" title="Facebook">📘</a>
              )}
              {client.instagram_url && (
                <a href={normalizeSocialUrl(client.instagram_url, "https://instagram.com/")} target="_blank" rel="noopener noreferrer" className="text-lg hover:opacity-70 transition-opacity" title="Instagram">📷</a>
              )}
            </div>
          </div>
        </div>
        {/* Inline Weekly Reminder */}
        <div className="border-t border-gray-100 pt-4">
          <div className="flex items-center gap-3 flex-wrap">
            <button
              onClick={() => {
                const newEnabled = !client.weekly_reminder;
                if (!newEnabled) {
                  // Toggle off — save immediately
                  setSaving(true);
                  supabase.from("clients").update({ weekly_reminder: false, contact_day: null, updated_at: new Date().toISOString() }).eq("id", client.id).select().single()
                    .then(({ data }) => { if (data) { setClient(data); setForm(data); } setReminderConfirm("Reminder removed"); setSaving(false); })
                    .catch(() => setSaving(false));
                } else {
                  // Toggle on — optimistic UI, wait for day pick to save
                  setClient(prev => ({ ...prev, weekly_reminder: true }));
                  setForm(prev => ({ ...prev, weekly_reminder: true }));
                }
              }}
              disabled={saving}
              className={`w-12 h-7 rounded-full transition-colors duration-200 relative flex-shrink-0 ${client.weekly_reminder ? "bg-[#E8735A]" : "bg-gray-300"} ${saving ? "opacity-50" : ""}`}
              aria-label={client.weekly_reminder ? "Disable weekly reminder" : "Enable weekly reminder"}
            >
              <span className={`absolute top-0.5 left-0.5 w-6 h-6 bg-white rounded-full shadow transition-transform duration-200 ${client.weekly_reminder ? "translate-x-5" : ""}`} />
            </button>
            <span className="text-sm font-semibold text-gray-600">Weekly Reminder</span>
            {client.weekly_reminder && (
              <div className="flex gap-1.5 flex-wrap">
                {WEEKDAYS.map((day) => (
                  <button
                    key={day}
                    onClick={() => {
                      setSaving(true);
                      supabase.from("clients").update({ weekly_reminder: true, contact_day: day, updated_at: new Date().toISOString() }).eq("id", client.id).select().single()
                        .then(({ data }) => { if (data) { setClient(data); setForm(data); } setReminderConfirm(`Reminder set for ${day}s`); setSaving(false); })
                        .catch(() => setSaving(false));
                    }}
                    disabled={saving}
                    className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all duration-150 min-h-[44px] min-w-[44px] touch-manipulation ${
                      client.contact_day === day
                        ? "bg-[#E8735A] text-white shadow-sm"
                        : "bg-[#faf7f2] text-gray-600 hover:bg-[#f0ebe3] active:scale-95"
                    } ${saving ? "opacity-50" : ""}`}
                  >
                    {day.slice(0, 3)}
                  </button>
                ))}
              </div>
            )}
            {!client.weekly_reminder && (
              <span className="text-xs text-gray-400">Get a calendar reminder to check in</span>
            )}
          </div>
          {reminderConfirm && (
            <p className="mt-2 text-sm font-semibold text-green-600 animate-fade-up">{reminderConfirm} ✓</p>
          )}
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <button onClick={() => logQuickAction("call")} className="bg-white rounded-2xl p-4 shadow-sm flex flex-col items-center gap-2 hover:shadow-md transition-all duration-150 active:scale-95 min-h-[72px] touch-manipulation">
          <span className="text-2xl">📞</span><span className="font-bold text-sm">Log a Call</span>
        </button>
        <button onClick={() => logQuickAction("text")} className="bg-white rounded-2xl p-4 shadow-sm flex flex-col items-center gap-2 hover:shadow-md transition-all duration-150 active:scale-95 min-h-[72px] touch-manipulation">
          <span className="text-2xl">💬</span><span className="font-bold text-sm">Log a Text</span>
        </button>
        <button onClick={() => { setNoteText(""); setNoteModal(true); }} className="bg-white rounded-2xl p-4 shadow-sm flex flex-col items-center gap-2 hover:shadow-md transition-all duration-150 active:scale-95 min-h-[72px] touch-manipulation">
          <span className="text-2xl">📝</span><span className="font-bold text-sm">Log a Note</span>
        </button>
        {/* ARCHIVED: Touchpoint sequences hidden until automation is ready */}
        {/* <button onClick={() => setShowAssign(true)} disabled={!hasSequences} className={"rounded-2xl p-4 shadow-sm flex flex-col items-center gap-2 transition-all duration-150 active:scale-95 min-h-[72px] touch-manipulation " + (hasSequences ? "bg-blue-600 text-white hover:bg-blue-700 hover:shadow-md" : "bg-gray-200 text-gray-400 cursor-not-allowed")}>
          <span className="text-2xl">▶️</span><span className="font-bold text-sm">{hasSequences ? "Start Sequence" : "No Sequences"}</span>
        </button> */}
        <button onClick={() => {
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
        }} className="bg-white rounded-2xl p-4 shadow-sm flex flex-col items-center gap-2 hover:shadow-md transition-all duration-150 active:scale-95 min-h-[72px] touch-manipulation">
          <span className="text-2xl">📅</span><span className="font-bold text-sm">Log a Meeting</span>
        </button>
      </div>
      {/* Log Scale Pic & Weight */}
      <div className="bg-white rounded-2xl p-5 shadow-sm mb-5">
        <h2 className="text-lg font-extrabold mb-3">📸 Log Scale Pic & Weight</h2>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-end gap-3">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={scalePicChecked}
              onChange={async () => {
                try {
                  await fetch("/api/clients/checkin-weekly", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ client_id: client.id, check_type: "scale_photo" }),
                  });
                  setScalePicChecked(!scalePicChecked);
                  showToast({ message: scalePicChecked ? "Scale pic unchecked" : "Scale pic checked", variant: "success" });
                } catch {
                  showToast({ message: "Failed to update — try again", variant: "error" });
                }
              }}
              className="w-5 h-5 rounded border-gray-300 text-green-600 focus:ring-green-500"
            />
            <span className={`text-sm font-semibold ${scalePicChecked ? "text-green-600" : "text-gray-500"}`}>
              Scale pic received this week
            </span>
          </label>
          <div className="flex-1 flex gap-2">
            <input
              type="number"
              value={weightInput}
              onChange={e => setWeightInput(e.target.value)}
              placeholder="New weight (lbs)"
              className="flex-1 px-4 py-2.5 text-base border-2 border-gray-200 rounded-xl focus:border-[#E8735A] focus:ring-1 focus:ring-[#E8735A]/30 focus:outline-none transition-colors min-h-[44px]"
            />
            <button
              onClick={logScalePicAndWeight}
              disabled={loggingWeight || (!weightInput && scalePicChecked)}
              className="px-5 py-2.5 bg-[#E8735A] hover:bg-[#d4634d] text-white rounded-xl text-sm font-bold transition-all duration-150 active:scale-95 disabled:opacity-50 min-h-[44px] touch-manipulation"
            >
              {loggingWeight ? "Saving..." : "Log"}
            </button>
          </div>
        </div>
        {/* Recent weight entries */}
        {activities.filter(a => a.action === "Logged weight").length > 0 && (
          <div className="mt-3 pt-3 border-t border-gray-100">
            <p className="text-xs font-bold text-gray-400 uppercase mb-2">Recent Weights</p>
            <div className="flex flex-wrap gap-2">
              {activities.filter(a => a.action === "Logged weight").slice(0, 8).map(a => (
                <span key={a.id} className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-[#faf7f2] rounded-lg text-xs">
                  <span className="font-bold text-gray-700">{a.details}</span>
                  <span className="text-gray-400">{new Date(a.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Quick Message */}
      <QuickMessageCard client={client} />

      {/* ARCHIVED: Touchpoint sequences hidden until automation is ready */}
      {/* <div className="mt-8">
        <h2 className="text-2xl font-bold text-gray-800 mb-4" style={{ fontFamily: 'Playfair Display, serif' }}>
          Active Sequences
        </h2>
        <TouchpointTimeline
          key={timelineKey}
          clientId={client.id}
          clientName={client.full_name}
          onUpdate={() => { setTimelineKey(prev => prev + 1); }}
        />
      </div>
      {showAssign && (
        <AssignSequence
          supabase={supabase}
          clientId={client.id}
          coachId={coach.id}
          onAssigned={() => { setShowAssign(false); loadClient(); }}
          onClose={() => setShowAssign(false)}
        />
      )} */}
      {/* Profile & Social */}
      <div className="bg-white rounded-2xl p-6 shadow-sm mb-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-extrabold">🔗 Socials</h2>
          {!editingSocials && (client.facebook_url || client.instagram_url) && (
            <button
              onClick={() => { setSocialsForm({ facebook_url: client.facebook_url || "", instagram_url: client.instagram_url || "" }); setEditingSocials(true); }}
              className="px-3 py-1.5 rounded-xl text-xs font-bold text-gray-500 bg-gray-100 hover:bg-gray-200 transition-colors min-h-[44px] min-w-[44px] touch-manipulation flex items-center gap-1"
            >
              ✏️ Edit
            </button>
          )}
        </div>
        {editingSocials ? (
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-bold text-gray-400 uppercase tracking-wide mb-1">Facebook</label>
              <input
                type="text"
                value={socialsForm.facebook_url}
                onChange={(e) => setSocialsForm((p) => ({ ...p, facebook_url: e.target.value }))}
                placeholder="Username or profile URL"
                className="w-full rounded-xl border-2 border-gray-200 px-4 py-2.5 font-body text-sm focus:outline-none focus:border-[#E8735A] focus:ring-1 focus:ring-[#E8735A]/30 transition-colors min-h-[44px]"
                autoFocus
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-400 uppercase tracking-wide mb-1">Instagram</label>
              <input
                type="text"
                value={socialsForm.instagram_url}
                onChange={(e) => setSocialsForm((p) => ({ ...p, instagram_url: e.target.value }))}
                placeholder="Username or profile URL"
                className="w-full rounded-xl border-2 border-gray-200 px-4 py-2.5 font-body text-sm focus:outline-none focus:border-[#E8735A] focus:ring-1 focus:ring-[#E8735A]/30 transition-colors min-h-[44px]"
              />
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setEditingSocials(false)}
                className="flex-1 py-2.5 rounded-xl border-2 border-gray-200 font-bold text-sm text-gray-600 hover:bg-gray-50 transition-colors min-h-[44px] touch-manipulation"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  setSaving(true);
                  try {
                    const updates = {
                      facebook_url: socialsForm.facebook_url.trim() || null,
                      instagram_url: socialsForm.instagram_url.trim() || null,
                      updated_at: new Date().toISOString(),
                    };
                    const { data } = await supabase.from("clients").update(updates).eq("id", client.id).select().single();
                    if (data) { setClient(data); setForm(data); }
                    setEditingSocials(false);
                    showToast({ message: "Socials updated", variant: "success" });
                  } catch {
                    showToast({ message: "Something went wrong — please try again", variant: "error" });
                  } finally {
                    setSaving(false);
                  }
                }}
                disabled={saving}
                className={"flex-1 py-2.5 rounded-xl font-bold text-sm transition-colors min-h-[44px] touch-manipulation " + (saving ? "bg-gray-200 text-gray-400" : "bg-[#E8735A] text-white hover:bg-[#d4654e]")}
              >
                {saving ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {client.facebook_url && (
              <div className="flex items-center justify-between p-3 bg-[#faf7f2] rounded-xl">
                <span className="text-xs font-bold text-gray-400 uppercase">📘 Facebook</span>
                <a href={normalizeSocialUrl(client.facebook_url, "https://facebook.com/")} target="_blank" rel="noopener noreferrer" className="text-sm font-semibold text-[#E8735A] underline hover:text-[#d4634d] truncate max-w-[250px]">
                  {client.facebook_url.replace(/^@/, "")}
                </a>
              </div>
            )}
            {client.instagram_url && (
              <div className="flex items-center justify-between p-3 bg-[#faf7f2] rounded-xl">
                <span className="text-xs font-bold text-gray-400 uppercase">📷 Instagram</span>
                <a href={normalizeSocialUrl(client.instagram_url, "https://instagram.com/")} target="_blank" rel="noopener noreferrer" className="text-sm font-semibold text-[#E8735A] underline hover:text-[#d4634d] truncate max-w-[250px]">
                  {client.instagram_url.replace(/^@/, "")}
                </a>
              </div>
            )}
            {client.source && (
              <div className="flex items-center justify-between p-3 bg-[#faf7f2] rounded-xl">
                <span className="text-xs font-bold text-gray-400 uppercase">Source</span>
                <span className="text-sm font-semibold">{sourceMap[client.source] || client.source}</span>
              </div>
            )}
            {client.originally_met_date && (
              <div className="flex items-center justify-between p-3 bg-[#faf7f2] rounded-xl">
                <span className="text-xs font-bold text-gray-400 uppercase">Originally Met</span>
                <span className="text-sm font-semibold">{new Date(client.originally_met_date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
              </div>
            )}
            {!client.facebook_url && !client.instagram_url && (
              <button
                onClick={() => { setSocialsForm({ facebook_url: "", instagram_url: "" }); setEditingSocials(true); }}
                className="w-full py-4 rounded-xl border-2 border-dashed border-gray-300 text-gray-400 hover:border-[#E8735A] hover:text-[#E8735A] transition-colors font-bold text-sm flex items-center justify-center gap-2 min-h-[56px] touch-manipulation"
              >
                <span className="text-xl">+</span> Add Socials
              </button>
            )}
          </div>
        )}
      </div>

      {/* Engagement */}
      <div className="bg-white rounded-2xl p-6 shadow-sm mb-5">
        <h2 className="text-lg font-extrabold mb-4">💬 Engagement</h2>
        <div className="space-y-3">
          <div className="flex items-center justify-between p-3 bg-[#faf7f2] rounded-xl">
            <span className="text-sm font-semibold text-gray-700">Friends on Facebook</span>
            <button
              onClick={async () => {
                const newVal = !client.is_facebook_friend;
                try {
                  await supabase.from("clients").update({ is_facebook_friend: newVal, updated_at: new Date().toISOString() }).eq("id", client.id);
                  setClient(prev => ({ ...prev, is_facebook_friend: newVal }));
                  setForm(prev => ({ ...prev, is_facebook_friend: newVal }));
                  showToast({ message: newVal ? "Marked as Facebook friend" : "Unmarked Facebook friend", variant: "success" });
                } catch {
                  showToast({ message: "Something went wrong — please try again", variant: "error" });
                }
              }}
              className={`w-11 h-6 rounded-full transition-colors duration-200 relative ${client.is_facebook_friend ? "bg-green-500" : "bg-gray-300"}`}
            >
              <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${client.is_facebook_friend ? "translate-x-5" : ""}`} />
            </button>
          </div>
          <div className="flex items-center justify-between p-3 bg-[#faf7f2] rounded-xl">
            <span className="text-sm font-semibold text-gray-700">Follows on Instagram</span>
            <button
              onClick={async () => {
                const newVal = !client.is_instagram_follower;
                try {
                  await supabase.from("clients").update({ is_instagram_follower: newVal, updated_at: new Date().toISOString() }).eq("id", client.id);
                  setClient(prev => ({ ...prev, is_instagram_follower: newVal }));
                  setForm(prev => ({ ...prev, is_instagram_follower: newVal }));
                  showToast({ message: newVal ? "Marked as Instagram follower" : "Unmarked Instagram follower", variant: "success" });
                } catch {
                  showToast({ message: "Something went wrong — please try again", variant: "error" });
                }
              }}
              className={`w-11 h-6 rounded-full transition-colors duration-200 relative ${client.is_instagram_follower ? "bg-green-500" : "bg-gray-300"}`}
            >
              <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${client.is_instagram_follower ? "translate-x-5" : ""}`} />
            </button>
          </div>
          <div className="grid grid-cols-2 gap-3 pt-1">
            <button
              onClick={() => logQuickAction("comment")}
              className="bg-[#faf7f2] rounded-xl p-3 text-center hover:bg-[#f0ebe3] transition-colors active:scale-95 min-h-[44px] touch-manipulation"
            >
              <span className="text-lg">💬</span>
              <p className="text-xs font-bold text-gray-600 mt-1">Log Comment</p>
            </button>
            <button
              onClick={() => logQuickAction("shared_post")}
              className="bg-[#faf7f2] rounded-xl p-3 text-center hover:bg-[#f0ebe3] transition-colors active:scale-95 min-h-[44px] touch-manipulation"
            >
              <span className="text-lg">🔄</span>
              <p className="text-xs font-bold text-gray-600 mt-1">Log Shared Post</p>
            </button>
          </div>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-5">
        <div className="bg-white rounded-2xl p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-extrabold">📊 Details</h2>
            <button onClick={() => editing ? saveChanges() : setEditing(true)} className={"px-4 py-2 rounded-xl font-bold text-sm transition-all duration-150 " + (editing ? "bg-brand-500 text-white" : "bg-gray-100 text-gray-500 hover:bg-gray-200")}>
              {saving ? "Saving..." : editing ? "Save Changes" : "Edit"}
            </button>
          </div>
          <div className="space-y-3">
            {[
              { key: "full_name", label: "Name" },
              { key: "email", label: "Email" },
              { key: "phone", label: "Phone" },
              { key: "plan", label: "Plan" },
              { key: "weight_start", label: "Starting Weight" },
              { key: "weight_current", label: "Current Weight" },
              { key: "weight_goal", label: "Goal Weight" },
            ].map(f => (
              <div key={f.key} className="flex items-center justify-between p-3 bg-[#faf7f2] rounded-xl">
                <span className="text-xs font-bold text-gray-400 uppercase">{f.label}</span>
                {editing ? (
                  <input value={form[f.key] || ""} onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
                    className="text-right text-base font-semibold bg-white px-3 py-2 rounded-lg border border-gray-200 w-40 focus:outline-none focus:ring-2 focus:ring-[#E8735A] focus:border-transparent transition-colors duration-150 min-h-[44px]" />
                ) : (
                  f.key === "phone" && client.phone ? (
                    <a href={`tel:${phoneDigits(client.phone)}`} className="text-sm font-semibold text-[#E8735A] hover:underline">{formatPhoneDisplay(client.phone)}</a>
                  ) : (
                    <span className="text-sm font-semibold">{f.key === "phone" ? (client.phone ? formatPhoneDisplay(client.phone) : "—") : (client[f.key] || "—")}{(f.key.includes("weight") && client[f.key]) ? " lbs" : ""}</span>
                  )
                )}
              </div>
            ))}
            {/* Status */}
            <div className="flex items-center justify-between p-3 bg-[#faf7f2] rounded-xl">
              <span className="text-xs font-bold text-gray-400 uppercase">Status</span>
              {editing ? (
                <select value={form.status || "active"} onChange={e => setForm(p => ({ ...p, status: e.target.value }))}
                  className="text-right text-base font-semibold bg-white px-3 py-2 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#E8735A] focus:border-transparent transition-colors duration-150 min-h-[44px]">
                  {statusOptions.map(s => <option key={s} value={s}>{statusEmojis[s]} {statusLabels[s]}</option>)}
                </select>
              ) : (
                <span className="text-sm font-semibold">{statusEmojis[client.status]} {statusLabels[client.status]}</span>
              )}
            </div>
            {/* Program Phase */}
            <div className="flex items-center justify-between p-3 bg-[#faf7f2] rounded-xl">
              <span className="text-xs font-bold text-gray-400 uppercase">Program Phase</span>
              {editing ? (
                <select value={form.program_phase || "active_losing"} onChange={e => setForm(p => ({ ...p, program_phase: e.target.value }))}
                  className="text-right text-base font-semibold bg-white px-3 py-2 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#E8735A] focus:border-transparent transition-colors duration-150 min-h-[44px]">
                  {programPhaseOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              ) : (
                <span className="text-sm font-semibold">{programPhaseOptions.find(o => o.value === client.program_phase)?.label || "Active - Losing"}</span>
              )}
            </div>
            {/* Weight Progress */}
            {client.program_phase === "maintenance" && client.weight_current ? (
              <div className="p-3 bg-green-50 rounded-xl">
                <div className="flex justify-between text-xs font-bold">
                  <span className="text-gray-400">Maintenance</span>
                  <span className="text-green-600">Maintaining at {client.weight_current} lbs</span>
                </div>
              </div>
            ) : client.weight_start && client.weight_current ? (
              <div className="p-3 bg-[#faf7f2] rounded-xl">
                <div className="flex justify-between text-xs font-bold mb-1.5">
                  <span className="text-gray-400">Progress</span>
                  <span className="text-[#4a7c59]">{weightLost > 0 ? weightLost + " lbs lost" : "Just starting"}</span>
                </div>
                {client.weight_goal ? (
                  <>
                    <div className="flex items-center gap-2 text-xs mb-1.5">
                      <span className="text-gray-400">{client.weight_start}</span>
                      <div className="flex-1 h-3 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full bg-[#4a7c59] rounded-full transition-all" style={{
                          width: Math.min(100, Math.max(5, ((client.weight_start - client.weight_current) / (client.weight_start - client.weight_goal)) * 100)) + "%"
                        }} />
                      </div>
                      <span className="text-gray-400">{client.weight_goal}</span>
                    </div>
                    <div className="text-xs text-center font-semibold text-gray-500">
                      {client.weight_current > client.weight_goal
                        ? `${(client.weight_current - client.weight_goal).toFixed(1)} lbs to go`
                        : "Goal reached!"}
                    </div>
                  </>
                ) : (
                  <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full bg-[#4a7c59] rounded-full transition-all" style={{ width: Math.min(100, Math.max(5, (weightLost / client.weight_start) * 100 * 3)) + "%" }} />
                  </div>
                )}
              </div>
            ) : null}
          </div>
          <div className="mt-4">
            <label className="text-xs font-bold text-gray-400 uppercase">Notes</label>
            {editing ? (
              <textarea value={form.notes || ""} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} rows={3}
                className="w-full mt-1 px-4 py-3 text-base border-2 border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#E8735A] focus:border-transparent transition-colors duration-150" />
            ) : (
              <p className="mt-1 text-sm text-gray-600 bg-[#faf7f2] p-3 rounded-xl">{client.notes || "No notes yet."}</p>
            )}
          </div>
          <button onClick={handleDeleteClick} className="mt-4 px-4 py-2 text-xs font-bold text-red-400 hover:text-red-600 transition-colors duration-150">
            Delete this client
          </button>
        </div>
        <div className="bg-white rounded-2xl p-6 shadow-sm">
          <h2 className="text-lg font-extrabold mb-4">📋 Activity History</h2>
          {activities.length === 0 ? (
            <div className="text-center py-10 text-gray-400">
              <div className="text-4xl mb-3">📝</div>
              <p className="text-sm">No activity yet. Use the quick actions above to start tracking!</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {activities.map(act => (
                <div key={act.id} className="group p-3 bg-[#faf7f2] rounded-xl flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-semibold text-sm">{act.action}</div>
                    {act.details && act.details !== client.full_name && <div className="text-xs text-gray-500 mt-0.5">{act.details}</div>}
                    <div className="text-xs text-gray-400 mt-1">{new Date(act.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</div>
                  </div>
                  <button
                    onClick={() => deleteActivity(act.id)}
                    className="opacity-0 group-hover:opacity-100 focus:opacity-100 text-gray-400 hover:text-red-500 text-sm font-bold px-1.5 py-0.5 rounded transition-all shrink-0"
                    title="Delete this entry"
                  >
                    &times;
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      {meetingModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/50" onClick={() => setMeetingModal(false)} />
          <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <h2 className="font-display text-lg font-bold text-gray-900 mb-1">📅 Log a Meeting</h2>
            <p className="text-sm text-gray-500 mb-4">Record a meeting with {client.full_name}</p>
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
                    await logQuickAction("meeting", desc);
                    try {
                      await fetch("/api/calendar/events", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          title: `${desc} — ${client.full_name}`,
                          date: meetingDate,
                          time: meetingTime,
                          client_id: client.id,
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
                          summary: `Meeting with ${client.full_name}`,
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
      {noteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/50" onClick={() => setNoteModal(false)} />
          <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <h2 className="font-display text-lg font-bold text-gray-900 mb-1">📝 Log a Note</h2>
            <p className="text-sm text-gray-500 mb-4">Add a note about {client.full_name}</p>
            <textarea
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              placeholder="Type your note here..."
              rows={3}
              className="w-full rounded-xl border-2 border-gray-200 px-4 py-2.5 font-body text-sm focus:outline-none focus:border-[#E8735A] focus:ring-1 focus:ring-[#E8735A]/30 transition-colors resize-none mb-4"
              autoFocus
            />
            <div className="flex gap-3">
              <button onClick={() => setNoteModal(false)} className="flex-1 py-2.5 rounded-xl border-2 border-gray-200 font-bold text-sm text-gray-600 hover:bg-gray-50 transition-colors">
                Cancel
              </button>
              <button
                onClick={async () => {
                  await logQuickAction("note", noteText.trim() || undefined);
                  setNoteModal(false);
                  setNoteText("");
                }}
                disabled={!noteText.trim()}
                className={"flex-1 py-2.5 rounded-xl font-bold text-sm transition-colors " + (noteText.trim() ? "bg-[#E8735A] text-white hover:bg-[#d4654e]" : "bg-gray-200 text-gray-400 cursor-not-allowed")}
              >
                Save Note
              </button>
            </div>
          </div>
        </div>
      )}
      <ConfirmDialog
        isOpen={deleteConfirm}
        title="Delete this client?"
        message={`${client.full_name} will be permanently removed. This cannot be undone.`}
        confirmLabel="Delete"
        confirmVariant="danger"
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeleteConfirm(false)}
      />
    </div>
  );
}
