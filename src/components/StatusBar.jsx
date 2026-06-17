import React, { useState, useRef, useEffect } from 'react'
import { ChevronDown, RefreshCw, Smartphone, Usb, ShieldAlert, Battery, Check } from 'lucide-react'
import { useDevice } from '../state/DeviceContext.jsx'
import { modeMeta, classNames } from '../lib/format.js'
import { Spinner, Tooltip } from './ui.jsx'

export default function StatusBar() {
  const { devices, selected, selectedSerial, setSelectedSerial, info, scanning, refreshDevices, refreshInfo } = useDevice()
  const [open, setOpen] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    const onClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  const meta = selected ? modeMeta(selected.mode) : null

  const doRefresh = async () => {
    setRefreshing(true)
    await Promise.all([refreshDevices(), refreshInfo()])
    setTimeout(() => setRefreshing(false), 400)
  }

  return (
    <header className="drag flex h-14 shrink-0 items-center justify-between gap-3 border-b border-border bg-surface-1/80 px-4 backdrop-blur-xl">
      {/* Device selector */}
      <div className="no-drag relative" ref={ref}>
        <button
          onClick={() => setOpen((o) => !o)}
          disabled={devices.length === 0}
          className={classNames(
            'flex items-center gap-3 rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-left transition-colors hover:border-border-strong',
            devices.length === 0 && 'opacity-70'
          )}
        >
          <span className={classNames('relative grid h-7 w-7 place-items-center rounded-md', selected ? 'bg-surface-4' : 'bg-surface-3')}>
            <Smartphone size={15} className={meta ? meta.color : 'text-zinc-500'} />
            {selected && (
              <span className={classNames('absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full ring-2 ring-surface-1', meta.dot)} />
            )}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium text-zinc-100">
              {selected ? selected.model || info?.marketingName || selected.serial : scanning ? 'Scanning…' : 'No device'}
            </span>
            <span className="block truncate font-mono text-[10px] text-zinc-500">
              {selected ? selected.serial : 'Connect a device via USB'}
            </span>
          </span>
          {devices.length > 1 && (
            <span className="ml-1 rounded-full bg-surface-4 px-1.5 py-0.5 text-[10px] font-semibold text-zinc-400">
              {devices.length}
            </span>
          )}
          <ChevronDown size={15} className="text-zinc-500" />
        </button>

        {open && (
          <div className="absolute left-0 top-full z-50 mt-1.5 w-[320px] animate-fade-in rounded-xl border border-border bg-surface-3 p-1.5 shadow-card">
            {devices.length === 0 && (
              <div className="px-3 py-4 text-center text-xs text-zinc-500">No devices detected.</div>
            )}
            {devices.map((d) => {
              const dm = modeMeta(d.mode)
              const isSel = d.serial === selectedSerial
              return (
                <button
                  key={d.serial}
                  onClick={() => {
                    setSelectedSerial(d.serial)
                    setOpen(false)
                  }}
                  className={classNames(
                    'flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition-colors',
                    isSel ? 'bg-surface-4' : 'hover:bg-surface-2'
                  )}
                >
                  <span className={classNames('h-2 w-2 shrink-0 rounded-full', dm.dot)} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-zinc-100">{d.model || d.product || d.serial}</span>
                    <span className="block truncate font-mono text-[10px] text-zinc-500">{d.serial}</span>
                  </span>
                  <span className={classNames('chip bg-surface-2', dm.color)}>{dm.label}</span>
                  {isSel && <Check size={14} className="text-brand" />}
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* Right side status pills */}
      <div className="no-drag flex items-center gap-2">
        {selected && meta && (
          <span className={classNames('chip border bg-surface-2', meta.color, `border-current/20`)}>
            <span className={classNames('h-1.5 w-1.5 rounded-full', meta.dot)} />
            {meta.label}
          </span>
        )}

        {selected?.mode === 'unauthorized' && (
          <span className="chip bg-danger/10 text-danger">
            <ShieldAlert size={13} /> Allow USB debugging on device
          </span>
        )}

        {info?.battery?.level != null && (
          <Tooltip label={`${info.battery.status} • ${info.battery.temperature ?? '?'}°C`}>
            <span className="chip bg-surface-2 text-zinc-300">
              <Battery size={14} className={info.battery.level < 20 ? 'text-danger' : 'text-brand'} />
              {info.battery.level}%
            </span>
          </Tooltip>
        )}

        {info?.androidVersion && (
          <span className="chip bg-surface-2 text-zinc-400">Android {info.androidVersion}</span>
        )}

        <Tooltip label="Rescan devices">
          <button onClick={doRefresh} className="btn-surface !px-2.5 !py-2">
            {refreshing || scanning ? <Spinner size={15} /> : <RefreshCw size={15} />}
          </button>
        </Tooltip>
      </div>
    </header>
  )
}
