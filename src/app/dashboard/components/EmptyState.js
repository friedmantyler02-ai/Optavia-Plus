"use client"

export default function EmptyState({ icon, title, subtitle, actionLabel, onAction }) {
  return (
    <div className="rounded-2xl border-2 border-gray-100 bg-white p-12 text-center">
      <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center text-3xl mx-auto mb-4">
        {icon}
      </div>
      <h3 className="text-lg font-semibold text-gray-900 mb-1">{title}</h3>
      {subtitle && (
        <p className="text-sm text-gray-500 mb-6">{subtitle}</p>
      )}
      {actionLabel && onAction && (
        <button
          onClick={onAction}
          className="bg-[#E8735A] hover:bg-[#d4634d] text-white px-5 py-2 rounded-xl text-sm font-medium transition-colors"
        >
          {actionLabel}
        </button>
      )}
    </div>
  )
}
