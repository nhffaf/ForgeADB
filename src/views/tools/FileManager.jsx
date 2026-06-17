import React, { useEffect, useState } from 'react'
import {
  Folder, FileText, ArrowUp, RefreshCw, Download, Upload, ChevronRight, Home, FolderSymlink,
} from 'lucide-react'
import { useToast } from '../../state/ToastContext.jsx'
import { Card, Spinner } from '../../components/ui.jsx'
import { formatBytes, classNames } from '../../lib/format.js'
import api from '../../lib/api.js'

export default function FileManager({ device }) {
  const toast = useToast()
  const [path, setPath] = useState('/sdcard/')
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)

  const normalize = (p) => {
    if (!p.endsWith('/')) p += '/'
    return p.replace(/\/+/g, '/')
  }

  const load = async (target = path) => {
    if (!device) return
    setLoading(true)
    const res = await api.listFiles({ serial: device.serial, remotePath: target })
    setLoading(false)
    if (res.ok) {
      setEntries(res.entries)
      setPath(normalize(target))
    } else {
      toast.error('Cannot open folder', { message: res.error })
    }
  }

  useEffect(() => {
    load('/sdcard/')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [device?.serial])

  const goUp = () => {
    const trimmed = path.replace(/\/$/, '')
    const parent = trimmed.substring(0, trimmed.lastIndexOf('/')) || '/'
    load(normalize(parent))
  }

  const enter = (entry) => {
    if (entry.isDir || entry.isLink) load(normalize(path + entry.name))
  }

  const pull = async (entry) => {
    const localDir = await api.openDir({ title: `Pull “${entry.name}” to…` })
    if (!localDir) return
    setBusy(true)
    const res = await api.pullFile({ serial: device.serial, remote: normalize(path + entry.name).replace(/\/$/, entry.isDir ? '' : ''), localDir })
    setBusy(false)
    toast.fromResult(res, { successTitle: `Pulled ${entry.name}`, errorTitle: 'Pull failed' })
  }

  const push = async () => {
    const local = await api.openFile({ title: 'Select a file to push' })
    if (!local) return
    setBusy(true)
    const res = await api.pushFile({ serial: device.serial, local, remote: path })
    setBusy(false)
    toast.fromResult(res, { successTitle: 'File pushed', errorTitle: 'Push failed' })
    if (res.ok) load()
  }

  const crumbs = path.split('/').filter(Boolean)

  return (
    <Card
      title="File Manager"
      subtitle="Browse, pull & push files"
      icon={Folder}
      actions={
        <div className="flex gap-2">
          <button className="btn-surface" onClick={push} disabled={busy}>
            {busy ? <Spinner size={14} /> : <Upload size={14} />} Push here
          </button>
          <button className="btn-surface !px-2.5" onClick={() => load()} disabled={loading}>
            {loading ? <Spinner size={14} /> : <RefreshCw size={14} />}
          </button>
        </div>
      }
    >
      {/* Breadcrumb */}
      <div className="mb-3 flex items-center gap-1 overflow-x-auto rounded-lg border border-border bg-surface-1 px-3 py-2 text-xs">
        <button onClick={() => load('/')} className="text-zinc-500 hover:text-brand"><Home size={13} /></button>
        {crumbs.map((c, i) => {
          const sub = '/' + crumbs.slice(0, i + 1).join('/') + '/'
          return (
            <span key={i} className="flex items-center gap-1">
              <ChevronRight size={12} className="text-zinc-700" />
              <button onClick={() => load(sub)} className="whitespace-nowrap font-mono text-zinc-300 hover:text-brand">{c}</button>
            </span>
          )
        })}
      </div>

      <div className="mb-2 flex gap-2">
        <button className="btn-ghost !px-2 !py-1.5 text-xs" onClick={goUp} disabled={path === '/'}>
          <ArrowUp size={13} /> Up
        </button>
        <input
          className="input flex-1 font-mono text-xs"
          value={path}
          onChange={(e) => setPath(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && load(path)}
          spellCheck={false}
        />
      </div>

      <div className="max-h-[320px] overflow-auto rounded-lg border border-border">
        {loading ? (
          <div className="flex items-center gap-2 p-6 text-sm text-zinc-500"><Spinner /> Listing…</div>
        ) : entries.length === 0 ? (
          <div className="p-6 text-center text-sm text-zinc-600">Empty folder.</div>
        ) : (
          <ul className="divide-y divide-border">
            {entries.map((e) => (
              <li key={e.name} className="group flex items-center gap-3 px-3 py-2 hover:bg-surface-3">
                <button className="flex min-w-0 flex-1 items-center gap-2.5 text-left" onClick={() => enter(e)} disabled={!e.isDir && !e.isLink}>
                  {e.isDir ? (
                    <Folder size={15} className="shrink-0 text-info" />
                  ) : e.isLink ? (
                    <FolderSymlink size={15} className="shrink-0 text-zinc-400" />
                  ) : (
                    <FileText size={15} className="shrink-0 text-zinc-500" />
                  )}
                  <span className="truncate text-sm text-zinc-200">{e.name}</span>
                </button>
                <span className="shrink-0 text-xs text-zinc-600">{e.isDir ? '' : formatBytes(e.size)}</span>
                <button
                  onClick={() => pull(e)}
                  className="shrink-0 rounded-md p-1.5 text-zinc-500 opacity-0 transition-opacity hover:bg-surface-4 hover:text-brand group-hover:opacity-100"
                  title="Pull to PC"
                >
                  <Download size={14} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  )
}
