import React, { createContext, useCallback, useContext, useRef, useState } from 'react'
import { CheckCircle2, AlertTriangle, XCircle, Info, X } from 'lucide-react'

const ToastContext = createContext(null)

let idSeq = 0

const ICONS = {
  success: CheckCircle2,
  error: XCircle,
  warning: AlertTriangle,
  info: Info,
}

const ACCENT = {
  success: 'text-brand border-brand/30',
  error: 'text-danger border-danger/30',
  warning: 'text-warn border-warn/30',
  info: 'text-info border-info/30',
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const timers = useRef({})

  const dismiss = useCallback((id) => {
    setToasts((t) => t.filter((x) => x.id !== id))
    if (timers.current[id]) {
      clearTimeout(timers.current[id])
      delete timers.current[id]
    }
  }, [])

  const push = useCallback(
    (toast) => {
      const id = ++idSeq
      const t = { id, type: 'info', duration: 4500, ...toast }
      setToasts((list) => [...list, t])
      if (t.duration > 0) {
        timers.current[id] = setTimeout(() => dismiss(id), t.duration)
      }
      return id
    },
    [dismiss]
  )

  const toast = {
    success: (title, opts = {}) => push({ type: 'success', title, ...opts }),
    error: (title, opts = {}) => push({ type: 'error', title, duration: 7000, ...opts }),
    warning: (title, opts = {}) => push({ type: 'warning', title, ...opts }),
    info: (title, opts = {}) => push({ type: 'info', title, ...opts }),
    fromResult: (res, { successTitle = 'Success', errorTitle = 'Failed' } = {}) => {
      const ok = res?.ok ?? res?.code === 0
      const detail = (res?.stderr || res?.stdout || '').trim().split(/\r?\n/).slice(0, 4).join('\n')
      return push({
        type: ok ? 'success' : 'error',
        title: ok ? successTitle : errorTitle,
        message: detail || undefined,
        duration: ok ? 4000 : 8000,
      })
    },
    dismiss,
  }

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div className="pointer-events-none fixed bottom-5 right-5 z-[100] flex w-[380px] max-w-[90vw] flex-col gap-2.5">
        {toasts.map((t) => {
          const Icon = ICONS[t.type] || Info
          return (
            <div
              key={t.id}
              className={`pointer-events-auto animate-slide-in rounded-xl border bg-surface-3/95 backdrop-blur-xl px-4 py-3 shadow-card ${ACCENT[t.type]}`}
            >
              <div className="flex items-start gap-3">
                <Icon size={18} className="mt-0.5 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-zinc-100">{t.title}</div>
                  {t.message && (
                    <pre className="mt-1 whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-zinc-400">
                      {t.message}
                    </pre>
                  )}
                </div>
                <button
                  onClick={() => dismiss(t.id)}
                  className="shrink-0 rounded-md p-0.5 text-zinc-500 hover:bg-surface-4 hover:text-zinc-200"
                >
                  <X size={14} />
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within ToastProvider')
  return ctx
}
