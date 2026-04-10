import { useEffect, useState } from 'react'
import { useAppStore } from './store'
import { API } from './lib/api'
import IdleView from './views/IdleView'
import EditView from './views/EditView'
import ReadView from './views/ReadView'

// Island sizes — small shadow bleed (20px sides, 20px bottom) so box-shadow renders fully.
const SB = 20  // side bleed
const BB = 20  // bottom bleed
const ISLAND_SIZES = {
  idle:      { w: 213,        h: 38       },
  idleHover: { w: 236,        h: 48       },
  edit:      { w: 560 + SB*2, h: 340 + BB },
  read:      { w: 440 + SB*2, h: 205 + BB },
}

export default function App() {
  const { view, config, setConfig, setScripts, setCurrentScriptIndex, setScriptText, setScriptDoc, setView } = useAppStore()
  const [isHovered, setIsHovered] = useState(false)

  useEffect(() => {
    // Load config FIRST
    API.getConfig().then((cfg) => {
      if (!cfg) return
      const mode = cfg.mode ?? 'notch'
      setConfig({
        mode,
        scrollSpeed: cfg.scrollSpeed ?? cfg.scroll_speed ?? 1,
        fontSize: cfg.fontSize ?? cfg.font_size ?? 16,
        opacity: cfg.opacity ?? 1,
        threshold: cfg.threshold ?? 0.018,
        autoScroll: cfg.autoScroll ?? cfg.auto_scroll ?? false,
        micDeviceId: cfg.micDeviceId ?? cfg.mic_device_id ?? 'default',
      })
      // Always keep window mouse-responsive.
      // CSS pointer-events:none on body/root handles transparent-area pass-through.
      // setIgnoreMouse(false) ensures WKWebView hit-testing is always active.
      API.setIgnoreMouse(false)
    })

    // Load scripts
    API.getScripts().then((s) => { if (s) setScripts(s) })

    // Config updates from settings window — apply immediately
    API.onConfigUpdate((cfg) => {
      if (!cfg) return
      const patch = {
        mode:        cfg.mode        ?? undefined,
        scrollSpeed: cfg.scrollSpeed ?? cfg.scroll_speed ?? undefined,
        opacity:     cfg.opacity     ?? undefined,
        threshold:   cfg.threshold   ?? undefined,
        autoScroll:  cfg.autoScroll  ?? cfg.auto_scroll  ?? undefined,
        micDeviceId: cfg.micDeviceId ?? cfg.mic_device_id ?? undefined,
        fontSize:    cfg.fontSize    ?? cfg.font_size     ?? undefined,
        theme:       cfg.theme       ?? undefined,
      }
      // Strip undefined keys
      Object.keys(patch).forEach(k => patch[k] === undefined && delete patch[k])
      setConfig(patch)
      if (cfg.opacity !== undefined) document.documentElement.style.opacity = cfg.opacity
    })

    // Probe mic permission immediately
    ;(async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        stream.getTracks().forEach(t => t.stop())
      } catch (e) {}
    })()
  }, [])

  useEffect(() => {
    document.documentElement.style.opacity = config.opacity
  }, [config.opacity])

  useEffect(() => {
    if (config.mode === 'classic') {
      document.body.classList.add('mode-classic')
    } else {
      document.body.classList.remove('mode-classic')
    }
    API.setIgnoreMouse(false)
  }, [config.mode])

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', config.theme || 'dark')
  }, [config.theme])

  // Resize Tauri window to exactly match island size at all times (notch mode only)
  useEffect(() => {
    if (config.mode === 'classic') return
    let size
    if (view === 'edit') size = ISLAND_SIZES.edit
    else if (view === 'read') size = ISLAND_SIZES.read
    else size = isHovered ? ISLAND_SIZES.idleHover : ISLAND_SIZES.idle
    API.resizePrompter({ width: size.w, height: size.h })
  }, [view, isHovered, config.mode])

  // Island class mirrors v2 showView() logic
  const islandClass = [
    config.mode === 'classic' ? 'mode-classic' : '',
    view === 'edit' ? 'state-edit' : '',
    view === 'read' ? 'state-read' : '',
  ].filter(Boolean).join(' ')

  function handleMouseEnter() {
    setIsHovered(true)
    if (config.mode !== 'classic') API.focusPrompter()
  }

  function handleMouseLeave() {
    setIsHovered(false)
    // Window stays mouse-responsive always — CSS handles pointer-events pass-through.
  }

  function handleMouseDown(e) {
    if (config.mode !== 'classic') return
    if (e.target.closest('button, input, textarea, select')) return
    e.preventDefault()
    API.startDrag()
  }

  const isExpanded = (view === 'edit' || view === 'read') && config.mode !== 'classic'
  const islandW = view === 'edit' ? 560 : view === 'read' ? 440 : 0
  const cornerLeft  = isExpanded ? `calc(50% - ${islandW / 2}px - 20px)` : '0'
  const cornerRight = isExpanded ? `calc(50% + ${islandW / 2}px)` : '0'

  return (
    <>
      {/* Concave anti-notch corners */}
      <div className={`notch-corner notch-corner-left${isExpanded ? ' visible' : ''}`}  style={{ left: cornerLeft }} />
      <div className={`notch-corner notch-corner-right${isExpanded ? ' visible' : ''}`} style={{ left: cornerRight }} />

      <div id="island" className={islandClass} onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave} onMouseDown={handleMouseDown}>
        {view === 'idle' && <IdleView isHovered={isHovered} />}
        {view === 'edit' && <EditView />}
        {view === 'read' && <ReadView />}
      </div>
    </>
  )
}
