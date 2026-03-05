"use client";

import { useState, useEffect } from "react";
import { useCoach } from "./layout";
import { useRouter } from "next/navigation";
import TouchpointsDueToday from "./TouchpointsDueToday";
import RankProgressCard from "./components/RankProgressCard";
import SkeletonCard from "./components/SkeletonCard";
import ErrorBanner from "./components/ErrorBanner";

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

export default function DashboardHome() {
  const { coach, supabase } = useCoach();
  const [clients, setClients] = useState([]);
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const router = useRouter();

  useEffect(() => { loadData(); }, []);

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
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {[
          { icon: "👥", label: "Total Clients", value: clients.length, sub: activeCount + " active", color: "#4a7c59" },
          { icon: "📊", label: "Frontline Volume", value: "$" + (clients.length * 300).toLocaleString(), sub: "This month (est.)", color: "#5b8fa8" },
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
