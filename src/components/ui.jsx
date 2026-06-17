import React, { useEffect, useState } from 'react'
import { Loader2, AlertTriangle, X } from 'lucide-react'
import { classNames } from '../lib/format.js'

export function Spinner({ size = 16, className = '' }) {
  return <Loader2 size={size} className={classNames('animate-spin', className)} />
}

export function Tooltip({ label, children, side = 'bottom' }) {
  const pos = {
    bottom: 'top-full mt-2 left-1/2 -translate-x-1/2',
    top: 'bottom-full mb-2 left-1/2 -translate-x-1/2',
    right: 'left-full ml-2 top-1/2 -translate-y-1/2',
    left: 'right-full mr-2 top-1/2 -translate-y-1/2',
  }
  return (
    <span className="group/tt relative inline-flex">
      {children}
      {label && (
        <span
          className={classNames(
            'pointer-events-none absolute z-50 whitespace-nowrap rounded-md border border-border bg-surface-4 px-2 py-1 text-[11px] font-medium text-zinc-200 opacity-0 shadow-card transition-opacity duration-150 group-hover/tt:opacity-100',
            pos[side]
          )}
        >
          {label}
        </span>
      )}
    </span>
  )
}

export function Card({ title, subtitle, icon: Icon, actions, children, className = '' }) {
  return (
    <section className={classNames('card p-5', className)}>
      {(title || actions) && (
        <header className="mb-4 flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            {Icon && (
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-surface-4 text-brand">
                <Icon size={16} />
              </span>
            )}
            <div>
              {title && <h3 className="text-sm font-semibold text-zinc-100">{title}</h3>}
              {subtitle && <p className="text-xs text-zinc-500">{subtitle}</p>}
            </div>
          </div>
          {actions}
        </header>
      )}
      {children}
    </section>
  )
}

export function Stat({ label, value, mono = false }) {
  return (
    <div className="rounded-lg bg-surface-1 border border-border px-3 py-2.5">
      <div className="label">{label}</div>
      <div className={classNames('mt-1 truncate text-sm text-zinc-100', mono && 'font-mono')} title={String(value ?? '')}>
        {value ?? '—'}
      </div>
    </div>
  )
}

export function EmptyState({ icon: Icon, title, message, children }) {
  return (
    <div className="grid place-items-center rounded-xl border border-dashed border-border py-16 text-center">
      <div className="max-w-sm px-6">
        {Icon && (
          <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-surface-3 text-zinc-500">
            <Icon size={22} />
          </div>
        )}
        <h3 className="text-sm font-semibold text-zinc-200">{title}</h3>
        {message && <p className="mt-1.5 text-xs leading-relaxed text-zinc-500">{message}</p>}
        {children && <div className="mt-4">{children}</div>}
      </div>
    </div>
  )
}

/**
 * Confirmation modal for dangerous operations.
 * Controlled imperatively via the useConfirm hook below.
 */
export function ConfirmDialog({ open, options, onResolve }) {
  const [text, setText] = useState('')
  useEffect(() => {
    if (open) setText('')
  }, [open])

  if (!open || !options) return null
  const { title, message, confirmLabel = 'Confirm', danger = false, requireText } = options
  const canConfirm = !requireText || text.trim() === requireText

  return (
    <div className="fixed inset-0 z-[90] grid place-items-center bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="card w-[440px] max-w-[92vw] p-6">
        <div className="flex items-start gap-3">
          <span
            className={classNames(
              'grid h-10 w-10 shrink-0 place-items-center rounded-xl',
              danger ? 'bg-danger/15 text-danger' : 'bg-warn/15 text-warn'
            )}
          >
            <AlertTriangle size={20} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold text-zinc-100">{title}</h2>
            <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-zinc-400">{message}</p>
          </div>
        </div>

        {requireText && (
          <div className="mt-4">
            <p className="mb-1.5 text-xs text-zinc-500">
              Type <span className="font-mono text-zinc-300">{requireText}</span> to confirm:
            </p>
            <input
              autoFocus
              value={text}
              onChange={(e) => setText(e.target.value)}
              className="input font-mono"
              placeholder={requireText}
            />
          </div>
        )}

        <div className="mt-6 flex justify-end gap-2.5">
          <button className="btn-ghost" onClick={() => onResolve(false)}>
            Cancel
          </button>
          <button
            className={danger ? 'btn-danger' : 'btn-warn'}
            disabled={!canConfirm}
            onClick={() => onResolve(true)}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

export function Modal({ open, title, onClose, children, width = 560 }) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-[90] grid place-items-center bg-black/60 backdrop-blur-sm animate-fade-in" onClick={onClose}>
      <div
        className="card max-h-[85vh] overflow-hidden p-0"
        style={{ width, maxWidth: '92vw' }}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-border px-5 py-3.5">
          <h2 className="text-sm font-semibold text-zinc-100">{title}</h2>
          <button className="rounded-md p-1 text-zinc-500 hover:bg-surface-4 hover:text-zinc-200" onClick={onClose}>
            <X size={16} />
          </button>
        </header>
        <div className="max-h-[72vh] overflow-auto p-5">{children}</div>
      </div>
    </div>
  )
}
