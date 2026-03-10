"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase-browser";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const supabase = createClient();
  const router = useRouter();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);

    const { error: updateError } = await supabase.auth.updateUser({
      password,
    });

    if (updateError) {
      setError(updateError.message);
      setLoading(false);
      return;
    }

    setSuccess(true);
    setLoading(false);
    setTimeout(() => router.push("/login"), 2000);
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
          <h2 className="text-xl font-bold text-center mb-2">Set New Password</h2>
          <p className="text-sm text-gray-500 text-center mb-6">
            Choose a new password for your account.
          </p>

          {success ? (
            <div className="text-center">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center text-3xl mx-auto mb-4">✅</div>
              <h3 className="text-lg font-semibold text-gray-900 mb-1">Password updated!</h3>
              <p className="text-sm text-gray-500">Redirecting to sign in...</p>
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
                  <label className="block text-xs font-bold text-gray-400 uppercase tracking-wide mb-1">New Password</label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="At least 8 characters"
                    className="w-full px-5 py-4 text-lg border-2 border-gray-200 rounded-xl font-body focus:border-brand-500 focus:outline-none transition"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase tracking-wide mb-1">Confirm Password</label>
                  <input
                    type="password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    placeholder="Re-enter your password"
                    className="w-full px-5 py-4 text-lg border-2 border-gray-200 rounded-xl font-body focus:border-brand-500 focus:outline-none transition"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-4 text-lg font-bold rounded-xl text-white transition shadow-lg disabled:opacity-50"
                  style={{ background: "linear-gradient(135deg, #4a7c59, #3a6247)" }}
                >
                  {loading ? "Updating..." : "Update Password →"}
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
