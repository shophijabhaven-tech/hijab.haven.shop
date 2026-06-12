import { createContext, useCallback, useContext, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import Toast from '@/components/Toast'

export type ToastKind = 'success' | 'error' | 'info'

export type ToastEntry = {
  id: number
  message: string
  kind: ToastKind
}

type ToastContextValue = {
  showToast: (message: string, kind?: ToastKind) => void
}

const ToastContext = createContext<ToastContextValue>({ showToast: () => {} })

const TOAST_DURATION_MS = 3500

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastEntry[]>([])
  const nextIdRef = useRef(1)

  const showToast = useCallback((message: string, kind: ToastKind = 'info') => {
    const id = nextIdRef.current++
    setToasts(prev => [...prev, { id, message, kind }])
    setTimeout(() => {
      setToasts(prev => prev.filter(toast => toast.id !== id))
    }, TOAST_DURATION_MS)
  }, [])

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <Toast toasts={toasts} />
    </ToastContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export const useToast = () => useContext(ToastContext)
