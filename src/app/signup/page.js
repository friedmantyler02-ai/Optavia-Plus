"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase-browser";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function SignUpPage() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [optaviaId, setOptaviaId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  const handleSignUp = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    if (!fullName.trim() || !email.trim() || !password) {
      setError("Please fill in your name, email, and password.");
      setLoading(false);
      return;
    }

    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      setLoading(false);
      return;
    }

    // 1. Create the auth account
    const { data, error: authError } = await supabase.auth.signUp({
      email: email.trim().toLowerCase(),
      password,
      options: {
        data: {
          full_name: fullName.trim(),
          optavia_id: optaviaId.trim() || null,
        },
      },
    });

    if (authError) {
      setError(authError.message);
      setLoading(false);
      return;
    }

    // 2. Create the coach profile row
    if (data.user) {
      const { error: profileError } = await supabase.from("coaches").insert({
        id: data.user.id,
        email: email.trim().toLowerCase(),
        full_name: fullName.trim(),
        optavia_id: optaviaId.trim() || null,
      });

      if (profileError && !profileError.message.includes("duplicate")) {
        console.error("Profile creation error:", profileError);
      }
    }

    // If email confirmation is enabled, show success message
    // Otherwise redirect to dashboard
    if (data.session) {
      router.push("/dashboard");
    } else {
      setSuccess(true);
    }

    setLoading(false);
  };

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6" style={{ background: "linear-gradient(160deg, #faf7f2 0%, #e8f0ea 50%, #faf0e8 100%)" }}>
        <div className="w-full max-w-md text-center animate-fade-up">
          <div className="w-16 h-16 rounded-2xl mx-auto mb-6 flex items-center justify-center text-3xl" style={{ background: "linear-gradient(135deg, #4a7c59, #c4855c)" }}>🌿</div>
          <h1 className="font-display text-3xl font-bold text-brand-500 mb-3">Check Your Email!</h1>
          <p className="text-gray-500 text-lg mb-6">
            We sent a confirmation link to <strong>{email}</strong>. Click it to activate your account.
          </p>
          <Link href="/login" className="inline-block px-6 py-3 bg-brand-500 text-white rounded-xl font-bold text-lg hover:bg-brand-600 transition">
            Go to Sign In
          </Link>
        </div>
      </div>
    );
  }

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
        <form onSubmit={handleSignUp} className="bg-white rounded-2xl p-8 shadow-md">
          <h2 className="text-xl font-bold text-center mb-6">Create Your Account</h2>

          {error && (
            <div className="bg-red-50 border-2 border-red-200 text-red-700 px-4 py-3 rounded-xl mb-4 text-sm font-semibold">
              {error}
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-gray-400 uppercase tracking-wide mb-1">Your Name</label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="e.g. Jane Smith"
                className="w-full px-5 py-4 text-lg border-2 border-gray-200 rounded-xl font-body focus:border-brand-500 focus:outline-none transition"
              />
            </div>

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
                placeholder="At least 6 characters"
                className="w-full px-5 py-4 text-lg border-2 border-gray-200 rounded-xl font-body focus:border-brand-500 focus:outline-none transition"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-400 uppercase tracking-wide mb-1">
                Optavia Coach ID <span className="font-normal italic">(optional)</span>
              </label>
              <input
                type="text"
                value={optaviaId}
                onChange={(e) => setOptaviaId(e.target.value)}
                placeholder="Your Optavia login or ID"
                className="w-full px-5 py-4 text-lg border-2 border-gray-200 rounded-xl font-body focus:border-brand-500 focus:outline-none transition"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-4 text-lg font-bold rounded-xl text-white transition shadow-lg disabled:opacity-50 mt-2"
              style={{ background: "linear-gradient(135deg, #4a7c59, #3a6247)" }}
            >
              {loading ? "Creating your account..." : "Create Account →"}
            </button>
          </div>

          <p className="text-center text-sm text-gray-400 mt-5">
            Already have an account?{" "}
            <Link href="/login" className="text-brand-500 font-bold hover:underline">
              Sign In
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
