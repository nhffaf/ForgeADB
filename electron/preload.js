'use strict'

const { contextBridge, ipcRenderer } = require('electron')

/**
 * Safe, typed bridge between the React renderer and the Node main process.
 * The renderer can ONLY call the functions exposed here — no direct Node access.
 */
const api = {
  // Device discovery & info
  listDevices: () => ipcRenderer.invoke('devices:list'),
  getDeviceInfo: (device) => ipcRenderer.invoke('device:info', device),

  // Reboots
  reboot: (payload) => ipcRenderer.invoke('device:reboot', payload),

  // Screenshot
  screenshot: (payload) => ipcRenderer.invoke('device:screenshot', payload),

  // Packages
  listPackages: (payload) => ipcRenderer.invoke('packages:list', payload),
  packageAction: (payload) => ipcRenderer.invoke('package:action', payload),
  installApk: (payload) => ipcRenderer.invoke('apk:install', payload),

  // File manager
  listFiles: (payload) => ipcRenderer.invoke('file:list', payload),
  pullFile: (payload) => ipcRenderer.invoke('file:pull', payload),
  pushFile: (payload) => ipcRenderer.invoke('file:push', payload),

  // Terminal
  runCommand: (payload) => ipcRenderer.invoke('terminal:run', payload),

  // Fastboot
  fastbootFlash: (payload) => ipcRenderer.invoke('fastboot:flash', payload),
  fastbootErase: (payload) => ipcRenderer.invoke('fastboot:erase', payload),
  fastbootBoot: (payload) => ipcRenderer.invoke('fastboot:boot', payload),
  fastbootWipe: (payload) => ipcRenderer.invoke('fastboot:wipe', payload),
  fastbootLock: (payload) => ipcRenderer.invoke('fastboot:lock', payload),
  fastbootCommand: (payload) => ipcRenderer.invoke('fastboot:command', payload),
  resizeLogical: (payload) => ipcRenderer.invoke('fastboot:resize-logical', payload),
  deleteLogical: (payload) => ipcRenderer.invoke('fastboot:delete-logical', payload),
  createLogical: (payload) => ipcRenderer.invoke('fastboot:create-logical', payload),

  // Partitions
  listPartitions: (device) => ipcRenderer.invoke('partitions:list', device),
  dumpPartition: (payload) => ipcRenderer.invoke('partition:dump', payload),

  // Dialogs
  openFile: (payload) => ipcRenderer.invoke('dialog:openFile', payload || {}),
  openDir: (payload) => ipcRenderer.invoke('dialog:openDir', payload || {}),
  saveFile: (payload) => ipcRenderer.invoke('dialog:saveFile', payload || {}),

  // Logcat streaming
  logcatStart: (payload) => ipcRenderer.invoke('logcat:start', payload),
  logcatStop: (payload) => ipcRenderer.invoke('logcat:stop', payload),
  logcatClear: (payload) => ipcRenderer.invoke('logcat:clear', payload),
  onLogcatData: (cb) => {
    const handler = (_e, data) => cb(data)
    ipcRenderer.on('logcat:data', handler)
    return () => ipcRenderer.removeListener('logcat:data', handler)
  },
  onLogcatEnd: (cb) => {
    const handler = (_e, data) => cb(data)
    ipcRenderer.on('logcat:end', handler)
    return () => ipcRenderer.removeListener('logcat:end', handler)
  },

  // ADB Sideload (OTA) with live progress
  sideloadStart: (payload) => ipcRenderer.invoke('sideload:start', payload),
  sideloadCancel: () => ipcRenderer.invoke('sideload:cancel'),
  onSideloadProgress: (cb) => {
    const handler = (_e, data) => cb(data)
    ipcRenderer.on('sideload:progress', handler)
    return () => ipcRenderer.removeListener('sideload:progress', handler)
  },
  onSideloadLog: (cb) => {
    const handler = (_e, data) => cb(data)
    ipcRenderer.on('sideload:log', handler)
    return () => ipcRenderer.removeListener('sideload:log', handler)
  },
  onSideloadEnd: (cb) => {
    const handler = (_e, data) => cb(data)
    ipcRenderer.on('sideload:end', handler)
    return () => ipcRenderer.removeListener('sideload:end', handler)
  },

  // DSU (Dynamic System Update)
  dsuCheck: (payload) => ipcRenderer.invoke('dsu:check', payload),
  dsuInstallUrl: (payload) => ipcRenderer.invoke('dsu:install-url', payload),
  dsuInstallLocal: (payload) => ipcRenderer.invoke('dsu:install-local', payload),
  onDsuProgress: (cb) => {
    const handler = (_e, data) => cb(data)
    ipcRenderer.on('dsu:progress', handler)
    return () => ipcRenderer.removeListener('dsu:progress', handler)
  },
}

contextBridge.exposeInMainWorld('adb', api)
