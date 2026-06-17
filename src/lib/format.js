// Small formatting helpers shared across views.

export function formatBytes(bytes, decimals = 1) {
  if (bytes === null || bytes === undefined || Number.isNaN(bytes)) return '—'
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  const clamped = Math.min(i, sizes.length - 1)
  return `${parseFloat((bytes / Math.pow(k, clamped)).toFixed(decimals))} ${sizes[clamped]}`
}

export function classNames(...args) {
  return args.filter(Boolean).join(' ')
}

// Connection-mode presentation metadata.
export const MODE_META = {
  adb: { label: 'ADB', color: 'text-brand', dot: 'bg-brand', ring: 'ring-brand/40' },
  recovery: { label: 'Recovery', color: 'text-info', dot: 'bg-info', ring: 'ring-info/40' },
  sideload: { label: 'Sideload', color: 'text-info', dot: 'bg-info', ring: 'ring-info/40' },
  fastboot: { label: 'Fastboot', color: 'text-warn', dot: 'bg-warn', ring: 'ring-warn/40' },
  fastbootd: { label: 'Fastbootd', color: 'text-warn', dot: 'bg-warn', ring: 'ring-warn/40' },
  unauthorized: { label: 'Unauthorized', color: 'text-danger', dot: 'bg-danger', ring: 'ring-danger/40' },
  offline: { label: 'Offline', color: 'text-zinc-500', dot: 'bg-zinc-500', ring: 'ring-zinc-500/40' },
}

export function modeMeta(mode) {
  return MODE_META[mode] || { label: mode || 'Unknown', color: 'text-zinc-400', dot: 'bg-zinc-500', ring: 'ring-zinc-500/40' }
}

// Turn a raw CLI result into a short human summary for toasts.
export function resultSummary(res, fallbackOk = 'Done', fallbackErr = 'Command failed') {
  if (!res) return { ok: false, message: fallbackErr }
  const ok = res.ok ?? res.code === 0
  const text = (res.stderr || res.stdout || '').trim()
  const firstLine = text.split(/\r?\n/).find((l) => l.trim()) || ''
  return { ok, message: firstLine || (ok ? fallbackOk : fallbackErr) }
}
