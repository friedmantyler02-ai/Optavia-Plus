"use client"

const variantStyles = {
  success: 'bg-green-500',
  error: 'bg-red-500',
  info: 'bg-gray-700',
}

const variantIcons = {
  success: '\u2713',
  error: '\u2715',
  info: '\u2139',
}

export default function Toast({ message, variant, onDismiss }) {
  return (
    <div
      onClick={onDismiss}
      className={`rounded-full px-5 py-2.5 shadow-lg text-sm font-medium text-white flex items-center gap-2 cursor-pointer ${variantStyles[variant] || variantStyles.info}`}
    >
      <span>{variantIcons[variant] || variantIcons.info}</span>
      {message}
    </div>
  )
}
