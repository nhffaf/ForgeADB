import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  TerminalSquare, CornerDownLeft, Trash2, Zap, Smartphone, Monitor, ChevronRight, Copy, Sparkles,
} from 'lucide-react'
import { useDevice } from '../state/DeviceContext.jsx'
import { useToast } from '../state/ToastContext.jsx'
import { classNames } from '../lib/format.js'
import api from '../lib/api.js'

const CONTEXTS = [
  { id: 'host', label: 'Host', icon: Monitor, prompt: 'PS>', hint: 'Runs adb/fastboot on your PC' },
  { id: 'adb', label: 'adb', icon: Smartphone, prompt: 'adb>', hint: 'adb -s <serial> …' },
  { id: 'adb-shell', label: 'adb shell', icon: ChevronRight, prompt: 'shell$', hint: 'Runs inside the device shell' },
  { id: 'fastboot', label: 'fastboot', icon: Zap, prompt: 'fastboot>', hint: 'fastboot -s <serial> …' },
]

// Autocomplete dictionaries per context.
const COMPLETIONS = {
  host: ['adb devices -l', 'adb kill-server', 'adb start-server', 'adb reboot', 'fastboot devices', 'adb get-state', 'adb usb', 'adb tcpip 5555'],
  adb: ['devices -l', 'reboot', 'reboot recovery', 'reboot bootloader', 'reboot fastboot', 'install -r app.apk', 'logcat -d', 'bugreport', 'get-state', 'shell'],
  'adb-shell': [
    'getprop', 'getprop ro.build.version.release', 'pm list packages -3', 'pm list packages -s',
    'dumpsys battery', 'settings put global window_animation_scale 0', 'wm size', 'wm density',
    'cat /proc/partitions', 'ls -la /dev/block/by-name', 'su -c id', 'screencap -p /sdcard/s.png',
    'setprop persist.sys.usb.config mtp', 'input keyevent 26',
  ],
  fastboot: [
    'devices', 'getvar all', 'getvar product', 'getvar current-slot', 'getvar unlocked',
    'flashing unlock', 'flashing lock', 'flash boot boot.img', 'boot boot.img', 'erase cache',
    'reboot', 'reboot bootloader', 'reboot fastboot', '--set-active=a', '--set-active=b',
    '--disable-verity --disable-verification flash vbmeta vbmeta.img', 'set_active a',
  ],
}

const SNIPPETS = [
  { group: 'Info', items: [
    { ctx: 'host', cmd: 'adb devices -l', desc: 'List devices' },
    { ctx: 'adb-shell', cmd: 'getprop ro.product.model', desc: 'Device model' },
    { ctx: 'fastboot', cmd: 'getvar all', desc: 'All bootloader vars' },
    { ctx: 'fastboot', cmd: 'getvar current-slot', desc: 'Active slot' },
  ]},
  { group: 'Reboots', items: [
    { ctx: 'adb', cmd: 'reboot bootloader', desc: 'To fastboot' },
    { ctx: 'adb', cmd: 'reboot fastboot', desc: 'To fastbootd' },
    { ctx: 'fastboot', cmd: 'reboot', desc: 'Reboot system' },
  ]},
  { group: 'Tweaks', items: [
    { ctx: 'adb-shell', cmd: 'settings put global window_animation_scale 0.5', desc: 'Faster animations' },
    { ctx: 'adb-shell', cmd: 'wm size', desc: 'Show resolution' },
    { ctx: 'adb-shell', cmd: 'dumpsys battery', desc: 'Battery details' },
  ]},
  { group: 'Flashing', items: [
    { ctx: 'fastboot', cmd: '--disable-verity --disable-verification flash vbmeta vbmeta.img', desc: 'Patch vbmeta' },
    { ctx: 'fastboot', cmd: 'flash boot boot.img', desc: 'Flash boot' },
    { ctx: 'fastboot', cmd: 'set_active a', desc: 'Set slot A' },
  ]},
]

let lineSeq = 0

export default function Terminal() {
  const { selected } = useDevice()
  const toast = useToast()
  const [ctx, setCtx] = useState('host')
  const [input, setInput] = useState('')
  const [log, setLog] = useState([])
  const [history, setHistory] = useState([])
  const [histIdx, setHistIdx] = useState(-1)
  const [running, setRunning] = useState(false)
  const [showSuggest, setShowSuggest] = useState(false)
  const [suggestIdx, setSuggestIdx] = useState(0)
  const scrollRef = useRef(null)
  const inputRef = useRef(null)

  const ctxMeta = CONTEXTS.find((c) => c.id === ctx)

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [log])

  const suggestions = useMemo(() => {
    const pool = COMPLETIONS[ctx] || []
    if (!input.trim()) return []
    return pool.filter((c) => c.toLowerCase().startsWith(input.toLowerCase()) && c.toLowerCase() !== input.toLowerCase()).slice(0, 6)
  }, [ctx, input])

  const append = (entry) => setLog((l) => [...l, { id: ++lineSeq, ...entry }])

  const run = async (raw) => {
    const command = (raw ?? input).trim()
    if (!command) return
    if (ctx !== 'host' && !selected) {
      toast.error('No device selected')
      return
    }
    setHistory((h) => [...h.filter((x) => x !== command), command])
    setHistIdx(-1)
    append({ type: 'cmd', ctx, text: command, prompt: ctxMeta.prompt })
    setInput('')
    setShowSuggest(false)
    setRunning(true)

    const res = await api.runCommand({ serial: selected?.serial, context: ctx, command })
    setRunning(false)

    const out = (res.stdout || '').replace(/\s+$/, '')
    const err = (res.stderr || '').replace(/\s+$/, '')
    if (out) append({ type: 'out', text: out })
    if (err) append({ type: err && !res.ok ? 'err' : 'out', text: err })
    if (!out && !err) append({ type: 'muted', text: res.ok ? '(no output)' : `exited with code ${res.code}` })
  }

  const onKeyDown = (e) => {
    if (showSuggest && suggestions.length) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setSuggestIdx((i) => (i + 1) % suggestions.length); return }
      if (e.key === 'ArrowUp') { e.preventDefault(); setSuggestIdx((i) => (i - 1 + suggestions.length) % suggestions.length); return }
      if (e.key === 'Tab' || (e.key === 'Enter' && suggestions[suggestIdx] && input !== suggestions[suggestIdx])) {
        if (e.key === 'Tab') {
          e.preventDefault()
          setInput(suggestions[suggestIdx])
          return
        }
      }
      if (e.key === 'Escape') { setShowSuggest(false); return }
    }
    if (e.key === 'Enter') {
      e.preventDefault()
      run()
      return
    }
    if (e.key === 'ArrowUp' && !showSuggest) {
      e.preventDefault()
      const next = Math.min(histIdx + 1, history.length - 1)
      if (history.length) { setHistIdx(next); setInput(history[history.length - 1 - next] || '') }
    }
    if (e.key === 'ArrowDown' && !showSuggest) {
      e.preventDefault()
      const next = Math.max(histIdx - 1, -1)
      setHistIdx(next)
      setInput(next === -1 ? '' : history[history.length - 1 - next] || '')
    }
  }

  const useSnippet = (s) => {
    setCtx(s.ctx)
    setInput(s.cmd)
    inputRef.current?.focus()
  }

  const copyOutput = () => {
    const text = log.map((l) => (l.type === 'cmd' ? `${l.prompt} ${l.text}` : l.text)).join('\n')
    navigator.clipboard?.writeText(text)
    toast.success('Copied terminal output')
  }

  return (
    <div className="animate-fade-in space-y-4">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-xl font-semibold text-zinc-100">Terminal</h1>
          <p className="mt-0.5 text-sm text-zinc-500">{ctxMeta.hint}</p>
        </div>
        <div className="flex gap-2">
          <button className="btn-surface" onClick={copyOutput} disabled={!log.length}><Copy size={14} /> Copy</button>
          <button className="btn-surface" onClick={() => setLog([])} disabled={!log.length}><Trash2 size={14} /> Clear</button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_260px]">
        {/* Terminal */}
        <div className="card flex min-h-[560px] flex-col overflow-hidden p-0">
          {/* Context switch */}
          <div className="flex items-center gap-1 border-b border-border bg-surface-1 px-3 py-2">
            {CONTEXTS.map((c) => {
              const Icon = c.icon
              const active = ctx === c.id
              const disabled = c.id !== 'host' && !selected
              return (
                <button
                  key={c.id}
                  onClick={() => setCtx(c.id)}
                  disabled={disabled}
                  className={classNames(
                    'flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-all disabled:opacity-30',
                    active ? 'bg-surface-4 text-white' : 'text-zinc-400 hover:text-zinc-200'
                  )}
                >
                  <Icon size={13} className={active ? 'text-brand' : ''} /> {c.label}
                </button>
              )
            })}
            <span className="ml-auto font-mono text-[10px] text-zinc-600">
              {selected ? selected.serial : 'no device'}
            </span>
          </div>

          {/* Output */}
          <div ref={scrollRef} className="flex-1 overflow-auto bg-black/40 p-4 font-mono text-[12px] leading-relaxed">
            {log.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 text-zinc-700">
                <TerminalSquare size={28} />
                <p className="text-xs">Type a command or pick a snippet. Use Tab to autocomplete, ↑/↓ for history.</p>
              </div>
            ) : (
              log.map((l) => <LogLine key={l.id} line={l} />)
            )}
            {running && <div className="mt-1 animate-pulse-soft text-brand">▌ running…</div>}
          </div>

          {/* Input */}
          <div className="relative border-t border-border bg-surface-1 px-3 py-2.5">
            {showSuggest && suggestions.length > 0 && (
              <div className="absolute bottom-full left-3 mb-1 w-[min(520px,90%)] overflow-hidden rounded-lg border border-border bg-surface-3 shadow-card">
                {suggestions.map((s, i) => (
                  <button
                    key={s}
                    onMouseDown={(e) => { e.preventDefault(); setInput(s); setShowSuggest(false); inputRef.current?.focus() }}
                    className={classNames(
                      'flex w-full items-center gap-2 px-3 py-1.5 text-left font-mono text-xs',
                      i === suggestIdx ? 'bg-surface-4 text-white' : 'text-zinc-400 hover:bg-surface-2'
                    )}
                  >
                    <Sparkles size={12} className="text-brand/70" /> {s}
                  </button>
                ))}
              </div>
            )}
            <div className="flex items-center gap-2">
              <span className="shrink-0 font-mono text-xs font-semibold text-brand">{ctxMeta.prompt}</span>
              <input
                ref={inputRef}
                value={input}
                onChange={(e) => { setInput(e.target.value); setShowSuggest(true); setSuggestIdx(0) }}
                onKeyDown={onKeyDown}
                onFocus={() => setShowSuggest(true)}
                onBlur={() => setTimeout(() => setShowSuggest(false), 120)}
                placeholder={ctx === 'host' ? 'adb devices -l' : ctx === 'fastboot' ? 'getvar all' : 'enter command'}
                spellCheck={false}
                autoComplete="off"
                className="flex-1 bg-transparent font-mono text-xs text-zinc-100 placeholder:text-zinc-700 focus:outline-none"
              />
              <button className="btn-brand !px-2.5 !py-1.5" onClick={() => run()} disabled={running || !input.trim()}>
                <CornerDownLeft size={14} />
              </button>
            </div>
          </div>
        </div>

        {/* Snippets */}
        <div className="card max-h-[560px] overflow-auto p-3">
          <div className="mb-2 flex items-center gap-2 px-1 text-sm font-semibold text-zinc-200">
            <Sparkles size={15} className="text-brand" /> Snippets
          </div>
          <div className="space-y-3">
            {SNIPPETS.map((group) => (
              <div key={group.group}>
                <div className="label px-1 py-1">{group.group}</div>
                <div className="space-y-1">
                  {group.items.map((s) => {
                    const cm = CONTEXTS.find((c) => c.id === s.ctx)
                    return (
                      <button
                        key={s.cmd}
                        onClick={() => useSnippet(s)}
                        className="group w-full rounded-lg border border-border bg-surface-1 px-2.5 py-2 text-left transition-all hover:border-border-strong hover:bg-surface-3"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate text-xs font-medium text-zinc-200">{s.desc}</span>
                          <span className="chip bg-surface-2 text-[9px] text-zinc-500">{cm?.label}</span>
                        </div>
                        <div className="mt-0.5 truncate font-mono text-[10px] text-zinc-600" title={s.cmd}>{s.cmd}</div>
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function LogLine({ line }) {
  if (line.type === 'cmd') {
    return (
      <div className="mt-2 flex items-start gap-2">
        <span className="shrink-0 font-semibold text-brand">{line.prompt}</span>
        <span className="break-all text-zinc-100">{line.text}</span>
      </div>
    )
  }
  const cls = {
    out: 'text-zinc-300',
    err: 'text-danger',
    muted: 'text-zinc-600 italic',
  }[line.type] || 'text-zinc-300'
  return <pre className={classNames('whitespace-pre-wrap break-all', cls)}>{line.text}</pre>
}
