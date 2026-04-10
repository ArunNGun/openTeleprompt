import { useEffect, useRef, useState } from 'react'

const tauriInvoke = window.__TAURI__?.core?.invoke ?? (() => Promise.resolve(null))
const tauriListen = window.__TAURI__?.event?.listen ?? (() => Promise.resolve(() => {}))

const API = {
  getConfig:      () => tauriInvoke('get_config'),
  setConfig:      (patch) => tauriInvoke('set_config', { patch }),
  switchMode:     (mode) => tauriInvoke('switch_mode', { mode }),
  onConfigUpdate: (cb) => tauriListen('config-update', (e) => cb(e.payload)),
  togglePrompter: () => tauriInvoke('toggle_prompter'),
  resizeSettings: (dims) => tauriInvoke('resize_settings', { dims }),
  quit:           () => tauriInvoke('quit_app'),
  openDevTools:   () => tauriInvoke('open_devtools'),
  hideSettings:   () => tauriInvoke('hide_settings'),
}

const SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2]
const MIN_T = 0.003, MAX_T = 0.562
const sliderToThreshold = v => MIN_T * Math.pow(MAX_T / MIN_T, v / 100)
const thresholdToSlider = t => Math.round(Math.log(t / MIN_T) / Math.log(MAX_T / MIN_T) * 100)
const thresholdToDb = t => (20 * Math.log10(Math.max(t, 0.0001))).toFixed(0)
const isWin = navigator.userAgent.includes('Windows')

export default function SettingsView() {
  const [prompterVisible, setPrompterVisible] = useState(true)
  const [mode, setMode] = useState('notch')
  const [opacity, setOpacity] = useState(100)
  const [voiceInput, setVoiceInput] = useState(true)
  const [screenshare, setScreenshare] = useState(false)
  const [theme, setTheme] = useState('dark')
  const [speedIdx, setSpeedIdx] = useState(3)
  const [threshold, setThreshold] = useState(0.018)
  const [thresholdSlider, setThresholdSlider] = useState(24)
  const [mics, setMics] = useState([{ deviceId: 'default', label: 'Default microphone' }])
  const [micId, setMicId] = useState('default')
  const [meterPct, setMeterPct] = useState(0)
  const [meterActive, setMeterActive] = useState(false)

  const panelRef = useRef(null)
  const meterStreamRef = useRef(null)
  const meterIntervalRef = useRef(null)

  // Auto-resize window to panel height
  useEffect(() => {
    if (!panelRef.current) return
    const ro = new ResizeObserver(() => {
      const h = panelRef.current.getBoundingClientRect().height
      API.resizeSettings({ height: Math.ceil(h) + 2 })
    })
    ro.observe(panelRef.current)
    return () => ro.disconnect()
  }, [])

  // Load config + mics on mount
  useEffect(() => {
    API.getConfig().then(cfg => {
      if (cfg) {
        applyConfig(cfg)
        document.documentElement.setAttribute('data-theme', cfg.theme || 'dark')
      }
    })
    populateMics()
    startMeter()

    API.onConfigUpdate(applyConfig)

    const handler = (e) => {
      if (e.metaKey && e.altKey && e.code === 'KeyI') API.openDevTools()
    }
    document.addEventListener('keydown', handler)

    const onBlur = () => {
      setTimeout(() => { if (!document.hasFocus()) API.hideSettings() }, 150)
    }
    window.addEventListener('blur', onBlur)

    return () => {
      document.removeEventListener('keydown', handler)
      window.removeEventListener('blur', onBlur)
      stopMeter()
    }
  }, [])

  function applyConfig(c) {
    if (c.mode)         setMode(c.mode)
    if (c.opacity != null) setOpacity(Math.round(c.opacity * 100))
    if (c.autoScroll != null) setVoiceInput(!c.autoScroll)
    if (c.screenshareHidden != null) setScreenshare(!!c.screenshareHidden)
    if (c.theme) {
      setTheme(c.theme)
      document.documentElement.setAttribute('data-theme', c.theme)
    }
    if (c.scrollSpeed != null) {
      const i = SPEEDS.indexOf(c.scrollSpeed)
      setSpeedIdx(i !== -1 ? i : 3)
    }
    if (c.threshold != null) {
      setThreshold(c.threshold)
      setThresholdSlider(thresholdToSlider(c.threshold))
    }
    if (c.micDeviceId)  setMicId(c.micDeviceId)
  }

  async function populateMics() {
    try {
      const tmp = await navigator.mediaDevices.getUserMedia({ audio: true })
      tmp.getTracks().forEach(t => t.stop())
      const devices = await navigator.mediaDevices.enumerateDevices()
      const found = devices.filter(d => d.kind === 'audioinput').map(d => ({
        deviceId: d.deviceId,
        label: d.label || `Microphone (${d.deviceId.slice(0, 8)})`,
      }))
      if (found.length) setMics(found)
    } catch(e) {}
  }

  async function startMeter() {
    if (meterStreamRef.current) return
    try {
      meterStreamRef.current = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
      })
      const ctx = new AudioContext()
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 1024
      ctx.createMediaStreamSource(meterStreamRef.current).connect(analyser)
      const data = new Float32Array(analyser.fftSize)
      meterIntervalRef.current = setInterval(() => {
        analyser.getFloatTimeDomainData(data)
        let sum = 0; for (let i = 0; i < data.length; i++) sum += data[i] * data[i]
        const rms = Math.sqrt(sum / data.length)
        const db = rms > 0 ? 20 * Math.log10(rms) : -100
        const pct = Math.max(0, Math.min(100, (db + 60) / 60 * 100))
        setMeterPct(pct)
        setMeterActive(rms > sliderToThreshold(thresholdSlider))
      }, 32)
    } catch(e) {}
  }

  function stopMeter() {
    if (meterIntervalRef.current) { clearInterval(meterIntervalRef.current); meterIntervalRef.current = null }
    if (meterStreamRef.current) { meterStreamRef.current.getTracks().forEach(t => t.stop()); meterStreamRef.current = null }
    setMeterPct(0)
    setMeterActive(false)
  }

  async function handlePrompterToggle(checked) {
    const isVisible = await API.togglePrompter()
    setPrompterVisible(isVisible)
    if (isVisible) startMeter(); else stopMeter()
  }

  function handleMode(m) {
    setMode(m)
    API.switchMode(m)
  }

  function handleOpacity(v) {
    setOpacity(v)
    API.setConfig({ opacity: v / 100 })
  }

  function handleVoiceInput(checked) {
    setVoiceInput(checked)
    API.setConfig({ autoScroll: !checked })
  }

  function handleScreenshare(checked) {
    setScreenshare(checked)
    API.setConfig({ screenshareHidden: checked })
  }

  function handleTheme(checked) {
    const t = checked ? 'light' : 'dark'
    setTheme(t)
    API.setConfig({ theme: t })
  }

  function handleSpeed(v) {
    setSpeedIdx(v)
    API.setConfig({ scrollSpeed: SPEEDS[v] })
  }

  function handleThresholdSlider(v) {
    const t = sliderToThreshold(v)
    setThresholdSlider(v)
    setThreshold(t)
    API.setConfig({ threshold: t })
  }

  function handleMic(deviceId) {
    setMicId(deviceId)
    API.setConfig({ micDeviceId: deviceId })
  }

  const thresholdPct = thresholdSlider + '%'

  return (
    <div id="panel" ref={panelRef}>
      {/* Header */}
      <div className="s-header">
        <span className="s-title">✦ Teleprompter</span>
        <button className="s-quit" onClick={() => API.quit()}>Quit</button>
      </div>

      <div className="s-body">
        {/* Show Prompter */}
        <Row label="Show Prompter">
          <Toggle checked={prompterVisible} onChange={handlePrompterToggle} />
        </Row>

        {prompterVisible && <>
          <Divider />

          {/* Style — hidden on Windows */}
          {!isWin && <>
            <Row label="Style">
              <div className="s-mode-group">
                {['notch','classic'].map(m => (
                  <button
                    key={m}
                    className={`s-mode-btn${mode === m ? ' active' : ''}`}
                    onClick={() => handleMode(m)}
                  >{m.charAt(0).toUpperCase() + m.slice(1)}</button>
                ))}
              </div>
            </Row>
            <Divider />
          </>}

          {/* Opacity */}
          <Row label="Opacity" val={opacity + '%'}>
            <input type="range" className="s-slider" min="20" max="100" step="5"
              value={opacity} onChange={e => handleOpacity(+e.target.value)} />
          </Row>

          <Divider />

          {/* Voice Input */}
          <Row label="Voice Input">
            <Toggle checked={voiceInput} onChange={handleVoiceInput} />
          </Row>

          <Divider />

          {/* Hide on screen share */}
          <Row label="Hide on screen share">
            <Toggle checked={screenshare} onChange={handleScreenshare} />
          </Row>

          <Divider />

          {/* Light Theme */}
          <Row label="Light Theme">
            <Toggle checked={theme === 'light'} onChange={handleTheme} />
          </Row>

          <Divider />

          {/* Microphone */}
          <div className="s-row s-col">
            <span className="s-label">Microphone</span>
            <select className="s-select" value={micId} onChange={e => handleMic(e.target.value)}>
              {mics.map(m => <option key={m.deviceId} value={m.deviceId}>{m.label}</option>)}
            </select>
          </div>

          <Divider />

          {/* Scroll Speed */}
          <Row label="Scroll Speed" val={SPEEDS[speedIdx] + '×'}>
            <input type="range" className="s-slider" min="0" max="7" step="1"
              value={speedIdx} onChange={e => handleSpeed(+e.target.value)} />
          </Row>

          <Divider />

          {/* Voice Sensitivity */}
          <Row label="Voice Sensitivity" val={thresholdToDb(threshold) + ' dB'}>
            <div className="s-meter">
              <div className="s-meter-fill" style={{ width: meterPct.toFixed(1) + '%', background: meterActive ? '#22c55e' : 'rgba(255,255,255,0.15)' }} />
              <div className="s-meter-mark" style={{ left: thresholdPct }} />
            </div>
            <input type="range" className="s-slider" min="0" max="100" step="1"
              value={thresholdSlider} onChange={e => handleThresholdSlider(+e.target.value)} />
          </Row>

          <Divider />

          {/* Shortcuts */}
          <Shortcut label="Pause / Resume"   keys="⌘⇧Space" />
          <Shortcut label="Speed Up / Down"  keys="⌘⇧↑↓" />
          <Shortcut label="Reset to Top"     keys="⌘⇧R" />
        </>}

        <Divider />

        {/* Author */}
        <div className="s-author">
          <div>
            <div className="s-built-by">Built by</div>
            <div className="s-name">Arun Kumar</div>
          </div>
          <a
            className="s-github"
            href="#"
            onClick={e => { e.preventDefault(); tauriInvoke('open_url', { url: 'https://github.com/ArunNGun/openTeleprompt' }) }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/></svg>
            ArunNGun
          </a>
        </div>
      </div>
    </div>
  )
}

function Row({ label, val, children }) {
  return (
    <div className={`s-row${val !== undefined ? ' s-slider-row' : ''}`}>
      <div className="s-row-top">
        <span className="s-label">{label}</span>
        {val && <span className="s-val">{val}</span>}
        {!val && children}
      </div>
      {val && <div className="s-row-control">{children}</div>}
    </div>
  )
}

function Toggle({ checked, onChange }) {
  return (
    <label className="s-switch">
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} />
      <span className="s-sw" />
    </label>
  )
}

function Divider() { return <div className="s-divider" /> }

function Shortcut({ label, keys }) {
  return (
    <div className="s-shortcut">
      <span className="s-sc-label">{label}</span>
      <span className="s-sc-key">{keys}</span>
    </div>
  )
}
