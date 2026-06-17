'use strict'

const { app } = require('electron')
const path = require('path')
const fs = require('fs')
const { spawn } = require('child_process')

/**
 * Resolve the directory that holds adb.exe / fastboot.exe.
 *
 * - In production (packaged) the platform-tools folder is shipped as an
 *   extraResource, so it lives under process.resourcesPath.
 * - In development it sits next to the project root (../platform-tools).
 * - As a last resort we fall back to whatever `adb` is on the system PATH.
 */
function resolveToolsDir() {
  const candidates = []
  if (app && app.isPackaged) {
    candidates.push(path.join(process.resourcesPath, 'platform-tools'))
  }
  candidates.push(path.join(__dirname, '..', 'platform-tools'))
  candidates.push(path.join(process.cwd(), 'platform-tools'))

  for (const dir of candidates) {
    try {
      if (fs.existsSync(path.join(dir, 'adb.exe'))) return dir
    } catch (_) {
      /* ignore */
    }
  }
  return null // means: rely on PATH
}

const TOOLS_DIR = resolveToolsDir()

function binPath(name) {
  const exe = process.platform === 'win32' ? `${name}.exe` : name
  return TOOLS_DIR ? path.join(TOOLS_DIR, exe) : exe
}

/**
 * Run a tool once and collect its full output.
 * @returns {Promise<{ok:boolean, code:number, stdout:string, stderr:string, command:string}>}
 */
function run(bin, args = [], opts = {}) {
  const { serial, timeout = 60000, binary = false } = opts
  const finalArgs = serial ? ['-s', serial, ...args] : args
  const command = `${bin} ${finalArgs.join(' ')}`

  return new Promise((resolve) => {
    let child
    try {
      child = spawn(binPath(bin), finalArgs, { windowsHide: true })
    } catch (err) {
      return resolve({ ok: false, code: -1, stdout: '', stderr: String(err.message || err), command })
    }

    const outChunks = []
    const errChunks = []
    let settled = false

    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      try { child.kill() } catch (_) {}
      resolve({
        ok: false,
        code: -2,
        stdout: Buffer.concat(outChunks).toString(binary ? 'binary' : 'utf8'),
        stderr: 'Operation timed out.',
        command,
      })
    }, timeout)

    child.stdout.on('data', (d) => outChunks.push(d))
    child.stderr.on('data', (d) => errChunks.push(d))

    child.on('error', (err) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve({ ok: false, code: -1, stdout: '', stderr: String(err.message || err), command })
    })

    child.on('close', (code) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      const stdout = binary
        ? Buffer.concat(outChunks)
        : Buffer.concat(outChunks).toString('utf8')
      const stderr = Buffer.concat(errChunks).toString('utf8')
      resolve({ ok: code === 0, code, stdout, stderr, command })
    })
  })
}

const adb = (args, opts = {}) => run('adb', args, opts)
const fastboot = (args, opts = {}) => run('fastboot', args, opts)

/**
 * Spawn a long-lived streaming process (logcat, interactive shell, scrcpy...).
 * Returns the raw ChildProcess so the caller can wire up stdout/stderr/kill.
 */
function spawnStream(bin, args = [], opts = {}) {
  const { serial } = opts
  const finalArgs = serial ? ['-s', serial, ...args] : args
  return spawn(binPath(bin), finalArgs, { windowsHide: true })
}

module.exports = { run, adb, fastboot, spawnStream, binPath, resolveToolsDir, TOOLS_DIR }
