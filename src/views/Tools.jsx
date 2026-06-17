import React, { useState } from 'react'
import { Wrench, Zap, Smartphone } from 'lucide-react'
import { useDevice } from '../state/DeviceContext.jsx'
import { classNames } from '../lib/format.js'
import AppManager from './tools/AppManager.jsx'
import FileManager from './tools/FileManager.jsx'
import Logcat from './tools/Logcat.jsx'
import FastbootTools from './tools/FastbootTools.jsx'
import Sideload from './tools/Sideload.jsx'
import DSU from './tools/DSU.jsx'

export default function Tools() {
  const { selected } = useDevice()
  const isFastboot = selected?.mode === 'fastboot' || selected?.mode === 'fastbootd'
  const isSideload = selected?.mode === 'sideload'

  // Default sub-tab depends on the connection mode.
  const [tab, setTab] = useState(isSideload ? 'sideload' : isFastboot ? 'fastboot' : 'adb')

  return (
    <div className="animate-fade-in space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-xl font-semibold text-zinc-100">ADB / Fastboot Tools</h1>
          <p className="mt-0.5 text-sm text-zinc-500">Common device operations as single-click actions</p>
        </div>
        {!isSideload && <SubTabs tab={tab} setTab={setTab} />}
      </div>

      {isSideload ? (
        // In sideload mode only the OTA sideloader is meaningful.
        <Sideload device={selected} />
      ) : tab === 'adb' ? (
        isFastboot ? (
          <ModeNotice
            icon={Smartphone}
            text="The selected device is in Fastboot mode. ADB tools (apps, files, logcat) need the device booted into Android or recovery."
          />
        ) : (
          <div className="space-y-6">
            <AppManager device={selected} />
            <FileManager device={selected} />
            <Logcat device={selected} />
            <DSU device={selected} />
          </div>
        )
      ) : (
        <FastbootTools device={selected} isFastboot={isFastboot} />
      )}
    </div>
  )
}

function SubTabs({ tab, setTab }) {
  const tabs = [
    { id: 'adb', label: 'ADB Common', icon: Wrench },
    { id: 'fastboot', label: 'Fastboot Common', icon: Zap },
  ]
  return (
    <div className="flex rounded-lg border border-border bg-surface-2 p-1">
      {tabs.map((t) => {
        const Icon = t.icon
        const active = tab === t.id
        return (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={classNames(
              'flex items-center gap-2 rounded-md px-3.5 py-1.5 text-sm font-medium transition-all',
              active ? 'bg-surface-4 text-white' : 'text-zinc-400 hover:text-zinc-200'
            )}
          >
            <Icon size={14} className={active ? 'text-brand' : ''} /> {t.label}
          </button>
        )
      })}
    </div>
  )
}

function ModeNotice({ icon: Icon, text }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-warn/20 bg-warn/5 px-4 py-4 text-sm text-warn">
      <Icon size={18} className="mt-0.5 shrink-0" />
      <p className="leading-relaxed">{text}</p>
    </div>
  )
}
