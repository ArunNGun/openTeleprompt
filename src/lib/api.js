const tauriInvoke = window.__TAURI__?.core?.invoke ?? (() => Promise.resolve(null))
const tauriListen = window.__TAURI__?.event?.listen ?? (() => Promise.resolve(() => {}))

export const API = {
  elevateNotchWindow: () => invoke('elevate_notch_window'),
  platform: navigator.platform.toLowerCase().includes('win') ? 'win32' : 'darwin',
  getConfig: () => tauriInvoke('get_config'),
  setConfig: (patch) => tauriInvoke('set_config', { patch }),
  onConfigUpdate: (cb) => tauriListen('config-update', (e) => cb(e.payload)),
  getScripts: () => tauriInvoke('get_scripts'),
  saveScripts: (scripts) => tauriInvoke('save_scripts', { scripts }),
  setIgnoreMouse: (ignore) => tauriInvoke('set_ignore_mouse', { ignore }),
  resizePrompter: (dims) => tauriInvoke('resize_prompter', { dims }),
  resizeSettings: (dims) => tauriInvoke('resize_settings', { dims }),
  quit: () => tauriInvoke('quit_app'),
  openDevTools: () => tauriInvoke('open_devtools'),
  setMovable: (v) => tauriInvoke('set_movable', { movable: v }),
  moveWindow: (pos) => tauriInvoke('move_window', { pos }),
  getWindowPos: () => tauriInvoke('get_window_pos'),
  startDrag: () => tauriInvoke('start_drag'),
  onShortcut: (cb) => tauriListen('shortcut', (e) => cb(e.payload)),
  focusPrompter: () => tauriInvoke('focus_prompter'),
}
