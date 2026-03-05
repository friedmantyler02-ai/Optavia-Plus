"use client"

import { useState, useEffect } from "react"

function Skeleton({ className = "" }) {
  return <div className={`animate-pulse rounded-lg bg-gray-200 ${className}`} />
}

export default function RankProgressCard({ coachId, compact = false }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    const url = coachId
      ? `/api/org/rank-stats?coach_id=${coachId}`
      : `/api/org/rank-stats`
    fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error("Failed to load rank stats")
        return r.json()
      })
      .then((d) => { setData(d); setError(null) })
      .catch((err) => { console.error(err); setError("Could not load rank data") })
      .finally(() => setLoading(false))
  }, [coachId])

  // ── Compact view ──────────────────────────────────────────────────────
  if (compact) {
    if (loading) {
      return (
        <div className="flex items-center gap-3">
          <Skeleton className="h-5 w-5 rounded-full" />
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-2 w-32 rounded-full" />
        </div>
      )
    }
    if (error || !data) return null

    return (
      <div className="flex items-center gap-3">
        <span className="text-lg">{data.current_rank.emoji}</span>
        <span className="text-sm font-bold" style={{ color: data.current_rank.color }}>
          {data.current_rank.name}
        </span>
        {data.next_rank && (
          <div className="flex items-center gap-2">
            <div className="h-2 w-24 rounded-full bg-gray-200 overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{ width: data.progress_percent + "%", backgroundColor: data.current_rank.color }}
              />
            </div>
            <span className="text-xs text-gray-400">{data.progress_percent}%</span>
          </div>
        )}
      </div>
    )
  }

  // ── Full view ─────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="rounded-2xl border-2 border-gray-100 bg-white p-6">
        <div className="flex items-center justify-between mb-4">
          <Skeleton className="h-7 w-40" />
          <Skeleton className="h-5 w-20" />
        </div>
        <Skeleton className="h-3 w-full rounded-full mb-3" />
        <Skeleton className="h-4 w-48" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-2xl border-2 border-gray-100 bg-white p-6">
        <p className="text-sm text-gray-400">{error}</p>
      </div>
    )
  }

  if (!data) return null

  const { current_rank, next_rank, progress_percent, gqv, gqv_needed, qp_needed, is_close } = data
  const atMax = !next_rank

  return (
    <div className="rounded-2xl border-2 border-gray-100 bg-white p-6">
      {/* Top row */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <span className="text-3xl">{current_rank.emoji}</span>
          <span className="font-display text-xl font-bold" style={{ color: current_rank.color }}>
            {current_rank.name}
          </span>
        </div>
        <span className="text-xs font-bold text-gray-400 uppercase tracking-wide">Your Rank</span>
      </div>

      {/* Progress section */}
      {atMax ? (
        <div className="rounded-xl bg-green-50 px-4 py-3 text-center">
          <p className="text-sm font-bold text-green-700">🏆 Maximum rank achieved</p>
        </div>
      ) : (
        <>
          <p className="text-xs font-bold text-gray-500 mb-2">
            Progress to {next_rank.emoji} {next_rank.name}
          </p>
          <div className="w-full h-3 bg-gray-200 rounded-full overflow-hidden mb-2">
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{ width: progress_percent + "%", backgroundColor: current_rank.color }}
            />
          </div>
          <p className="text-xs text-gray-500">
            {gqv_needed > 0
              ? `${gqv.toLocaleString()} GQV of ${(next_rank.minGQV || 0).toLocaleString()} needed`
              : qp_needed > 0
                ? `${qp_needed} more qualifying point${qp_needed !== 1 ? "s" : ""} needed`
                : `${data.entities_needed} more ordering entit${data.entities_needed !== 1 ? "ies" : "y"} needed`
            }
          </p>

          {/* Close-to-rank banner */}
          {is_close && (
            <div className="mt-3 rounded-xl bg-coral-50 border border-coral-200 px-4 py-3">
              <p className="text-sm font-bold text-[#E8735A]">
                🔥 {gqv_needed > 0 ? `${gqv_needed.toLocaleString()} GQV` : `${qp_needed} QP`} away from {next_rank.name} — keep pushing!
              </p>
            </div>
          )}
        </>
      )}
    </div>
  )
}
