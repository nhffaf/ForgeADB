// Thin wrapper around the preload bridge (window.adb).
//
// When the app is opened in a plain browser (no Electron preload), we fall back
// to a small mock so the UI still renders and is explorable during development.

const hasBridge = typeof window !== 'undefined' && !!window.adb

export const isElectron = hasBridge

const mockDevices = [
  {
    serial: 'EMULATOR-DEMO1',
    state: 'device',
    mode: 'adb',
    model: 'Pixel 8 Pro',
    product: 'husky',
    device: 'husky',
    transportId: '1',
  },
]

const mock = {
  listDevices: async () => mockDevices,
  getDeviceInfo: async (d) => ({
    mode: 'adb',
    serial: d?.serial || 'EMULATOR-DEMO1',
    codename: 'husky',
    marketingName: 'Pixel 8 Pro',
    manufacturer: 'Google',
    androidVersion: '14',
    sdk: '34',
    securityPatch: '2024-05-05',
    buildId: 'AP1A.240505.005',
    cpuArch: 'arm64-v8a',
    bootloaderState: 'Unlocked',
    currentSlot: 'a',
    battery: { level: 86, status: 'Charging', temperature: '29.5', plugged: 'USB', health: 'Good' },
    raw: {},
  }),
  reboot: async () => ({ ok: true, stdout: '', stderr: '' }),
  screenshot: async () => ({ ok: false, error: 'Screenshots require a real device.' }),
  listPackages: async () => ({
    ok: true,
    packages: ['com.android.chrome', 'com.google.android.youtube', 'com.spotify.music', 'com.whatsapp'],
  }),
  packageAction: async () => ({ ok: true, stdout: 'Success' }),
  installApk: async () => ({ ok: true, stdout: 'Success' }),
  listFiles: async () => ({ ok: true, path: '/sdcard/', entries: [
    { name: 'DCIM', isDir: true, size: null },
    { name: 'Download', isDir: true, size: null },
    { name: 'sample.txt', isDir: false, size: 1024 },
  ] }),
  pullFile: async () => ({ ok: true }),
  pushFile: async () => ({ ok: true }),
  runCommand: async ({ command }) => ({ ok: true, stdout: `(mock) ran: ${command}\n`, stderr: '', code: 0 }),
  fastbootFlash: async () => ({ ok: true, stdout: 'OKAY' }),
  fastbootErase: async () => ({ ok: true, stdout: 'OKAY' }),
  fastbootBoot: async () => ({ ok: true, stdout: 'OKAY' }),
  fastbootWipe: async () => ({ ok: true, stdout: 'OKAY' }),
  fastbootLock: async () => ({ ok: true, stdout: 'OKAY' }),
  fastbootCommand: async () => ({ ok: true, stdout: 'OKAY' }),
  resizeLogical: async () => ({ ok: true }),
  deleteLogical: async () => ({ ok: true }),
  createLogical: async () => ({ ok: true }),
  listPartitions: async () => ({
    ok: true,
    source: 'mock',
    partitions: [
      { name: 'boot_a', base: 'boot', size: 100663296, logical: false, type: 'raw' },
      { name: 'init_boot_a', base: 'init_boot', size: 8388608, logical: false, type: 'raw' },
      { name: 'dtbo_a', base: 'dtbo', size: 25165824, logical: false, type: 'raw' },
      { name: 'vbmeta_a', base: 'vbmeta', size: 65536, logical: false, type: 'raw' },
      { name: 'recovery_a', base: 'recovery', size: 100663296, logical: false, type: 'raw' },
      { name: 'super', base: 'super', size: 9663676416, logical: false, type: 'raw' },
      { name: 'system_a', base: 'system', size: 3221225472, logical: true, type: 'ext4' },
      { name: 'system_ext_a', base: 'system_ext', size: 536870912, logical: true, type: 'ext4' },
      { name: 'vendor_a', base: 'vendor', size: 1073741824, logical: true, type: 'ext4' },
      { name: 'product_a', base: 'product', size: 2147483648, logical: true, type: 'ext4' },
      { name: 'userdata', base: 'userdata', size: 53687091200, logical: false, type: 'f2fs' },
    ],
  }),
  dumpPartition: async () => ({ ok: true }),
  openFile: async () => null,
  openDir: async () => null,
  saveFile: async () => null,
  logcatStart: async () => ({ ok: true, id: 1 }),
  logcatStop: async () => ({ ok: true }),
  logcatClear: async () => ({ ok: true }),
  onLogcatData: () => () => {},
  onLogcatEnd: () => () => {},
  // Sideload — simulate a progress ramp so the bar is demoable in preview mode.
  sideloadStart: async () => {
    let pct = 0
    const tick = () => {
      pct += Math.random() * 18
      const p = Math.min(100, Math.round(pct))
      mockEmit('sideload:progress', { id: 1, percent: p })
      mockEmit('sideload:log', { id: 1, line: `serving: 'ota.zip'  (~${p}%)` })
      if (p < 100) setTimeout(tick, 350)
      else mockEmit('sideload:end', { id: 1, code: 0, ok: true })
    }
    setTimeout(tick, 300)
    return { ok: true, id: 1 }
  },
  sideloadCancel: async () => ({ ok: true }),
  onSideloadProgress: (cb) => mockOn('sideload:progress', cb),
  onSideloadLog: (cb) => mockOn('sideload:log', cb),
  onSideloadEnd: (cb) => mockOn('sideload:end', cb),
  dsuCheck: async () => ({ ok: true, abUpdate: 'true', dynamicPartitions: 'true', sdk: 34, supported: true, reason: null }),
  dsuInstallUrl: async () => ({ ok: true, stdout: 'Starting DynamicSystemInstallationService…' }),
  dsuInstallLocal: async () => {
    const stages = [
      ['analyzing', 0, 'Analyzing image format…'],
      ['converting', 35, 'Unsparsing… 35%'],
      ['converting', 80, 'Unsparsing… 80%'],
      ['pushing', 60, 'Pushing image to device…'],
      ['starting', 100, 'Starting Dynamic System Update…'],
      ['done', 100, 'Confirm the prompt on your device.'],
    ]
    for (const [stage, percent, message] of stages) {
      await new Promise((r) => setTimeout(r, 400))
      mockEmit('dsu:progress', { stage, percent, message })
    }
    return { ok: true, stdout: 'Starting DynamicSystemInstallationService…', rawSize: 3221225472, wasSparse: true }
  },
  onDsuProgress: (cb) => mockOn('dsu:progress', cb),
}

// Tiny event bus so the mock can emit sideload progress in preview mode.
const mockListeners = {}
function mockOn(channel, cb) {
  ;(mockListeners[channel] ||= []).push(cb)
  return () => {
    mockListeners[channel] = (mockListeners[channel] || []).filter((f) => f !== cb)
  }
}
function mockEmit(channel, payload) {
  ;(mockListeners[channel] || []).forEach((cb) => cb(payload))
}

const api = hasBridge ? window.adb : mock
export default api
