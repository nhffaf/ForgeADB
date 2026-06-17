import React, { useEffect, useMemo, useState } from 'react'
import {
  Package, Search, UploadCloud, Trash2, Ban, CheckCircle2, Eraser, RefreshCw, FileDown,
} from 'lucide-react'
import { useToast } from '../../state/ToastContext.jsx'
import { useConfirm } from '../../state/ConfirmContext.jsx'
import { Card, Spinner, Tooltip } from '../../components/ui.jsx'
import { classNames } from '../../lib/format.js'
import api from '../../lib/api.js'

const SCOPES = [
  { id: 'third', label: 'User' },
  { id: 'system', label: 'System' },
  { id: 'disabled', label: 'Disabled' },
  { id: 'all', label: 'All' },
]

export default function AppManager({ device }) {
  const toast = useToast()
  const confirm = useConfirm()
  const [scope, setScope] = useState('third')
  const [packages, setPackages] = useState([])
  const [loading, setLoading] = useState(false)
  const [query, setQuery] = useState('')
  const [busyPkg, setBusyPkg] = useState(null)
  const [installing, setInstalling] = useState(false)
  const [dragOver, setDragOver] = useState(false)

  const load = async () => {
    if (!device) return
    setLoading(true)
    const res = await api.listPackages({ serial: device.serial, scope })
    setLoading(false)
    if (res.ok) setPackages(res.packages)
    else toast.error('Failed to list packages', { message: res.error })
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [device?.serial, scope])

  const filtered = useMemo(
    () => packages.filter((p) => p.toLowerCase().includes(query.toLowerCase())),
    [packages, query]
  )

  const installFrom = async (filePath) => {
    if (!filePath) return
    setInstalling(true)
    const res = await api.installApk({ serial: device.serial, filePath, reinstall: true, grant: true })
    setInstalling(false)
    toast.fromResult(res, { successTitle: 'APK installed', errorTitle: 'Install failed' })
    if (res.ok) load()
  }

  const pickApk = async () => {
    const file = await api.openFile({ title: 'Select APK', filters: [{ name: 'Android Package', extensions: ['apk', 'apkm', 'apks'] }] })
    if (file) installFrom(file)
  }

  const onDrop = (e) => {
    e.preventDefault()
    setDragOver(false)
    const f = e.dataTransfer.files?.[0]
    if (f && f.path) installFrom(f.path)
    else if (f) toast.error('Could not read dropped file path')
  }

  const act = async (pkg, action, opts = {}) => {
    if (opts.confirm) {
      const ok = await confirm(opts.confirm)
      if (!ok) return
    }
    setBusyPkg(pkg + action)
    const res = await api.packageAction({ serial: device.serial, pkg, action })
    setBusyPkg(null)
    toast.fromResult(res, { successTitle: opts.success || 'Done', errorTitle: 'Action failed' })
    if (res.ok) load()
  }

  return (
    <Card
      title="App Management"
      subtitle="Install, uninstall, disable & enable packages"
      icon={Package}
      actions={
        <button className="btn-surface" onClick={load} disabled={loading}>
          {loading ? <Spinner size={14} /> : <RefreshCw size={14} />} Refresh
        </button>
      }
    >
      {/* Install dropzone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        className={classNames(
          'mb-4 flex items-center justify-between gap-4 rounded-xl border border-dashed px-4 py-4 transition-all',
          dragOver ? 'border-brand bg-brand/5' : 'border-border bg-surface-1'
        )}
      >
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-surface-4 text-brand">
            {installing ? <Spinner size={18} /> : <UploadCloud size={18} />}
          </span>
          <div>
            <div className="text-sm font-medium text-zinc-100">{installing ? 'Installing APK…' : 'Drag & drop an APK to install'}</div>
            <div className="text-xs text-zinc-500">or click to browse — installs with -r -g</div>
          </div>
        </div>
        <button className="btn-brand" onClick={pickApk} disabled={installing}>
          <FileDown size={15} /> Select APK
        </button>
      </div>

      {/* Controls */}
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <div className="relative min-w-[220px] flex-1">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600" />
          <input className="input pl-9" placeholder="Search packages…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <div className="flex rounded-lg border border-border bg-surface-2 p-1">
          {SCOPES.map((s) => (
            <button
              key={s.id}
              onClick={() => setScope(s.id)}
              className={classNames(
                'rounded-md px-2.5 py-1 text-xs font-medium transition-all',
                scope === s.id ? 'bg-surface-4 text-white' : 'text-zinc-400 hover:text-zinc-200'
              )}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* Package list */}
      <div className="max-h-[360px] overflow-auto rounded-lg border border-border">
        {loading ? (
          <div className="flex items-center gap-2 p-6 text-sm text-zinc-500"><Spinner /> Loading packages…</div>
        ) : filtered.length === 0 ? (
          <div className="p-6 text-center text-sm text-zinc-600">No packages found.</div>
        ) : (
          <ul className="divide-y divide-border">
            {filtered.map((pkg) => (
              <li key={pkg} className="flex items-center gap-2 px-3 py-2 hover:bg-surface-3">
                <Package size={14} className="shrink-0 text-zinc-600" />
                <span className="flex-1 truncate font-mono text-xs text-zinc-200" title={pkg}>{pkg}</span>
                <div className="flex shrink-0 items-center gap-1">
                  <PkgAction
                    icon={Ban} label="Disable" tone="warn" busy={busyPkg === pkg + 'disable'}
                    onClick={() => act(pkg, 'disable', { success: 'Disabled' })}
                  />
                  <PkgAction
                    icon={CheckCircle2} label="Enable" tone="brand" busy={busyPkg === pkg + 'enable'}
                    onClick={() => act(pkg, 'enable', { success: 'Enabled' })}
                  />
                  <PkgAction
                    icon={Eraser} label="Clear data" tone="surface" busy={busyPkg === pkg + 'clear'}
                    onClick={() => act(pkg, 'clear', {
                      success: 'Data cleared',
                      confirm: { title: 'Clear app data?', message: `All data for ${pkg} will be deleted.`, confirmLabel: 'Clear data' },
                    })}
                  />
                  <PkgAction
                    icon={Trash2} label="Uninstall" tone="danger" busy={busyPkg === pkg + 'uninstall'}
                    onClick={() => act(pkg, 'uninstall', {
                      success: 'Uninstalled',
                      confirm: { title: 'Uninstall package?', message: `${pkg} will be removed from the device.`, confirmLabel: 'Uninstall', danger: true },
                    })}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="mt-2 text-right text-[11px] text-zinc-600">{filtered.length} package{filtered.length === 1 ? '' : 's'}</div>
    </Card>
  )
}

function PkgAction({ icon: Icon, label, tone, busy, onClick }) {
  const cls = {
    brand: 'hover:bg-brand/10 hover:text-brand',
    warn: 'hover:bg-warn/10 hover:text-warn',
    danger: 'hover:bg-danger/10 hover:text-danger',
    surface: 'hover:bg-surface-4 hover:text-zinc-100',
  }[tone]
  return (
    <Tooltip label={label}>
      <button
        onClick={onClick}
        disabled={busy}
        className={classNames('grid h-7 w-7 place-items-center rounded-md text-zinc-500 transition-colors', cls)}
      >
        {busy ? <Spinner size={13} /> : <Icon size={14} />}
      </button>
    </Tooltip>
  )
}
