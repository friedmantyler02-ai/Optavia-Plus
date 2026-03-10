"use client";

import { useState } from "react";
import { useCoach } from "../layout";
import useShowToast from "@/hooks/useShowToast";
import PageHeader from "../components/PageHeader";

export default function SettingsPage() {
  const { coach, supabase } = useCoach();
  const showToast = useShowToast();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordError, setPasswordError] = useState("");
  const [passwordSuccess, setPasswordSuccess] = useState(false);

  const handlePasswordChange = async (e) => {
    e.preventDefault();
    setPasswordError("");
    setPasswordSuccess(false);

    if (newPassword.length < 8) {
      setPasswordError("New password must be at least 8 characters.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordError("New passwords do not match.");
      return;
    }

    setPasswordLoading(true);

    const { error } = await supabase.auth.updateUser({
      password: newPassword,
    });

    if (error) {
      setPasswordError(error.message);
      setPasswordLoading(false);
      return;
    }

    setPasswordSuccess(true);
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setPasswordLoading(false);

    if (showToast) {
      showToast("Password updated successfully!", "success");
    }
  };

  return (
    <>
      <PageHeader
        title="Settings"
        subtitle="Manage your account"
      />
      <div className="space-y-4">
        {/* Profile Card */}
        <div className="rounded-2xl border-2 border-gray-100 bg-white p-6">
          <h2 className="font-display text-lg font-bold text-gray-900 mb-4">Profile</h2>
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-bold text-gray-400 uppercase tracking-wide mb-1">Full Name</label>
              <p className="text-base text-gray-900 bg-gray-50 px-4 py-3 rounded-xl border-2 border-gray-100">{coach?.full_name || "—"}</p>
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-400 uppercase tracking-wide mb-1">Email</label>
              <p className="text-base text-gray-900 bg-gray-50 px-4 py-3 rounded-xl border-2 border-gray-100">{coach?.email || "—"}</p>
            </div>
            {coach?.optavia_id && (
              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-wide mb-1">Optavia ID</label>
                <p className="text-base text-gray-900 bg-gray-50 px-4 py-3 rounded-xl border-2 border-gray-100">{coach.optavia_id}</p>
              </div>
            )}
          </div>
          <p className="text-xs text-gray-400 mt-4">Contact support to update your email.</p>
        </div>

        {/* Password Card */}
        <div className="rounded-2xl border-2 border-gray-100 bg-white p-6">
          <h2 className="font-display text-lg font-bold text-gray-900 mb-4">Password</h2>

          {passwordError && (
            <div className="bg-red-50 border-2 border-red-200 text-red-700 px-4 py-3 rounded-xl mb-4 text-sm font-semibold">
              {passwordError}
            </div>
          )}

          {passwordSuccess && !showToast && (
            <div className="bg-green-50 border-2 border-green-200 text-green-700 px-4 py-3 rounded-xl mb-4 text-sm font-semibold">
              Password updated successfully!
            </div>
          )}

          <form onSubmit={handlePasswordChange} className="space-y-3">
            <div>
              <label className="block text-xs font-bold text-gray-400 uppercase tracking-wide mb-1">Current Password</label>
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Enter current password"
                className="w-full px-4 py-3 text-sm border-2 border-gray-200 rounded-xl font-body focus:border-[#E8735A] focus:ring-1 focus:ring-[#E8735A]/30 focus:outline-none transition-colors"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-400 uppercase tracking-wide mb-1">New Password</label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="At least 8 characters"
                className="w-full px-4 py-3 text-sm border-2 border-gray-200 rounded-xl font-body focus:border-[#E8735A] focus:ring-1 focus:ring-[#E8735A]/30 focus:outline-none transition-colors"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-400 uppercase tracking-wide mb-1">Confirm New Password</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter new password"
                className="w-full px-4 py-3 text-sm border-2 border-gray-200 rounded-xl font-body focus:border-[#E8735A] focus:ring-1 focus:ring-[#E8735A]/30 focus:outline-none transition-colors"
              />
            </div>
            <button
              type="submit"
              disabled={passwordLoading}
              className="bg-[#E8735A] hover:bg-[#d4634d] text-white px-6 py-3 rounded-xl text-sm font-bold transition-all duration-150 active:scale-95 disabled:opacity-50 mt-2 shadow-sm"
            >
              {passwordLoading ? "Updating..." : "Update Password"}
            </button>
          </form>
        </div>

        {/* Preferences Card */}
        <div className="rounded-2xl border-2 border-gray-100 bg-white p-6">
          <h2 className="font-display text-lg font-bold text-gray-900 mb-1">Preferences</h2>
          <p className="text-sm text-gray-500">Customize notifications and display options.</p>
          <p className="text-sm text-gray-400 mt-3 italic">Coming soon</p>
        </div>
      </div>
    </>
  );
}
