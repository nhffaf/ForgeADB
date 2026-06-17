import React, { useEffect, useMemo, useRef, useState } from 'react'
import { ScrollText, Play, Pause, Trash2, Filter, Square, ArrowDownToLine } from 'lucide-react'
import { useToast } from '../../state/ToastContext.jsx'
import { Card, Spinner } from '../../components/ui.jsx'
import { classNames } from '../../lib/format.js'
import api from '../../lib/api.js'

const MAX_LINES = 5000

// Colour a logcat line by its priority letter (threadtime format).
function levelClass(line) {
  const m = /\s([VDIWEF])\s/.exec(line.slice(0, 40))
  switch (m?.[1]) {
    case 'E':
    case 'F':
      return 'text-danger'
    case 'W':
      return 'text-warn'
    case 'I':
      return 'text-brand/90'
    case 'D':
      return 'text-info/80'
    default:
      return 'text-zinc-400'
  }
}

export default function Logcat({ device }) {
  const toast = useToast()
  const [running, setRunning] = useState(false)
  const [paused, setPaused] = useState(false)
  const [lines, setLines] = useState([])
  const [filter, setFilter] = useState('')
  const [autoscroll, setAutoscroll] = useState(true)
  const streamId = useRef(null)
  const bufferRef = useRef([])
  const scrollRef = useRef(null)
  const pausedRef = useRef(false)
  pausedRef.current = paused

  // Wire up the streaming listeners once.
  useEffect(() => {
    const off = api.onLogcatData(({ id, line }) => {
      if (id !== streamId.current) return
      if (pausedRef.current) return
      const newLines = line.split(/\r?\n/).filter(Boolean)
      if (newLines.length === 0) return
      bufferRef.current.push(...newLines)
      if (bufferRef.current.length > MAX_LINES) {
        bufferRef.current = bufferRef.current.slice(-MAX_LINES)
      }
      setLines([...bufferRef.current])
    })
    const offEnd = api.onLogcatEnd(({ id }) => {
      if (id === streamId.current) setRunning(false)
    })
    return () => {
      off?.()
      offEnd?.()
    }
  }, [])

  // Stop the stream when the device changes or component unmounts.
  useEffect(() => {
    return () => {
      if (streamId.current) api.logcatStop({ id: streamId.current })
    }
  }, [])

  useEffect(() => {
    stop()
    setLines([])
    bufferRef.current = []
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [device?.serial])

  useEffect(() => {
    if (autoscroll && scrollRef.current && !paused) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [lines, autoscroll, paused])

  const start = async () => {
    if (!device) return
    const res = await api.logcatStart({ serial: device.serial })
    if (res.ok) {
      streamId.current = res.id
      setRunning(true)
      setPaused(false)
    } else {
      toast.error('Could not start logcat')
    }
  }

  const stop = () => {
    if (streamId.current) {
      api.logcatStop({ id: streamId.current })
      streamId.current = null
    }
    setRunning(false)
  }

  const clear = async () => {
    bufferRef.current = []
    setLines([])
    if (device) await api.logcatClear({ serial: device.serial })
  }

  // Compile the regex filter; invalid patterns fall back to substring match.
  const { re, invalid } = useMemo(() => {
    if (!filter) return { re: null, invalid: false }
    try {
      return { re: new RegExp(filter, 'i'), invalid: false }
    } catch {
      return { re: null, invalid: true }
    }
  }, [filter])

  const visible = useMemo(() => {
    if (!filter) return lines
    if (re) return lines.filter((l) => re.test(l))
    return lines.filter((l) => l.toLowerCase().includes(filter.toLowerCase()))
  }, [lines, filter, re])

  return (
    <Card
      title="Logcat"
      subtitle="Real-time log stream"
      icon={ScrollText}
      actions={
        <div className="flex items-center gap-2">
          {!running ? (
            <button className="btn-brand" onClick={start}>
              <Play size={14} /> Start
            </button>
          ) : (
            <>
              <button className={classNames(paused ? 'btn-warn' : 'btn-surface')} onClick={() => setPaused((p) => !p)}>
                {paused ? <Play size={14} /> : <Pause size={14} />} {paused ? 'Resume' : 'Pause'}
              </button>
              <button className="btn-surface" onClick={stop}>
                <Square size={14} /> Stop
              </button>
            </>
          )}
          <button className="btn-surface !px-2.5" onClick={clear} title="Clear">
            <Trash2 size={14} />
          </button>
        </div>
      }
    >
      <div className="mb-2.5 flex items-center gap-3">
        <div className="relative flex-1">
          <Filter size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600" />
          <input
            className={classNames('input pl-9 font-mono text-xs', invalid && 'border-danger/60')}
            placeholder="Filter by regex (e.g. ActivityManager|ERROR)"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            spellCheck={false}
          />
        </div>
        <label className="flex cursor-pointer select-none items-center gap-1.5 text-xs text-zinc-400">
          <input type="checkbox" checked={autoscroll} onChange={(e) => setAutoscroll(e.target.checked)} className="accent-brand" />
          <ArrowDownToLine size={13} /> Autoscroll
        </label>
      </div>

      <div
        ref={scrollRef}
        className="h-[320px] overflow-auto rounded-lg border border-border bg-black/40 p-3 font-mono text-[11px] leading-relaxed"
      >
        {visible.length === 0 ? (
          <div className="grid h-full place-items-center text-zinc-600">
            {running ? (
              <span className="flex items-center gap-2"><Spinner size={14} /> Waiting for log output…</span>
            ) : (
              'Press Start to stream logcat.'
            )}
          </div>
        ) : (
          visible.map((l, i) => (
            <div key={i} className={classNames('whitespace-pre-wrap break-all', levelClass(l))}>
              {l}
            </div>
          ))
        )}
      </div>
      <div className="mt-2 flex justify-between text-[11px] text-zinc-600">
        <span>{paused ? 'Paused' : running ? 'Streaming…' : 'Stopped'}</span>
        <span>{visible.length} / {lines.length} lines{filter ? ' (filtered)' : ''}</span>
      </div>
    </Card>
  )
}
