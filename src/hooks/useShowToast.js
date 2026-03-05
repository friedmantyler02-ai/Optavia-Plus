"use client"

import { useContext } from 'react'
import { ToastContext } from '@/app/dashboard/layout'

export default function useShowToast() {
  return useContext(ToastContext)
}
