import React, { useState, useEffect, useMemo } from 'react'
import Sidebar from './components/Sidebar.jsx'
import StatusBar from './components/StatusBar.jsx'
import Dashboard from './views/Dashboard.jsx'
import Tools from './views/Tools.jsx'
import PartitionManager from './views/PartitionManager.jsx'
import Terminal from './views/Terminal.jsx'
import { useDevice } from './state/DeviceContext.jsx'
import { EmptyState } from './components/ui.jsx'
import { Smartphone } from 'lucide-react'
import { isElectron } from './lib/api.js'

const VIEWS = {
  dashboard: Dashboard,
  tools: Tools,
  partitions: PartitionManager,
  terminal: Terminal,
}

// Views that genuinely need a connected device to be useful.
const NEEDS_DEVICE = new Set(['dashboard', 'tools', 'partitions'])

export default function App() {
  const [active, setActive] = useState('dashboard')
  const { selected, scanning } = useDevice()

  // In sideload mode the device can only receive an OTA — partition tooling is
  // meaningless and would error, so we lock that tab. (App/File/Logcat live
  // inside Tools and are gated there so the Sideload panel can still show.)
  const isSideload = selected?.mode === 'sideload'
  const disabledTabs = useMemo(() => (isSideload ? new Set(['partitions']) : new Set()), [isSideload])

  // If the active tab becomes disabled (device entered sideload), bounce to Tools.
  useEffect(() => {
    if (disabledTabs.has(active)) setActive('tools')
  }, [disabledTabs, active])

  const View = VIEWS[active] || Dashboard
  const gated = NEEDS_DEVICE.has(active) && !selected

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-surface-0">
      <Sidebar active={active} onChange={setActive} disabledTabs={disabledTabs} />
      <div className="flex min-w-0 flex-1 flex-col">
        <StatusBar />
        <main className="min-h-0 flex-1 overflow-auto">
          {!isElectron && (
            <div className="border-b border-warn/20 bg-warn/10 px-6 py-2 text-center text-xs text-warn">
              Preview mode — running outside Electron with mock data. Build the app to control real devices.
            </div>
          )}
          {isSideload && (
            <div className="border-b border-info/20 bg-info/10 px-6 py-2 text-center text-xs text-info">
              Device is in <b>Sideload</b> mode — only OTA sideloading is available. Other tools are locked.
            </div>
          )}
          <div className="mx-auto max-w-[1200px] px-6 py-6">
            {gated ? (
              <EmptyState
                icon={Smartphone}
                title={scanning ? 'Scanning for devices…' : 'No device connected'}
                message={
                  scanning
                    ? 'Looking for adb and fastboot devices over USB.'
                    : 'Connect an Android device via USB and enable USB debugging. Devices in Fastboot or Recovery mode are detected automatically.'
                }
              />
            ) : (
              <View />
            )}
          </div>
        </main>
      </div>
    </div>
  )
}
