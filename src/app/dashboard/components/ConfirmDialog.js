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
    <>
      <div className="fixed inset-0 z-50" onClick={onCancel} />
      <div className="fixed z-50 bg-white rounded-2xl shadow-xl w-[calc(100%-2rem)] max-w-sm p-6" style={{ top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }}>
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
    </>
  )
}
