const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  // Platform
  platform: process.platform,

  // Config
  getConfig: () => ipcRenderer.invoke('get-config'),
  setConfig: (patch) => ipcRenderer.send('set-config', patch),
  onConfigUpdate: (cb) => ipcRenderer.on('config-update', (_, c) => cb(c)),

  // Scripts
  getScripts: () => ipcRenderer.invoke('get-scripts'),
  saveScripts: (scripts) => ipcRenderer.send('save-scripts', scripts),

  // Window
  setIgnoreMouse: (ignore) => ipcRenderer.invoke('set-ignore-mouse', ignore),
  resizePrompter: (dims) => ipcRenderer.invoke('resize-prompter', dims),
  togglePrompter: () => ipcRenderer.invoke('toggle-prompter'),
  resizeSettings: (dims) => ipcRenderer.invoke('resize-settings', dims),
  quit: () => ipcRenderer.invoke('quit'),
  openDevTools: () => ipcRenderer.invoke('open-devtools'),
  setMovable: (v) => ipcRenderer.invoke('set-movable', v),
  moveWindow: (pos) => ipcRenderer.invoke('move-window', pos),
  getWindowPos: () => ipcRenderer.invoke('get-window-pos'),

  // Shortcuts (prompter only)
  onShortcut: (cb) => ipcRenderer.on('shortcut', (_, action) => cb(action)),
})
