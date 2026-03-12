"use client";

import { useState, useEffect, useContext } from "react";
import { useCoach, ToastContext } from "./layout";
import { useRouter } from "next/navigation";
import Link from "next/link";
import SkeletonCard from "./components/SkeletonCard";
import ErrorBanner from "./components/ErrorBanner";
import GetTheAppModal from "./components/GetTheAppModal";

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

const SECTIONS = [
  {
    key: "followUps",
    question: "Who do I need to follow up with?",
    color: "#E8735A",
    emptyText: "No follow-ups due — you're all caught up!",
    viewAllHref: "/dashboard/leads?sort=next_followup_date&order=asc",
    viewAllLabel: "View all follow-ups",
  },
  {
    key: "readyForHA",
    question: "Who's ready for a Health Assessment?",
    color: "#3B82F6",
    emptyText: "No leads in conversation stage right now.",
    viewAllHref: "/dashboard/leads?stage=conversation",
    viewAllLabel: "View all in conversation",
  },
  {
    key: "potentialClients",
    question: "Who could become a client?",
    color: "#8B5CF6",
    emptyText: "No pending HA outcomes.",
    viewAllHref: "/dashboard/leads?stage=ha_completed",
    viewAllLabel: "View all HA completed",
  },
  {
    key: "needSupport",
    question: "Which clients need support?",
    color: "#D97706",
    emptyText: "All clients are on track!",
    viewAllHref: "/dashboard/clients",
    viewAllLabel: "View all clients",
  },
  {
    key: "reactivate",
    question: "Who can I re-engage?",
    color: "#059669",
    emptyText: "No inactive clients to re-engage.",
    viewAllHref: "/dashboard/clients",
    viewAllLabel: "View all clients",
  },
];

export default function DashboardHome() {
  const { coach } = useCoach();
  const showToast = useContext(ToastContext);
  const router = useRouter();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [dismissed, setDismissed] = useState({});
  const [showGetApp, setShowGetApp] = useState(false);

  useEffect(() => {
    loadPriorities();
  }, []);

  useEffect(() => {
    if (
      coach &&
      coach.onboarding_completed &&
      localStorage.getItem("hideGetTheApp") !== "true"
    ) {
      const timer = setTimeout(() => setShowGetApp(true), 2000);
      return () => clearTimeout(timer);
    }
  }, [coach]);

  const loadPriorities = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/dashboard/priorities");
      if (!res.ok) throw new Error("Failed to load");
      const json = await res.json();
      setData(json);
    } catch {
      setError("Something went wrong loading your dashboard.");
    } finally {
      setLoading(false);
    }
  };

  const handleDone = async (sectionKey, item) => {
    const dismissKey = `${sectionKey}-${item.id}`;
    setDismissed((prev) => ({ ...prev, [dismissKey]: true }));

    try {
      if (item.type === "client" || sectionKey === "needSupport" || sectionKey === "reactivate") {
        const res = await fetch(`/api/clients/${item.id}/checkin`, { method: "PATCH" });
        if (!res.ok) throw new Error("Checkin failed");
      } else {
        const res = await fetch(`/api/leads/${item.id}/activities`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "Followed up", details: "Marked done from dashboard" }),
        });
        if (!res.ok) throw new Error("Activity log failed");
      }
      showToast({ message: `${item.full_name} marked done`, variant: "success" });
    } catch {
      setDismissed((prev) => {
        const next = { ...prev };
        delete next[dismissKey];
        return next;
      });
      showToast({ message: "Something went wrong — try again", variant: "error" });
    }
  };

  const firstName = coach?.full_name?.split(" ")[0] || "";
  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  if (loading) {
    return (
      <div className="animate-fade-up">
        <div className="mb-6">
          <div className="h-8 w-64 bg-gray-200 rounded-lg animate-pulse mb-2" />
          <div className="h-4 w-40 bg-gray-100 rounded animate-pulse" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 mb-6">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
        <div className="space-y-5">
          <SkeletonCard height="h-48" />
          <SkeletonCard height="h-48" />
          <SkeletonCard height="h-48" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="animate-fade-up">
        <ErrorBanner
          message={error}
          onRetry={() => {
            setError(null);
            loadPriorities();
          }}
        />
      </div>
    );
  }

  const followUpsDue = data?.followUps?.total || 0;
  const leadsInPipeline =
    (data?.readyForHA?.total || 0) + (data?.potentialClients?.total || 0);
  const atRiskClients = data?.needSupport?.total || 0;

  return (
    <div className="animate-fade-up">
      {/* Greeting */}
      <div className="mb-6">
        <h1 className="font-display text-2xl md:text-3xl font-bold">
          {getGreeting()}, {firstName}!
        </h1>
        <p className="text-base text-gray-400 mt-1">{today}</p>
      </div>

      {/* Stats Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 mb-8">
        {[
          { label: "Follow-ups Due", value: followUpsDue, color: "#E8735A" },
          { label: "Leads in Pipeline", value: leadsInPipeline, color: "#3B82F6" },
          { label: "At Risk Clients", value: atRiskClients, color: "#D97706" },
          { label: "To Re-engage", value: data?.reactivate?.total || 0, color: "#059669" },
        ].map((stat) => (
          <div
            key={stat.label}
            className="bg-white rounded-2xl p-5 shadow-sm border-2 border-gray-100"
          >
            <div className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-1">
              {stat.label}
            </div>
            <div
              className="text-2xl md:text-3xl font-extrabold"
              style={{ color: stat.color }}
            >
              {stat.value}
            </div>
          </div>
        ))}
      </div>

      {/* 5 Question Cards */}
      <div className="space-y-5">
        {SECTIONS.map((section) => {
          const sectionData = data?.[section.key];
          const items = (sectionData?.items || []).filter(
            (item) => !dismissed[`${section.key}-${item.id}`]
          );
          const total = sectionData?.total || 0;

          return (
            <div
              key={section.key}
              className="bg-white rounded-2xl shadow-sm border-2 border-gray-100 overflow-hidden"
              style={{ borderLeft: `4px solid ${section.color}` }}
            >
              {/* Header */}
              <div className="px-5 pt-5 pb-3 flex items-center justify-between">
                <h2 className="font-display text-lg md:text-xl font-bold text-gray-800">
                  {section.question}
                </h2>
                {total > 0 && (
                  <span
                    className="inline-flex items-center justify-center min-w-[28px] h-7 rounded-full px-2 text-sm font-bold text-white"
                    style={{ backgroundColor: section.color }}
                  >
                    {total}
                  </span>
                )}
              </div>

              {/* Items */}
              <div className="px-5 pb-4">
                {items.length === 0 ? (
                  <p className="text-base text-gray-400 py-4">
                    {section.emptyText}
                  </p>
                ) : (
                  <div className="space-y-2">
                    {items.slice(0, 5).map((item) => (
                      <div
                        key={item.id}
                        className="flex items-center justify-between p-3.5 bg-[#faf7f2] rounded-xl"
                      >
                        <button
                          onClick={() => {
                            const base =
                              item.type === "client" ||
                              section.key === "needSupport" ||
                              section.key === "reactivate"
                                ? "/dashboard/clients"
                                : "/dashboard/leads";
                            router.push(`${base}/${item.id}`);
                          }}
                          className="flex-1 min-w-0 text-left hover:opacity-70 transition-opacity min-h-[44px] touch-manipulation"
                        >
                          <div className="font-bold text-base truncate">
                            {item.full_name}
                          </div>
                          <div className="text-sm text-gray-500 mt-0.5">
                            {item.context}
                          </div>
                        </button>

                        {/* Quick actions */}
                        <div className="flex-shrink-0 ml-3 flex items-center gap-2">
                          {(section.key === "followUps" ||
                            section.key === "needSupport") && (
                            <button
                              onClick={() => handleDone(section.key, item)}
                              className="text-sm font-bold px-4 py-2 rounded-xl bg-green-50 text-green-700 hover:bg-green-100 transition-colors min-h-[44px] touch-manipulation"
                            >
                              Done &#10003;
                            </button>
                          )}
                          {section.key === "readyForHA" && (
                            <Link
                              href={`/dashboard/leads/${item.id}`}
                              className="text-sm font-bold px-4 py-2 rounded-xl text-white hover:opacity-90 transition-opacity min-h-[44px] inline-flex items-center touch-manipulation"
                              style={{ backgroundColor: section.color }}
                            >
                              Schedule HA
                            </Link>
                          )}
                          {section.key === "reactivate" && (
                            <button
                              onClick={() => handleDone(section.key, item)}
                              className="text-sm font-bold px-4 py-2 rounded-xl bg-green-50 text-green-700 hover:bg-green-100 transition-colors min-h-[44px] touch-manipulation"
                            >
                              Done &#10003;
                            </button>
                          )}
                          {(section.key === "potentialClients" ||
                            section.key === "reactivate") && (
                            <Link
                              href={
                                section.key === "potentialClients"
                                  ? `/dashboard/leads/${item.id}`
                                  : `/dashboard/clients/${item.id}`
                              }
                              className="text-sm font-bold px-4 py-2 rounded-xl bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors min-h-[44px] inline-flex items-center touch-manipulation"
                            >
                              View
                            </Link>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* View all link */}
                {total > 5 && (
                  <Link
                    href={section.viewAllHref}
                    className="block text-sm font-bold mt-3 transition-colors hover:opacity-80"
                    style={{ color: section.color }}
                  >
                    {section.viewAllLabel} ({total}) &rarr;
                  </Link>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {showGetApp && (
        <GetTheAppModal onClose={() => setShowGetApp(false)} />
      )}
    </div>
  );
}
