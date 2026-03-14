const { app, BrowserWindow, ipcMain, systemPreferences, screen, Tray, nativeImage, globalShortcut } = require('electron')
const path = require('path')
const fs = require('fs')
const os = require('os')

let prompterWin = null
let settingsWin = null
let tray = null
let isSettingsVisible = false

// Persisted config
const CONFIG_PATH = path.join(os.homedir(), '.teleprompter-config.json')
function loadConfig() {
  try { return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')) } catch(e) {}
  return { scrollSpeed: 1, threshold: 0.018, screenshareHidden: true, mode: 'notch', opacity: 1, autoScroll: false, micDeviceId: 'default' }
  // screenshareHidden: true = hide on screen share ON by default
  // autoScroll: false = voice input ON by default
}
function saveConfig(c) { fs.writeFileSync(CONFIG_PATH, JSON.stringify(c, null, 2)) }
let config = loadConfig()

// Persisted scripts
const SCRIPTS_PATH = path.join(os.homedir(), '.teleprompter-scripts.json')
const DEFAULT_SCRIPTS = [
  {
    name: 'About Me',
    text: `Hi, I'm Arun — a full-stack engineer with five years of experience building products that scale.

I've worked on systems serving over ten million customers, and I love building things that actually matter to people.

Outside of work I ride bikes, play guitar, and chase anything with an adrenaline spike — whether that's a mountain trail, a racetrack, or just a stupid idea that sounds fun. Life's too short for boring weekends.
`
  },
  {
    name: 'Meeting Notes',
    text: `Quick recap from yesterday's sync.

We aligned on the Q2 roadmap priorities — performance improvements take the lead, followed by the new onboarding flow.

Action items: design review by Friday, API spec finalized by end of next week.

That's all — any questions, ping me directly.`
  },
  {
    name: 'Product Demo',
    text: `Let me walk you through what we've built.

OpenTeleprompter is a voice-activated teleprompter that lives right in your Mac's notch.

Speak — it scrolls. Stop — it pauses. No subscriptions, no setup, just open and go.

It's the simplest way to deliver your script naturally, without losing eye contact.

Give it a try — I think you'll love it.`
  }
]

function loadScripts() {
  try { return JSON.parse(fs.readFileSync(SCRIPTS_PATH, 'utf8')) } catch(e) {}
  // First run — return default sample scripts
  return DEFAULT_SCRIPTS
}
function saveScripts(scripts) { fs.writeFileSync(SCRIPTS_PATH, JSON.stringify(scripts, null, 2)) }

// ── Prompter window ────────────────────────────────────────
function createPrompterWindow() {
  const { width } = screen.getPrimaryDisplay().bounds
  const isMac = process.platform === 'darwin'
  const isNotch = config.mode !== 'classic'

  prompterWin = new BrowserWindow({
    icon: path.join(__dirname, 'icon.png'),
    width: isNotch ? 220 : 560,
    height: isNotch ? 50 : 400,
    x: Math.floor((width - (isNotch ? 220 : 560)) / 2),
    y: isNotch ? 0 : 100,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: !isNotch,
    resizable: config.mode === 'classic',
    movable: config.mode === 'classic',
    alwaysOnTop: true,
    skipTaskbar: true,
    focusable: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    }
  })

  prompterWin.webContents.session.setPermissionRequestHandler((wc, permission, cb) => {
    cb(permission === 'media')
  })

  applyScreenshareMode()
  prompterWin.setOpacity(config.opacity ?? 1)
  prompterWin.loadFile(path.join(__dirname, 'renderer', 'index.html'))
  prompterWin.setAlwaysOnTop(true, 'screen-saver')
  prompterWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
}

function applyScreenshareMode() {
  if (!prompterWin) return
  prompterWin.setContentProtection(config.screenshareHidden)
}

// ── Settings window ────────────────────────────────────────
function createSettingsWindow(x, y) {
  const WIN_W = 280
  const WIN_H = 380

  settingsWin = new BrowserWindow({
    width: WIN_W, height: WIN_H, x, y,
    frame: false, transparent: true,
    backgroundColor: '#00000000',
    hasShadow: true, resizable: false, movable: false,
    alwaysOnTop: true, skipTaskbar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false, contextIsolation: true,
    }
  })

  settingsWin.loadFile(path.join(__dirname, 'renderer', 'settings.html'))
  settingsWin.setAlwaysOnTop(true, 'floating')
  settingsWin.on('blur', () => {
    // Small delay so we can check what got focus
    setTimeout(() => {
      const focused = BrowserWindow.getFocusedWindow()
      // Stay open only if settings itself got focus back (e.g. internal interaction)
      if (focused && focused === settingsWin) return
      hideSettings()
    }, 100)
  })
  settingsWin.on('closed', () => { settingsWin = null; isSettingsVisible = false })
}

function showSettings() {
  // Always recompute position from current tray bounds
  const trayBounds = tray.getBounds()
  const { width: sw, height: sh } = screen.getPrimaryDisplay().bounds
  const WIN_W = 320
  const WIN_H = 380
  let x = Math.round(trayBounds.x + trayBounds.width / 2 - WIN_W / 2)
  x = Math.max(8, Math.min(x, sw - WIN_W - 8))
  // On Windows taskbar is at bottom — open settings above the tray icon
  let y
  if (process.platform === 'win32') {
    y = trayBounds.y - WIN_H - 4
  } else {
    y = trayBounds.y + trayBounds.height + 4
  }

  if (!settingsWin) {
    createSettingsWindow(x, y)
  } else {
    settingsWin.setPosition(x, y)
    settingsWin.show()
  }
  settingsWin.focus()
  isSettingsVisible = true
}
function hideSettings() {
  if (settingsWin) settingsWin.hide()
  isSettingsVisible = false
}
function toggleSettings() {
  if (isSettingsVisible) hideSettings()
  else showSettings()
}

// ── Tray ───────────────────────────────────────────────────
function createTray() {
  let icon
  if (process.platform === 'win32') {
    // Windows uses .ico for tray
    icon = nativeImage.createFromPath(path.join(__dirname, 'icon.ico'))
  } else {
    // macOS uses template PNG for auto light/dark switching
    icon = nativeImage.createFromPath(path.join(__dirname, 'tray-icon.png'))
    icon.setTemplateImage(true)
  }
  tray = new Tray(icon)
  tray.setToolTip('OpenTeleprompter — click for settings')
  // Windows: left-click doesn't fire 'click' reliably, use double-click + right-click menu
  if (process.platform === 'win32') {
    const { Menu, MenuItem } = require('electron')
    const contextMenu = Menu.buildFromTemplate([
      { label: 'Settings', click: toggleSettings },
      { type: 'separator' },
      { label: 'Quit', click: () => app.quit() }
    ])
    tray.on('double-click', toggleSettings)
    tray.setContextMenu(contextMenu)
  } else {
    tray.on('click', toggleSettings)
  }
}

// ── Global shortcuts ───────────────────────────────────────
function registerShortcuts() {
  // Space — pause/resume
  globalShortcut.register('CommandOrControl+Shift+Space', () => {
    if (prompterWin) prompterWin.webContents.send('shortcut', 'pause')
  })
  // Speed up
  globalShortcut.register('CommandOrControl+Shift+Up', () => {
    if (prompterWin) prompterWin.webContents.send('shortcut', 'faster')
  })
  // Speed down
  globalShortcut.register('CommandOrControl+Shift+Down', () => {
    if (prompterWin) prompterWin.webContents.send('shortcut', 'slower')
  })
  // Reset scroll to top
  globalShortcut.register('CommandOrControl+Shift+R', () => {
    if (prompterWin) prompterWin.webContents.send('shortcut', 'reset')
  })
}

// ── IPC ────────────────────────────────────────────────────
ipcMain.handle('toggle-prompter', () => {
  if (!prompterWin) return
  if (prompterWin.isVisible()) {
    prompterWin.webContents.send('shortcut', 'stop')
    prompterWin.hide()
  } else {
    prompterWin.show()
  }
  return prompterWin.isVisible()
})

ipcMain.handle('resize-settings', (_, { height }) => {
  if (settingsWin) {
    const [x, y] = settingsWin.getPosition()
    settingsWin.setBounds({ x, y, width: 280, height: Math.ceil(height) })
  }
})

ipcMain.handle('get-config', () => config)

ipcMain.on('set-config', (_, patch) => {
  const modeChanged = patch.mode && patch.mode !== config.mode
  Object.assign(config, patch)
  saveConfig(config)

  if (modeChanged && prompterWin) {
    prompterWin.close()
    prompterWin = null
    createPrompterWindow()
  } else {
    applyScreenshareMode()
    if (prompterWin) {
      prompterWin.setOpacity(config.opacity ?? 1)
      prompterWin.webContents.send('config-update', config)
    }
  }
  if (settingsWin) settingsWin.webContents.send('config-update', config)
})

ipcMain.handle('get-scripts', () => loadScripts())
ipcMain.on('save-scripts', (_, scripts) => saveScripts(scripts))

ipcMain.handle('set-ignore-mouse', (_, ignore) => {
  if (prompterWin) prompterWin.setIgnoreMouseEvents(ignore, { forward: true })
})

ipcMain.handle('resize-prompter', (_, { width, height }) => {
  if (!prompterWin) return
  const { width: sw } = screen.getPrimaryDisplay().bounds
  const x = Math.floor((sw - width) / 2)
  const y = config.mode === 'classic' ? prompterWin.getBounds().y : 0
  prompterWin.setBounds({ x, y, width, height }, true)
})

ipcMain.handle('quit', () => app.quit())
ipcMain.handle('open-devtools', () => {
  if (prompterWin) prompterWin.webContents.openDevTools({ mode: 'detach' })
})

ipcMain.handle('set-movable', (_, movable) => {
  if (prompterWin) prompterWin.setMovable(movable)
})

ipcMain.handle('move-window', (_, { x, y }) => {
  if (prompterWin) prompterWin.setPosition(Math.round(x), Math.round(y))
})

ipcMain.handle('get-window-pos', () => {
  if (!prompterWin) return { x: 0, y: 0 }
  const [x, y] = prompterWin.getPosition()
  return { x, y }
})

// ── App init ───────────────────────────────────────────────
app.whenReady().then(async () => {
  if (process.platform === 'darwin') {
    app.dock.hide()
    // Set dock icon
    const dockIcon = nativeImage.createFromPath(path.join(__dirname, 'icon.png'))
    app.dock.setIcon(dockIcon)
    // Request mic permission on macOS
    const status = systemPreferences.getMediaAccessStatus('microphone')
    if (status !== 'granted') await systemPreferences.askForMediaAccess('microphone')
  }
  // On Windows, mic permission is handled by the browser/Electron media API automatically
  createTray()
  createPrompterWindow()
  registerShortcuts()
})

app.on('window-all-closed', e => e.preventDefault())
app.on('will-quit', () => globalShortcut.unregisterAll())
