"use client"

export default function SkeletonCard({ height = "h-32", className = "" }) {
  return (
    <div className={`bg-gray-200 animate-pulse rounded-2xl ${height} ${className}`} />
  )
}
