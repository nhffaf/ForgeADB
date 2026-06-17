'use strict'

const { adb, fastboot } = require('./tools')

/**
 * Parse `adb devices -l` output into structured device records.
 * Example line:
 *   R58M1234ABC   device product:beyond1lte model:SM_G973F device:beyond1lte transport_id:1
 */
function parseAdbDevices(stdout) {
  const lines = stdout.split(/\r?\n/).slice(1) // drop "List of devices attached"
  const out = []
  for (const raw of lines) {
    const line = raw.trim()
    if (!line) continue
    const [serial, state, ...rest] = line.split(/\s+/)
    if (!serial) continue
    const meta = {}
    for (const token of rest) {
      const idx = token.indexOf(':')
      if (idx > -1) meta[token.slice(0, idx)] = token.slice(idx + 1)
    }
    // state can be: device | unauthorized | offline | recovery | sideload | no permissions
    let mode = 'adb'
    if (state === 'recovery') mode = 'recovery'
    else if (state === 'sideload') mode = 'sideload'
    else if (state === 'unauthorized') mode = 'unauthorized'
    else if (state === 'offline') mode = 'offline'

    out.push({
      serial,
      state,
      mode,
      model: (meta.model || '').replace(/_/g, ' ') || null,
      product: meta.product || null,
      device: meta.device || null,
      transportId: meta.transport_id || null,
    })
  }
  return out
}

/** Parse `fastboot devices` output. */
function parseFastbootDevices(stdout) {
  const out = []
  for (const raw of stdout.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line) continue
    const m = line.split(/\s+/)
    const serial = m[0]
    const state = (m[1] || 'fastboot').toLowerCase()
    if (!serial) continue
    out.push({
      serial,
      state,
      mode: state.includes('fastbootd') ? 'fastbootd' : 'fastboot',
      model: null,
      product: null,
      device: null,
      transportId: null,
    })
  }
  return out
}

/** Enumerate every connected device across adb + fastboot transports. */
async function listDevices() {
  const [adbRes, fbRes] = await Promise.all([
    adb(['devices', '-l'], { timeout: 8000 }),
    fastboot(['devices'], { timeout: 8000 }),
  ])

  const devices = []
  if (adbRes.ok || adbRes.stdout) devices.push(...parseAdbDevices(adbRes.stdout))
  if (fbRes.ok || fbRes.stdout) devices.push(...parseFastbootDevices(fbRes.stdout))

  // De-dupe by serial (a device only lives in one mode at a time, but guard anyway)
  const seen = new Set()
  return devices.filter((d) => {
    if (seen.has(d.serial)) return false
    seen.add(d.serial)
    return true
  })
}

/** Read a batch of system properties via a single `getprop` dump. */
async function getProps(serial) {
  const res = await adb(['shell', 'getprop'], { serial, timeout: 10000 })
  const map = {}
  if (!res.stdout) return map
  // Format: [ro.product.model]: [SM-G973F]
  const re = /^\[([^\]]+)\]:\s*\[([^\]]*)\]/
  for (const line of res.stdout.split(/\r?\n/)) {
    const m = re.exec(line.trim())
    if (m) map[m[1]] = m[2]
  }
  return map
}

/** Parse `dumpsys battery` into a friendly object. */
async function getBattery(serial) {
  const res = await adb(['shell', 'dumpsys', 'battery'], { serial, timeout: 8000 })
  const info = {}
  if (!res.stdout) return info
  for (const line of res.stdout.split(/\r?\n/)) {
    const m = /^\s*([A-Za-z ]+):\s*(.+)$/.exec(line)
    if (m) info[m[1].trim().toLowerCase()] = m[2].trim()
  }
  const statusMap = { 1: 'Unknown', 2: 'Charging', 3: 'Discharging', 4: 'Not charging', 5: 'Full' }
  return {
    level: info.level ? Number(info.level) : null,
    status: statusMap[info.status] || info.status || 'Unknown',
    temperature: info.temperature ? (Number(info.temperature) / 10).toFixed(1) : null,
    health: info.health || null,
    plugged: info['ac powered'] === 'true' ? 'AC' : info['usb powered'] === 'true' ? 'USB' : 'Battery',
  }
}

/**
 * Build a rich device-info object for the Dashboard.
 * Falls back gracefully when the device is in fastboot (no shell access).
 */
async function getDeviceInfo(device) {
  if (!device) return null

  if (device.mode === 'fastboot' || device.mode === 'fastbootd') {
    const res = await fastboot(['getvar', 'all'], { serial: device.serial, timeout: 12000 })
    // fastboot prints getvar info on stderr
    const text = `${res.stdout}\n${res.stderr}`
    const vars = {}
    for (const line of text.split(/\r?\n/)) {
      const m = /\(bootloader\)\s*([^:]+):\s*(.*)/.exec(line)
      if (m) vars[m[1].trim()] = m[2].trim()
    }
    return {
      mode: device.mode,
      serial: device.serial,
      codename: vars['product'] || device.product || 'unknown',
      marketingName: vars['product'] || 'Fastboot Device',
      androidVersion: null,
      securityPatch: null,
      cpuArch: vars['cpu-abi'] || null,
      bootloaderState: vars['unlocked'] === 'yes' ? 'Unlocked' : vars['unlocked'] === 'no' ? 'Locked' : 'Unknown',
      currentSlot: vars['current-slot'] || null,
      battery: null,
      raw: vars,
    }
  }

  if (device.mode !== 'adb' && device.mode !== 'recovery') {
    return {
      mode: device.mode,
      serial: device.serial,
      codename: device.product || 'unknown',
      marketingName: device.model || device.mode,
      androidVersion: null,
      securityPatch: null,
      cpuArch: null,
      battery: null,
      raw: {},
    }
  }

  const [props, battery] = await Promise.all([getProps(device.serial), getBattery(device.serial)])

  const slot = props['ro.boot.slot_suffix'] || null
  return {
    mode: device.mode,
    serial: device.serial,
    codename: props['ro.product.device'] || device.product || 'unknown',
    marketingName:
      props['ro.product.marketname'] ||
      props['ro.product.vendor.marketname'] ||
      props['ro.config.marketing_name'] ||
      props['ro.product.model'] ||
      device.model ||
      'Android Device',
    manufacturer: props['ro.product.manufacturer'] || null,
    androidVersion: props['ro.build.version.release'] || null,
    sdk: props['ro.build.version.sdk'] || null,
    securityPatch: props['ro.build.version.security_patch'] || null,
    buildId: props['ro.build.display.id'] || props['ro.build.id'] || null,
    cpuArch: props['ro.product.cpu.abi'] || null,
    bootloaderState:
      props['ro.boot.flash.locked'] === '0'
        ? 'Unlocked'
        : props['ro.boot.flash.locked'] === '1'
          ? 'Locked'
          : props['ro.boot.verifiedbootstate'] || 'Unknown',
    currentSlot: slot ? slot.replace('_', '') : null,
    battery,
    raw: props,
  }
}

module.exports = {
  listDevices,
  getDeviceInfo,
  parseAdbDevices,
  parseFastbootDevices,
  getProps,
  getBattery,
}
