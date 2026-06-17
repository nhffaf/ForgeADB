import React, { useState } from 'react'
import {
  Smartphone, Cpu, ShieldCheck, ShieldAlert, CalendarClock, Layers, Battery,
  RotateCw, LifeBuoy, Wrench, Zap, Camera, Download, ImageOff, Tag, Hash, Boxes,
} from 'lucide-react'
import { useDevice } from '../state/DeviceContext.jsx'
import { useToast } from '../state/ToastContext.jsx'
import { useConfirm } from '../state/ConfirmContext.jsx'
import { Card, Stat, Spinner, Tooltip } from '../components/ui.jsx'
import { modeMeta, classNames } from '../lib/format.js'
import api from '../lib/api.js'

export default function Dashboard() {
  const { selected, info, infoLoading, refreshInfo } = useDevice()
  const meta = selected ? modeMeta(selected.mode) : null
  const isFastboot = selected?.mode === 'fastboot' || selected?.mode === 'fastbootd'

  return (
    <div className="animate-fade-in space-y-6">
      <PageHeader
        title="Dashboard"
        subtitle={selected ? `${info?.marketingName || selected.model || selected.serial}` : ''}
        meta={meta}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <DeviceStatusCard info={info} loading={infoLoading} device={selected} onRefresh={refreshInfo} />
        </div>
        <div className="space-y-6">
          <QuickActions device={selected} isFastboot={isFastboot} />
          <BatteryCard info={info} />
        </div>
      </div>

      {!isFastboot && <ScreenshotCard device={selected} />}
    </div>
  )
}

function PageHeader({ title, subtitle, meta }) {
  return (
    <div className="flex items-end justify-between">
      <div>
        <h1 className="text-xl font-semibold text-zinc-100">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-zinc-500">{subtitle}</p>}
      </div>
      {meta && (
        <span className={classNames('chip border border-current/20 bg-surface-2', meta.color)}>
          <span className={classNames('h-1.5 w-1.5 rounded-full', meta.dot)} />
          {meta.label} mode
        </span>
      )}
    </div>
  )
}

function DeviceStatusCard({ info, loading, device, onRefresh }) {
  if (!info && loading) {
    return (
      <Card title="Device Status" icon={Smartphone}>
        <div className="flex items-center gap-2 py-10 text-sm text-zinc-500">
          <Spinner /> Reading device properties…
        </div>
      </Card>
    )
  }
  if (!info) {
    return (
      <Card title="Device Status" icon={Smartphone}>
        <p className="py-8 text-sm text-zinc-500">Could not read device details.</p>
      </Card>
    )
  }

  const unlocked = info.bootloaderState === 'Unlocked'

  return (
    <Card
      title="Device Status"
      subtitle={info.manufacturer ? `${info.manufacturer} • ${info.codename}` : info.codename}
      icon={Smartphone}
      actions={
        <Tooltip label="Refresh">
          <button className="btn-surface !px-2.5 !py-2" onClick={onRefresh}>
            {loading ? <Spinner size={14} /> : <RotateCw size={14} />}
          </button>
        </Tooltip>
      }
    >
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="chip bg-surface-1 text-zinc-200">
          <Tag size={12} /> {info.marketingName}
        </span>
        {info.androidVersion && (
          <span className="chip bg-surface-1 text-zinc-300">Android {info.androidVersion}{info.sdk ? ` (API ${info.sdk})` : ''}</span>
        )}
        <span
          className={classNames(
            'chip',
            unlocked ? 'bg-warn/10 text-warn' : 'bg-brand/10 text-brand'
          )}
        >
          {unlocked ? <ShieldAlert size={12} /> : <ShieldCheck size={12} />}
          Bootloader {info.bootloaderState}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
        <Stat label="Codename" value={info.codename} />
        <Stat label="CPU / ABI" value={info.cpuArch} mono />
        <Stat label="Security Patch" value={info.securityPatch} mono />
        <Stat label="Build ID" value={info.buildId} mono />
        <Stat label="Active Slot" value={info.currentSlot ? info.currentSlot.toUpperCase() : 'A-only / N/A'} />
        <Stat label="Serial" value={info.serial} mono />
      </div>
    </Card>
  )
}

function BatteryCard({ info }) {
  const b = info?.battery
  if (!b || b.level == null) {
    return (
      <Card title="Battery" icon={Battery}>
        <p className="py-2 text-xs text-zinc-500">Unavailable in this mode.</p>
      </Card>
    )
  }
  const low = b.level < 20
  return (
    <Card title="Battery" icon={Battery}>
      <div className="flex items-end justify-between">
        <div>
          <div className={classNames('text-3xl font-semibold', low ? 'text-danger' : 'text-zinc-100')}>{b.level}%</div>
          <div className="mt-1 text-xs text-zinc-500">{b.status}{b.plugged ? ` • ${b.plugged}` : ''}</div>
        </div>
        {b.temperature && <div className="text-right text-xs text-zinc-500">{b.temperature}°C<br />{b.health || ''}</div>}
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-1">
        <div
          className={classNames('h-full rounded-full transition-all', low ? 'bg-danger' : 'bg-brand')}
          style={{ width: `${b.level}%` }}
        />
      </div>
    </Card>
  )
}

function QuickActions({ device, isFastboot }) {
  const toast = useToast()
  const confirm = useConfirm()
  const [busy, setBusy] = useState(null)

  const doReboot = async (target, label, dangerous) => {
    if (dangerous) {
      const ok = await confirm({
        title: `Reboot to ${label}?`,
        message: `The device will reboot into ${label}. Make sure you know how to get back to the system.`,
        confirmLabel: `Reboot ${label}`,
      })
      if (!ok) return
    }
    setBusy(target)
    const res = await api.reboot({ serial: device.serial, mode: device.mode, target })
    setBusy(null)
    toast.fromResult(res, { successTitle: `Rebooting to ${label}…`, errorTitle: 'Reboot failed' })
  }

  const actions = [
    { target: 'system', label: 'System', icon: RotateCw, cls: 'btn-surface' },
    { target: 'recovery', label: 'Recovery', icon: LifeBuoy, cls: 'btn-surface', danger: true },
    { target: 'bootloader', label: 'Bootloader', icon: Wrench, cls: 'btn-surface', danger: true },
    { target: 'fastboot', label: 'Fastbootd', icon: Zap, cls: 'btn-surface', danger: true },
  ]

  return (
    <Card title="Quick Actions" subtitle="Reboot targets" icon={Zap}>
      <div className="grid grid-cols-2 gap-2.5">
        {actions.map((a) => {
          const Icon = a.icon
          return (
            <button
              key={a.target}
              className={classNames(a.cls, 'justify-start')}
              disabled={busy !== null}
              onClick={() => doReboot(a.target, a.label, a.danger)}
            >
              {busy === a.target ? <Spinner size={15} /> : <Icon size={15} className="text-brand" />}
              {a.label}
            </button>
          )
        })}
      </div>
      <p className="mt-3 text-[11px] leading-relaxed text-zinc-600">
        {isFastboot
          ? 'Device is in fastboot — “System” returns to Android.'
          : 'Bootloader = fastboot. Fastbootd is userspace fastboot (dynamic partitions).'}
      </p>
    </Card>
  )
}

function ScreenshotCard({ device }) {
  const toast = useToast()
  const [shot, setShot] = useState(null)
  const [busy, setBusy] = useState(false)

  const capture = async () => {
    setBusy(true)
    const res = await api.screenshot({ serial: device.serial })
    setBusy(false)
    if (res.ok) {
      setShot(res.dataUrl)
    } else {
      toast.error('Screenshot failed', { message: res.error })
    }
  }

  return (
    <Card
      title="Screenshot"
      subtitle="Capture the current screen"
      icon={Camera}
      actions={
        <div className="flex gap-2">
          <button className="btn-brand" onClick={capture} disabled={busy}>
            {busy ? <Spinner size={15} /> : <Camera size={15} />} Take Screenshot
          </button>
        </div>
      }
    >
      <div className="flex flex-col items-center justify-center gap-3">
        {shot ? (
          <div className="group relative">
            <img
              src={shot}
              alt="Device screenshot"
              className="max-h-[420px] rounded-lg border border-border object-contain shadow-card"
            />
            <a
              href={shot}
              download={`screenshot-${device.serial}.png`}
              className="btn-surface absolute bottom-3 right-3 opacity-0 transition-opacity group-hover:opacity-100"
            >
              <Download size={14} /> Save PNG
            </a>
          </div>
        ) : (
          <div className="grid h-48 w-full place-items-center rounded-lg border border-dashed border-border text-zinc-600">
            <div className="flex flex-col items-center gap-2 text-xs">
              <ImageOff size={22} />
              No screenshot yet
            </div>
          </div>
        )}
      </div>
    </Card>
  )
}
