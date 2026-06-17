import React, { useEffect, useRef, useState } from 'react'
import { PackageOpen, UploadCloud, Play, X, CheckCircle2, AlertTriangle, FileArchive } from 'lucide-react'
import { useToast } from '../../state/ToastContext.jsx'
import { Card, Spinner } from '../../components/ui.jsx'
import { classNames } from '../../lib/format.js'
import api from '../../lib/api.js'

// status: idle | running | done | error
export default function Sideload({ device }) {
  const toast = useToast()
  const [file, setFile] = useState(null)
  const [dragOver, setDragOver] = useState(false)
  const [status, setStatus] = useState('idle')
  const [percent, setPercent] = useState(0)
  const [logLines, setLogLines] = useState([])
  const logRef = useRef(null)

  // Subscribe to backend progress/log/end events.
  useEffect(() => {
    const offProg = api.onSideloadProgress(({ percent }) => setPercent(percent))
    const offLog = api.onSideloadLog(({ line }) =>
      setLogLines((l) => [...l.slice(-200), line])
    )
    const offEnd = api.onSideloadEnd(({ ok }) => {
      setStatus(ok ? 'done' : 'error')
      if (ok) {
        setPercent(100)
        toast.success('Sideload complete', { message: 'The OTA package was applied.' })
      } else {
        toast.error('Sideload failed', { message: 'Check the device screen and log output.' })
      }
    })
    return () => {
      offProg?.()
      offLog?.()
      offEnd?.()
    }
  }, [toast])

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
  }, [logLines])

  const pickFile = async () => {
    const f = await api.openFile({
      title: 'Select OTA package',
      filters: [{ name: 'OTA package', extensions: ['zip'] }],
    })
    if (f) setFile(f)
  }

  const onDrop = (e) => {
    e.preventDefault()
    setDragOver(false)
    const f = e.dataTransfer.files?.[0]
    if (f && f.path) {
      if (!f.path.toLowerCase().endsWith('.zip')) {
        toast.error('Not a .zip', { message: 'OTA sideload packages must be .zip files.' })
        return
      }
      setFile(f.path)
    }
  }

  const start = async () => {
    if (!file) return
    setStatus('running')
    setPercent(0)
    setLogLines([])
    const res = await api.sideloadStart({ serial: device.serial, filePath: file })
    if (!res.ok) {
      setStatus('error')
      toast.error('Could not start sideload', { message: res.error })
    }
  }

  const cancel = async () => {
    await api.sideloadCancel()
    setStatus('idle')
    setPercent(0)
    toast.info('Sideload cancelled')
  }

  const running = status === 'running'
  const fileName = file ? file.split(/[\\/]/).pop() : null

  return (
    <Card
      title="ADB Sideload"
      subtitle="Apply an OTA / update .zip while in recovery sideload mode"
      icon={PackageOpen}
    >
      {/* Dropzone / file picker */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        className={classNames(
          'flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-6 py-8 text-center transition-all',
          dragOver ? 'border-brand bg-brand/5' : 'border-border bg-surface-1',
          running && 'pointer-events-none opacity-60'
        )}
      >
        <span className="grid h-14 w-14 place-items-center rounded-2xl bg-surface-4 text-brand">
          {fileName ? <FileArchive size={26} /> : <UploadCloud size={26} />}
        </span>
        {fileName ? (
          <div className="min-w-0">
            <div className="truncate text-sm font-medium text-zinc-100" title={file}>{fileName}</div>
            <div className="truncate font-mono text-[11px] text-zinc-500" title={file}>{file}</div>
          </div>
        ) : (
          <div>
            <div className="text-sm font-medium text-zinc-200">Drag & drop an OTA .zip here</div>
            <div className="text-xs text-zinc-500">or pick a file to sideload</div>
          </div>
        )}
        <button className="btn-surface" onClick={pickFile} disabled={running}>
          <FileArchive size={15} /> {fileName ? 'Choose a different file' : 'Select .zip'}
        </button>
      </div>

      {/* Controls */}
      <div className="mt-4 flex items-center gap-2.5">
        {!running ? (
          <button className="btn-brand flex-1" onClick={start} disabled={!file}>
            <Play size={16} /> Start Sideload
          </button>
        ) : (
          <button className="btn-danger flex-1" onClick={cancel}>
            <X size={16} /> Cancel
          </button>
        )}
      </div>

      {/* Progress bar */}
      {(running || status === 'done' || status === 'error') && (
        <div className="mt-5">
          <div className="mb-1.5 flex items-center justify-between text-xs">
            <span className="flex items-center gap-1.5 font-medium text-zinc-300">
              {status === 'done' ? (
                <><CheckCircle2 size={14} className="text-brand" /> Complete</>
              ) : status === 'error' ? (
                <><AlertTriangle size={14} className="text-danger" /> Failed</>
              ) : (
                <><Spinner size={13} /> Transferring…</>
              )}
            </span>
            <span className={classNames('font-mono font-semibold', status === 'error' ? 'text-danger' : 'text-brand')}>
              {percent}%
            </span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-surface-1">
            <div
              className={classNames(
                'h-full rounded-full transition-all duration-300 ease-out',
                status === 'error' ? 'bg-danger' : 'bg-gradient-to-r from-brand-dim to-brand',
                running && 'animate-pulse-soft'
              )}
              style={{ width: `${percent}%` }}
            />
          </div>
        </div>
      )}

      {/* Live log */}
      {logLines.length > 0 && (
        <div
          ref={logRef}
          className="mt-4 max-h-40 overflow-auto rounded-lg border border-border bg-black/40 p-3 font-mono text-[11px] leading-relaxed text-zinc-400"
        >
          {logLines.map((l, i) => (
            <div key={i} className="whitespace-pre-wrap break-all">{l}</div>
          ))}
        </div>
      )}

      <p className="mt-4 text-[11px] leading-relaxed text-zinc-600">
        To sideload, boot the device into recovery, choose <b>“Apply update from ADB”</b>, then start the transfer here.
        The device must appear in <span className="font-mono">sideload</span> state.
      </p>
    </Card>
  )
}
