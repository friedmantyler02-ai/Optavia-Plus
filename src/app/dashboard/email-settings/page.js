"use client";

import { useState, useEffect, useCallback } from "react";
import { useCoach } from "../layout";

// ---------------------------------------------------------------------------
// Skeleton loader
// ---------------------------------------------------------------------------
function Skeleton({ className = "" }) {
  return <div className={`animate-pulse rounded-lg bg-gray-200 ${className}`} />;
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------
export default function EmailSettingsPage() {
  const { coach, supabase } = useCoach();

  const [triggers, setTriggers] = useState([]);
  const [settings, setSettings] = useState({});
  const [templates, setTemplates] = useState({});
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [savedFlash, setSavedFlash] = useState(null); // trigger_id that just saved

  // Modals
  const [previewTrigger, setPreviewTrigger] = useState(null);
  const [editTrigger, setEditTrigger] = useState(null);
  const [editSubject, setEditSubject] = useState("");
  const [editBody, setEditBody] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  // ------------------------------------------------------------------
  // Fetch everything on mount
  // ------------------------------------------------------------------
  const loadData = useCallback(async () => {
    if (!coach?.id) return;
    setLoading(true);
    setError(null);

    try {
      // Fetch triggers
      const { data: triggerRows, error: tErr } = await supabase
        .from("email_triggers")
        .select("*")
        .order("sort_order", { ascending: true });
      if (tErr) throw tErr;

      // Fetch coach's override settings
      const { data: settingRows, error: sErr } = await supabase
        .from("coach_trigger_settings")
        .select("*")
        .eq("coach_id", coach.id);
      if (sErr) throw sErr;

      // Fetch coach's custom templates
      const { data: templateRows, error: tmErr } = await supabase
        .from("email_templates")
        .select("*")
        .eq("coach_id", coach.id);
      if (tmErr) throw tmErr;

      // Index by trigger_id for fast lookup
      const settingsMap = {};
      (settingRows || []).forEach((s) => { settingsMap[s.trigger_id] = s; });
      const templatesMap = {};
      (templateRows || []).forEach((t) => { templatesMap[t.trigger_id] = t; });

      setTriggers(triggerRows || []);
      setSettings(settingsMap);
      setTemplates(templatesMap);

      // Fetch stats
      await loadStats();
    } catch (err) {
      console.error("Failed to load email settings:", err);
      setError("Something went wrong loading your email settings. Please try refreshing the page.");
    } finally {
      setLoading(false);
    }
  }, [coach?.id, supabase]);

  const loadStats = async () => {
    try {
      // Pending emails
      const { count: pendingCount } = await supabase
        .from("email_queue")
        .select("*", { count: "exact", head: true })
        .eq("coach_id", coach.id)
        .eq("status", "pending");

      // Sent this week
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      const { count: sentCount } = await supabase
        .from("email_log")
        .select("*", { count: "exact", head: true })
        .eq("coach_id", coach.id)
        .gte("sent_at", weekAgo.toISOString());

      // Open rate
      const { count: totalSent } = await supabase
        .from("email_log")
        .select("*", { count: "exact", head: true })
        .eq("coach_id", coach.id);

      const { count: totalOpened } = await supabase
        .from("email_log")
        .select("*", { count: "exact", head: true })
        .eq("coach_id", coach.id)
        .eq("opened", true);

      setStats({
        pending: pendingCount || 0,
        sentThisWeek: sentCount || 0,
        openRate: totalSent > 0 ? Math.round((totalOpened / totalSent) * 100) : null,
        totalSent: totalSent || 0,
      });
    } catch {
      // Stats are non-critical — just set empty
      setStats({ pending: 0, sentThisWeek: 0, openRate: null, totalSent: 0 });
    }
  };

  useEffect(() => {
    loadData();
  }, [loadData]);

  // ------------------------------------------------------------------
  // Toggle a trigger on/off
  // ------------------------------------------------------------------
  const handleToggle = async (trigger) => {
    const existing = settings[trigger.id];
    const currentlyEnabled = existing ? existing.enabled : trigger.default_enabled;
    const newEnabled = !currentlyEnabled;

    // Optimistic update
    setSettings((prev) => ({
      ...prev,
      [trigger.id]: { ...prev[trigger.id], trigger_id: trigger.id, coach_id: coach.id, enabled: newEnabled },
    }));

    // Flash "Saved!"
    setSavedFlash(trigger.id);
    setTimeout(() => setSavedFlash((f) => (f === trigger.id ? null : f)), 1500);

    try {
      const { error: uErr } = await supabase
        .from("coach_trigger_settings")
        .upsert(
          {
            coach_id: coach.id,
            trigger_id: trigger.id,
            enabled: newEnabled,
            delay_days: existing?.delay_days ?? trigger.default_delay_days,
          },
          { onConflict: "coach_id,trigger_id" }
        );
      if (uErr) throw uErr;
    } catch (err) {
      console.error("Toggle failed:", err);
      // Revert
      setSettings((prev) => ({
        ...prev,
        [trigger.id]: existing || undefined,
      }));
    }
  };

  // ------------------------------------------------------------------
  // Save delay days on blur
  // ------------------------------------------------------------------
  const handleDelayBlur = async (trigger, value) => {
    const days = Math.max(1, Math.min(365, parseInt(value) || trigger.default_delay_days));
    const existing = settings[trigger.id];

    // Optimistic
    setSettings((prev) => ({
      ...prev,
      [trigger.id]: { ...prev[trigger.id], trigger_id: trigger.id, coach_id: coach.id, delay_days: days },
    }));

    setSavedFlash(trigger.id);
    setTimeout(() => setSavedFlash((f) => (f === trigger.id ? null : f)), 1500);

    try {
      const { error: uErr } = await supabase
        .from("coach_trigger_settings")
        .upsert(
          {
            coach_id: coach.id,
            trigger_id: trigger.id,
            enabled: existing?.enabled ?? trigger.default_enabled,
            delay_days: days,
          },
          { onConflict: "coach_id,trigger_id" }
        );
      if (uErr) throw uErr;
    } catch (err) {
      console.error("Delay save failed:", err);
    }
  };

  // ------------------------------------------------------------------
  // Open edit modal
  // ------------------------------------------------------------------
  const openEditModal = (trigger) => {
    const custom = templates[trigger.id];
    setEditSubject(custom?.subject || trigger.default_subject || "");
    setEditBody(custom?.body_text || trigger.default_body_text || "");
    setEditTrigger(trigger);
  };

  // ------------------------------------------------------------------
  // Save custom template
  // ------------------------------------------------------------------
  const handleSaveTemplate = async () => {
    if (!editTrigger) return;
    setEditSaving(true);

    try {
      const { error: uErr } = await supabase
        .from("email_templates")
        .upsert(
          {
            coach_id: coach.id,
            trigger_id: editTrigger.id,
            subject: editSubject,
            body_text: editBody,
          },
          { onConflict: "coach_id,trigger_id" }
        );
      if (uErr) throw uErr;

      // Update local state
      setTemplates((prev) => ({
        ...prev,
        [editTrigger.id]: { coach_id: coach.id, trigger_id: editTrigger.id, subject: editSubject, body_text: editBody },
      }));
      setEditTrigger(null);
    } catch (err) {
      console.error("Save template failed:", err);
      alert("Failed to save — please try again.");
    } finally {
      setEditSaving(false);
    }
  };

  // ------------------------------------------------------------------
  // Reset template to default
  // ------------------------------------------------------------------
  const handleResetTemplate = async () => {
    if (!editTrigger) return;
    if (!confirm("Reset this email to the default message? Your custom version will be deleted.")) return;
    setEditSaving(true);

    try {
      const { error: dErr } = await supabase
        .from("email_templates")
        .delete()
        .eq("coach_id", coach.id)
        .eq("trigger_id", editTrigger.id);
      if (dErr) throw dErr;

      setTemplates((prev) => {
        const next = { ...prev };
        delete next[editTrigger.id];
        return next;
      });
      setEditSubject(editTrigger.default_subject || "");
      setEditBody(editTrigger.default_body_text || "");
    } catch (err) {
      console.error("Reset template failed:", err);
    } finally {
      setEditSaving(false);
    }
  };

  // ------------------------------------------------------------------
  // Render preview HTML with variable replacement
  // ------------------------------------------------------------------
  const renderPreviewHtml = (trigger) => {
    const custom = templates[trigger.id];
    let html = custom?.body_html || trigger.default_body_html || custom?.body_text || trigger.default_body_text || "";
    html = html
      .replace(/\{\{client_first_name\}\}/g, "Sarah")
      .replace(/\{\{coach_name\}\}/g, coach?.full_name || "Coach")
      .replace(/\{\{coach_email\}\}/g, coach?.email || "coach@example.com");
    return html;
  };

  const getPreviewSubject = (trigger) => {
    const custom = templates[trigger.id];
    let subject = custom?.subject || trigger.default_subject || "(No subject)";
    subject = subject
      .replace(/\{\{client_first_name\}\}/g, "Sarah")
      .replace(/\{\{coach_name\}\}/g, coach?.full_name || "Coach")
      .replace(/\{\{coach_email\}\}/g, coach?.email || "coach@example.com");
    return subject;
  };

  // ------------------------------------------------------------------
  // Helpers
  // ------------------------------------------------------------------
  const isEnabled = (trigger) => {
    const s = settings[trigger.id];
    return s ? s.enabled : trigger.default_enabled;
  };

  const effectiveDelay = (trigger) => {
    const s = settings[trigger.id];
    return s?.delay_days ?? trigger.default_delay_days;
  };

  const hasCustomTemplate = (triggerId) => !!templates[triggerId];

  const showDelayInput = (trigger) =>
    trigger.trigger_type === "time_since_last_order" || trigger.trigger_type === "time_since_import";

  // ------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------
  if (error) {
    return (
      <div className="animate-fade-up">
        <div className="rounded-2xl border-2 border-red-200 bg-red-50 p-8 text-center">
          <div className="text-4xl mb-3">😟</div>
          <p className="font-body text-lg text-red-700">{error}</p>
          <button
            onClick={loadData}
            className="mt-4 font-display rounded-2xl bg-red-100 px-6 py-3 text-sm font-bold text-red-700 hover:bg-red-200 transition"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-up">
      {/* ================================================================= */}
      {/* HEADER                                                            */}
      {/* ================================================================= */}
      <div className="mb-8">
        <h1 className="font-display text-2xl md:text-3xl font-bold text-gray-900">
          ✉️ Email Automation
        </h1>
        <p className="font-body mt-2 text-base text-gray-500">
          Configure when and what gets sent to your clients automatically
        </p>
      </div>

      {/* ================================================================= */}
      {/* STATS BANNER                                                      */}
      {/* ================================================================= */}
      <div className="mb-8 rounded-2xl border-2 border-gray-100 bg-white p-6">
        {loading ? (
          <div className="flex gap-8">
            <Skeleton className="h-12 w-32" />
            <Skeleton className="h-12 w-32" />
            <Skeleton className="h-12 w-32" />
          </div>
        ) : stats && stats.totalSent > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 text-center">
            <div>
              <p className="font-display text-3xl font-bold text-brand-500">{stats.pending}</p>
              <p className="font-body text-sm text-gray-500 mt-1">Emails Pending</p>
            </div>
            <div>
              <p className="font-display text-3xl font-bold text-brand-500">{stats.sentThisWeek}</p>
              <p className="font-body text-sm text-gray-500 mt-1">Sent This Week</p>
            </div>
            <div>
              <p className="font-display text-3xl font-bold text-brand-500">
                {stats.openRate !== null ? `${stats.openRate}%` : "—"}
              </p>
              <p className="font-body text-sm text-gray-500 mt-1">Open Rate</p>
            </div>
          </div>
        ) : (
          <div className="text-center py-2">
            <p className="font-body text-base text-gray-500">
              🎉 No emails sent yet — your automation is ready to go!
            </p>
          </div>
        )}
      </div>

      {/* ================================================================= */}
      {/* TRIGGER CARDS                                                     */}
      {/* ================================================================= */}
      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="rounded-2xl border-2 border-gray-100 bg-white p-6">
              <div className="flex items-center gap-4">
                <Skeleton className="h-10 w-10 rounded-xl" />
                <div className="flex-1">
                  <Skeleton className="h-5 w-48 mb-2" />
                  <Skeleton className="h-4 w-72" />
                </div>
                <Skeleton className="h-8 w-16 rounded-full" />
              </div>
            </div>
          ))}
        </div>
      ) : triggers.length === 0 ? (
        <div className="rounded-2xl border-2 border-gray-100 bg-white p-8 text-center">
          <div className="text-4xl mb-3">📭</div>
          <p className="font-body text-lg text-gray-500">
            No email triggers have been set up yet.
          </p>
          <p className="font-body text-sm text-gray-400 mt-1">
            Email triggers will appear here once they are configured in the system.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {triggers.map((trigger) => {
            const enabled = isEnabled(trigger);
            const delay = effectiveDelay(trigger);
            const hasCustom = hasCustomTemplate(trigger.id);
            const justSaved = savedFlash === trigger.id;

            return (
              <div
                key={trigger.id}
                className="rounded-2xl border-2 border-gray-100 bg-white overflow-hidden"
                style={{ borderLeftWidth: "6px", borderLeftColor: trigger.color || "#4a7c59" }}
              >
                <div className="p-5 sm:p-6">
                  {/* Top row: icon + name + badge + toggle */}
                  <div className="flex items-start justify-between gap-4 mb-3">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <span className="text-3xl shrink-0">{trigger.icon || "📧"}</span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-display text-lg font-bold text-gray-900">
                            {trigger.name}
                          </h3>
                          {hasCustom && (
                            <span className="inline-flex items-center rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-bold text-brand-600">
                              Customized
                            </span>
                          )}
                          {justSaved && (
                            <span className="inline-flex items-center text-xs font-bold text-green-600 animate-pulse">
                              ✓ Saved!
                            </span>
                          )}
                        </div>
                        <p className="font-body text-sm text-gray-500 mt-0.5">
                          {trigger.description}
                        </p>
                      </div>
                    </div>

                    {/* Toggle switch */}
                    <button
                      onClick={() => handleToggle(trigger)}
                      className="shrink-0 mt-1"
                      aria-label={`${enabled ? "Disable" : "Enable"} ${trigger.name}`}
                    >
                      <div
                        className={`relative w-14 h-8 rounded-full transition-colors duration-200 ${
                          enabled ? "bg-green-500" : "bg-gray-300"
                        }`}
                      >
                        <div
                          className={`absolute top-1 w-6 h-6 rounded-full bg-white shadow-md transition-transform duration-200 ${
                            enabled ? "translate-x-7" : "translate-x-1"
                          }`}
                        />
                      </div>
                    </button>
                  </div>

                  {/* Delay input (only for time-based triggers) */}
                  {showDelayInput(trigger) && (
                    <div className="flex items-center gap-2 mt-3 mb-3 ml-12">
                      <label className="font-body text-sm text-gray-600">Send after</label>
                      <input
                        type="number"
                        min="1"
                        max="365"
                        defaultValue={delay}
                        onBlur={(e) => handleDelayBlur(trigger, e.target.value)}
                        className="font-body w-20 rounded-xl border-2 border-gray-200 px-3 py-2 text-center text-sm font-bold text-gray-900 focus:border-brand-400 focus:outline-none"
                      />
                      <span className="font-body text-sm text-gray-600">days</span>
                    </div>
                  )}

                  {/* Action buttons */}
                  <div className="flex items-center gap-3 mt-4 ml-12">
                    <button
                      onClick={() => setPreviewTrigger(trigger)}
                      className="font-body inline-flex items-center gap-1.5 rounded-xl border-2 border-gray-200 bg-white px-4 py-2.5 text-sm font-bold text-gray-600 transition hover:border-brand-300 hover:bg-brand-50 hover:text-brand-600"
                    >
                      👁️ Preview Email
                    </button>
                    <button
                      onClick={() => openEditModal(trigger)}
                      className="font-body inline-flex items-center gap-1.5 rounded-xl border-2 border-gray-200 bg-white px-4 py-2.5 text-sm font-bold text-gray-600 transition hover:border-coral-300 hover:bg-coral-50 hover:text-coral-600"
                    >
                      ✏️ Edit Message
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ================================================================= */}
      {/* PREVIEW MODAL                                                     */}
      {/* ================================================================= */}
      {previewTrigger && (
        <>
          <div className="fixed inset-0 z-50 bg-black/40" onClick={() => setPreviewTrigger(null)} />
          <div className="fixed inset-4 sm:inset-auto sm:left-1/2 sm:top-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:w-full sm:max-w-2xl sm:max-h-[80vh] z-50 flex flex-col rounded-2xl bg-white shadow-2xl border-2 border-gray-100 overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gray-50 shrink-0">
              <div>
                <p className="font-body text-xs font-semibold uppercase tracking-wide text-gray-400">Email Preview</p>
                <h3 className="font-display text-lg font-bold text-gray-900 mt-0.5">
                  {previewTrigger.name}
                </h3>
              </div>
              <button
                onClick={() => setPreviewTrigger(null)}
                className="w-10 h-10 rounded-xl flex items-center justify-center text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition text-xl"
              >
                ✕
              </button>
            </div>

            {/* Subject */}
            <div className="px-6 py-3 border-b border-gray-100 bg-brand-50/50 shrink-0">
              <p className="font-body text-sm">
                <span className="font-bold text-gray-500">Subject: </span>
                <span className="text-gray-900">{getPreviewSubject(previewTrigger)}</span>
              </p>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-6 py-6">
              <div
                className="font-body text-sm text-gray-800 leading-relaxed prose prose-sm max-w-none"
                dangerouslySetInnerHTML={{ __html: renderPreviewHtml(previewTrigger) }}
              />
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 shrink-0">
              <p className="font-body text-xs text-gray-400 text-center">
                Preview shown with sample name "Sarah" — actual client names will be inserted automatically
              </p>
            </div>
          </div>
        </>
      )}

      {/* ================================================================= */}
      {/* EDIT MODAL                                                        */}
      {/* ================================================================= */}
      {editTrigger && (
        <>
          <div className="fixed inset-0 z-50 bg-black/40" onClick={() => !editSaving && setEditTrigger(null)} />
          <div className="fixed inset-4 sm:inset-auto sm:left-1/2 sm:top-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:w-full sm:max-w-2xl sm:max-h-[85vh] z-50 flex flex-col rounded-2xl bg-white shadow-2xl border-2 border-gray-100 overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gray-50 shrink-0">
              <div>
                <p className="font-body text-xs font-semibold uppercase tracking-wide text-gray-400">Edit Email</p>
                <h3 className="font-display text-lg font-bold text-gray-900 mt-0.5">
                  {editTrigger.name}
                </h3>
              </div>
              <button
                onClick={() => !editSaving && setEditTrigger(null)}
                className="w-10 h-10 rounded-xl flex items-center justify-center text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition text-xl"
              >
                ✕
              </button>
            </div>

            {/* Form */}
            <div className="flex-1 overflow-y-auto px-6 py-6 space-y-5">
              {/* Variable hints */}
              <div className="rounded-xl bg-brand-50 px-4 py-3">
                <p className="font-body text-xs font-bold text-brand-600 mb-1">Available template variables:</p>
                <div className="flex flex-wrap gap-2">
                  {["{{client_first_name}}", "{{coach_name}}", "{{coach_email}}"].map((v) => (
                    <code key={v} className="rounded-lg bg-white px-2 py-1 text-xs font-mono text-brand-700 border border-brand-200">
                      {v}
                    </code>
                  ))}
                </div>
              </div>

              {/* Subject line */}
              <div>
                <label className="font-body block text-sm font-bold text-gray-700 mb-1.5">
                  Subject Line
                </label>
                <input
                  type="text"
                  value={editSubject}
                  onChange={(e) => setEditSubject(e.target.value)}
                  placeholder="Enter email subject..."
                  className="font-body w-full rounded-xl border-2 border-gray-200 px-4 py-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-brand-400 focus:outline-none"
                />
              </div>

              {/* Body */}
              <div>
                <label className="font-body block text-sm font-bold text-gray-700 mb-1.5">
                  Message Body
                </label>
                <textarea
                  value={editBody}
                  onChange={(e) => setEditBody(e.target.value)}
                  rows={10}
                  placeholder="Write your email message..."
                  className="font-body w-full rounded-xl border-2 border-gray-200 px-4 py-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-brand-400 focus:outline-none resize-y"
                />
              </div>
            </div>

            {/* Footer buttons */}
            <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100 bg-gray-50 shrink-0">
              <button
                onClick={handleResetTemplate}
                disabled={editSaving || !hasCustomTemplate(editTrigger.id)}
                className="font-body rounded-xl border-2 border-gray-200 bg-white px-4 py-2.5 text-sm font-bold text-gray-500 transition hover:border-red-300 hover:bg-red-50 hover:text-red-600 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Reset to Default
              </button>
              <div className="flex gap-3">
                <button
                  onClick={() => setEditTrigger(null)}
                  disabled={editSaving}
                  className="font-body rounded-xl border-2 border-gray-200 bg-white px-5 py-2.5 text-sm font-bold text-gray-600 transition hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveTemplate}
                  disabled={editSaving}
                  className="font-display rounded-2xl bg-brand-500 px-6 py-2.5 text-sm font-bold text-white shadow-lg transition hover:bg-brand-600 hover:shadow-xl disabled:opacity-60"
                >
                  {editSaving ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
