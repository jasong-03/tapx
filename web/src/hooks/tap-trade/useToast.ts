/**
 * Hook for managing toast notifications
 */
import { useState, useCallback } from 'react'

export type ToastType = 'error' | 'success' | 'info'

export interface ToastMessage {
  message: string
  type: ToastType
}

export function useToast() {
  const [toast, setToast] = useState<ToastMessage | null>(null)

  const showToast = useCallback((message: string, type: ToastType = 'info') => {
    setToast({ message, type })
  }, [])

  const showError = useCallback((message: string) => {
    setToast({ message, type: 'error' })
  }, [])

  const showSuccess = useCallback((message: string) => {
    setToast({ message, type: 'success' })
  }, [])

  const showInfo = useCallback((message: string) => {
    setToast({ message, type: 'info' })
  }, [])

  const hideToast = useCallback(() => {
    setToast(null)
  }, [])

  return {
    toast,
    showToast,
    showError,
    showSuccess,
    showInfo,
    hideToast,
  }
}
