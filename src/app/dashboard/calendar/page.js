"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useCoach } from "../layout";
import { useSearchParams } from "next/navigation";
import useShowToast from "@/hooks/useShowToast";
import PageHeader from "../components/PageHeader";
import ErrorBanner from "../components/ErrorBanner";
import ConfirmDialog from "../components/ConfirmDialog";

// --- Helpers ---
const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function fmt(d) { return d.toISOString().split("T")[0]; }
function monthKey(d) { return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`; }
function isSameDay(a, b) { return a.getFullYear()===b.getFullYear() && a.getMonth()===b.getMonth() && a.getDate()===b.getDate(); }
function parseDate(s) { const [y,m,d] = s.split("-").map(Number); return new Date(y,m-1,d); }

function getWeekStart(date) {
  const d = new Date(date);
  d.setDate(d.getDate() - d.getDay()); // Sunday
  return d;
}

const EVENT_COLORS = {
  lead_followup:      { bg: "bg-[#E8735A]",    text: "text-[#E8735A]",    light: "bg-[#fef0ed]",  border: "border-[#E8735A]" },
  client_checkin:     { bg: "bg-[#3B82F6]",    text: "text-[#3B82F6]",    light: "bg-blue-50",    border: "border-[#3B82F6]" },
  reminder:           { bg: "bg-[#8B5CF6]",    text: "text-[#8B5CF6]",    light: "bg-purple-50",  border: "border-[#8B5CF6]" },
  recurring_reminder: { bg: "bg-emerald-500",  text: "text-emerald-600",  light: "bg-emerald-50", border: "border-emerald-500" },
};

const TYPE_LABELS = {
  lead_followup: "Follow-up",
  client_checkin: "Check-in",
  reminder: "Reminder",
  recurring_reminder: "Recurring",
};

// --- Skeleton ---
function CalendarSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="grid grid-cols-7 gap-px bg-gray-200 rounded-2xl overflow-hidden">
        {Array.from({ length: 35 }).map((_, i) => (
          <div key={i} className="bg-gray-50 h-24 md:h-28" />
        ))}
      </div>
    </div>
  );
}

// --- Event Pill (month view) ---
function EventPill({ event }) {
  const c = EVENT_COLORS[event.type];
  return (
    <div className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold truncate ${event.isCompleted ? "opacity-40" : ""} ${c.light}`}>
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${c.bg}`} />
      <span className={`truncate ${event.isCompleted ? "line-through" : ""} ${c.text}`}>{event.title}</span>
    </div>
  );
}

// --- Event Card (week view) ---
function EventCard({ event, onClick }) {
  const c = EVENT_COLORS[event.type];
  return (
    <button
      onClick={onClick}
      className={`w-full text-left border-l-3 ${c.border} bg-white rounded-lg px-2.5 py-2 shadow-sm hover:shadow-md transition-shadow ${event.isCompleted ? "opacity-50" : ""}`}
    >
      <p className={`text-xs font-semibold truncate ${event.isCompleted ? "line-through text-gray-400" : "text-gray-800"}`}>{event.title}</p>
      <p className="text-[10px] text-gray-400 truncate">{event.subtitle}</p>
      {event.dueTime && <p className="text-[10px] text-gray-400 mt-0.5">{event.dueTime.slice(0, 5)}</p>}
    </button>
  );
}

// --- Day Detail Panel ---
function DayDetailPanel({ date, events, onClose, onAction, actionLoading }) {
  const grouped = useMemo(() => {
    const g = { lead_followup: [], client_checkin: [], reminder: [], recurring_reminder: [] };
    events.forEach(e => { if (g[e.type]) g[e.type].push(e); });
    return g;
  }, [events]);

  const dateObj = parseDate(date);
  const label = dateObj.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });

  return (
    <div className="fixed inset-0 z-50 flex justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/30" />
      <div className="relative bg-white w-full max-w-md h-full shadow-xl overflow-y-auto animate-slide-in" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-white border-b border-gray-100 px-5 py-4 flex items-center justify-between z-10">
          <div>
            <h2 className="font-display text-lg font-bold text-gray-900">{label}</h2>
            <p className="text-xs text-gray-400">{events.length} event{events.length !== 1 ? "s" : ""}</p>
          </div>
          <button onClick={onClose} className="w-11 h-11 rounded-xl hover:bg-gray-100 flex items-center justify-center text-gray-400 text-xl transition touch-manipulation">&#10005;</button>
        </div>

        <div className="p-5 space-y-6">
          {Object.entries(grouped).map(([type, items]) => {
            if (!items.length) return null;
            const c = EVENT_COLORS[type];
            return (
              <div key={type}>
                <h3 className={`text-xs font-bold uppercase tracking-wider mb-2 ${c.text}`}>{TYPE_LABELS[type]}s</h3>
                <div className="space-y-2">
                  {items.map(event => (
                    <div key={event.id} className={`bg-white border border-gray-100 rounded-xl p-3 ${event.isCompleted ? "opacity-50" : ""}`}>
                      <div className="flex items-start gap-2.5">
                        <span className={`w-2.5 h-2.5 rounded-full mt-1 flex-shrink-0 ${c.bg}`} />
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm font-semibold ${event.isCompleted ? "line-through text-gray-400" : "text-gray-800"}`}>{event.title}</p>
                          <p className="text-xs text-gray-400">{event.subtitle}</p>
                          {event.dueTime && <p className="text-xs text-gray-400 mt-0.5">{event.dueTime.slice(0, 5)}</p>}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 mt-2.5 ml-5 flex-wrap">
                        {!event.isCompleted && type !== "recurring_reminder" && (
                          <button
                            onClick={() => onAction("complete", event)}
                            disabled={actionLoading === event.id}
                            className="text-xs font-medium text-green-600 bg-green-50 hover:bg-green-100 px-3 py-2 rounded-lg transition disabled:opacity-50 min-h-[44px] touch-manipulation"
                          >
                            {actionLoading === event.id ? "..." : "Done \u2713"}
                          </button>
                        )}
                        {type === "lead_followup" && (
                          <a href={`/dashboard/leads`} className="text-xs font-medium text-gray-500 hover:text-gray-700 px-2.5 py-1 rounded-lg hover:bg-gray-50 transition">View Lead</a>
                        )}
                        {type === "client_checkin" && (
                          <a href={`/dashboard/clients`} className="text-xs font-medium text-gray-500 hover:text-gray-700 px-2.5 py-1 rounded-lg hover:bg-gray-50 transition">View</a>
                        )}
                        {type === "reminder" && (
                          <>
                            <button onClick={() => onAction("edit", event)} className="text-xs font-medium text-gray-500 hover:text-gray-700 px-2.5 py-1 rounded-lg hover:bg-gray-50 transition">Edit</button>
                            <button onClick={() => onAction("delete", event)} className="text-xs font-medium text-red-500 hover:text-red-600 px-2.5 py-1 rounded-lg hover:bg-red-50 transition">Delete</button>
                          </>
                        )}
                        {type === "recurring_reminder" && (
                          <>
                            <span className="text-xs text-emerald-600 font-medium">↻ Recurring</span>
                            <button onClick={() => onAction("edit", event)} className="text-xs font-medium text-gray-500 hover:text-gray-700 px-2.5 py-1 rounded-lg hover:bg-gray-50 transition">Edit</button>
                            <button onClick={() => onAction("delete", event)} className="text-xs font-medium text-red-500 hover:text-red-600 px-2.5 py-1 rounded-lg hover:bg-red-50 transition">Delete</button>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}

          {events.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-8">No events this day</p>
          )}

          <button
            onClick={() => onAction("addReminder", { date })}
            className="w-full bg-[#E8735A] hover:bg-[#d4634d] text-white text-sm font-bold py-3 rounded-xl transition-all active:scale-[0.98] shadow-sm min-h-[44px] touch-manipulation"
          >
            + Add Reminder
          </button>
        </div>
      </div>
    </div>
  );
}

// --- Reminder Modal ---
function ReminderModal({ isOpen, onClose, onSave, initial, saving }) {
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [dueTime, setDueTime] = useState("");
  const [linkType, setLinkType] = useState("none"); // none, lead, client
  const [linkId, setLinkId] = useState("");
  const [leads, setLeads] = useState([]);
  const [clients, setClients] = useState([]);
  const { supabase } = useCoach();

  useEffect(() => {
    if (isOpen) {
      setTitle(initial?.title || "");
      setNotes(initial?.notes || "");
      setDueDate(initial?.due_date || initial?.date || "");
      setDueTime(initial?.due_time || initial?.dueTime || "");
      if (initial?.leadId) { setLinkType("lead"); setLinkId(initial.leadId); }
      else if (initial?.clientId) { setLinkType("client"); setLinkId(initial.clientId); }
      else { setLinkType("none"); setLinkId(""); }
      loadOptions();
    }
  }, [isOpen]);

  const loadOptions = async () => {
    const [leadsRes, clientsRes] = await Promise.all([
      fetch("/api/leads?limit=100&sort=full_name&order=asc").then(r => r.json()),
      supabase.from("clients").select("id, full_name").eq("coach_id", (await supabase.auth.getUser()).data.user.id).order("full_name"),
    ]);
    setLeads(leadsRes.leads || []);
    setClients(clientsRes.data || []);
  };

  const handleSave = () => {
    if (!title.trim() || !dueDate) return;
    onSave({
      id: initial?.id,
      title: title.trim(),
      notes: notes.trim() || null,
      due_date: dueDate,
      due_time: dueTime || null,
      client_id: linkType === "client" ? linkId : null,
      lead_id: linkType === "lead" ? linkId : null,
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" />
      <div className="relative bg-white rounded-2xl shadow-xl max-w-md w-full p-6" onClick={e => e.stopPropagation()}>
        <h2 className="font-display text-lg font-bold text-gray-900 mb-4">{initial?.id ? "Edit Reminder" : "Add Reminder"}</h2>

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-bold text-gray-400 uppercase tracking-wide mb-1">Title *</label>
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="e.g. Call Sarah about plan"
              className="w-full border-2 border-gray-200 rounded-xl px-4 py-2.5 text-base font-body focus:outline-none focus:ring-1 focus:ring-[#E8735A]/30 focus:border-[#E8735A] transition-colors min-h-[44px]"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-400 uppercase tracking-wide mb-1">Notes</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={2}
              placeholder="Optional details..."
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-[#E8735A]/30 focus:border-[#E8735A] resize-none"
            />
          </div>
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-xs font-bold text-gray-400 uppercase tracking-wide mb-1">Date *</label>
              <input
                type="date"
                value={dueDate}
                onChange={e => setDueDate(e.target.value)}
                className="w-full border-2 border-gray-200 rounded-xl px-4 py-2.5 text-base font-body focus:outline-none focus:ring-1 focus:ring-[#E8735A]/30 focus:border-[#E8735A] transition-colors min-h-[44px]"
              />
            </div>
            <div className="flex-1">
              <label className="block text-xs font-bold text-gray-400 uppercase tracking-wide mb-1">Time</label>
              <input
                type="time"
                value={dueTime}
                onChange={e => setDueTime(e.target.value)}
                className="w-full border-2 border-gray-200 rounded-xl px-4 py-2.5 text-base font-body focus:outline-none focus:ring-1 focus:ring-[#E8735A]/30 focus:border-[#E8735A] transition-colors min-h-[44px]"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-400 uppercase tracking-wide mb-1">Link to</label>
            <div className="flex gap-2 mb-2">
              {["none", "lead", "client"].map(t => (
                <button
                  key={t}
                  onClick={() => { setLinkType(t); setLinkId(""); }}
                  className={`px-4 py-2 rounded-xl text-sm font-bold transition min-h-[44px] touch-manipulation ${linkType === t ? "bg-[#E8735A] text-white" : "bg-gray-100 text-gray-500 hover:bg-gray-200"}`}
                >
                  {t === "none" ? "None" : t === "lead" ? "Lead" : "Client"}
                </button>
              ))}
            </div>
            {linkType === "lead" && (
              <select
                value={linkId}
                onChange={e => setLinkId(e.target.value)}
                className="w-full border-2 border-gray-200 rounded-xl px-4 py-2.5 text-base font-body focus:outline-none focus:ring-1 focus:ring-[#E8735A]/30 focus:border-[#E8735A] transition-colors min-h-[44px]"
              >
                <option value="">Select a lead...</option>
                {leads.filter(l => l.stage !== "client").map(l => (
                  <option key={l.id} value={l.id}>{l.full_name}</option>
                ))}
              </select>
            )}
            {linkType === "client" && (
              <select
                value={linkId}
                onChange={e => setLinkId(e.target.value)}
                className="w-full border-2 border-gray-200 rounded-xl px-4 py-2.5 text-base font-body focus:outline-none focus:ring-1 focus:ring-[#E8735A]/30 focus:border-[#E8735A] transition-colors min-h-[44px]"
              >
                <option value="">Select a client...</option>
                {clients.map(c => (
                  <option key={c.id} value={c.id}>{c.full_name}</option>
                ))}
              </select>
            )}
          </div>
        </div>

        <div className="flex gap-3 justify-end mt-5">
          <button onClick={onClose} className="border-2 border-gray-200 text-gray-600 hover:bg-gray-50 px-5 py-2.5 rounded-xl text-sm font-bold transition">Cancel</button>
          <button
            onClick={handleSave}
            disabled={!title.trim() || !dueDate || saving}
            className="bg-[#E8735A] hover:bg-[#d4634d] text-white px-6 py-2.5 rounded-xl text-sm font-bold transition-all active:scale-95 disabled:opacity-50 flex items-center gap-2"
          >
            {saving && <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
            {initial?.id ? "Update" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

// --- Recurring Reminder Modal ---
const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
const ORDINALS = ["1st", "2nd", "3rd", "4th"];

function RecurringReminderModal({ isOpen, onClose, onSave, initial, saving }) {
  const [title, setTitle] = useState("");
  const [clientId, setClientId] = useState("");
  const [clientName, setClientName] = useState("");
  const [clientSearch, setClientSearch] = useState("");
  const [clients, setClients] = useState([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [frequency, setFrequency] = useState("weekly");
  const [dayOfWeek, setDayOfWeek] = useState("Monday");
  const [monthlyOrdinal, setMonthlyOrdinal] = useState("1st");
  const [monthlyDay, setMonthlyDay] = useState("Monday");
  const [isAllDay, setIsAllDay] = useState(true);
  const [reminderTime, setReminderTime] = useState("09:00");
  const { supabase } = useCoach();

  useEffect(() => {
    if (!isOpen) return;
    setTitle(initial?.recurringRawTitle || "");
    setClientId(initial?.recurringClientId || "");
    setClientName(initial?.recurringClientName || "");
    setClientSearch(initial?.recurringClientName || "");
    setFrequency(initial?.recurringFrequency || "weekly");
    setDayOfWeek(initial?.recurringDayOfWeek || "Monday");
    setMonthlyOrdinal(initial?.recurringMonthlyOrdinal || "1st");
    setMonthlyDay(initial?.recurringMonthlyDay || "Monday");
    setIsAllDay(initial?.isAllDay !== false);
    setReminderTime(initial?.dueTime?.slice(0, 5) || "09:00");
    loadClients();
  }, [isOpen]);

  const loadClients = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    const { data } = await supabase
      .from("clients")
      .select("id, full_name")
      .eq("coach_id", user.id)
      .order("full_name");
    setClients(data || []);
  };

  const filteredClients = clients.filter(c =>
    c.full_name.toLowerCase().includes(clientSearch.toLowerCase())
  );

  const selectClient = (c) => {
    setClientId(c.id);
    setClientName(c.full_name);
    setClientSearch(c.full_name);
    setShowDropdown(false);
  };

  const clearClient = () => {
    setClientId("");
    setClientName("");
    setClientSearch("");
  };

  const handleSave = () => {
    if (!title.trim()) return;
    onSave({
      id: initial?.recurringReminderId || null,
      title: title.trim(),
      client_id: clientId || null,
      client_name: clientName || null,
      frequency,
      day_of_week: frequency !== "monthly" ? dayOfWeek : null,
      monthly_ordinal: frequency === "monthly" ? monthlyOrdinal : null,
      monthly_day: frequency === "monthly" ? monthlyDay : null,
      is_all_day: isAllDay,
      reminder_time: isAllDay ? null : reminderTime,
    });
  };

  const canSave = title.trim() &&
    (frequency === "monthly" || dayOfWeek) &&
    (frequency !== "monthly" || (monthlyOrdinal && monthlyDay));

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" />
      <div
        className="relative bg-white rounded-2xl shadow-xl max-w-md w-full p-6 max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <h2 className="font-display text-lg font-bold text-gray-900 mb-5">
          {initial?.recurringReminderId ? "Edit Recurring Reminder" : "Add Recurring Reminder"}
        </h2>

        <div className="space-y-4">
          {/* Title */}
          <div>
            <label className="block text-xs font-bold text-gray-400 uppercase tracking-wide mb-1">Title *</label>
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="e.g. Weekly check-in call"
              className="w-full border-2 border-gray-200 rounded-xl px-4 py-2.5 text-base font-body focus:outline-none focus:border-[#E8735A] transition-colors min-h-[44px]"
            />
          </div>

          {/* Client search */}
          <div className="relative">
            <label className="block text-xs font-bold text-gray-400 uppercase tracking-wide mb-1">Client (optional)</label>
            <div className="relative">
              <input
                value={clientSearch}
                onChange={e => {
                  setClientSearch(e.target.value);
                  setShowDropdown(true);
                  if (!e.target.value) clearClient();
                }}
                onFocus={() => setShowDropdown(true)}
                onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
                placeholder="Search clients..."
                className="w-full border-2 border-gray-200 rounded-xl px-4 py-2.5 text-base font-body focus:outline-none focus:border-[#E8735A] transition-colors min-h-[44px] pr-10"
              />
              {clientId && (
                <button
                  onMouseDown={e => { e.preventDefault(); clearClient(); }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xl leading-none"
                >
                  &times;
                </button>
              )}
            </div>
            {showDropdown && clientSearch && filteredClients.length > 0 && (
              <div className="absolute z-20 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg max-h-40 overflow-y-auto">
                {filteredClients.slice(0, 8).map(c => (
                  <button
                    key={c.id}
                    onMouseDown={() => selectClient(c)}
                    className="w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 transition"
                  >
                    {c.full_name}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Frequency */}
          <div>
            <label className="block text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">Frequency *</label>
            <div className="flex gap-2">
              {[
                { key: "weekly", label: "Weekly" },
                { key: "biweekly", label: "Every 2 Wks" },
                { key: "monthly", label: "Monthly" },
              ].map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setFrequency(key)}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition min-h-[44px] ${frequency === key ? "bg-[#E8735A] text-white" : "bg-gray-100 text-gray-500 hover:bg-gray-200"}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Weekday picker (weekly / biweekly) */}
          {(frequency === "weekly" || frequency === "biweekly") && (
            <div>
              <label className="block text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">Day *</label>
              <div className="flex gap-1.5">
                {WEEKDAYS.map(day => (
                  <button
                    key={day}
                    onClick={() => setDayOfWeek(day)}
                    className={`flex-1 py-2 rounded-xl text-xs font-bold transition min-h-[44px] ${dayOfWeek === day ? "bg-[#E8735A] text-white" : "bg-gray-100 text-gray-500 hover:bg-gray-200"}`}
                  >
                    {day.slice(0, 3)}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Monthly picker */}
          {frequency === "monthly" && (
            <div>
              <label className="block text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">Repeats on *</label>
              <div className="flex gap-2">
                <select
                  value={monthlyOrdinal}
                  onChange={e => setMonthlyOrdinal(e.target.value)}
                  className="flex-1 border-2 border-gray-200 rounded-xl px-3 py-2.5 text-base font-body focus:outline-none focus:border-[#E8735A] min-h-[44px]"
                >
                  {ORDINALS.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
                <select
                  value={monthlyDay}
                  onChange={e => setMonthlyDay(e.target.value)}
                  className="flex-1 border-2 border-gray-200 rounded-xl px-3 py-2.5 text-base font-body focus:outline-none focus:border-[#E8735A] min-h-[44px]"
                >
                  {WEEKDAYS.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
            </div>
          )}

          {/* Time */}
          <div>
            <label className="block text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">Time</label>
            <div className="flex gap-2">
              <button
                onClick={() => setIsAllDay(true)}
                className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition min-h-[44px] ${isAllDay ? "bg-[#E8735A] text-white" : "bg-gray-100 text-gray-500 hover:bg-gray-200"}`}
              >
                All day
              </button>
              <button
                onClick={() => setIsAllDay(false)}
                className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition min-h-[44px] ${!isAllDay ? "bg-[#E8735A] text-white" : "bg-gray-100 text-gray-500 hover:bg-gray-200"}`}
              >
                Specific time
              </button>
            </div>
            {!isAllDay && (
              <input
                type="time"
                value={reminderTime}
                onChange={e => setReminderTime(e.target.value)}
                className="mt-2 w-full border-2 border-gray-200 rounded-xl px-4 py-2.5 text-base font-body focus:outline-none focus:border-[#E8735A] min-h-[44px]"
              />
            )}
          </div>
        </div>

        <div className="flex gap-3 justify-end mt-6">
          <button
            onClick={onClose}
            className="border-2 border-gray-200 text-gray-600 hover:bg-gray-50 px-5 py-2.5 rounded-xl text-sm font-bold transition"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!canSave || saving}
            className="bg-[#E8735A] hover:bg-[#d4634d] text-white px-6 py-2.5 rounded-xl text-sm font-bold transition-all active:scale-95 disabled:opacity-50 flex items-center gap-2"
          >
            {saving && <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
            {initial?.recurringReminderId ? "Update" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

// === MAIN PAGE ===
export default function CalendarPage() {
  const { coach, supabase } = useCoach();
  const showToast = useShowToast();
  const searchParams = useSearchParams();

  // Google Calendar connection state
  const [gcalConnected, setGcalConnected] = useState(null); // null = loading, true/false
  const [disconnecting, setDisconnecting] = useState(false);

  useEffect(() => {
    if (!coach?.id) return;
    supabase
      .from("google_calendar_connections")
      .select("id")
      .eq("coach_id", coach.id)
      .maybeSingle()
      .then(({ data }) => setGcalConnected(!!data));
  }, [coach?.id]);

  useEffect(() => {
    if (searchParams.get("connected") === "true") {
      showToast({ message: "Google Calendar connected!", variant: "success" });
      setGcalConnected(true);
    }
  }, []);

  const handleDisconnect = async () => {
    setDisconnecting(true);
    try {
      const res = await fetch("/api/auth/google/disconnect", { method: "POST" });
      if (res.ok) {
        setGcalConnected(false);
        showToast({ message: "Google Calendar disconnected", variant: "success" });
      } else {
        showToast({ message: "Failed to disconnect", variant: "error" });
      }
    } catch {
      showToast({ message: "Failed to disconnect", variant: "error" });
    } finally {
      setDisconnecting(false);
    }
  };

  const today = new Date();
  const [currentMonth, setCurrentMonth] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [view, setView] = useState("month"); // month | week
  const [selectedWeekStart, setSelectedWeekStart] = useState(getWeekStart(today));
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedDay, setSelectedDay] = useState(null);
  const [actionLoading, setActionLoading] = useState(null);

  // Reminder modal (one-time)
  const [reminderModal, setReminderModal] = useState({ open: false, initial: null });
  const [savingReminder, setSavingReminder] = useState(false);

  // Recurring reminder modal
  const [recurringModal, setRecurringModal] = useState({ open: false, initial: null });
  const [savingRecurring, setSavingRecurring] = useState(false);

  // Delete confirms
  const [deleteConfirm, setDeleteConfirm] = useState({ open: false, event: null });
  const [deleteRecurringConfirm, setDeleteRecurringConfirm] = useState({ open: false, event: null });

  // Fetch events
  const fetchEvents = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/calendar/events?month=${monthKey(currentMonth)}`);
      if (!res.ok) throw new Error("Failed to load events");
      const data = await res.json();
      setEvents(data.events || []);
    } catch (err) {
      console.error(err);
      setError("Could not load calendar events. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [currentMonth]);

  useEffect(() => { fetchEvents(); }, [fetchEvents]);

  // Calendar grid data
  const calendarDays = useMemo(() => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startOffset = firstDay.getDay();

    const days = [];
    // Previous month padding
    for (let i = startOffset - 1; i >= 0; i--) {
      const d = new Date(year, month, -i);
      days.push({ date: fmt(d), day: d.getDate(), outside: true });
    }
    // Current month
    for (let d = 1; d <= lastDay.getDate(); d++) {
      const date = new Date(year, month, d);
      days.push({ date: fmt(date), day: d, outside: false, isToday: isSameDay(date, today) });
    }
    // Next month padding
    const remaining = 7 - (days.length % 7);
    if (remaining < 7) {
      for (let d = 1; d <= remaining; d++) {
        const date = new Date(year, month + 1, d);
        days.push({ date: fmt(date), day: d, outside: true });
      }
    }
    return days;
  }, [currentMonth]);

  // Events by date lookup
  const eventsByDate = useMemo(() => {
    const map = {};
    events.forEach(e => {
      if (!map[e.date]) map[e.date] = [];
      map[e.date].push(e);
    });
    return map;
  }, [events]);

  // Week view days
  const weekDays = useMemo(() => {
    const days = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(selectedWeekStart);
      d.setDate(d.getDate() + i);
      days.push({ date: fmt(d), day: d.getDate(), dayName: DAYS[i], isToday: isSameDay(d, today), dateObj: d });
    }
    return days;
  }, [selectedWeekStart]);

  // Navigation
  const prevMonth = () => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
  const nextMonth = () => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));
  const prevWeek = () => { const d = new Date(selectedWeekStart); d.setDate(d.getDate() - 7); setSelectedWeekStart(d); };
  const nextWeek = () => { const d = new Date(selectedWeekStart); d.setDate(d.getDate() + 7); setSelectedWeekStart(d); };

  // Handle day click
  const handleDayClick = (dateStr) => {
    setSelectedDay(dateStr);
    if (view === "month") {
      // If switching to a different month's day, don't navigate
    }
  };

  // Handle switching to week view from month
  const switchToWeek = (dateStr) => {
    const d = parseDate(dateStr);
    setSelectedWeekStart(getWeekStart(d));
    setView("week");
  };

  // Action handlers
  const handleAction = async (action, event) => {
    if (action === "addReminder") {
      setReminderModal({ open: true, initial: { date: event.date } });
      return;
    }
    if (action === "edit") {
      if (event.type === "recurring_reminder") {
        setRecurringModal({ open: true, initial: event });
      } else {
        setReminderModal({ open: true, initial: event });
      }
      return;
    }
    if (action === "delete") {
      if (event.type === "recurring_reminder") {
        setDeleteRecurringConfirm({ open: true, event });
      } else {
        setDeleteConfirm({ open: true, event });
      }
      return;
    }
    if (action === "complete") {
      setActionLoading(event.id);
      try {
        if (event.type === "lead_followup") {
          const res = await fetch(`/api/leads/${event.leadId}/activities`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "call", details: "Follow-up completed from calendar" }),
          });
          if (!res.ok) throw new Error();
        } else if (event.type === "client_checkin") {
          const res = await fetch(`/api/clients/${event.clientId}/checkin`, { method: "PATCH" });
          if (!res.ok) throw new Error();
        } else if (event.type === "reminder") {
          const res = await fetch("/api/calendar/reminders", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: event.id, is_completed: true }),
          });
          if (!res.ok) throw new Error();
        }

        // Optimistic update
        setEvents(prev => prev.map(e => e.id === event.id ? { ...e, isCompleted: true } : e));
        showToast({ message: "Marked as done!", variant: "success" });
      } catch {
        showToast({ message: "Something went wrong", variant: "error" });
      } finally {
        setActionLoading(null);
      }
    }
  };

  // Delete reminder
  const handleDelete = async () => {
    const event = deleteConfirm.event;
    setDeleteConfirm({ open: false, event: null });
    try {
      const res = await fetch("/api/calendar/reminders", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: event.id }),
      });
      if (!res.ok) throw new Error();
      setEvents(prev => prev.filter(e => e.id !== event.id));
      showToast({ message: "Reminder deleted", variant: "success" });
    } catch {
      showToast({ message: "Failed to delete reminder", variant: "error" });
    }
  };

  // Save reminder
  const handleSaveReminder = async (data) => {
    setSavingReminder(true);
    try {
      const method = data.id ? "PATCH" : "POST";
      const res = await fetch("/api/calendar/reminders", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error();
      setReminderModal({ open: false, initial: null });
      showToast({ message: data.id ? "Reminder updated" : "Reminder added", variant: "success" });
      fetchEvents();
    } catch {
      showToast({ message: "Failed to save reminder", variant: "error" });
    } finally {
      setSavingReminder(false);
    }
  };

  // Save recurring reminder
  const handleSaveRecurring = async (data) => {
    setSavingRecurring(true);
    try {
      const method = data.id ? "PATCH" : "POST";
      const res = await fetch("/api/calendar/recurring", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error();
      setRecurringModal({ open: false, initial: null });
      showToast({ message: data.id ? "Recurring reminder updated" : "Recurring reminder added", variant: "success" });
      fetchEvents();
    } catch {
      showToast({ message: "Failed to save recurring reminder", variant: "error" });
    } finally {
      setSavingRecurring(false);
    }
  };

  // Delete recurring reminder
  const handleDeleteRecurring = async () => {
    const event = deleteRecurringConfirm.event;
    setDeleteRecurringConfirm({ open: false, event: null });
    try {
      const res = await fetch("/api/calendar/recurring", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: event.recurringReminderId }),
      });
      if (!res.ok) throw new Error();
      setEvents(prev => prev.filter(e => e.recurringReminderId !== event.recurringReminderId));
      showToast({ message: "Recurring reminder deleted", variant: "success" });
    } catch {
      showToast({ message: "Failed to delete recurring reminder", variant: "error" });
    }
  };

  // Week label
  const weekLabel = useMemo(() => {
    const d = new Date(selectedWeekStart);
    return `Week of ${MONTHS[d.getMonth()].slice(0, 3)} ${d.getDate()}`;
  }, [selectedWeekStart]);

  // Ensure week events are loaded (might be in a different month)
  useEffect(() => {
    if (view === "week") {
      const weekMonth = monthKey(selectedWeekStart);
      const currentMK = monthKey(currentMonth);
      if (weekMonth !== currentMK) {
        setCurrentMonth(new Date(selectedWeekStart.getFullYear(), selectedWeekStart.getMonth(), 1));
      }
    }
  }, [selectedWeekStart, view]);

  return (
    <>
      <PageHeader
        title="Calendar"
        subtitle="Your upcoming follow-ups and check-ins"
        actions={
          <div className="flex gap-2">
            <button
              onClick={() => setReminderModal({ open: true, initial: null })}
              className="bg-[#E8735A] hover:bg-[#d4634d] text-white px-5 py-2.5 rounded-xl text-sm font-bold transition-all active:scale-95 shadow-sm min-h-[44px] touch-manipulation"
            >
              + Reminder
            </button>
            <button
              onClick={() => setRecurringModal({ open: true, initial: null })}
              className="bg-emerald-500 hover:bg-emerald-600 text-white px-5 py-2.5 rounded-xl text-sm font-bold transition-all active:scale-95 shadow-sm min-h-[44px] touch-manipulation"
            >
              ↻ Recurring
            </button>
          </div>
        }
      />

      {/* Google Calendar Connection Banner */}
      {gcalConnected !== null && (
        gcalConnected ? (
          <div className="flex items-center justify-between bg-green-50 border border-green-200 rounded-xl px-4 py-3 mb-4">
            <span className="text-sm font-semibold text-green-700">&#10003; Google Calendar connected</span>
            <button
              onClick={handleDisconnect}
              disabled={disconnecting}
              className="text-xs font-bold text-gray-400 hover:text-red-500 transition-colors disabled:opacity-50"
            >
              {disconnecting ? "Disconnecting..." : "Disconnect"}
            </button>
          </div>
        ) : (
          <div className="bg-white border-2 border-gray-100 rounded-2xl p-5 mb-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="text-3xl">&#128197;</span>
              <div>
                <h3 className="font-display text-base font-bold text-gray-900">Connect Google Calendar</h3>
                <p className="text-sm text-gray-400">Sync your meetings and reminders to your phone&#39;s calendar</p>
              </div>
            </div>
            <a
              href="/api/auth/google/connect"
              className="bg-[#E8735A] hover:bg-[#d4634d] text-white px-5 py-2.5 rounded-xl text-sm font-bold transition-all active:scale-95 shadow-sm min-h-[44px] touch-manipulation whitespace-nowrap"
            >
              Connect
            </a>
          </div>
        )
      )}

      {/* Controls */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4">
        {/* Month/Week navigation */}
        <div className="flex items-center gap-2">
          <button
            onClick={view === "month" ? prevMonth : prevWeek}
            className="w-11 h-11 rounded-xl border-2 border-gray-200 hover:bg-gray-50 flex items-center justify-center text-gray-500 text-lg transition touch-manipulation"
          >
            &#8249;
          </button>
          <h2 className="font-display text-lg font-bold text-gray-900 min-w-[180px] text-center">
            {view === "month"
              ? `${MONTHS[currentMonth.getMonth()]} ${currentMonth.getFullYear()}`
              : weekLabel
            }
          </h2>
          <button
            onClick={view === "month" ? nextMonth : nextWeek}
            className="w-11 h-11 rounded-xl border-2 border-gray-200 hover:bg-gray-50 flex items-center justify-center text-gray-500 text-lg transition touch-manipulation"
          >
            &#8250;
          </button>
        </div>

        {/* View toggle */}
        <div className="flex bg-gray-100 rounded-xl p-0.5">
          {["month", "week"].map(v => (
            <button
              key={v}
              onClick={() => {
                setView(v);
                if (v === "week") setSelectedWeekStart(getWeekStart(today));
              }}
              className={`px-5 py-2 rounded-lg text-sm font-bold capitalize transition min-h-[44px] touch-manipulation ${view === v ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      <ErrorBanner message={error} onRetry={fetchEvents} />

      {loading ? (
        <CalendarSkeleton />
      ) : view === "month" ? (
        /* ====== MONTH VIEW ====== */
        <div className="bg-white rounded-2xl border-2 border-gray-100 overflow-hidden">
          {/* Day headers */}
          <div className="grid grid-cols-7 border-b border-gray-100">
            {DAYS.map(d => (
              <div key={d} className="text-center text-[11px] font-bold text-gray-400 uppercase tracking-wider py-2">{d}</div>
            ))}
          </div>
          {/* Day cells */}
          <div className="grid grid-cols-7">
            {calendarDays.map((day, i) => {
              const dayEvents = eventsByDate[day.date] || [];
              const shown = dayEvents.slice(0, 3);
              const more = dayEvents.length - 3;

              return (
                <button
                  key={i}
                  onClick={() => handleDayClick(day.date)}
                  className={`relative text-left border-b border-r border-gray-50 min-h-[52px] md:min-h-[100px] p-1.5 md:p-2 transition-colors hover:bg-gray-50/50 group touch-manipulation ${
                    day.isToday ? "bg-[#fef0ed] border-[#E8735A]/20" : ""
                  }`}
                >
                  <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold ${
                    day.isToday ? "bg-[#E8735A] text-white" : day.outside ? "text-gray-300" : "text-gray-700"
                  }`}>
                    {day.day}
                  </span>

                  {/* Event pills - hidden on mobile, shown on md+ */}
                  <div className="hidden md:flex flex-col gap-0.5 mt-1">
                    {shown.map(e => <EventPill key={e.id} event={e} />)}
                    {more > 0 && <span className="text-[10px] text-gray-400 pl-1.5">+{more} more</span>}
                  </div>

                  {/* Mobile: dots only */}
                  <div className="flex md:hidden gap-0.5 mt-1 flex-wrap">
                    {dayEvents.slice(0, 5).map(e => (
                      <span key={e.id} className={`w-1.5 h-1.5 rounded-full ${EVENT_COLORS[e.type].bg} ${e.isCompleted ? "opacity-30" : ""}`} />
                    ))}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Legend */}
          <div className="flex items-center gap-4 px-4 py-2.5 border-t border-gray-100 bg-gray-50/50">
            {Object.entries(TYPE_LABELS).map(([type, label]) => (
              <div key={type} className="flex items-center gap-1.5">
                <span className={`w-2 h-2 rounded-full ${EVENT_COLORS[type].bg}`} />
                <span className="text-[11px] text-gray-500 font-medium">{label}</span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        /* ====== WEEK VIEW ====== */
        <div className="bg-white rounded-2xl border-2 border-gray-100 overflow-hidden">
          <div className="grid grid-cols-7 divide-x divide-gray-100">
            {weekDays.map((day) => {
              const dayEvents = eventsByDate[day.date] || [];
              return (
                <div
                  key={day.date}
                  className={`min-h-[300px] md:min-h-[400px] ${day.isToday ? "bg-[#fef0ed]/40" : ""}`}
                >
                  {/* Day header */}
                  <div className={`text-center py-2.5 border-b border-gray-100 ${day.isToday ? "bg-[#fef0ed]" : "bg-gray-50/50"}`}>
                    <p className="text-[10px] font-bold text-gray-400 uppercase">{day.dayName}</p>
                    <p className={`text-lg font-bold ${day.isToday ? "text-[#E8735A]" : "text-gray-700"}`}>{day.day}</p>
                  </div>
                  {/* Events */}
                  <div className="p-1.5 space-y-1.5">
                    {dayEvents.map(e => (
                      <EventCard key={e.id} event={e} onClick={() => handleDayClick(day.date)} />
                    ))}
                    {dayEvents.length === 0 && (
                      <button
                        onClick={() => { setReminderModal({ open: true, initial: { date: day.date } }); }}
                        className="w-full text-center text-[10px] text-gray-300 hover:text-gray-500 py-4 transition"
                      >
                        + Add
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Day Detail Panel */}
      {selectedDay && (
        <DayDetailPanel
          date={selectedDay}
          events={eventsByDate[selectedDay] || []}
          onClose={() => setSelectedDay(null)}
          onAction={handleAction}
          actionLoading={actionLoading}
        />
      )}

      {/* Reminder Modal */}
      <ReminderModal
        isOpen={reminderModal.open}
        onClose={() => setReminderModal({ open: false, initial: null })}
        onSave={handleSaveReminder}
        initial={reminderModal.initial}
        saving={savingReminder}
      />

      {/* Delete one-time reminder confirm */}
      <ConfirmDialog
        isOpen={deleteConfirm.open}
        title="Delete Reminder"
        message={`Are you sure you want to delete "${deleteConfirm.event?.title}"? This cannot be undone.`}
        confirmLabel="Delete"
        confirmVariant="danger"
        onConfirm={handleDelete}
        onCancel={() => setDeleteConfirm({ open: false, event: null })}
      />

      {/* Recurring reminder modal */}
      <RecurringReminderModal
        isOpen={recurringModal.open}
        onClose={() => setRecurringModal({ open: false, initial: null })}
        onSave={handleSaveRecurring}
        initial={recurringModal.initial}
        saving={savingRecurring}
      />

      {/* Delete recurring confirm */}
      <ConfirmDialog
        isOpen={deleteRecurringConfirm.open}
        title="Delete Recurring Reminder"
        message={`Delete "${deleteRecurringConfirm.event?.recurringRawTitle || deleteRecurringConfirm.event?.title}"? This will remove all future occurrences and delete it from Google Calendar.`}
        confirmLabel="Delete All"
        confirmVariant="danger"
        onConfirm={handleDeleteRecurring}
        onCancel={() => setDeleteRecurringConfirm({ open: false, event: null })}
      />

      {/* Slide-in animation */}
      <style jsx global>{`
        @keyframes slideIn {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
        .animate-slide-in {
          animation: slideIn 0.25s ease-out;
        }
      `}</style>
    </>
  );
}
