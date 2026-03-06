"use client";

import { useState, useEffect } from "react";
import { useCoach } from "./layout";
import { useRouter } from "next/navigation";
import Link from "next/link";
import TouchpointsDueToday from "./TouchpointsDueToday";
import RankProgressCard from "./components/RankProgressCard";
import SkeletonCard from "./components/SkeletonCard";
import ErrorBanner from "./components/ErrorBanner";

const LEAD_STAGES = [
  { value: "prospect", label: "Prospect", color: "bg-gray-100 text-gray-700" },
  { value: "conversation", label: "Conversation", color: "bg-blue-100 text-blue-700" },
  { value: "ha_scheduled", label: "HA Scheduled", color: "bg-yellow-100 text-yellow-700" },
  { value: "ha_completed", label: "HA Completed", color: "bg-purple-100 text-purple-700" },
  { value: "client", label: "Client", color: "bg-green-100 text-green-700" },
  { value: "potential_coach", label: "Potential Coach", color: "bg-teal-100 text-teal-700" },
];
const LEAD_STAGE_MAP = Object.fromEntries(LEAD_STAGES.map((s) => [s.value, s]));

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

function getScoreColor(score) {
  if (score >= 70) return "#4a7c59";
  if (score >= 40) return "#c4855c";
  return "#c25b50";
}

const emojis = { active: "✅", new: "🌱", plateau: "🏔️", milestone: "🎉", lapsed: "💛", archived: "📦" };
const labels = { active: "Active", new: "New Client", plateau: "Plateau", milestone: "Milestone!", lapsed: "Lapsed", archived: "Archived" };

function LeadsFollowupWidget({ leads, router }) {
  const now = new Date();
  now.setHours(0, 0, 0, 0);

  const needsFollowup = leads.filter((l) => {
    if (l.stage === "client" || l.stage === "potential_coach") return false;
    // Overdue follow-up
    if (l.next_followup_date) {
      const fu = new Date(l.next_followup_date);
      fu.setHours(0, 0, 0, 0);
      if (fu <= now) return true;
    }
    // No contact in 7+ days
    if (l.last_contact_date) {
      const daysSince = Math.floor((now - new Date(l.last_contact_date)) / 86400000);
      if (daysSince > 7) return true;
    } else {
      // Never contacted
      return true;
    }
    return false;
  }).slice(0, 5);

  const getUrgency = (l) => {
    if (l.next_followup_date) {
      const fu = new Date(l.next_followup_date);
      fu.setHours(0, 0, 0, 0);
      const days = Math.round((now - fu) / 86400000);
      if (days > 0) return { text: `${days}d overdue`, color: "text-red-600" };
      if (days === 0) return { text: "Due today", color: "text-orange-500" };
    }
    if (l.last_contact_date) {
      const days = Math.floor((now - new Date(l.last_contact_date)) / 86400000);
      if (days > 0) return { text: `No contact in ${days}d`, color: "text-yellow-600" };
    }
    return { text: "Never contacted", color: "text-gray-500" };
  };

  return (
    <div className="bg-white rounded-2xl p-6 shadow-sm">
      <h2 className="text-lg font-extrabold mb-1 flex items-center gap-2">
        <span className="text-xl">{"\uD83C\uDFAF"}</span> Leads Needing Follow-up
      </h2>
      <p className="text-xs text-gray-400 mb-4">Overdue or no recent contact</p>
      {needsFollowup.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-4">All caught up! {"\uD83C\uDF89"}</p>
      ) : (
        <div className="space-y-2">
          {needsFollowup.map((lead) => {
            const urgency = getUrgency(lead);
            const stageInfo = LEAD_STAGE_MAP[lead.stage];
            return (
              <button
                key={lead.id}
                onClick={() => router.push(`/dashboard/leads/${lead.id}`)}
                className="w-full flex items-center justify-between p-3 bg-[#faf7f2] rounded-xl hover:bg-brand-50 transition-colors duration-150 text-left"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="min-w-0">
                    <div className="font-bold text-sm truncate">{lead.full_name}</div>
                    <div className={`text-xs font-semibold ${urgency.color}`}>{urgency.text}</div>
                  </div>
                </div>
                {stageInfo && (
                  <span className={`flex-shrink-0 inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${stageInfo.color}`}>
                    {stageInfo.label}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
      <Link href="/dashboard/leads" className="block text-sm font-bold text-[#E8735A] hover:text-[#d4634d] mt-4 transition-colors">
        View All Leads &rarr;
      </Link>
    </div>
  );
}

function LeadsPipelineWidget({ leads, router }) {
  const stageCounts = {};
  LEAD_STAGES.forEach((s) => { stageCounts[s.value] = 0; });
  leads.forEach((l) => {
    if (stageCounts[l.stage] !== undefined) stageCounts[l.stage]++;
  });

  // Conversions this week: leads at 'client' stage with updated_at within last 7 days
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  const conversionsThisWeek = leads.filter(
    (l) => l.stage === "client" && l.updated_at && new Date(l.updated_at) >= weekAgo
  ).length;

  return (
    <div className="bg-white rounded-2xl p-6 shadow-sm">
      <h2 className="text-lg font-extrabold mb-1 flex items-center gap-2">
        <span className="text-xl">{"\uD83D\uDCCA"}</span> Lead Pipeline
      </h2>
      <p className="text-xs text-gray-400 mb-4">{leads.length} total lead{leads.length !== 1 ? "s" : ""}</p>
      <div className="flex flex-wrap gap-2 mb-4">
        {LEAD_STAGES.map((s) => (
          <span key={s.value} className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${s.color}`}>
            {s.label} <span className="font-extrabold">{stageCounts[s.value]}</span>
          </span>
        ))}
      </div>
      <div className="bg-[#faf7f2] rounded-xl p-3 mb-4">
        <div className="flex items-center gap-2">
          <span className="text-lg">{"\u2728"}</span>
          <span className="text-sm font-bold text-gray-700">Conversions this week:</span>
          <span className="text-sm font-extrabold text-green-600">{conversionsThisWeek}</span>
        </div>
      </div>
      <Link href="/dashboard/leads" className="block text-sm font-bold text-[#E8735A] hover:text-[#d4634d] transition-colors">
        Go to Leads &rarr;
      </Link>
    </div>
  );
}

export default function DashboardHome() {
  const { coach, supabase } = useCoach();
  const [clients, setClients] = useState([]);
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [allLeads, setAllLeads] = useState([]);
  const [leadsLoading, setLeadsLoading] = useState(true);
  const router = useRouter();

  useEffect(() => { loadData(); loadLeads(); }, []);

  const loadLeads = async () => {
    try {
      const res = await fetch("/api/leads?limit=1000&sort=next_followup_date&order=asc");
      const data = await res.json();
      if (res.ok && data.leads) setAllLeads(data.leads);
    } catch { /* ignore */ }
    finally { setLeadsLoading(false); }
  };

  const loadData = async () => {
    try {
      const { data: cd, error: cErr } = await supabase.from("clients").select("*").eq("coach_id", coach.id).neq("status", "archived").order("created_at", { ascending: false });
      if (cErr) throw cErr;
      if (cd) setClients(cd);
      const { data: ad, error: aErr } = await supabase.from("activities").select("*").eq("coach_id", coach.id).order("created_at", { ascending: false }).limit(10);
      if (aErr) throw aErr;
      if (ad) setActivities(ad);
      setLoadError(null);
    } catch (err) {
      console.error("Error loading dashboard:", err);
      setLoadError("Something went wrong loading your dashboard.");
    } finally {
      setLoading(false);
    }
  };

  const activeCount = clients.filter(c => c.status === "active" || c.status === "new").length;
  const avgScore = clients.length > 0 ? Math.round(clients.reduce((s, c) => s + getRelationshipScore(c), 0) / clients.length) : 0;
  const needsAttention = clients.map(c => ({ ...c, score: getRelationshipScore(c) })).sort((a, b) => a.score - b.score).slice(0, 5);

  if (loading) return (
    <div className="animate-fade-up">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>
      <div className="grid md:grid-cols-2 gap-5">
        <SkeletonCard height="h-48" />
        <SkeletonCard height="h-48" />
      </div>
    </div>
  );
  if (loadError) return (
    <div className="animate-fade-up">
      <ErrorBanner message={loadError} onRetry={() => { setLoadError(null); setLoading(true); loadData(); }} />
    </div>
  );

  return (
    <div className="animate-fade-up">
      <h1 className="font-display text-2xl md:text-3xl font-bold mb-6">Welcome back, {coach.full_name?.split(" ")[0]}! 👋</h1>

      {/* STATS */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
        {[
          { icon: "👥", label: "Total Clients", value: clients.length, sub: activeCount + " active", color: "#4a7c59" },
          { icon: "🎯", label: "Avg Relationship", value: avgScore, sub: "Out of 100", color: "#c4855c" },
          { icon: "✅", label: "Active Rate", value: clients.length > 0 ? Math.round((activeCount / clients.length) * 100) + "%" : "—", sub: "Active + New", color: "#8b6baf" },
        ].map((stat) => (
          <div key={stat.label} className="bg-white rounded-2xl p-5 shadow-sm" style={{ borderLeft: "4px solid " + stat.color }}>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-2xl">{stat.icon}</span>
              <span className="text-xs font-bold text-gray-400 uppercase tracking-wide">{stat.label}</span>
            </div>
            <div className="text-3xl font-extrabold" style={{ color: stat.color }}>{stat.value}</div>
            <div className="text-xs text-gray-400 mt-1">{stat.sub}</div>
          </div>
        ))}
      </div>

      <div className="mb-6">
        <RankProgressCard />
      </div>

      <div className="mb-6">
        <TouchpointsDueToday />
      </div>

      {/* LEAD WIDGETS */}
      {!leadsLoading && (
        <div className="grid md:grid-cols-2 gap-5 mb-6">
          {/* Leads Needing Follow-up */}
          <LeadsFollowupWidget leads={allLeads} router={router} />
          {/* Pipeline Snapshot */}
          <LeadsPipelineWidget leads={allLeads} router={router} />
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-5">
        {/* WHO NEEDS ME */}
        <div className="bg-white rounded-2xl p-6 shadow-sm">
          <h2 className="text-lg font-extrabold mb-1 flex items-center gap-2"><span className="text-xl">💡</span> Who Needs You Today</h2>
          <p className="text-xs text-gray-400 mb-4">Clients with the lowest relationship scores</p>
          {needsAttention.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">Everyone&#39;s been taken care of ✓</p>
          ) : (
            <div className="space-y-2">
              {needsAttention.map((client) => (
                <button key={client.id} onClick={() => router.push("/dashboard/clients/" + client.id)} className="w-full flex items-center justify-between p-3 bg-[#faf7f2] rounded-xl hover:bg-brand-50 transition-colors duration-150 text-left">
                  <div className="flex items-center gap-3">
                    <span className="text-xl">{emojis[client.status] || "📋"}</span>
                    <div>
                      <div className="font-bold text-sm">{client.full_name}</div>
                      <div className="text-xs text-gray-400">{labels[client.status]} · {client.plan || "No plan"}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-14 h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: client.score + "%", backgroundColor: getScoreColor(client.score) }} />
                    </div>
                    <span className="text-sm font-extrabold min-w-[28px] text-right" style={{ color: getScoreColor(client.score) }}>{client.score}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* RECENT ACTIVITY */}
        <div className="bg-white rounded-2xl p-6 shadow-sm">
          <h2 className="text-lg font-extrabold mb-1 flex items-center gap-2"><span className="text-xl">📋</span> Recent Activity</h2>
          <p className="text-xs text-gray-400 mb-4">Your latest actions</p>
          {activities.length === 0 ? (
            <div className="text-center py-10 text-gray-400">
              <div className="text-4xl mb-3">📝</div>
              <p>Your activity will show up here as you work with clients!</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {activities.map((act) => (
                <div key={act.id} className="p-3 bg-[#faf7f2] rounded-xl">
                  <div className="font-semibold text-sm">{act.action}</div>
                  <div className="text-xs text-gray-400 mt-1">{new Date(act.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* QUICK ACTIONS */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-6">
        {[
          { label: "Add New Client", icon: "➕", href: "/dashboard/clients?add=1" },
          { label: "View All Clients", icon: "👥", href: "/dashboard/clients" },
          { label: "Touchpoints", icon: "💬", href: "/dashboard/touchpoints" },
          { label: "Marketing Ideas", icon: "📣", href: "/dashboard/marketing" },
        ].map((qa) => (
          <button key={qa.label} onClick={() => router.push(qa.href)} className="bg-white rounded-2xl p-5 shadow-sm flex flex-col items-center gap-2 hover:shadow-md transition-all duration-150 active:scale-95 text-center">
            <span className="text-2xl">{qa.icon}</span>
            <span className="font-bold text-sm">{qa.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
