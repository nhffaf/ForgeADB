import React from 'react'
import { LayoutDashboard, Wrench, HardDrive, TerminalSquare, Lock, Github, ExternalLink } from 'lucide-react'
import { classNames } from '../lib/format.js'
import appIcon from '../assets/app-icon.png'

const NAV = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, hint: 'Device info & quick actions' },
  { id: 'tools', label: 'ADB / Fastboot', icon: Wrench, hint: 'Apps, files, logcat, flashing' },
  { id: 'partitions', label: 'Partitions', icon: HardDrive, hint: 'Visual partition manager' },
  { id: 'terminal', label: 'Terminal', icon: TerminalSquare, hint: 'Interactive command console' },
]

export default function Sidebar({ active, onChange, disabledTabs }) {
  const disabled = disabledTabs || new Set()
  return (
    <aside className="flex w-[230px] shrink-0 flex-col border-r border-border bg-surface-1">
      <div className="drag flex items-center gap-2.5 px-5 pb-4 pt-5">
        <div className="grid h-9 w-9 place-items-center overflow-hidden rounded-xl bg-surface-3 shadow-glow ring-1 ring-border">
          <img src={appIcon} alt="ForgeADB" className="h-full w-full object-cover" />
        </div>
        <div className="leading-tight">
          <div className="text-sm font-semibold text-zinc-100">ForgeADB</div>
          <div className="text-[10px] uppercase tracking-widest text-zinc-600">Android Toolkit</div>
        </div>
      </div>

      <nav className="no-drag flex flex-1 flex-col gap-1 px-3 py-2">
        {NAV.map((item) => {
          const Icon = item.icon
          const isActive = active === item.id
          const isDisabled = disabled.has(item.id)
          return (
            <button
              key={item.id}
              onClick={() => !isDisabled && onChange(item.id)}
              disabled={isDisabled}
              title={isDisabled ? `${item.label} — unavailable in this mode` : item.hint}
              className={classNames(
                'group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-all',
                isDisabled
                  ? 'cursor-not-allowed text-zinc-700'
                  : isActive
                    ? 'bg-surface-3 text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)]'
                    : 'text-zinc-400 hover:bg-surface-2 hover:text-zinc-100'
              )}
            >
              <Icon
                size={17}
                className={classNames(
                  'shrink-0 transition-colors',
                  isDisabled ? 'text-zinc-700' : isActive ? 'text-brand' : 'text-zinc-500 group-hover:text-zinc-300'
                )}
              />
              <span className="truncate">{item.label}</span>
              {isDisabled ? (
                <Lock size={13} className="ml-auto text-zinc-700" />
              ) : (
                isActive && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-brand" />
              )}
            </button>
          )
        })}
      </nav>

      <div className="space-y-3 border-t border-border px-5 py-3.5">
        <p className="text-[10px] leading-relaxed text-zinc-600">
          Single-click actions for adb &amp; fastboot. Dangerous operations are guarded.
        </p>
        <a
          href="https://github.com/nhffaf"
          target="_blank"
          rel="noreferrer"
          className="group flex items-center gap-2.5 rounded-lg border border-border bg-surface-2 px-3 py-2 transition-all hover:border-brand/40 hover:bg-surface-3"
        >
          <Github size={15} className="text-zinc-500 transition-colors group-hover:text-brand" />
          <span className="leading-tight">
            <span className="block text-[10px] uppercase tracking-wider text-zinc-600">Developed by</span>
            <span className="block text-xs font-semibold text-zinc-200 group-hover:text-white">nhffaf</span>
          </span>
          <ExternalLink size={12} className="ml-auto text-zinc-700 transition-colors group-hover:text-brand" />
        </a>
      </div>
    </aside>
  )
}

export { NAV }
