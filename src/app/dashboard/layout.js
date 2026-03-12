"use client";

import { useState, useEffect, useRef, createContext, useContext } from "react";
import useToast from "@/hooks/useToast";
import ToastContainer from "./components/ToastContainer";
import { createClient } from "@/lib/supabase-browser";
import { useRouter, usePathname } from "next/navigation";

// Context so any dashboard page can access the current coach profile
export const CoachContext = createContext(null);
export const useCoach = () => useContext(CoachContext);
export const ToastContext = createContext(null);

export default function DashboardLayout({ children }) {
  const [coach, setCoach] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showMenu, setShowMenu] = useState(false);
  const signInTracked = useRef(false);
  const router = useRouter();
  const pathname = usePathname();
  const supabase = createClient();
  const { toasts, showToast, dismissToast } = useToast();

  useEffect(() => {
    loadCoachProfile();
  }, []);

  const loadCoachProfile = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      router.push("/login");
      return;
    }

    const { data: profile } = await supabase
      .from("coaches")
      .select("*")
      .eq("id", user.id)
      .single();

    if (profile) {
      setCoach(profile);
      // Track last sign-in (once per session)
      if (!signInTracked.current) {
        signInTracked.current = true;
        supabase
          .from("coaches")
          .update({ last_sign_in_at: new Date().toISOString() })
          .eq("id", profile.id)
          .then();
      }
    } else {
      // Profile doesn't exist yet — create via server-side API (bypasses RLS)
      const meta = user.user_metadata || {};
      const coachEmail = user.email;
      const coachName = meta.full_name || user.email.split("@")[0];
      const coachOptaviaId = meta.optavia_id || null;

      try {
        await fetch("/api/auth/create-coach", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            user_id: user.id,
            email: coachEmail,
            full_name: coachName,
            optavia_id: coachOptaviaId,
          }),
        });
      } catch (err) {
        console.error("Coach creation fallback error:", err);
      }

      // Re-fetch the profile (should exist now)
      const { data: newProfile } = await supabase
        .from("coaches")
        .select("*")
        .eq("id", user.id)
        .single();

      if (newProfile) {
        setCoach(newProfile);
      } else {
        // Last resort: set a minimal coach object so onboarding redirect still works
        setCoach({
          id: user.id,
          email: coachEmail,
          full_name: coachName,
          optavia_id: coachOptaviaId,
          onboarding_completed: false,
        });
      }
    }
    setLoading(false);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  };

  const navItems = [
    { href: "/dashboard", label: "Dashboard", icon: "🏠" },
    { href: "/dashboard/clients", label: "Clients", icon: "👥" },
    { href: "/dashboard/leads", label: "Leads", icon: "🎯" },
    { href: "/dashboard/calendar", label: "Calendar", icon: "📅" },
  ];

  const isActive = (href) => {
    if (href === "/dashboard") return pathname === "/dashboard";
    return pathname.startsWith(href);
  };

  const isOnboarding = pathname === "/dashboard/onboarding";

  // Redirect to onboarding if coach hasn't completed it (and isn't a stub)
  useEffect(() => {
    if (
      coach &&
      !coach.onboarding_completed &&
      !coach.is_stub &&
      !isOnboarding
    ) {
      router.push("/onboarding");
    }
  }, [coach, isOnboarding]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center text-3xl" style={{ background: "linear-gradient(135deg, #4a7c59, #c4855c)" }}>🌿</div>
          <p className="text-gray-400 text-lg font-semibold">Loading...</p>
        </div>
      </div>
    );
  }

  // Onboarding page: skip nav, render full-page
  if (isOnboarding) {
    return (
      <CoachContext.Provider value={{ coach, setCoach, supabase }}>
        <ToastContext.Provider value={showToast}>
          <div className="min-h-screen bg-[#faf7f2]">
            {children}
          </div>
          <ToastContainer toasts={toasts} dismissToast={dismissToast} />
        </ToastContext.Provider>
      </CoachContext.Provider>
    );
  }

  return (
    <CoachContext.Provider value={{ coach, setCoach, supabase }}>
      <ToastContext.Provider value={showToast}>
      <div className="min-h-screen bg-[#faf7f2]">
        {/* TOP NAV */}
        <nav className="bg-white border-b-2 border-[#e5e0d8] px-4 md:px-6 flex items-center justify-between h-[70px] sticky top-0 z-50">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl" style={{ background: "linear-gradient(135deg, #4a7c59, #c4855c)" }}>🌿</div>
            <span className="font-display text-xl font-bold text-brand-500 hidden sm:inline">Optavia Plus</span>
          </div>

          {/* Nav links — desktop */}
          <div className="hidden md:flex gap-1 overflow-x-auto flex-nowrap whitespace-nowrap [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {navItems.map((item) => (
              <button
                key={item.href}
                onClick={() => router.push(item.href)}
                className={`px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 transition-colors duration-150 ${
                  isActive(item.href)
                    ? "bg-brand-100 text-brand-500"
                    : "text-gray-400 hover:bg-gray-50"
                }`}
              >
                <span className="text-lg">{item.icon}</span>
                {item.label}
              </button>
            ))}
          </div>

          {/* Admin + Settings + User menu */}
          <div className="flex items-center gap-2">
            {coach?.email && ['friedmantyler02@gmail.com'].includes(coach.email) && (
              <button
                onClick={() => router.push("/dashboard/admin")}
                className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg transition ${
                  isActive("/dashboard/admin")
                    ? "bg-brand-100 text-brand-500"
                    : "text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                }`}
                title="Admin"
              >
                🔧
              </button>
            )}
          <div className="relative">
            <button
              onClick={() => setShowMenu(!showMenu)}
              className="flex items-center gap-2 px-3 py-2 rounded-xl bg-brand-50 hover:bg-brand-100 transition min-h-[44px] touch-manipulation"
            >
              <div className="w-8 h-8 rounded-lg bg-brand-500 text-white flex items-center justify-center text-sm font-bold">
                {coach?.full_name?.charAt(0)?.toUpperCase() || "?"}
              </div>
              <span className="text-sm font-bold text-brand-600 hidden sm:inline">{coach?.full_name}</span>
              <span className="text-xs text-gray-400">{showMenu ? "▲" : "▼"}</span>
            </button>

            {showMenu && (
              <div className="absolute right-0 top-full mt-2 w-64 bg-white rounded-xl shadow-lg border-2 border-gray-100 overflow-hidden z-50">
                <div className="p-4 bg-brand-50 border-b border-gray-100">
                  <p className="font-bold text-sm">{coach?.full_name}</p>
                  <p className="text-xs text-gray-400">{coach?.email}</p>
                  {coach?.optavia_id && <p className="text-xs text-brand-500 mt-1">ID: {coach.optavia_id}</p>}
                </div>

                {/* Mobile nav — main nav items are in bottom tab bar, so only show overflow here */}

                {coach?.email && ['friedmantyler02@gmail.com'].includes(coach.email) && (
                  <button
                    onClick={() => { router.push("/dashboard/admin"); setShowMenu(false); }}
                    className="w-full text-left px-4 py-3 text-sm font-semibold text-gray-500 hover:bg-gray-50 flex items-center gap-3"
                  >
                    <span>🔧</span> Admin
                  </button>
                )}
                <button
                  onClick={() => { router.push("/dashboard/settings"); setShowMenu(false); }}
                  className="w-full text-left px-4 py-3 text-sm font-semibold text-gray-500 hover:bg-gray-50 flex items-center gap-3 min-h-[44px] touch-manipulation"
                >
                  <span>⚙️</span> Settings
                </button>
                <button
                  onClick={() => { router.push("/dashboard/help"); setShowMenu(false); }}
                  className="w-full text-left px-4 py-3 text-sm font-semibold text-gray-500 hover:bg-gray-50 flex items-center gap-3 border-b border-gray-100 min-h-[44px] touch-manipulation"
                >
                  <span>❓</span> Help
                </button>
                <button
                  onClick={handleLogout}
                  className="w-full text-left px-4 py-3 text-sm font-bold text-red-500 hover:bg-red-50 transition-colors duration-150 min-h-[44px] touch-manipulation"
                >
                  Sign Out
                </button>
              </div>
            )}
          </div>
          </div>
        </nav>

        {/* PAGE CONTENT — extra bottom padding on mobile for tab bar */}
        <main className="max-w-6xl mx-auto px-4 md:px-6 py-6 md:py-8 pb-28 md:pb-8">
          {children}
        </main>

        {/* MOBILE BOTTOM TAB BAR */}
        <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-white border-t-2 border-[#e5e0d8] flex items-stretch justify-around pt-2 pb-7 safe-bottom">
          {navItems.map((item) => (
            <button
              key={item.href}
              onClick={() => router.push(item.href)}
              className={`flex-1 flex flex-col items-center justify-center min-h-[60px] touch-manipulation transition-colors duration-150 ${
                isActive(item.href)
                  ? "text-[#E8735A]"
                  : "text-gray-400"
              }`}
            >
              <span className="text-[22px] leading-none">{item.icon}</span>
              <span className={`text-xs font-bold mt-1 ${isActive(item.href) ? "text-[#E8735A]" : "text-gray-400"}`}>
                {item.label}
              </span>
            </button>
          ))}
          <button
            onClick={() => setShowMenu(!showMenu)}
            className={`flex-1 flex flex-col items-center justify-center min-h-[60px] touch-manipulation transition-colors duration-150 ${
              showMenu ? "text-[#E8735A]" : "text-gray-400"
            }`}
          >
            <span className="text-[22px] leading-none">•••</span>
            <span className={`text-xs font-bold mt-1 ${showMenu ? "text-[#E8735A]" : "text-gray-400"}`}>More</span>
          </button>
        </nav>
      </div>

      {/* Click outside to close menu */}
      {showMenu && <div className="fixed inset-0 z-40" onClick={() => setShowMenu(false)} />}
      <ToastContainer toasts={toasts} dismissToast={dismissToast} />
      </ToastContext.Provider>
    </CoachContext.Provider>
  );
}
