"use client"

import { useState } from 'react'

export default function useToast() {
  const [toasts, setToasts] = useState([])

  function showToast({ message, variant = 'success' }) {
    const id = Date.now() + Math.random()
    setToasts((prev) => [...prev, { id, message, variant }])
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, 3000)
  }

  function dismissToast(id) {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }

  return { toasts, showToast, dismissToast }
}
