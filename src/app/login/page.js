"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase-browser";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();
  const supabase = createClient();

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    if (!email.trim() || !password) {
      setError("Please enter your email and password.");
      setLoading(false);
      return;
    }

    const { error: authError } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });

    if (authError) {
      setError(authError.message);
      setLoading(false);
      return;
    }

    router.push("/dashboard");
    router.refresh();
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ background: "linear-gradient(160deg, #faf7f2 0%, #e8f0ea 50%, #faf0e8 100%)" }}>
      <div className="w-full max-w-md animate-fade-up">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-[72px] h-[72px] rounded-2xl mx-auto mb-4 flex items-center justify-center text-4xl shadow-lg" style={{ background: "linear-gradient(135deg, #4a7c59, #c4855c)" }}>🌿</div>
          <h1 className="font-display text-4xl font-bold text-brand-500 mb-1">Optavia Plus</h1>
          <p className="text-gray-500 text-lg">Your coaching business, simplified.</p>
        </div>

        {/* Form */}
        <form onSubmit={handleLogin} className="bg-white rounded-2xl p-8 shadow-md">
          <h2 className="text-xl font-bold text-center mb-6">Welcome Back!</h2>

          {error && (
            <div className="bg-red-50 border-2 border-red-200 text-red-700 px-4 py-3 rounded-xl mb-4 text-sm font-semibold">
              {error}
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-gray-400 uppercase tracking-wide mb-1">Email Address</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="jane@email.com"
                className="w-full px-5 py-4 text-lg border-2 border-gray-200 rounded-xl font-body focus:border-brand-500 focus:outline-none transition"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-400 uppercase tracking-wide mb-1">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Your password"
                className="w-full px-5 py-4 text-lg border-2 border-gray-200 rounded-xl font-body focus:border-brand-500 focus:outline-none transition"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-4 text-lg font-bold rounded-xl text-white transition shadow-lg disabled:opacity-50 mt-2"
              style={{ background: "linear-gradient(135deg, #4a7c59, #3a6247)" }}
            >
              {loading ? "Signing in..." : "Sign In →"}
            </button>
          </div>

          <p className="text-center text-sm mt-4">
            <Link href="/forgot-password" className="text-[#E8735A] font-semibold hover:underline">
              Forgot your password?
            </Link>
          </p>

          <p className="text-center text-sm text-gray-400 mt-3">
            Don't have an account?{" "}
            <Link href="/onboarding" className="text-brand-500 font-bold hover:underline">
              Create One
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
