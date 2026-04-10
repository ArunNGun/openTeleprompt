import { useEffect, useRef, useState } from 'react'
import { useAppStore } from './store'
import { API } from './lib/api'
import IdleView from './views/IdleView'
import EditView from './views/EditView'
import ReadView from './views/ReadView'

// Island sizes — 20px side + bottom bleed so box-shadow renders fully
const SB = 20
const BB = 20
const ISLAND_SIZES = {
  idle:      { w: 213,          h: 38       },
  idleHover: { w: 236,          h: 48       },
  edit:      { w: 560 + SB * 2, h: 340 + BB },
  read:      { w: 440 + SB * 2, h: 205 + BB },
}
// Classic: window = island size exactly, OS handles shadow
const CLASSIC_SIZES = {
  idle:      { w: 240, h: 80  },
  idleHover: { w: 260, h: 88  },
  edit:      { w: 580, h: 360 },
  read:      { w: 460, h: 240 },
}

export default function App() {
  const { view, config, setConfig, setScripts, setView } = useAppStore()
  const [isHovered, setIsHovered] = useState(false)
  const isClassic = config.mode === 'classic'

  // ── Bootstrap ──────────────────────────────────────────────
  useEffect(() => {
    // Load config
    API.getConfig().then((cfg) => {
      if (!cfg) return
      setConfig({
        mode:        cfg.mode        ?? 'notch',
        theme:       cfg.theme       ?? 'dark',
        scrollSpeed: cfg.scrollSpeed ?? cfg.scroll_speed ?? 1,
        fontSize:    cfg.fontSize    ?? cfg.font_size    ?? 16,
        opacity:     cfg.opacity     ?? 1,
        threshold:   cfg.threshold   ?? 0.018,
        autoScroll:  cfg.autoScroll  ?? cfg.auto_scroll  ?? false,
        micDeviceId: cfg.micDeviceId ?? cfg.mic_device_id ?? 'default',
      })
      API.setIgnoreMouse(false)
    })

    // Load scripts
    API.getScripts().then((s) => { if (s) setScripts(s) })

    // Live config updates from settings window
    API.onConfigUpdate((cfg) => {
      if (!cfg) return
      const patch = {}
      const keys = ['mode','theme','scrollSpeed','scroll_speed','opacity','threshold',
                    'autoScroll','auto_scroll','micDeviceId','mic_device_id','fontSize','font_size']
      keys.forEach(k => { if (cfg[k] !== undefined) patch[k] = cfg[k] })
      // Normalise snake_case → camelCase
      if (patch.scroll_speed  !== undefined) { patch.scrollSpeed  = patch.scroll_speed;  delete patch.scroll_speed }
      if (patch.auto_scroll   !== undefined) { patch.autoScroll   = patch.auto_scroll;   delete patch.auto_scroll  }
      if (patch.mic_device_id !== undefined) { patch.micDeviceId  = patch.mic_device_id; delete patch.mic_device_id }
      if (patch.font_size     !== undefined) { patch.fontSize     = patch.font_size;     delete patch.font_size     }
      if (Object.keys(patch).length) setConfig(patch)
    })

    // Probe mic permission once so browser doesn't ask mid-session
    navigator.mediaDevices?.getUserMedia({ audio: true })
      .then(s => s.getTracks().forEach(t => t.stop()))
      .catch(() => {})
  }, [])

  // ── Side-effects from config ───────────────────────────────
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', config.theme || 'dark')
  }, [config.theme])

  useEffect(() => {
    document.body.classList.toggle('mode-classic', isClassic)
    API.setIgnoreMouse(false)
  }, [config.mode])

  useEffect(() => {
    document.documentElement.style.opacity = config.opacity ?? 1
  }, [config.opacity])

  // ── Window resize ──────────────────────────────────────────
  useEffect(() => {
    const sizes = isClassic ? CLASSIC_SIZES : ISLAND_SIZES
    const size  = view === 'edit' ? sizes.edit
                : view === 'read' ? sizes.read
                : isHovered       ? sizes.idleHover
                : sizes.idle
    API.resizePrompter({ width: size.w, height: size.h })
  }, [view, isHovered, config.mode])

  // ── Event handlers ─────────────────────────────────────────
  function handleMouseEnter() {
    setIsHovered(true)
    if (!isClassic) API.focusPrompter()
  }
  function handleMouseLeave() { setIsHovered(false) }
  function handleMouseDown(e) {
    if (!isClassic) return
    if (e.target.closest('button, input, textarea, select, svg')) return
    e.preventDefault()
    API.startDrag()
  }

  // ── Derived render values ──────────────────────────────────
  const isExpanded   = !isClassic && (view === 'edit' || view === 'read')
  const islandW      = view === 'edit' ? 560 : view === 'read' ? 440 : 0
  const cornerLeft   = isExpanded ? `calc(50% - ${islandW / 2}px - 20px)` : '0'
  const cornerRight  = isExpanded ? `calc(50% + ${islandW / 2}px)` : '0'
  const islandClass  = [
    isClassic       ? 'mode-classic' : '',
    view === 'edit' ? 'state-edit'   : '',
    view === 'read' ? 'state-read'   : '',
  ].filter(Boolean).join(' ')

  const isBrowser = !window.__TAURI__

  return (
    <>
      {/* Concave anti-notch corners (notch mode only) */}
      <div className={`notch-corner notch-corner-left${isExpanded ? ' visible' : ''}`}  style={{ left: cornerLeft }} />
      <div className={`notch-corner notch-corner-right${isExpanded ? ' visible' : ''}`} style={{ left: cornerRight }} />

      <div
        id="island"
        className={islandClass}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onMouseDown={handleMouseDown}
      >
        {view === 'idle' && <IdleView isHovered={isHovered} />}
        {view === 'edit' && <EditView />}
        {view === 'read' && <ReadView />}
      </div>

      {/* Dev panel — browser only, hidden in Tauri */}
      {isBrowser && (
        <div id="dev-panel">
          <div className="dev-label">DEV</div>
          <div className="dev-row">
            <span>View</span>
            <select value={view} onChange={e => setView(e.target.value)}>
              <option value="idle">Idle</option>
              <option value="edit">Edit</option>
              <option value="read">Read</option>
            </select>
          </div>
          <div className="dev-row">
            <span>Mode</span>
            <select value={config.mode || 'notch'} onChange={e => setConfig({ mode: e.target.value })}>
              <option value="notch">Notch</option>
              <option value="classic">Classic</option>
            </select>
          </div>
          <div className="dev-row">
            <span>Theme</span>
            <select value={config.theme || 'dark'} onChange={e => setConfig({ theme: e.target.value })}>
              <option value="dark">Dark</option>
              <option value="light">Light</option>
            </select>
          </div>
        </div>
      )}
    </>
  )
}
