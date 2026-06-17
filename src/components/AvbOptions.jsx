import React from 'react'
import { ShieldOff, AlertTriangle } from 'lucide-react'
import { classNames } from '../lib/format.js'

// Partitions where Android Verified Boot flags are relevant.
export const VBMETA_PARTITIONS = ['vbmeta', 'vbmeta_system', 'vbmeta_vendor']

export function isVbmeta(partition) {
  if (!partition) return false
  const base = partition.replace(/_[ab]$/i, '')
  return VBMETA_PARTITIONS.includes(base)
}

/**
 * Two checkboxes controlling the AVB flags injected before `fastboot flash`.
 * Only meaningful for vbmeta* partitions, where unverified custom images would
 * otherwise trigger a bootloop.
 */
export default function AvbOptions({ verity, verification, onChange, className }) {
  const Row = ({ checked, onToggle, flag, label }) => (
    <label className="flex cursor-pointer select-none items-start gap-2.5 rounded-lg border border-border bg-surface-2 px-3 py-2.5 transition-colors hover:border-border-strong">
      <input type="checkbox" checked={checked} onChange={(e) => onToggle(e.target.checked)} className="mt-0.5 accent-warn" />
      <span className="min-w-0">
        <span className="block text-xs font-medium text-zinc-100">{label}</span>
        <span className="block font-mono text-[10px] text-zinc-500">{flag}</span>
      </span>
    </label>
  )

  return (
    <div className={classNames('space-y-2', className)}>
      <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-warn">
        <ShieldOff size={12} /> Android Verified Boot
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <Row
          checked={verity}
          onToggle={(v) => onChange({ verity: v, verification })}
          flag="--disable-verity"
          label="Disable Verity"
        />
        <Row
          checked={verification}
          onToggle={(v) => onChange({ verity, verification: v })}
          flag="--disable-verification"
          label="Disable Verification"
        />
      </div>
      {(verity || verification) && (
        <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-warn">
          <AlertTriangle size={12} className="mt-0.5 shrink-0" />
          Flashing with{' '}
          <span className="font-mono">
            {[verity && '--disable-verity', verification && '--disable-verification'].filter(Boolean).join(' ')}
          </span>
          . Required for most custom ROM / GSI vbmeta images.
        </p>
      )}
    </div>
  )
}
