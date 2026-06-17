'use strict'

const { app, BrowserWindow, shell, nativeTheme } = require('electron')
const path = require('path')
const { registerIpc, killAllStreams } = require('./ipc')

const isDev = process.env.NODE_ENV === 'development'

// App icon — packaged path (build resource) with a dev fallback to the root PNG.
function iconPath() {
  const candidates = [
    path.join(process.resourcesPath || '', 'build', 'icon.ico'),
    path.join(__dirname, '..', 'build', 'icon.ico'),
    path.join(__dirname, '..', 'build', 'icon.png'),
    path.join(__dirname, '..', 'app-icon.png'),
  ]
  for (const p of candidates) {
    try {
      if (p && require('fs').existsSync(p)) return p
    } catch (_) {}
  }
  return undefined
}

let mainWindow = null

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: '#09090b',
    show: false,
    autoHideMenuBar: true,
    title: 'ForgeADB',
    icon: iconPath(),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  nativeTheme.themeSource = 'dark'

  if (isDev) {
    mainWindow.loadURL('http://127.0.0.1:5173')
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  }

  mainWindow.once('ready-to-show', () => mainWindow.show())

  // Open external links in the default browser, never in-app.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

app.whenReady().then(() => {
  registerIpc()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  killAllStreams()
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  killAllStreams()
})
