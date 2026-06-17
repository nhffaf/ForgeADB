import React, { useEffect, useMemo, useState } from 'react'
import {
  HardDrive, RefreshCw, Search, Boxes, Layers, Upload, Download, Eraser,
  Maximize2, Trash2, AlertTriangle, Database, Cpu, Box,
} from 'lucide-react'
import { useDevice } from '../state/DeviceContext.jsx'
import { useToast } from '../state/ToastContext.jsx'
import { useConfirm } from '../state/ConfirmContext.jsx'
import { Card, Spinner, EmptyState, Modal, Tooltip } from '../components/ui.jsx'
import AvbOptions, { isVbmeta } from '../components/AvbOptions.jsx'
import { formatBytes, classNames } from '../lib/format.js'
import api from '../lib/api.js'

// Partitions we class as "critical" — extra-loud warnings when flashing/erasing.
const CRITICAL = new Set(['boot', 'init_boot', 'bootloader', 'vbmeta', 'vbmeta_system', 'super', 'modem', 'aboot', 'xbl', 'tz'])

export default function PartitionManager() {
  const { selected } = useDevice()
  const toast = useToast()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [query, setQuery] = useState('')
  const [showLogicalOnly, setShowLogicalOnly] = useState(false)
  const [activePart, setActivePart] = useState(null)

  const isFastboot = selected?.mode === 'fastboot' || selected?.mode === 'fastbootd'
  const isFastbootd = selected?.mode === 'fastbootd'

  const load = async () => {
    if (!selected) return
    setLoading(true)
    const res = await api.listPartitions(selected)
    setLoading(false)
    if (res.ok) setData(res)
    else {
      setData({ partitions: [], source: null })
      toast.error('Could not read partitions', { message: res.error })
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.serial, selected?.mode])

  const partitions = data?.partitions || []
  const filtered = useMemo(() => {
    return partitions.filter((p) => {
      if (showLogicalOnly && !p.logical) return false
      if (query && !p.name.toLowerCase().includes(query.toLowerCase())) return false
      return true
    })
  }, [partitions, query, showLogicalOnly])

  const logicalCount = partitions.filter((p) => p.logical).length
  const physicalCount = partitions.length - logicalCount
  const totalSize = partitions.reduce((a, p) => a + (p.size || 0), 0)
  const maxSize = Math.max(1, ...partitions.map((p) => p.size || 0))

  return (
    <div className="animate-fade-in space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-xl font-semibold text-zinc-100">Partition Manager</h1>
          <p className="mt-0.5 text-sm text-zinc-500">
            {data?.source === 'fastboot'
              ? 'Reported by fastboot getvar'
              : data?.source === 'adb'
                ? 'Enumerated from /dev/block/by-name'
                : 'Visual partition table'}
          </p>
        </div>
        <button className="btn-surface" onClick={load} disabled={loading}>
          {loading ? <Spinner size={15} /> : <RefreshCw size={15} />} Refresh
        </button>
      </div>

      {!isFastboot && (
        <div className="flex items-start gap-2.5 rounded-lg border border-info/20 bg-info/5 px-4 py-3 text-xs text-info">
          <AlertTriangle size={15} className="mt-0.5 shrink-0" />
          <p>
            You're in ADB mode. You can <b>back up (dump)</b> partitions here (root may be required). To <b>flash</b> or
            <b> erase</b>, reboot to <b>Bootloader</b> (fastboot). Logical partition editing needs <b>Fastbootd</b>.
          </p>
        </div>
      )}

      {/* Summary stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryStat icon={Box} label="Total" value={partitions.length} />
        <SummaryStat icon={Cpu} label="Physical" value={physicalCount} />
        <SummaryStat icon={Layers} label="Logical (super)" value={logicalCount} accent="text-info" />
        <SummaryStat icon={Database} label="Mapped size" value={totalSize ? formatBytes(totalSize) : '—'} />
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600" />
          <input
            className="input pl-9"
            placeholder="Filter partitions…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <label className="flex cursor-pointer select-none items-center gap-2 rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-zinc-300">
          <input
            type="checkbox"
            checked={showLogicalOnly}
            onChange={(e) => setShowLogicalOnly(e.target.checked)}
            className="accent-brand"
          />
          <Layers size={14} className="text-info" /> Logical only
        </label>
      </div>

      {/* Partition list */}
      {loading && !data ? (
        <div className="flex items-center gap-2 py-12 text-sm text-zinc-500">
          <Spinner /> Reading partition table…
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={HardDrive}
          title="No partitions to show"
          message={
            partitions.length === 0
              ? 'The partition table could not be read. On ADB this usually needs root; try rebooting to bootloader for a full fastboot list.'
              : 'No partitions match your filter.'
          }
        />
      ) : (
        <div className="space-y-2">
          {filtered.map((p) => (
            <PartitionRow
              key={p.name}
              p={p}
              maxSize={maxSize}
              onClick={() => setActivePart(p)}
            />
          ))}
        </div>
      )}

      <PartitionDrawer
        part={activePart}
        device={selected}
        isFastboot={isFastboot}
        isFastbootd={isFastbootd}
        onClose={() => setActivePart(null)}
        onChanged={load}
      />
    </div>
  )
}

function SummaryStat({ icon: Icon, label, value, accent = 'text-brand' }) {
  return (
    <div className="card flex items-center gap-3 p-3.5">
      <span className={classNames('grid h-9 w-9 place-items-center rounded-lg bg-surface-4', accent)}>
        <Icon size={16} />
      </span>
      <div>
        <div className="label">{label}</div>
        <div className="text-lg font-semibold text-zinc-100">{value}</div>
      </div>
    </div>
  )
}

function PartitionRow({ p, maxSize, onClick }) {
  const pct = p.size ? Math.max(2, (p.size / maxSize) * 100) : 0
  const critical = CRITICAL.has(p.base)
  return (
    <button
      onClick={onClick}
      className="group flex w-full items-center gap-4 rounded-xl border border-border bg-surface-2 px-4 py-3 text-left transition-all hover:border-border-strong hover:bg-surface-3"
    >
      <span
        className={classNames(
          'grid h-9 w-9 shrink-0 place-items-center rounded-lg',
          p.logical ? 'bg-info/10 text-info' : critical ? 'bg-warn/10 text-warn' : 'bg-surface-4 text-zinc-400'
        )}
      >
        {p.logical ? <Layers size={16} /> : <HardDrive size={16} />}
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate font-mono text-sm text-zinc-100">{p.name}</span>
          {p.logical && <span className="chip bg-info/10 text-info">logical</span>}
          {critical && <span className="chip bg-warn/10 text-warn">critical</span>}
          {p.type && <span className="chip bg-surface-1 text-zinc-500">{p.type}</span>}
        </div>
        {p.size != null && (
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-1">
            <div
              className={classNames('h-full rounded-full', p.logical ? 'bg-info/70' : 'bg-brand/70')}
              style={{ width: `${pct}%` }}
            />
          </div>
        )}
      </div>

      <div className="shrink-0 text-right">
        <div className="text-sm font-medium text-zinc-200">{formatBytes(p.size)}</div>
        <div className="text-[11px] text-zinc-600 opacity-0 transition-opacity group-hover:opacity-100">Manage →</div>
      </div>
    </button>
  )
}

function PartitionDrawer({ part, device, isFastboot, isFastbootd, onClose, onChanged }) {
  const toast = useToast()
  const confirm = useConfirm()
  const [busy, setBusy] = useState(null)
  const [avb, setAvb] = useState({ verity: false, verification: false })

  // Reset AVB toggles whenever a different partition drawer opens.
  useEffect(() => {
    setAvb({ verity: false, verification: false })
  }, [part?.name])

  if (!part) return null
  const critical = CRITICAL.has(part.base)
  const showAvb = isVbmeta(part.name)

  const flash = async () => {
    const image = await api.openFile({
      title: `Select image to flash to ${part.name}`,
      filters: [{ name: 'Disk images', extensions: ['img', 'bin'] }, { name: 'All Files', extensions: ['*'] }],
    })
    if (!image) return
    const ok = await confirm({
      title: `Flash ${part.name}?`,
      message: `This will overwrite the ${part.name} partition with:\n${image}\n\n${
        critical ? '⚠ This is a CRITICAL partition. Flashing the wrong image can hard-brick the device.' : 'Make sure the image matches this device and slot.'
      }`,
      confirmLabel: 'Flash image',
      danger: critical,
      requireText: critical ? part.base : undefined,
    })
    if (!ok) return
    setBusy('flash')
    const res = await api.fastbootFlash({
      serial: device.serial,
      partition: part.name,
      image,
      disableVerity: showAvb && avb.verity,
      disableVerification: showAvb && avb.verification,
    })
    setBusy(null)
    toast.fromResult(res, { successTitle: `Flashed ${part.name}`, errorTitle: 'Flash failed' })
    onChanged()
  }

  const dump = async () => {
    const local = await api.saveFile({
      title: `Back up ${part.name}`,
      defaultPath: `${part.base}.img`,
      filters: [{ name: 'Disk image', extensions: ['img'] }],
    })
    if (!local) return
    setBusy('dump')
    const res = await api.dumpPartition({ serial: device.serial, partition: part.name, local })
    setBusy(null)
    toast.fromResult(res, { successTitle: `Backed up ${part.name}`, errorTitle: 'Backup failed (root required?)' })
  }

  const erase = async () => {
    const ok = await confirm({
      title: `Erase ${part.name}?`,
      message: `This will erase all data on ${part.name}.${
        critical ? '\n\n⚠ CRITICAL partition — erasing may prevent the device from booting.' : ''
      }`,
      confirmLabel: 'Erase partition',
      danger: true,
      requireText: critical ? part.base : undefined,
    })
    if (!ok) return
    setBusy('erase')
    const res = await api.fastbootErase({ serial: device.serial, partition: part.name })
    setBusy(null)
    toast.fromResult(res, { successTitle: `Erased ${part.name}`, errorTitle: 'Erase failed' })
    onChanged()
  }

  const resize = async () => {
    const input = window.prompt(`New size for ${part.name} in MB:`, part.size ? Math.round(part.size / 1048576) : '')
    if (!input) return
    const bytes = Math.round(parseFloat(input) * 1048576)
    if (!bytes || bytes < 0) return toast.error('Invalid size')
    setBusy('resize')
    const res = await api.resizeLogical({ serial: device.serial, partition: part.name, sizeBytes: bytes })
    setBusy(null)
    toast.fromResult(res, { successTitle: `Resized ${part.name}`, errorTitle: 'Resize failed' })
    onChanged()
  }

  const deleteLogical = async () => {
    const ok = await confirm({
      title: `Delete logical partition ${part.name}?`,
      message: `This removes the logical partition ${part.name} from super. The space becomes unallocated.`,
      confirmLabel: 'Delete partition',
      danger: true,
      requireText: part.base,
    })
    if (!ok) return
    setBusy('delete')
    const res = await api.deleteLogical({ serial: device.serial, partition: part.name })
    setBusy(null)
    toast.fromResult(res, { successTitle: `Deleted ${part.name}`, errorTitle: 'Delete failed' })
    onChanged()
  }

  return (
    <Modal open={!!part} title={`Partition · ${part.name}`} onClose={onClose} width={520}>
      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-2.5">
          <Info label="Name" value={part.name} mono />
          <Info label="Base" value={part.base} mono />
          <Info label="Size" value={formatBytes(part.size)} />
          <Info label="Type" value={part.logical ? 'Logical (in super)' : 'Physical'} />
          {part.type && <Info label="Filesystem" value={part.type} mono />}
          {part.target && <Info label="Block" value={part.target} mono />}
        </div>

        {critical && (
          <div className="flex items-start gap-2.5 rounded-lg border border-danger/30 bg-danger/5 px-3.5 py-3 text-xs text-danger">
            <AlertTriangle size={15} className="mt-0.5 shrink-0" />
            <p>Critical partition. A wrong write here can <b>hard-brick</b> your device. Confirmation requires typing the name.</p>
          </div>
        )}

        <div className="space-y-2.5">
          <p className="label">Operations</p>

          {/* Dump — works over ADB */}
          <OpButton
            icon={Download}
            title="Back up (dump) to PC"
            desc={isFastboot ? 'Requires ADB/recovery mode — fastboot cannot read partitions.' : 'Pull the raw partition to a .img file (root may be required).'}
            disabled={isFastboot || busy}
            busy={busy === 'dump'}
            onClick={dump}
            tone="surface"
          />

          {/* AVB flags — only for vbmeta* partitions */}
          {showAvb && isFastboot && (
            <div className="rounded-lg border border-warn/20 bg-warn/5 px-3.5 py-3">
              <AvbOptions verity={avb.verity} verification={avb.verification} onChange={setAvb} />
            </div>
          )}

          {/* Flash — fastboot */}
          <OpButton
            icon={Upload}
            title="Flash image (.img)"
            desc={isFastboot ? 'Write a disk image to this partition.' : 'Reboot to bootloader/fastboot to flash.'}
            disabled={!isFastboot || busy}
            busy={busy === 'flash'}
            onClick={flash}
            tone="brand"
          />

          {/* Erase — fastboot */}
          <OpButton
            icon={Eraser}
            title="Erase partition"
            desc={isFastboot ? 'Wipe all data on this partition.' : 'Available in fastboot mode.'}
            disabled={!isFastboot || busy}
            busy={busy === 'erase'}
            onClick={erase}
            tone="danger"
          />

          {/* Logical-only operations (fastbootd) */}
          {part.logical && (
            <>
              <div className="pt-1">
                <p className="label flex items-center gap-1.5"><Layers size={12} className="text-info" /> Logical partition (Fastbootd)</p>
              </div>
              <OpButton
                icon={Maximize2}
                title="Resize logical partition"
                desc={isFastbootd ? 'Change the size of this partition within super.' : 'Requires Fastbootd (userspace fastboot).'}
                disabled={!isFastbootd || busy}
                busy={busy === 'resize'}
                onClick={resize}
                tone="surface"
              />
              <OpButton
                icon={Trash2}
                title="Delete logical partition"
                desc={isFastbootd ? 'Remove this partition from super.' : 'Requires Fastbootd (userspace fastboot).'}
                disabled={!isFastbootd || busy}
                busy={busy === 'delete'}
                onClick={deleteLogical}
                tone="danger"
              />
            </>
          )}
        </div>
      </div>
    </Modal>
  )
}

function Info({ label, value, mono }) {
  return (
    <div className="rounded-lg bg-surface-1 border border-border px-3 py-2">
      <div className="label">{label}</div>
      <div className={classNames('mt-0.5 truncate text-sm text-zinc-100', mono && 'font-mono')} title={String(value ?? '')}>
        {value ?? '—'}
      </div>
    </div>
  )
}

function OpButton({ icon: Icon, title, desc, disabled, busy, onClick, tone = 'surface' }) {
  const toneCls = {
    surface: 'hover:border-border-strong',
    brand: 'hover:border-brand/40',
    danger: 'hover:border-danger/40',
  }[tone]
  const iconCls = { surface: 'text-zinc-300', brand: 'text-brand', danger: 'text-danger' }[tone]
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={classNames(
        'flex w-full items-center gap-3 rounded-lg border border-border bg-surface-1 px-3.5 py-3 text-left transition-all disabled:opacity-40 disabled:cursor-not-allowed',
        !disabled && toneCls
      )}
    >
      <span className={classNames('grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-surface-4', iconCls)}>
        {busy ? <Spinner size={15} /> : <Icon size={15} />}
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-medium text-zinc-100">{title}</span>
        <span className="block text-[11px] leading-snug text-zinc-500">{desc}</span>
      </span>
    </button>
  )
}
