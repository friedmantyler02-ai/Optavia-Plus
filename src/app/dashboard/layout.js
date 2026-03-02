"use client";

import { useState, useEffect, createContext, useContext } from "react";
import { createClient } from "@/lib/supabase-browser";
import { useRouter, usePathname } from "next/navigation";

// Context so any dashboard page can access the current coach profile
export const CoachContext = createContext(null);
export const useCoach = () => useContext(CoachContext);

export default function DashboardLayout({ children }) {
  const [coach, setCoach] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showMenu, setShowMenu] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const supabase = createClient();

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
    } else {
      // Profile doesn't exist yet — create it from auth metadata
      const meta = user.user_metadata || {};
      const newProfile = {
        id: user.id,
        email: user.email,
        full_name: meta.full_name || user.email.split("@")[0],
        optavia_id: meta.optavia_id || null,
      };
      await supabase.from("coaches").insert(newProfile);
      setCoach(newProfile);
    }
    setLoading(false);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  };

  const navItems = [
    { href: "/dashboard", label: "Home", icon: "🏠" },
    { href: "/dashboard/clients", label: "My Clients", icon: "👥" },
    { href: "/dashboard/touchpoints", label: "Touchpoints", icon: "💬" },
    { href: "/dashboard/team", label: "My Team", icon: "🌳" },
    { href: "/dashboard/marketing", label: "Marketing", icon: "📣" },
    { href: "/dashboard/org-import", label: "Org Import", icon: "📥" },
  ];

  const isActive = (href) => {
    if (href === "/dashboard") return pathname === "/dashboard";
    return pathname.startsWith(href);
  };

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

  return (
    <CoachContext.Provider value={{ coach, setCoach, supabase }}>
      <div className="min-h-screen bg-[#faf7f2]">
        {/* TOP NAV */}
        <nav className="bg-white border-b-2 border-[#e5e0d8] px-4 md:px-6 flex items-center justify-between h-[70px] sticky top-0 z-50">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl" style={{ background: "linear-gradient(135deg, #4a7c59, #c4855c)" }}>🌿</div>
            <span className="font-display text-xl font-bold text-brand-500 hidden sm:inline">Optavia Plus</span>
          </div>

          {/* Nav links — desktop */}
          <div className="hidden md:flex gap-1">
            {navItems.map((item) => (
              <button
                key={item.href}
                onClick={() => router.push(item.href)}
                className={`px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 transition ${
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

          {/* User menu */}
          <div className="relative">
            <button
              onClick={() => setShowMenu(!showMenu)}
              className="flex items-center gap-2 px-3 py-2 rounded-xl bg-brand-50 hover:bg-brand-100 transition"
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

                {/* Mobile nav */}
                <div className="md:hidden border-b border-gray-100">
                  {navItems.map((item) => (
                    <button
                      key={item.href}
                      onClick={() => { router.push(item.href); setShowMenu(false); }}
                      className={`w-full text-left px-4 py-3 text-sm font-semibold flex items-center gap-3 ${
                        isActive(item.href) ? "bg-brand-50 text-brand-500" : "text-gray-500 hover:bg-gray-50"
                      }`}
                    >
                      <span>{item.icon}</span> {item.label}
                    </button>
                  ))}
                </div>

                <button
                  onClick={handleLogout}
                  className="w-full text-left px-4 py-3 text-sm font-bold text-red-500 hover:bg-red-50 transition"
                >
                  Sign Out
                </button>
              </div>
            )}
          </div>
        </nav>

        {/* PAGE CONTENT */}
        <main className="max-w-6xl mx-auto px-4 md:px-6 py-6 md:py-8">
          {children}
        </main>
      </div>

      {/* Click outside to close menu */}
      {showMenu && <div className="fixed inset-0 z-40" onClick={() => setShowMenu(false)} />}
    </CoachContext.Provider>
  );
}
