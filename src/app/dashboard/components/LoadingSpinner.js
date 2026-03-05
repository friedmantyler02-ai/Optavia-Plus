"use client"

export default function LoadingSpinner({ message }) {
  return (
    <div className="flex flex-col items-center justify-center py-12">
      <div
        className="w-8 h-8 border-4 rounded-full animate-spin"
        style={{ borderColor: '#E8735A', borderTopColor: 'transparent' }}
      />
      {message && (
        <p className="text-sm text-gray-500 mt-3">{message}</p>
      )}
    </div>
  )
}
