"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase-browser";
import Link from "next/link";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const supabase = createClient();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    if (!email.trim()) {
      setError("Please enter your email address.");
      setLoading(false);
      return;
    }

    const { error: resetError } = await supabase.auth.resetPasswordForEmail(
      email.trim().toLowerCase(),
      { redirectTo: window.location.origin + "/auth/reset-password" }
    );

    if (resetError) {
      setError("Something went wrong. Please try again.");
      setLoading(false);
      return;
    }

    setSent(true);
    setLoading(false);
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
        <div className="bg-white rounded-2xl p-8 shadow-md">
          <h2 className="text-xl font-bold text-center mb-2">Reset Password</h2>
          <p className="text-sm text-gray-500 text-center mb-6">
            Enter your email and we'll send you a reset link.
          </p>

          {sent ? (
            <div className="text-center">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center text-3xl mx-auto mb-4">✉️</div>
              <h3 className="text-lg font-semibold text-gray-900 mb-1">Check your email</h3>
              <p className="text-sm text-gray-500 mb-6">
                If an account exists for that email, we've sent a password reset link.
              </p>
              <Link
                href="/login"
                className="text-[#E8735A] font-semibold text-sm hover:underline"
              >
                ← Back to sign in
              </Link>
            </div>
          ) : (
            <>
              {error && (
                <div className="bg-red-50 border-2 border-red-200 text-red-700 px-4 py-3 rounded-xl mb-4 text-sm font-semibold">
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
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

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-4 text-lg font-bold rounded-xl text-white transition shadow-lg disabled:opacity-50"
                  style={{ background: "linear-gradient(135deg, #4a7c59, #3a6247)" }}
                >
                  {loading ? "Sending..." : "Send Reset Link →"}
                </button>
              </form>

              <p className="text-center text-sm mt-5">
                <Link href="/login" className="text-[#E8735A] font-semibold hover:underline">
                  ← Back to sign in
                </Link>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
