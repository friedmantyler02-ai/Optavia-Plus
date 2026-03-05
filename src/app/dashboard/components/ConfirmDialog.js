"use client"

export default function ConfirmDialog({
  isOpen,
  title,
  message,
  confirmLabel = "Confirm",
  confirmVariant = "primary",
  onConfirm,
  onCancel,
}) {
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-2">{title}</h2>
        <p className="text-sm text-gray-500 mb-6">{message}</p>
        <div className="flex gap-3 justify-end">
          <button
            onClick={onCancel}
            className="border border-gray-200 text-gray-600 hover:bg-gray-50 px-4 py-2 rounded-xl text-sm font-medium transition-colors duration-150"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className={
              confirmVariant === 'danger'
                ? "bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-xl text-sm font-medium transition-all duration-150 active:scale-95"
                : "bg-[#E8735A] hover:bg-[#d4634d] text-white px-4 py-2 rounded-xl text-sm font-medium transition-all duration-150 active:scale-95"
            }
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
