import React, { useEffect, useState } from 'react'
import { Boxes, Link2, FolderOpen, HardDrive, Play, Info, ShieldCheck, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { useToast } from '../../state/ToastContext.jsx'
import { useConfirm } from '../../state/ConfirmContext.jsx'
import { Card, Spinner, Tooltip } from '../../components/ui.jsx'
import { classNames } from '../../lib/format.js'
import api from '../../lib/api.js'

const GB = 1024 * 1024 * 1024
const PRESETS = [4, 8, 16]

const STAGE_LABELS = {
  analyzing: 'Analyzing image',
  converting: 'Unsparsing & compressing',
  pushing: 'Pushing to device',
  starting: 'Starting DSU service',
  done: 'Done',
  error: 'Failed',
}

export default function DSU({ device }) {
  const toast = useToast()
  const confirm = useConfirm()
  const [check, setCheck] = useState(null)
  const [loading, setLoading] = useState(true)
  const [mode, setMode] = useState('url') // url | local
  const [url, setUrl] = useState('')
  const [localPath, setLocalPath] = useState('')
  const [sizeGb, setSizeGb] = useState(8)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState(null) // { stage, percent, message }

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    api.dsuCheck({ serial: device.serial }).then((res) => {
      if (!cancelled) {
        setCheck(res)
        setLoading(false)
      }
    })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [device?.serial])

  // Live progress events from the unsparse/compress/push pipeline.
  useEffect(() => {
    const off = api.onDsuProgress((data) => setProgress(data))
    return () => off?.()
  }, [])

  const supported = check?.supported
  const source = mode === 'url' ? url.trim() : localPath.trim()

  const pickLocal = async () => {
    const f = await api.openFile({
      title: 'Select GSI image',
      filters: [{ name: 'System image', extensions: ['img', 'gz', 'xz', 'zip'] }],
    })
    if (f) setLocalPath(f)
  }

  const install = async () => {
    if (!source) return toast.error('Provide a GSI URL or file path')
    const userdataBytes = Math.round(sizeGb * GB)
    const isLocal = mode === 'local'
    const ok = await confirm({
      title: 'Install DSU image?',
      message: isLocal
        ? `The image will be unsparsed, compressed, pushed to the device and installed as a temporary Dynamic System Update.\n\nSource: ${source}\nUserdata: ${sizeGb} GB\n\nThe device will prompt you to confirm and reboot into the DSU. Your existing system is untouched.`
        : `A Generic System Image will be downloaded by the device and installed as a temporary Dynamic System Update.\n\nSource: ${source}\nUserdata: ${sizeGb} GB\n\nThe device will prompt you to confirm and reboot into the DSU. Your existing system is untouched.`,
      confirmLabel: 'Start DSU install',
    })
    if (!ok) return

    setBusy(true)
    setProgress(isLocal ? { stage: 'analyzing', percent: 0, message: 'Preparing…' } : null)
    const res = isLocal
      ? await api.dsuInstallLocal({ serial: device.serial, imagePath: source, userdataBytes })
      : await api.dsuInstallUrl({ serial: device.serial, url: source, userdataBytes })
    setBusy(false)
    if (res.ok) setProgress({ stage: 'done', percent: 100, message: 'Confirm the prompt on your device.' })
    else if (mode === 'local') setProgress({ stage: 'error', percent: 0, message: res.error || 'Failed' })
    toast.fromResult(res, {
      successTitle: 'DSU install triggered — confirm on device',
      errorTitle: 'Could not start DSU',
    })
  }

  return (
    <Card
      title="DSU Package Installer"
      subtitle="Boot a Generic System Image temporarily (Dynamic System Update)"
      icon={Boxes}
      actions={
        loading ? (
          <span className="flex items-center gap-1.5 text-xs text-zinc-500"><Spinner size={13} /> checking…</span>
        ) : supported ? (
          <span className="chip bg-brand/10 text-brand"><ShieldCheck size={13} /> A/B compatible</span>
        ) : (
          <Tooltip label={check?.reason || 'DSU not supported on this device'} side="left">
            <span className="chip bg-danger/10 text-danger"><AlertTriangle size={13} /> Not supported</span>
          </Tooltip>
        )
      }
    >
      {/* Compatibility banner */}
      {!loading && !supported && (
        <div className="mb-4 flex items-start gap-2.5 rounded-lg border border-danger/30 bg-danger/5 px-4 py-3 text-xs text-danger">
          <AlertTriangle size={15} className="mt-0.5 shrink-0" />
          <p className="leading-relaxed">
            {check?.reason || 'This device does not support DSU.'} DSU requires an A/B (seamless update) device with
            dynamic partitions on Android 10+. Detected: <span className="font-mono">ro.build.ab_update={String(check?.abUpdate || '?')}</span>,
            <span className="font-mono"> dynamic_partitions={String(check?.dynamicPartitions || '?')}</span>.
          </p>
        </div>
      )}

      <fieldset disabled={!supported || busy} className={classNames('space-y-4', !supported && 'opacity-50')}>
        {/* Source toggle */}
        <div>
          <div className="label mb-1.5">GSI source</div>
          <div className="flex rounded-lg border border-border bg-surface-2 p-1">
            <ToggleBtn active={mode === 'url'} onClick={() => setMode('url')} icon={Link2}>Remote URL</ToggleBtn>
            <ToggleBtn active={mode === 'local'} onClick={() => setMode('local')} icon={FolderOpen}>Local file</ToggleBtn>
          </div>
        </div>

        {mode === 'url' ? (
          <div>
            <input
              className="input"
              placeholder="https://example.com/gsi_arm64-ab.img.gz"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              spellCheck={false}
            />
            <p className="mt-1 text-[11px] text-zinc-600">Direct link to a GSI image (.img / .gz / .xz / .zip).</p>
          </div>
        ) : (
          <div className="flex gap-2">
            <input
              className="input flex-1 font-mono text-xs"
              placeholder="No file selected"
              value={localPath}
              onChange={(e) => setLocalPath(e.target.value)}
              spellCheck={false}
            />
            <button className="btn-surface whitespace-nowrap" onClick={pickLocal} type="button">
              <FolderOpen size={15} /> Browse
            </button>
          </div>
        )}

        {/* Userdata size */}
        <div>
          <div className="label mb-1.5 flex items-center gap-1.5"><HardDrive size={12} /> Userdata allocation</div>
          <div className="flex items-center gap-2">
            {PRESETS.map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => setSizeGb(g)}
                className={classNames(
                  'rounded-lg border px-3 py-1.5 text-sm font-medium transition-all',
                  sizeGb === g ? 'border-brand/50 bg-brand/10 text-brand' : 'border-border bg-surface-1 text-zinc-400 hover:text-zinc-200'
                )}
              >
                {g} GB
              </button>
            ))}
            <div className="flex items-center gap-1.5">
              <input
                type="number"
                min="1"
                max="128"
                value={sizeGb}
                onChange={(e) => setSizeGb(Math.max(1, Number(e.target.value) || 1))}
                className="input w-20 text-center"
              />
              <span className="text-sm text-zinc-500">GB</span>
            </div>
          </div>
        </div>

        <button className="btn-brand w-full" onClick={install} type="button">
          {busy ? <Spinner size={16} /> : <Play size={16} />} Install & boot DSU
        </button>
      </fieldset>

      {progress && (
        <div className="mt-4 rounded-lg border border-border bg-surface-1 px-4 py-3">
          <div className="mb-1.5 flex items-center justify-between text-xs">
            <span className="flex items-center gap-1.5 font-medium text-zinc-200">
              {progress.stage === 'done' ? (
                <CheckCircle2 size={14} className="text-brand" />
              ) : progress.stage === 'error' ? (
                <AlertTriangle size={14} className="text-danger" />
              ) : (
                <Spinner size={13} />
              )}
              {STAGE_LABELS[progress.stage] || progress.stage}
            </span>
            {progress.stage !== 'error' && (
              <span className={classNames('font-mono font-semibold', progress.stage === 'done' ? 'text-brand' : 'text-zinc-400')}>
                {progress.percent}%
              </span>
            )}
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-surface-3">
            <div
              className={classNames(
                'h-full rounded-full transition-all duration-300 ease-out',
                progress.stage === 'error' ? 'bg-danger' : 'bg-gradient-to-r from-brand-dim to-brand',
                busy && 'animate-pulse-soft'
              )}
              style={{ width: `${progress.stage === 'error' ? 100 : progress.percent}%` }}
            />
          </div>
          {progress.message && <p className="mt-1.5 text-[11px] text-zinc-500">{progress.message}</p>}
        </div>
      )}

      <div className="mt-4 flex items-start gap-2.5 rounded-lg border border-info/20 bg-info/5 px-4 py-3 text-[11px] leading-relaxed text-info">
        <Info size={14} className="mt-0.5 shrink-0" />
        <p>
          DSU installs a GSI alongside your current system without touching it. After install, accept the prompt on the
          device, then use the notification to reboot into the dynamic system. Reboot normally to return to your OS.
        </p>
      </div>
    </Card>
  )
}

function ToggleBtn({ active, onClick, icon: Icon, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={classNames(
        'flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-all',
        active ? 'bg-surface-4 text-white' : 'text-zinc-400 hover:text-zinc-200'
      )}
    >
      <Icon size={14} className={active ? 'text-brand' : ''} /> {children}
    </button>
  )
}
