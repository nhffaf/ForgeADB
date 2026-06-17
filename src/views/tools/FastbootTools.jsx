import React, { useState } from 'react'
import {
  Zap, Rocket, Upload, Trash2, Unlock, Lock, AlertTriangle, ShieldAlert, Power, FlaskConical,
} from 'lucide-react'
import { useToast } from '../../state/ToastContext.jsx'
import { useConfirm } from '../../state/ConfirmContext.jsx'
import { Card, Spinner } from '../../components/ui.jsx'
import AvbOptions, { isVbmeta } from '../../components/AvbOptions.jsx'
import { classNames } from '../../lib/format.js'
import api from '../../lib/api.js'

const FLASH_TARGETS = [
  'boot', 'init_boot', 'recovery', 'dtbo', 'vbmeta', 'vbmeta_system', 'vendor_boot', 'system', 'vendor', 'super',
]

export default function FastbootTools({ device, isFastboot }) {
  if (!isFastboot) {
    return (
      <div className="flex items-start gap-3 rounded-xl border border-warn/20 bg-warn/5 px-4 py-4 text-sm text-warn">
        <Zap size={18} className="mt-0.5 shrink-0" />
        <p className="leading-relaxed">
          Fastboot tools require the device in <b>Bootloader (fastboot)</b> or <b>Fastbootd</b> mode. Use the Dashboard
          quick actions to reboot into the bootloader.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <BootFlash device={device} />
      <WipeTools device={device} />
      <BootloaderLock device={device} />
    </div>
  )
}

function BootFlash({ device }) {
  const toast = useToast()
  const confirm = useConfirm()
  const [partition, setPartition] = useState('boot')
  const [busy, setBusy] = useState(null)
  const [avb, setAvb] = useState({ verity: false, verification: false })

  const showAvb = isVbmeta(partition)

  const bootTemp = async () => {
    const image = await api.openFile({ title: 'Select boot image to boot (temporary)', filters: [{ name: 'Boot image', extensions: ['img'] }] })
    if (!image) return
    setBusy('boot')
    const res = await api.fastbootBoot({ serial: device.serial, image })
    setBusy(null)
    toast.fromResult(res, { successTitle: 'Booting temporary image…', errorTitle: 'Boot failed' })
  }

  const flash = async () => {
    const image = await api.openFile({ title: `Select image to flash to ${partition}`, filters: [{ name: 'Disk image', extensions: ['img', 'bin'] }] })
    if (!image) return
    const critical = ['vbmeta', 'vbmeta_system', 'super', 'boot', 'init_boot'].includes(partition)
    const useAvb = showAvb && (avb.verity || avb.verification)
    const flagText = useAvb
      ? `\n\nAVB: ${[avb.verity && '--disable-verity', avb.verification && '--disable-verification'].filter(Boolean).join(' ')}`
      : ''
    const ok = await confirm({
      title: `Flash ${partition}?`,
      message: `Write\n${image}\nto the ${partition} partition.${flagText}${critical ? '\n\n⚠ Critical partition — a wrong image can brick the device.' : ''}`,
      confirmLabel: 'Flash',
      danger: critical,
      requireText: critical ? partition : undefined,
    })
    if (!ok) return
    setBusy('flash')
    const res = await api.fastbootFlash({
      serial: device.serial,
      partition,
      image,
      disableVerity: showAvb && avb.verity,
      disableVerification: showAvb && avb.verification,
    })
    setBusy(null)
    toast.fromResult(res, { successTitle: `Flashed ${partition}`, errorTitle: 'Flash failed' })
  }

  return (
    <Card title="Boot & Flash" subtitle="Temporarily boot or flash an image" icon={Rocket}>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-lg border border-border bg-surface-1 p-4">
          <div className="mb-1 flex items-center gap-2 text-sm font-medium text-zinc-100">
            <FlaskConical size={15} className="text-info" /> Boot image (temporary)
          </div>
          <p className="mb-3 text-xs leading-relaxed text-zinc-500">
            Boots a kernel/recovery <b>without flashing</b>. Great for testing a patched boot.img or a recovery.
          </p>
          <button className="btn-surface w-full" onClick={bootTemp} disabled={busy}>
            {busy === 'boot' ? <Spinner size={15} /> : <Rocket size={15} className="text-info" />} Boot .img once
          </button>
        </div>

        <div className="rounded-lg border border-border bg-surface-1 p-4">
          <div className="mb-1 flex items-center gap-2 text-sm font-medium text-zinc-100">
            <Upload size={15} className="text-brand" /> Flash image
          </div>
          <div className="mb-3 flex gap-2">
            <select
              value={partition}
              onChange={(e) => setPartition(e.target.value)}
              className="input flex-1 font-mono text-xs"
            >
              {FLASH_TARGETS.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
            <button className="btn-brand whitespace-nowrap" onClick={flash} disabled={busy}>
              {busy === 'flash' ? <Spinner size={15} /> : <Upload size={15} />} Flash
            </button>
          </div>
          {showAvb && <AvbOptions verity={avb.verity} verification={avb.verification} onChange={setAvb} className="mb-3" />}
          <p className="text-[11px] leading-relaxed text-zinc-600">
            Targets the current slot. For per-slot control use the Terminal (<span className="font-mono">fastboot flash --slot</span>).
          </p>
        </div>
      </div>
    </Card>
  )
}

function WipeTools({ device }) {
  const toast = useToast()
  const confirm = useConfirm()
  const [busy, setBusy] = useState(null)

  const wipe = async (partition, danger) => {
    const ok = await confirm({
      title: `Erase ${partition}?`,
      message:
        partition === 'userdata'
          ? '⚠ This performs a FACTORY RESET. All user data, apps, photos and accounts will be permanently erased.'
          : `Erase the ${partition} partition.`,
      confirmLabel: `Erase ${partition}`,
      danger,
      requireText: partition === 'userdata' ? 'userdata' : undefined,
    })
    if (!ok) return
    setBusy(partition)
    const res = await api.fastbootWipe({ serial: device.serial, partition })
    setBusy(null)
    toast.fromResult(res, { successTitle: `Erased ${partition}`, errorTitle: 'Erase failed' })
  }

  return (
    <Card title="Wipe" subtitle="Erase partitions" icon={Trash2}>
      <div className="grid gap-3 sm:grid-cols-3">
        <button className="btn-surface justify-start" onClick={() => wipe('cache', false)} disabled={busy}>
          {busy === 'cache' ? <Spinner size={15} /> : <Trash2 size={15} className="text-warn" />} Wipe cache
        </button>
        <button className="btn-surface justify-start" onClick={() => wipe('metadata', false)} disabled={busy}>
          {busy === 'metadata' ? <Spinner size={15} /> : <Trash2 size={15} className="text-warn" />} Wipe metadata
        </button>
        <button className="btn-danger justify-start" onClick={() => wipe('userdata', true)} disabled={busy}>
          {busy === 'userdata' ? <Spinner size={15} /> : <ShieldAlert size={15} />} Factory reset (userdata)
        </button>
      </div>
    </Card>
  )
}

function BootloaderLock({ device }) {
  const toast = useToast()
  const confirm = useConfirm()
  const [busy, setBusy] = useState(null)

  const run = async (lock) => {
    const ok = await confirm({
      title: lock ? 'Lock bootloader?' : 'Unlock bootloader?',
      message: lock
        ? '⚠ Locking the bootloader with custom software flashed can HARD-BRICK the device. Only lock with 100% stock, signed firmware.\n\nThe device will factory reset.'
        : '⚠ Unlocking the bootloader will FACTORY RESET the device and erase all data. You must also confirm on the device screen using the volume + power keys.',
      confirmLabel: lock ? 'Lock bootloader' : 'Unlock bootloader',
      danger: true,
      requireText: lock ? 'LOCK' : 'UNLOCK',
    })
    if (!ok) return
    setBusy(lock ? 'lock' : 'unlock')
    const res = await api.fastbootLock({ serial: device.serial, lock })
    setBusy(null)
    toast.fromResult(res, {
      successTitle: lock ? 'Lock command sent — confirm on device' : 'Unlock command sent — confirm on device',
      errorTitle: 'Command failed',
    })
  }

  return (
    <Card title="Bootloader" subtitle="Lock / unlock — handle with care" icon={ShieldAlert}>
      <div className="mb-4 flex items-start gap-2.5 rounded-lg border border-danger/30 bg-danger/5 px-4 py-3 text-xs text-danger">
        <AlertTriangle size={15} className="mt-0.5 shrink-0" />
        <p className="leading-relaxed">
          These operations wipe all data and can brick the device if misused. Some devices require OEM unlocking enabled in
          Developer Options and a confirmation on the device screen.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <button className="btn-warn justify-start" onClick={() => run(false)} disabled={busy}>
          {busy === 'unlock' ? <Spinner size={15} /> : <Unlock size={15} />} Unlock bootloader
        </button>
        <button className="btn-danger justify-start" onClick={() => run(true)} disabled={busy}>
          {busy === 'lock' ? <Spinner size={15} /> : <Lock size={15} />} Lock bootloader
        </button>
      </div>
    </Card>
  )
}
