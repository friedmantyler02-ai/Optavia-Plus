"use client"

export default function ErrorBanner({ message, onRetry }) {
  if (!message) return null

  return (
    <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 flex items-center justify-between">
      <div className="flex items-center gap-2">
        <span>&#9888;&#65039;</span>
        <p className="text-sm text-red-700">{message}</p>
      </div>
      {onRetry && (
        <button
          onClick={onRetry}
          className="text-sm text-red-600 underline hover:text-red-800"
        >
          Try again
        </button>
      )}
    </div>
  )
}
