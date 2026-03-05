"use client";

import { useState, useEffect } from "react";
import { useCoach } from "../../layout";
import { useRouter, useParams } from "next/navigation";
import AssignSequence from "./AssignSequence";
import TouchpointTimeline from './TouchpointTimeline';
import ConfirmDialog from "../../components/ConfirmDialog";
import useShowToast from "@/hooks/useShowToast";

const statusOptions = ["new", "active", "plateau", "milestone", "lapsed", "archived"];
const statusEmojis = { active: "✅", new: "🌱", plateau: "🏔️", milestone: "🎉", lapsed: "💛", archived: "📦" };
const statusLabels = { active: "Active", new: "New Client", plateau: "Plateau", milestone: "Milestone!", lapsed: "Lapsed", archived: "Archived" };

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
  const showToast = useShowToast();

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

  const saveChanges = async () => {
    setSaving(true);
    try {
      const updates = {
        full_name: form.full_name,
        email: form.email || null,
        phone: form.phone || null,
        plan: form.plan || null,
        weight_current: form.weight_current ? Number(form.weight_current) : null,
        weight_start: form.weight_start ? Number(form.weight_start) : null,
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

  const logQuickAction = async (actionType) => {
    try {
      const actionText = actionType === "call" ? "Logged a call" : actionType === "text" ? "Logged a text check-in" : "Logged a note";
      await supabase.from("activities").insert({ coach_id: coach.id, client_id: client.id, action: actionText, details: client.full_name });
      await supabase.from("clients").update({ last_contact_date: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", client.id);
      setClient(prev => ({ ...prev, last_contact_date: new Date().toISOString() }));
      const { data: acts } = await supabase.from("activities").select("*").eq("coach_id", coach.id).eq("client_id", params.id).order("created_at", { ascending: false }).limit(20);
      if (acts) setActivities(acts);
      const label = actionType === "call" ? "Call logged" : actionType === "text" ? "Text logged" : "Note saved";
      showToast({ message: label, variant: "success" });
    } catch (err) {
      console.error("Error logging action:", err);
      showToast({ message: "Something went wrong — please try again", variant: "error" });
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

  const score = getRelationshipScore(client);
  const weightLost = client.weight_start && client.weight_current ? client.weight_start - client.weight_current : 0;

  return (
    <div className="animate-fade-up">
      <button onClick={() => router.push("/dashboard/clients")} className="px-4 py-2 bg-white border-2 border-gray-200 rounded-xl font-bold text-sm text-gray-500 mb-5 hover:bg-gray-50 transition-colors duration-150">
        ← Back to All Clients
      </button>
      <div className="bg-white rounded-2xl p-6 shadow-sm mb-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl" style={{ background: "linear-gradient(135deg, #e8f0ea, #eaf2f6)" }}>
            {statusEmojis[client.status]}
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold">{client.full_name}</h1>
            <p className="text-sm text-gray-400">{client.email || "No email"} · {client.phone || "No phone"}</p>
            <div className="flex gap-2 mt-2 flex-wrap">
              {statusOptions.map(s => (
                <button key={s} onClick={async () => {
                  try {
                    await supabase.from("clients").update({ status: s }).eq("id", client.id);
                    setClient(prev => ({ ...prev, status: s }));
                    setForm(prev => ({ ...prev, status: s }));
                    await supabase.from("activities").insert({ coach_id: coach.id, client_id: client.id, action: "Changed status to " + statusLabels[s], details: client.full_name });
                    showToast({ message: "Status updated", variant: "success" });
                  } catch (err) {
                    showToast({ message: "Something went wrong — please try again", variant: "error" });
                  }
                }}
                  className={"px-2 py-1 rounded-lg text-xs font-bold transition " + (client.status === s ? "bg-brand-500 text-white" : "bg-gray-100 text-gray-400 hover:bg-gray-200")}>
                  {statusEmojis[s]} {statusLabels[s]}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="text-center px-6 py-3 bg-[#faf7f2] rounded-2xl">
          <div className="text-4xl font-extrabold" style={{ color: getScoreColor(score) }}>{score}</div>
          <div className="text-xs font-bold text-gray-400 uppercase">Relationship Score</div>
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <button onClick={() => logQuickAction("call")} className="bg-white rounded-2xl p-4 shadow-sm flex flex-col items-center gap-2 hover:shadow-md transition-all duration-150 active:scale-95">
          <span className="text-2xl">📞</span><span className="font-bold text-sm">Log a Call</span>
        </button>
        <button onClick={() => logQuickAction("text")} className="bg-white rounded-2xl p-4 shadow-sm flex flex-col items-center gap-2 hover:shadow-md transition-all duration-150 active:scale-95">
          <span className="text-2xl">💬</span><span className="font-bold text-sm">Log a Text</span>
        </button>
        <button onClick={() => logQuickAction("note")} className="bg-white rounded-2xl p-4 shadow-sm flex flex-col items-center gap-2 hover:shadow-md transition-all duration-150 active:scale-95">
          <span className="text-2xl">📝</span><span className="font-bold text-sm">Log a Note</span>
        </button>
        <button onClick={() => setShowAssign(true)} disabled={!hasSequences} className={"rounded-2xl p-4 shadow-sm flex flex-col items-center gap-2 transition-all duration-150 active:scale-95 " + (hasSequences ? "bg-blue-600 text-white hover:bg-blue-700 hover:shadow-md" : "bg-gray-200 text-gray-400 cursor-not-allowed")}>
          <span className="text-2xl">▶️</span><span className="font-bold text-sm">{hasSequences ? "Start Sequence" : "No Sequences"}</span>
        </button>
      </div>
      <div className="mt-8">
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
      )}
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
            ].map(f => (
              <div key={f.key} className="flex items-center justify-between p-3 bg-[#faf7f2] rounded-xl">
                <span className="text-xs font-bold text-gray-400 uppercase">{f.label}</span>
                {editing ? (
                  <input value={form[f.key] || ""} onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
                    className="text-right text-sm font-semibold bg-white px-3 py-1 rounded-lg border border-gray-200 w-40 focus:outline-none focus:ring-2 focus:ring-[#E8735A] focus:border-transparent transition-colors duration-150" />
                ) : (
                  <span className="text-sm font-semibold">{client[f.key] || "—"}{(f.key.includes("weight") && client[f.key]) ? " lbs" : ""}</span>
                )}
              </div>
            ))}
            {client.weight_start && client.weight_current && (
              <div className="p-3 bg-brand-50 rounded-xl">
                <div className="flex justify-between text-xs font-bold mb-1">
                  <span className="text-gray-400">Progress</span>
                  <span className="text-brand-500">{weightLost > 0 ? weightLost + " lbs lost" : "Just starting"}</span>
                </div>
                <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full bg-brand-500 rounded-full transition-all" style={{ width: Math.min(100, Math.max(5, (weightLost / client.weight_start) * 100 * 3)) + "%" }} />
                </div>
              </div>
            )}
          </div>
          <div className="mt-4">
            <label className="text-xs font-bold text-gray-400 uppercase">Notes</label>
            {editing ? (
              <textarea value={form.notes || ""} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} rows={3}
                className="w-full mt-1 px-4 py-3 text-sm border-2 border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#E8735A] focus:border-transparent transition-colors duration-150" />
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
                <div key={act.id} className="p-3 bg-[#faf7f2] rounded-xl">
                  <div className="font-semibold text-sm">{act.action}</div>
                  <div className="text-xs text-gray-400 mt-1">{new Date(act.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
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
