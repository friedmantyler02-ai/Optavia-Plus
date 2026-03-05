'use client';

import { useState, useEffect, useCallback } from 'react';
import useShowToast from "@/hooks/useShowToast";
import { useCoach } from '../../layout';

// ─── Icon helpers ───────────────────────────────────────────────
function PhoneIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
    </svg>
  );
}
function ChatIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
    </svg>
  );
}
function MailIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
    </svg>
  );
}
function ClipboardIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
    </svg>
  );
}
function CheckCircleIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

const ACTION_TYPE_CONFIG = {
  call:  { icon: PhoneIcon,     label: 'Call',  color: 'text-blue-600' },
  text:  { icon: ChatIcon,      label: 'Text',  color: 'text-green-600' },
  email: { icon: MailIcon,      label: 'Email', color: 'text-purple-600' },
  other: { icon: ClipboardIcon, label: 'Task',  color: 'text-gray-600' },
};

// ─── Date helpers ───────────────────────────────────────────────
function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function formatDate(date) {
  return new Date(date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

function daysBetween(a, b) {
  const msPerDay = 1000 * 60 * 60 * 24;
  return Math.round((new Date(b) - new Date(a)) / msPerDay);
}

function getStepStatus(dueDate, isCompleted) {
  if (isCompleted) return 'completed';
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dueDate);
  due.setHours(0, 0, 0, 0);
  if (due < today) return 'overdue';
  if (due.getTime() === today.getTime()) return 'due-today';
  return 'upcoming';
}

// ─── Main Component ─────────────────────────────────────────────
export default function TouchpointTimeline({ clientId, clientName, onUpdate }) {
  const { coach, supabase } = useCoach();
  const [sequences, setSequences] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [completing, setCompleting] = useState(null); // step id being completed
  const [noteInput, setNoteInput] = useState({});     // { stepId: 'note text' }
  const [showNoteFor, setShowNoteFor] = useState(null);
  const showToast = useShowToast();

  // ── Fetch assigned sequences + steps + completions ──────────
  const fetchTimeline = useCallback(async () => {
    if (!coach?.id || !clientId) return;

    try {
      // 1. Get client_touchpoints for this client
      const { data: assignments, error: aErr } = await supabase
        .from('client_touchpoints')
        .select('id, sequence_id, started_at, status, touchpoint_sequences(name, icon, color)')
        .eq('client_id', clientId)
        .eq('coach_id', coach.id)
        .order('started_at', { ascending: false });

      if (aErr) throw aErr;

      if (!assignments || assignments.length === 0) {
        setSequences([]);
        setLoading(false);
        return;
      }

      // 2. For each assignment, get steps and completions
      const enriched = (await Promise.all(
        assignments.map(async (a) => {
          // Skip if started_at is missing or sequence was deleted
          if (!a.started_at || !a.touchpoint_sequences) return null;

          // Get steps for this sequence
          const { data: steps } = await supabase
            .from('touchpoint_steps')
            .select('id, day_offset, action_text, action_type, sort_order')
            .eq('sequence_id', a.sequence_id)
            .order('sort_order', { ascending: true });

          // Get completions for this assignment
          const { data: completions } = await supabase
            .from('touchpoint_completions')
            .select('id, step_id, completed_at, notes')
            .eq('client_touchpoint_id', a.id);

          const completionMap = {};
          (completions || []).forEach((c) => {
            completionMap[c.step_id] = c;
          });

          const enrichedSteps = (steps || []).map((s) => {
            const dueDate = addDays(a.started_at, s.day_offset);
            const completion = completionMap[s.id] || null;
            const status = getStepStatus(dueDate, !!completion);
            return { ...s, dueDate, completion, status };
          });

          // Check if all steps completed → update assignment status
          const allDone = enrichedSteps.length > 0 && enrichedSteps.every((s) => s.completion);

          return {
            assignmentId: a.id,
            sequenceName: a.touchpoint_sequences?.name || 'Unknown Sequence',
            sequenceIcon: a.touchpoint_sequences?.icon || '📋',
            sequenceColor: a.touchpoint_sequences?.color || '#6366f1',
            startedAt: a.started_at,
            assignmentStatus: allDone ? 'completed' : a.status,
            steps: enrichedSteps,
          };
        })
      )).filter(Boolean);

      setSequences(enriched);
      setError(null);
    } catch (err) {
      console.error('Error fetching timeline:', err);
      setError('Could not load sequences. Please try refreshing.');
    } finally {
      setLoading(false);
    }
  }, [coach?.id, clientId, supabase]);

  useEffect(() => {
    fetchTimeline();
  }, [fetchTimeline]);

  // ── Mark step complete ──────────────────────────────────────
  async function handleComplete(assignmentId, step) {
    if (completing) return;
    setCompleting(step.id);

    try {
      const notes = noteInput[step.id] || '';

      // 1. Insert touchpoint_completions row
      const { error: compErr } = await supabase
        .from('touchpoint_completions')
        .insert({
          client_touchpoint_id: assignmentId,
          step_id: step.id,
          completed_at: new Date().toISOString(),
          notes: notes || null,
        });

      if (compErr) throw compErr;

      // 2. Update client's last_contact_date (Piece 5 side effect)
      const { error: clientErr } = await supabase
        .from('clients')
        .update({ last_contact_date: new Date().toISOString().split('T')[0] })
        .eq('id', clientId);

      if (clientErr) console.error('Error updating last_contact_date:', clientErr);

      // 3. Log to activities table (Piece 5 side effect)
      await supabase.from('activities').insert({
        coach_id: coach.id,
        client_id: clientId,
        action: 'touchpoint_completed',
        details: `Completed: ${step.action_text}${notes ? ` — "${notes}"` : ''}`,
      });

      // 4. Check if all steps now complete → mark assignment completed
      const seq = sequences.find((s) => s.assignmentId === assignmentId);
      if (seq) {
        const remainingIncomplete = seq.steps.filter(
          (s) => s.id !== step.id && !s.completion
        );
        if (remainingIncomplete.length === 0) {
          await supabase
            .from('client_touchpoints')
            .update({ status: 'completed' })
            .eq('id', assignmentId);

          await supabase.from('activities').insert({
            coach_id: coach.id,
            client_id: clientId,
            action: 'sequence_completed',
            details: `Completed sequence: ${seq.sequenceName}`,
          });
        }
      }

      // 5. Clear note, refresh
      setNoteInput((prev) => ({ ...prev, [step.id]: '' }));
      setShowNoteFor(null);
      showToast({ message: "Step marked complete", variant: "success" });
      await fetchTimeline();
      if (onUpdate) onUpdate(); // let parent refresh activity feed etc.
    } catch (err) {
      console.error('Error completing step:', err);
      showToast({ message: "Something went wrong", variant: "error" });
    } finally {
      setCompleting(null);
    }
  }

  // ── Render ──────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-gray-200 rounded w-48" />
          <div className="h-4 bg-gray-100 rounded w-full" />
          <div className="h-4 bg-gray-100 rounded w-3/4" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-red-100 p-8 text-center">
        <p className="text-3xl mb-3">⚠️</p>
        <p className="text-gray-600 font-semibold" style={{ fontFamily: 'Nunito, sans-serif' }}>
          {error}
        </p>
        <button
          onClick={() => { setError(null); setLoading(true); fetchTimeline(); }}
          className="mt-3 px-4 py-2 bg-brand-500 text-white rounded-xl font-bold text-sm hover:bg-brand-600 transition"
          style={{ fontFamily: 'Nunito, sans-serif' }}
        >
          Retry
        </button>
      </div>
    );
  }

  if (sequences.length === 0) {
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 text-center">
        <p className="text-3xl mb-3">📋</p>
        <p className="text-lg text-gray-500" style={{ fontFamily: 'Nunito, sans-serif' }}>
          No touchpoint sequences assigned yet.
        </p>
        <p className="text-base text-gray-400 mt-1" style={{ fontFamily: 'Nunito, sans-serif' }}>
          Use the &ldquo;Start Sequence&rdquo; button above to get started.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {sequences.map((seq) => (
        <div
          key={seq.assignmentId}
          className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden"
        >
          {/* ── Sequence Header ── */}
          <div
            className="px-6 py-4 flex items-center justify-between"
            style={{ borderBottom: `3px solid ${seq.sequenceColor}` }}
          >
            <div className="flex items-center gap-3">
              <span className="text-2xl">{seq.sequenceIcon}</span>
              <div>
                <h3
                  className="text-xl font-bold text-gray-800"
                  style={{ fontFamily: 'Playfair Display, serif' }}
                >
                  {seq.sequenceName}
                </h3>
                <p
                  className="text-sm text-gray-500"
                  style={{ fontFamily: 'Nunito, sans-serif' }}
                >
                  Started {formatDate(seq.startedAt)}
                </p>
              </div>
            </div>
            {/* Status badge */}
            <span
              className={`px-3 py-1 rounded-full text-sm font-semibold ${
                seq.assignmentStatus === 'completed'
                  ? 'bg-green-100 text-green-700'
                  : 'bg-blue-100 text-blue-700'
              }`}
              style={{ fontFamily: 'Nunito, sans-serif' }}
            >
              {seq.assignmentStatus === 'completed' ? '✅ Complete' : '🔄 In Progress'}
            </span>
          </div>

          {/* ── Progress Bar ── */}
          <div className="px-6 pt-4">
            {(() => {
              const done = seq.steps.filter((s) => s.completion).length;
              const total = seq.steps.length;
              const pct = total > 0 ? Math.round((done / total) * 100) : 0;
              return (
                <div>
                  <div className="flex justify-between text-sm text-gray-500 mb-1" style={{ fontFamily: 'Nunito, sans-serif' }}>
                    <span>{done} of {total} steps done</span>
                    <span>{pct}%</span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-2.5">
                    <div
                      className="h-2.5 rounded-full transition-all duration-500"
                      style={{ width: `${pct}%`, backgroundColor: seq.sequenceColor }}
                    />
                  </div>
                </div>
              );
            })()}
          </div>

          {/* ── Steps Timeline ── */}
          <div className="px-6 py-4">
            <div className="relative">
              {seq.steps.map((step, idx) => {
                const isLast = idx === seq.steps.length - 1;
                const config = ACTION_TYPE_CONFIG[step.action_type] || ACTION_TYPE_CONFIG.other;
                const IconComponent = config.icon;
                const isOverdue = step.status === 'overdue';
                const isDueToday = step.status === 'due-today';
                const isCompleted = step.status === 'completed';
                const daysOverdue = isOverdue ? daysBetween(step.dueDate, new Date()) : 0;

                return (
                  <div key={step.id} className="flex gap-4 animate-fade-up" style={{ animationDelay: `${idx * 60}ms`, animationFillMode: 'both' }}>
                    {/* Timeline connector */}
                    <div className="flex flex-col items-center">
                      {/* Dot */}
                      <div
                        className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 border-2 transition-all ${
                          isCompleted
                            ? 'bg-green-100 border-green-400 text-green-600'
                            : isOverdue
                            ? 'bg-red-50 border-red-400 text-red-500 animate-pulse'
                            : isDueToday
                            ? 'bg-amber-50 border-amber-400 text-amber-600'
                            : 'bg-gray-50 border-gray-200 text-gray-400'
                        }`}
                      >
                        {isCompleted ? <CheckCircleIcon /> : <IconComponent />}
                      </div>
                      {/* Line */}
                      {!isLast && (
                        <div
                          className={`w-0.5 flex-grow min-h-[2rem] ${
                            isCompleted ? 'bg-green-300' : 'bg-gray-200'
                          }`}
                        />
                      )}
                    </div>

                    {/* Step content */}
                    <div className={`pb-6 flex-grow ${isLast ? 'pb-2' : ''}`}>
                      <div
                        className={`rounded-xl p-4 transition-all ${
                          isCompleted
                            ? 'bg-green-50 border border-green-200'
                            : isOverdue
                            ? 'bg-red-50 border border-red-200'
                            : isDueToday
                            ? 'bg-amber-50 border border-amber-200'
                            : 'bg-gray-50 border border-gray-100'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3 flex-wrap">
                          <div className="flex-grow">
                            <p
                              className={`text-base font-semibold ${
                                isCompleted ? 'text-green-800 line-through' : 'text-gray-800'
                              }`}
                              style={{ fontFamily: 'Nunito, sans-serif' }}
                            >
                              {step.action_text}
                            </p>
                            <div className="flex items-center gap-3 mt-1 flex-wrap">
                              <span
                                className={`text-sm ${config.color} font-medium`}
                                style={{ fontFamily: 'Nunito, sans-serif' }}
                              >
                                {config.label}
                              </span>
                              <span className="text-sm text-gray-400">•</span>
                              <span
                                className={`text-sm ${
                                  isOverdue
                                    ? 'text-red-600 font-bold'
                                    : isDueToday
                                    ? 'text-amber-600 font-bold'
                                    : 'text-gray-500'
                                }`}
                                style={{ fontFamily: 'Nunito, sans-serif' }}
                              >
                                {isCompleted
                                  ? `Done ${formatDate(step.completion.completed_at)}`
                                  : isOverdue
                                  ? `⚠️ ${daysOverdue} day${daysOverdue !== 1 ? 's' : ''} overdue`
                                  : isDueToday
                                  ? '📌 Due today!'
                                  : `Due ${formatDate(step.dueDate)}`}
                              </span>
                            </div>

                            {/* Show completion note if exists */}
                            {step.completion?.notes && (
                              <p
                                className="text-sm text-green-700 mt-2 italic"
                                style={{ fontFamily: 'Nunito, sans-serif' }}
                              >
                                &ldquo;{step.completion.notes}&rdquo;
                              </p>
                            )}
                          </div>

                          {/* Mark Complete button */}
                          {!isCompleted && (
                            <div className="flex flex-col items-end gap-2">
                              <button
                                onClick={() => {
                                  if (showNoteFor === step.id) {
                                    handleComplete(seq.assignmentId, step);
                                  } else {
                                    setShowNoteFor(step.id);
                                  }
                                }}
                                disabled={completing === step.id}
                                className={`px-4 py-2 rounded-xl text-sm font-bold text-white transition-all shadow-sm whitespace-nowrap ${
                                  completing === step.id
                                    ? 'bg-gray-400 cursor-not-allowed'
                                    : isOverdue
                                    ? 'bg-red-500 hover:bg-red-600 active:scale-95'
                                    : isDueToday
                                    ? 'bg-amber-500 hover:bg-amber-600 active:scale-95'
                                    : 'bg-indigo-500 hover:bg-indigo-600 active:scale-95'
                                }`}
                                style={{ fontFamily: 'Nunito, sans-serif' }}
                              >
                                {completing === step.id
                                  ? 'Saving...'
                                  : showNoteFor === step.id
                                  ? '✓ Complete'
                                  : 'Mark Done'}
                              </button>
                              {showNoteFor === step.id && (
                                <button
                                  onClick={() => setShowNoteFor(null)}
                                  className="text-xs text-gray-400 hover:text-gray-600"
                                  style={{ fontFamily: 'Nunito, sans-serif' }}
                                >
                                  cancel
                                </button>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Optional note input */}
                        {showNoteFor === step.id && !isCompleted && (
                          <div className="mt-3">
                            <input
                              type="text"
                              placeholder="Add a note (optional)..."
                              value={noteInput[step.id] || ''}
                              onChange={(e) =>
                                setNoteInput((prev) => ({ ...prev, [step.id]: e.target.value }))
                              }
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleComplete(seq.assignmentId, step);
                              }}
                              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400"
                              style={{ fontFamily: 'Nunito, sans-serif' }}
                              autoFocus
                            />
                            <p className="text-xs text-gray-400 mt-1" style={{ fontFamily: 'Nunito, sans-serif' }}>
                              Press Enter or click &ldquo;✓ Complete&rdquo; to finish
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
