'use strict'

const { ipcMain, dialog, BrowserWindow } = require('electron')
const path = require('path')
const os = require('os')
const fs = require('fs')
const { adb, fastboot, run, spawnStream } = require('./tools')
const { listDevices, getDeviceInfo } = require('./devices')
const { isSparseImage, prepareGzImage } = require('./dsu')

// ---- Active streaming processes (logcat, etc.) -----------------------------
let streamCounter = 0
const activeStreams = new Map() // id -> ChildProcess
let activeSideload = null // the in-flight `adb sideload` child, if any

function senderWindow(event) {
  return BrowserWindow.fromWebContents(event.sender)
}

// Partition names that normally live inside the dynamic `super` partition.
const KNOWN_LOGICAL = new Set([
  'system', 'system_ext', 'vendor', 'product', 'odm', 'odm_dlkm',
  'vendor_dlkm', 'system_dlkm',
])
function stripSlot(name) {
  return name.replace(/_[ab]$/i, '')
}

/**
 * Register every IPC handler. Call once after the main window exists.
 */
function registerIpc() {
  // ---- Device discovery ----------------------------------------------------
  ipcMain.handle('devices:list', async () => {
    return listDevices()
  })

  ipcMain.handle('device:info', async (_e, device) => {
    return getDeviceInfo(device)
  })

  // ---- Reboots -------------------------------------------------------------
  ipcMain.handle('device:reboot', async (_e, { serial, mode, target }) => {
    // target: system | recovery | bootloader | fastboot (fastbootd) | sideload
    const fromFastboot = mode === 'fastboot' || mode === 'fastbootd'
    if (fromFastboot) {
      const arg = target === 'system' ? [] : [target === 'fastboot' ? 'fastboot' : target]
      return fastboot(['reboot', ...arg], { serial, timeout: 15000 })
    }
    // adb side
    const map = {
      system: [],
      recovery: ['recovery'],
      bootloader: ['bootloader'],
      fastboot: ['fastboot'], // fastbootd
      sideload: ['sideload'],
    }
    return adb(['reboot', ...(map[target] || [])], { serial, timeout: 15000 })
  })

  // ---- Screenshot ----------------------------------------------------------
  ipcMain.handle('device:screenshot', async (_e, { serial }) => {
    const res = await adb(['exec-out', 'screencap', '-p'], { serial, timeout: 15000, binary: true })
    if (!res.ok || !res.stdout || res.stdout.length === 0) {
      return { ok: false, error: res.stderr || 'Failed to capture screen.' }
    }
    const b64 = Buffer.isBuffer(res.stdout) ? res.stdout.toString('base64') : Buffer.from(res.stdout, 'binary').toString('base64')
    return { ok: true, dataUrl: `data:image/png;base64,${b64}` }
  })

  // ---- Packages ------------------------------------------------------------
  ipcMain.handle('packages:list', async (_e, { serial, scope = 'third' }) => {
    // scope: third | system | all | disabled | enabled
    const flagMap = { third: ['-3'], system: ['-s'], all: [], disabled: ['-d'], enabled: ['-e'] }
    const res = await adb(['shell', 'pm', 'list', 'packages', ...(flagMap[scope] || [])], {
      serial,
      timeout: 12000,
    })
    if (!res.ok) return { ok: false, error: res.stderr || 'Failed to list packages.' }
    const pkgs = res.stdout
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.startsWith('package:'))
      .map((l) => l.replace('package:', '').trim())
      .filter(Boolean)
      .sort()
    return { ok: true, packages: pkgs }
  })

  ipcMain.handle('package:action', async (_e, { serial, pkg, action }) => {
    let args
    switch (action) {
      case 'uninstall':
        args = ['uninstall', pkg]
        break
      case 'uninstall-keep':
        args = ['shell', 'pm', 'uninstall', '-k', '--user', '0', pkg]
        break
      case 'disable':
        args = ['shell', 'pm', 'disable-user', '--user', '0', pkg]
        break
      case 'enable':
        args = ['shell', 'pm', 'enable', pkg]
        break
      case 'clear':
        args = ['shell', 'pm', 'clear', pkg]
        break
      default:
        return { ok: false, error: `Unknown action: ${action}` }
    }
    return adb(args, { serial, timeout: 20000 })
  })

  // ---- APK install ---------------------------------------------------------
  ipcMain.handle('apk:install', async (_e, { serial, filePath, reinstall, downgrade, grant }) => {
    const flags = []
    if (reinstall) flags.push('-r')
    if (downgrade) flags.push('-d')
    if (grant) flags.push('-g')
    return adb(['install', ...flags, filePath], { serial, timeout: 180000 })
  })

  // ---- File manager (pull / push) -----------------------------------------
  ipcMain.handle('file:list', async (_e, { serial, remotePath = '/sdcard/' }) => {
    const res = await adb(['shell', 'ls', '-la', remotePath], { serial, timeout: 10000 })
    if (!res.ok) return { ok: false, error: res.stderr || 'Failed to list directory.' }
    const entries = []
    for (const line of res.stdout.split(/\r?\n/)) {
      const t = line.trim()
      if (!t || t.startsWith('total ')) continue
      const m = /^([\-dlbcps])([rwxsStT\-]{9})[.+]?\s+\d+\s+\S+\s+\S+\s+(\d+|\S+)\s+\S+\s+\S+\s+\S+\s+(.+)$/.exec(t)
      if (m) {
        let name = m[4]
        const isLink = m[1] === 'l'
        if (isLink) name = name.split(' -> ')[0]
        if (name === '.' || name === '..') continue
        entries.push({ name, isDir: m[1] === 'd', isLink, size: /^\d+$/.test(m[3]) ? Number(m[3]) : null })
      } else {
        // Fallback: just grab a trailing token as a name
        const parts = t.split(/\s+/)
        const name = parts[parts.length - 1]
        if (name && name !== '.' && name !== '..') entries.push({ name, isDir: t.startsWith('d'), isLink: t.startsWith('l'), size: null })
      }
    }
    return { ok: true, path: remotePath, entries }
  })

  ipcMain.handle('file:pull', async (_e, { serial, remote, localDir }) => {
    return adb(['pull', remote, localDir], { serial, timeout: 300000 })
  })

  ipcMain.handle('file:push', async (_e, { serial, local, remote }) => {
    return adb(['push', local, remote], { serial, timeout: 300000 })
  })

  // ---- Generic terminal one-shot ------------------------------------------
  ipcMain.handle('terminal:run', async (_e, { serial, context, command }) => {
    const argv = splitArgs(command)
    if (argv.length === 0) return { ok: true, code: 0, stdout: '', stderr: '', command }
    if (context === 'adb-shell') {
      return adb(['shell', ...argv], { serial, timeout: 60000 })
    }
    if (context === 'adb') {
      return adb(argv, { serial, timeout: 60000 })
    }
    if (context === 'fastboot') {
      return fastboot(argv, { serial, timeout: 60000 })
    }
    // host: run the first token as a tool, otherwise echo unsupported
    const [bin, ...rest] = argv
    return run(bin, rest, { timeout: 60000 })
  })

  // ---- Fastboot operations -------------------------------------------------
  ipcMain.handle('fastboot:flash', async (_e, { serial, partition, image, slot, disableVerity, disableVerification }) => {
    // AVB flags must precede the flash subcommand, e.g.
    //   fastboot --disable-verity --disable-verification flash vbmeta vbmeta.img
    const avbFlags = []
    if (disableVerity) avbFlags.push('--disable-verity')
    if (disableVerification) avbFlags.push('--disable-verification')
    const slotArgs = slot && slot !== 'auto' ? ['--slot', slot] : []
    return fastboot([...avbFlags, 'flash', ...slotArgs, partition, image], { serial, timeout: 300000 })
  })

  ipcMain.handle('fastboot:erase', async (_e, { serial, partition }) => {
    return fastboot(['erase', partition], { serial, timeout: 60000 })
  })

  ipcMain.handle('fastboot:boot', async (_e, { serial, image }) => {
    return fastboot(['boot', image], { serial, timeout: 120000 })
  })

  ipcMain.handle('fastboot:wipe', async (_e, { serial, partition }) => {
    return fastboot(['erase', partition], { serial, timeout: 60000 })
  })

  ipcMain.handle('fastboot:lock', async (_e, { serial, lock }) => {
    return fastboot(['flashing', lock ? 'lock' : 'unlock'], { serial, timeout: 60000 })
  })

  ipcMain.handle('fastboot:command', async (_e, { serial, args }) => {
    return fastboot(args, { serial, timeout: 120000 })
  })

  // ---- Logical partition ops (fastbootd) ----------------------------------
  ipcMain.handle('fastboot:resize-logical', async (_e, { serial, partition, sizeBytes }) => {
    return fastboot(['resize-logical-partition', partition, String(sizeBytes)], { serial, timeout: 60000 })
  })
  ipcMain.handle('fastboot:delete-logical', async (_e, { serial, partition }) => {
    return fastboot(['delete-logical-partition', partition], { serial, timeout: 60000 })
  })
  ipcMain.handle('fastboot:create-logical', async (_e, { serial, partition, sizeBytes }) => {
    return fastboot(['create-logical-partition', partition, String(sizeBytes)], { serial, timeout: 60000 })
  })

  // ---- Partition listing ---------------------------------------------------
  ipcMain.handle('partitions:list', async (_e, device) => {
    if (!device) return { ok: false, error: 'No device.' }

    if (device.mode === 'fastboot' || device.mode === 'fastbootd') {
      const res = await fastboot(['getvar', 'all'], { serial: device.serial, timeout: 15000 })
      const text = `${res.stdout}\n${res.stderr}`
      const sizes = {}
      const logical = {}
      const types = {}
      for (const line of text.split(/\r?\n/)) {
        let m
        if ((m = /partition-size:([^:]+):\s*(0x[0-9a-fA-F]+|\d+)/.exec(line)))
          sizes[m[1].trim()] = parseInt(m[2], m[2].startsWith('0x') ? 16 : 10)
        else if ((m = /is-logical:([^:]+):\s*(yes|no)/.exec(line)))
          logical[m[1].trim()] = m[2] === 'yes'
        else if ((m = /partition-type:([^:]+):\s*(\S+)/.exec(line)))
          types[m[1].trim()] = m[2]
      }
      const names = new Set([...Object.keys(sizes), ...Object.keys(logical)])
      const parts = [...names].sort().map((name) => ({
        name,
        base: stripSlot(name),
        size: sizes[name] ?? null,
        logical: logical[name] ?? KNOWN_LOGICAL.has(stripSlot(name)),
        type: types[name] || null,
      }))
      return { ok: true, source: 'fastboot', partitions: parts }
    }

    // adb / recovery: enumerate /dev/block/by-name
    const res = await adb(['shell', 'ls', '-l', '/dev/block/by-name'], {
      serial: device.serial,
      timeout: 10000,
    })
    if (!res.ok) return { ok: false, error: res.stderr || 'Could not read partition table (root may be required).' }
    const parts = []
    for (const line of res.stdout.split(/\r?\n/)) {
      const t = line.trim()
      const m = /->\s*(\S+)$/.exec(t)
      const nameMatch = /\s(\S+)\s+->/.exec(t)
      if (m && nameMatch) {
        const name = nameMatch[1]
        parts.push({
          name,
          base: stripSlot(name),
          target: m[1],
          size: null,
          logical: KNOWN_LOGICAL.has(stripSlot(name)),
          type: null,
        })
      }
    }
    // Best-effort size enrichment (works only with root)
    return { ok: true, source: 'adb', partitions: parts.sort((a, b) => a.name.localeCompare(b.name)) }
  })

  ipcMain.handle('partition:dump', async (_e, { serial, partition, local }) => {
    return adb(['pull', `/dev/block/by-name/${partition}`, local], { serial, timeout: 600000 })
  })

  // ---- Dialogs -------------------------------------------------------------
  ipcMain.handle('dialog:openFile', async (event, { title, filters }) => {
    const win = senderWindow(event)
    const res = await dialog.showOpenDialog(win, {
      title: title || 'Select file',
      properties: ['openFile'],
      filters: filters || [{ name: 'All Files', extensions: ['*'] }],
    })
    return res.canceled ? null : res.filePaths[0]
  })

  ipcMain.handle('dialog:openDir', async (event, { title }) => {
    const win = senderWindow(event)
    const res = await dialog.showOpenDialog(win, {
      title: title || 'Select folder',
      properties: ['openDirectory', 'createDirectory'],
    })
    return res.canceled ? null : res.filePaths[0]
  })

  ipcMain.handle('dialog:saveFile', async (event, { title, defaultPath, filters }) => {
    const win = senderWindow(event)
    const res = await dialog.showSaveDialog(win, {
      title: title || 'Save as',
      defaultPath,
      filters: filters || [{ name: 'All Files', extensions: ['*'] }],
    })
    return res.canceled ? null : res.filePath
  })

  // ---- Logcat streaming ----------------------------------------------------
  ipcMain.handle('logcat:start', async (event, { serial }) => {
    const id = ++streamCounter
    const child = spawnStream('adb', ['logcat', '-v', 'threadtime'], { serial })
    activeStreams.set(id, child)
    const wc = event.sender

    const push = (chunk, isErr) => {
      if (wc.isDestroyed()) return
      wc.send('logcat:data', { id, line: chunk.toString('utf8'), isErr })
    }
    child.stdout.on('data', (d) => push(d, false))
    child.stderr.on('data', (d) => push(d, true))
    child.on('close', (code) => {
      activeStreams.delete(id)
      if (!wc.isDestroyed()) wc.send('logcat:end', { id, code })
    })
    child.on('error', (err) => {
      if (!wc.isDestroyed()) wc.send('logcat:data', { id, line: `[error] ${err.message}\n`, isErr: true })
    })
    return { ok: true, id }
  })

  ipcMain.handle('logcat:stop', async (_e, { id }) => {
    const child = activeStreams.get(id)
    if (child) {
      try { child.kill() } catch (_) {}
      activeStreams.delete(id)
    }
    return { ok: true }
  })

  ipcMain.handle('logcat:clear', async (_e, { serial }) => {
    return adb(['logcat', '-c'], { serial, timeout: 8000 })
  })

  // ---- ADB Sideload (OTA) with live progress -------------------------------
  // adb sideload prints progress to stderr like:  serving: 'ota.zip'  (~45%)
  // We stream it, parse the percentage with a regex, and emit sideload:progress.
  ipcMain.handle('sideload:start', async (event, { serial, filePath }) => {
    if (activeSideload) {
      return { ok: false, error: 'A sideload is already in progress.' }
    }
    const wc = event.sender
    const id = ++streamCounter
    const child = spawnStream('adb', ['sideload', filePath], { serial })
    activeSideload = child
    activeStreams.set(id, child)

    const PROGRESS_RE = /\(\s*~?\s*(\d{1,3})\s*%\s*\)/
    let lastPct = -1

    const emit = (channel, payload) => {
      if (!wc.isDestroyed()) wc.send(channel, payload)
    }

    const handle = (buf) => {
      const text = buf.toString('utf8')
      // adb often uses \r to overwrite the progress line — split on both.
      for (const part of text.split(/[\r\n]+/)) {
        if (!part.trim()) continue
        emit('sideload:log', { id, line: part })
        const m = PROGRESS_RE.exec(part)
        if (m) {
          const pct = Math.min(100, parseInt(m[1], 10))
          if (pct !== lastPct) {
            lastPct = pct
            emit('sideload:progress', { id, percent: pct })
          }
        }
      }
    }

    child.stdout.on('data', handle)
    child.stderr.on('data', handle)

    child.on('error', (err) => {
      emit('sideload:log', { id, line: `[error] ${err.message}` })
    })
    child.on('close', (code) => {
      activeStreams.delete(id)
      activeSideload = null
      const ok = code === 0
      if (ok && lastPct < 100) emit('sideload:progress', { id, percent: 100 })
      emit('sideload:end', { id, code, ok })
    })

    return { ok: true, id }
  })

  ipcMain.handle('sideload:cancel', async () => {
    if (activeSideload) {
      try { activeSideload.kill() } catch (_) {}
      activeSideload = null
    }
    return { ok: true }
  })

  // ---- DSU (Dynamic System Update) -----------------------------------------
  // Detect A/B support — DSU requires it.
  ipcMain.handle('dsu:check', async (_e, { serial }) => {
    const [ab, dynparts, sdk] = await Promise.all([
      adb(['shell', 'getprop', 'ro.build.ab_update'], { serial, timeout: 8000 }),
      adb(['shell', 'getprop', 'ro.boot.dynamic_partitions'], { serial, timeout: 8000 }),
      adb(['shell', 'getprop', 'ro.build.version.sdk'], { serial, timeout: 8000 }),
    ])
    const abVal = (ab.stdout || '').trim()
    const dynVal = (dynparts.stdout || '').trim()
    const sdkNum = parseInt((sdk.stdout || '').trim(), 10) || 0
    const isAb = abVal === 'true'
    const isDynamic = dynVal === 'true'
    return {
      ok: true,
      abUpdate: abVal,
      dynamicPartitions: dynVal,
      sdk: sdkNum,
      // DSU shipped in Android 10 (API 29); needs dynamic partitions.
      supported: (isAb || isDynamic) && sdkNum >= 29,
      reason:
        sdkNum && sdkNum < 29
          ? 'DSU requires Android 10 (API 29) or newer.'
          : !isAb && !isDynamic
            ? 'Device does not report A/B or dynamic-partition support.'
            : null,
    }
  })

  // Remote URL installs hand the link straight to DynamicSystemInstallationService.
  ipcMain.handle('dsu:install-url', async (_e, { serial, url, userdataBytes }) => {
    const args = [
      'shell', 'am', 'start-activity',
      '-n', 'com.android.dynsystem/com.android.dynsystem.VerificationActivity',
      '-a', 'android.os.image.action.START_INSTALL',
      '-d', url,
      '--el', 'KEY_USERDATA_SIZE', String(userdataBytes),
    ]
    return adb(args, { serial, timeout: 20000 })
  })

  // Local-file installs unsparse the image, gzip it, push it to the device and
  // then fire the intent against the on-device path. Progress is reported on the
  // dsu:progress channel so the UI can show a multi-stage indicator.
  ipcMain.handle('dsu:install-local', async (event, { serial, imagePath, userdataBytes }) => {
    const wc = event.sender
    const DEVICE_DIR = '/storage/emulated/0/Download'
    const DEVICE_FILE = `${DEVICE_DIR}/system_raw.gz`
    const tmpGz = path.join(os.tmpdir(), `forgeadb_system_raw_${Date.now()}.gz`)

    const emit = (stage, percent, message) => {
      if (!wc.isDestroyed()) wc.send('dsu:progress', { stage, percent, message })
    }

    try {
      emit('analyzing', 0, 'Analyzing image format…')
      const sparse = await isSparseImage(imagePath)

      emit('converting', 0, sparse ? 'Unsparsing and compressing image…' : 'Compressing raw image…')
      let lastPct = -1
      const { rawSize } = await prepareGzImage(imagePath, tmpGz, (written, total) => {
        const pct = total ? Math.min(99, Math.floor((written / total) * 100)) : 0
        if (pct !== lastPct) {
          lastPct = pct
          emit('converting', pct, `${sparse ? 'Unsparsing' : 'Compressing'}… ${pct}%`)
        }
      })

      emit('pushing', 0, 'Pushing image to device…')
      const child = spawnStream('adb', ['push', tmpGz, DEVICE_FILE], { serial })
      const pushPct = /\[\s*(\d{1,3})%\]/
      const onPush = (buf) => {
        const m = pushPct.exec(buf.toString('utf8'))
        if (m) emit('pushing', Math.min(100, parseInt(m[1], 10)), 'Pushing image to device…')
      }
      child.stdout.on('data', onPush)
      child.stderr.on('data', onPush)
      const pushCode = await new Promise((resolve) => child.on('close', resolve))
      if (pushCode !== 0) {
        emit('error', 0, 'Failed to push image to the device.')
        return { ok: false, error: 'adb push failed while transferring the image.' }
      }

      emit('starting', 100, 'Starting Dynamic System Update…')
      const intent = await adb(
        [
          'shell', 'am', 'start-activity',
          '-n', 'com.android.dynsystem/com.android.dynsystem.VerificationActivity',
          '-a', 'android.os.image.action.START_INSTALL',
          '-d', `file://${DEVICE_FILE}`,
          '--el', 'KEY_SYSTEM_SIZE', String(rawSize),
          '--el', 'KEY_USERDATA_SIZE', String(userdataBytes),
        ],
        { serial, timeout: 20000 }
      )

      emit(intent.ok ? 'done' : 'error', 100, intent.ok ? 'Confirm the prompt on your device.' : 'Failed to start DSU.')
      return { ...intent, rawSize, wasSparse: sparse }
    } catch (err) {
      emit('error', 0, String(err.message || err))
      return { ok: false, error: String(err.message || err) }
    } finally {
      fs.promises.unlink(tmpGz).catch(() => {})
    }
  })
}


function killAllStreams() {
  for (const child of activeStreams.values()) {
    try { child.kill() } catch (_) {}
  }
  activeStreams.clear()
  activeSideload = null
}

/** Minimal shell-style argv splitter that respects single/double quotes. */
function splitArgs(input) {
  const out = []
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g
  let m
  while ((m = re.exec(input)) !== null) {
    out.push(m[1] ?? m[2] ?? m[3])
  }
  return out
}

module.exports = { registerIpc, killAllStreams }
