'use client';

import { useState, useEffect } from 'react';
import { useCoach } from './layout';
import Link from 'next/link';

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

const ACTION_ICONS = { call: '📞', text: '💬', email: '📧', other: '📋' };

export default function TouchpointsDueToday() {
  const { coach, supabase } = useCoach();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!coach?.id) return;
    fetchDueItems();
  }, [coach?.id]);

  async function fetchDueItems() {
    // 1. Get all active client_touchpoints for this coach
    const { data: assignments, error: aErr } = await supabase
      .from('client_touchpoints')
      .select('id, sequence_id, started_at, client_id, clients(id, full_name)')
      .eq('coach_id', coach.id)
      .eq('status', 'active');

    if (aErr || !assignments || assignments.length === 0) {
      setLoading(false);
      return;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dueItems = [];

    for (const a of assignments) {
      // Get steps for this sequence
      const { data: steps } = await supabase
        .from('touchpoint_steps')
        .select('id, day_offset, action_text, action_type, sort_order')
        .eq('sequence_id', a.sequence_id)
        .order('sort_order', { ascending: true });

      // Get completions for this assignment
      const { data: completions } = await supabase
        .from('touchpoint_completions')
        .select('step_id')
        .eq('client_touchpoint_id', a.id);

      const completedStepIds = new Set((completions || []).map(c => c.step_id));

      for (const step of (steps || [])) {
        if (completedStepIds.has(step.id)) continue;

        const dueDate = addDays(a.started_at, step.day_offset);
        dueDate.setHours(0, 0, 0, 0);

        if (dueDate > today) continue;

        const daysOverdue = Math.round((today - dueDate) / (1000 * 60 * 60 * 24));

        dueItems.push({
          key: `${a.id}-${step.id}`,
          clientId: a.client_id,
          clientName: a.clients?.full_name || 'Unknown',
          actionText: step.action_text,
          actionType: step.action_type,
          daysOverdue,
        });
      }
    }

    // Sort: most overdue first, then due today
    dueItems.sort((a, b) => b.daysOverdue - a.daysOverdue);

    setItems(dueItems);
    setLoading(false);
  }

  if (loading) {
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <div className="animate-pulse space-y-3">
          <div className="h-6 bg-gray-200 rounded w-56" />
          <div className="h-4 bg-gray-100 rounded w-full" />
          <div className="h-4 bg-gray-100 rounded w-3/4" />
          <div className="h-4 bg-gray-100 rounded w-5/6" />
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
      <h2
        className="text-2xl font-bold text-gray-800 mb-4"
        style={{ fontFamily: 'Playfair Display, serif' }}
      >
        🔔 Touchpoints Due Today
      </h2>

      {items.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-3xl mb-2">🎉</p>
          <p className="text-gray-500 font-semibold" style={{ fontFamily: 'Nunito, sans-serif' }}>
            You're all caught up!
          </p>
          <p className="text-sm text-gray-400 mt-1" style={{ fontFamily: 'Nunito, sans-serif' }}>
            No touchpoints due or overdue right now.
          </p>
        </div>
      ) : (
        <div className="space-y-2 max-h-80 overflow-y-auto">
          {items.map(item => {
            const isOverdue = item.daysOverdue > 0;
            return (
              <Link
                key={item.key}
                href={`/dashboard/clients/${item.clientId}`}
                className={`flex items-center justify-between p-3 rounded-xl transition hover:shadow-sm ${
                  isOverdue
                    ? 'bg-red-50 border border-red-200 hover:bg-red-100'
                    : 'bg-amber-50 border border-amber-200 hover:bg-amber-100'
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="text-xl">{ACTION_ICONS[item.actionType] || ACTION_ICONS.other}</span>
                  <div>
                    <p className="font-bold text-sm text-gray-800" style={{ fontFamily: 'Nunito, sans-serif' }}>
                      {item.clientName}
                    </p>
                    <p className="text-sm text-gray-600" style={{ fontFamily: 'Nunito, sans-serif' }}>
                      {item.actionText}
                    </p>
                  </div>
                </div>
                <span
                  className={`text-xs font-bold whitespace-nowrap px-2 py-1 rounded-full ${
                    isOverdue
                      ? 'bg-red-100 text-red-700'
                      : 'bg-amber-100 text-amber-700'
                  }`}
                  style={{ fontFamily: 'Nunito, sans-serif' }}
                >
                  {isOverdue
                    ? `${item.daysOverdue} day${item.daysOverdue !== 1 ? 's' : ''} overdue`
                    : 'Due today'}
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
