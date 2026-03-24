// ── Tauri IPC bridge (replaces window.electronAPI) ────────
// All invoke calls go to Tauri Rust commands.
// Events are received via window.__TAURI__.event.listen()
const tauriInvoke = window.__TAURI__?.core?.invoke ?? (() => Promise.resolve(null))
const tauriListen = window.__TAURI__?.event?.listen ?? (() => Promise.resolve(() => {}))

const API = {
  platform: navigator.platform.toLowerCase().includes('win') ? 'win32' : 'darwin',
  getConfig: () => tauriInvoke('get_config'),
  setConfig: (patch) => tauriInvoke('set_config', { patch }),
  onConfigUpdate: (cb) => { tauriListen('config-update', (e) => cb(e.payload)) },
  getScripts: () => tauriInvoke('get_scripts'),
  saveScripts: (scripts) => tauriInvoke('save_scripts', { scripts }),
  setIgnoreMouse: (ignore) => tauriInvoke('set_ignore_mouse', { ignore }),
  resizePrompter: (dims) => tauriInvoke('resize_prompter', { dims }),
  togglePrompter: () => tauriInvoke('toggle_prompter'),
  resizeSettings: (dims) => tauriInvoke('resize_settings', { dims }),
  quit: () => tauriInvoke('quit_app'),
  openDevTools: () => tauriInvoke('open_devtools'),
  setMovable: (v) => tauriInvoke('set_movable', { movable: v }),
  moveWindow: (pos) => tauriInvoke('move_window', { pos }),
  getWindowPos: () => tauriInvoke('get_window_pos'),
  startDrag: () => tauriInvoke('start_drag'),
  setHideFromCapture: (hide) => tauriInvoke('set_hide_from_capture', { hide }),
  refreshOverlayBehavior: () => tauriInvoke('refresh_overlay_behavior'),
  onShortcut: (cb) => { tauriListen('shortcut', (e) => cb(e.payload)) },
}

// ── State ──────────────────────────────────────────────────
const state = {
  scrollSpeed: 1,
  isPaused: false,
  isHoverPaused: false,
  micStream: null,
  audioCtx: null,
  analyserInterval: null,
  scrollAnimFrame: null,
  isSpeaking: false,
  silenceTimer: null,
  isRunning: false,
  scripts: [],
  currentScriptIndex: -1,
  currentScriptImages: {},
}

let VOLUME_THRESHOLD = 0.018
let autoScroll = false
const SILENCE_DELAY_MS = 400
const SCROLL_SPEED_BASE = 0.1
let fontSize = 16  // default font size in px

const SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2]
let speedIndex = 3

// ── DOM ────────────────────────────────────────────────────
const island = document.getElementById('island')
const scrollVP = document.getElementById('scroll-viewport')

const scriptText = document.getElementById('script-text')
const statusText = document.getElementById('status-text')
const micRing = document.getElementById('mic-ring')
const speedVal = document.getElementById('speed-val')
const scriptInput = document.getElementById('script-input')
const scriptImagePreview = document.getElementById('script-image-preview')
const scriptStats = document.getElementById('script-stats')
const hideCaptureBtn = document.getElementById('btn-hide-capture')
const volBar = document.getElementById('vol-bar')
const volLabel = document.getElementById('vol-label')
const idleDot = document.getElementById('idle-dot')
const HIDE_CAPTURE_KEY = 'teleprompter.hideFromCapture'
let hideFromCapture = false

function renderHideCaptureButton() {
  if (!hideCaptureBtn) return
  hideCaptureBtn.textContent = hideFromCapture ? 'No Capture: On' : 'No Capture: Off'
  hideCaptureBtn.classList.toggle('active', hideFromCapture)
}

async function applyHideFromCapture(enabled) {
  hideFromCapture = !!enabled
  localStorage.setItem(HIDE_CAPTURE_KEY, hideFromCapture ? '1' : '0')
  renderHideCaptureButton()
  try {
    await API.setHideFromCapture(hideFromCapture)
  } catch (_) {}
}

// ── View switching ─────────────────────────────────────────
function showView(name) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'))
  island.className = ''
  if (name === 'idle') {
    document.getElementById('view-idle').classList.add('active')
    API.resizePrompter({ width: 220, height: 50 })
  } else if (name === 'edit') {
    document.getElementById('view-edit').classList.add('active')
    island.classList.add('state-edit')
    API.resizePrompter({ width: 560, height: 300 })
    setTimeout(() => scriptInput.focus(), 300)
  } else if (name === 'read') {
    document.getElementById('view-read').classList.add('active')
    island.classList.add('state-read')
    API.resizePrompter({ width: 420, height: 170 })
  }
}

// ── Scripts persistence ────────────────────────────────────
async function loadScripts() {
  state.scripts = await API.getScripts()
  renderScriptList()
}

function saveScripts() {
  API.saveScripts(state.scripts)
}

function renderScriptList() {
  const list = document.getElementById('script-list')
  if (!list) return
  list.innerHTML = ''
  state.scripts.forEach((s, i) => {
    const item = document.createElement('div')
    item.className = 'script-item' + (i === state.currentScriptIndex ? ' active' : '')
    item.innerHTML = `<span class="script-name">${s.name}</span><button class="script-del" data-i="${i}">✕</button>`
    item.querySelector('.script-name').addEventListener('click', () => loadScript(i))
    item.querySelector('.script-del').addEventListener('click', (e) => { e.stopPropagation(); deleteScript(i) })
    list.appendChild(item)
  })
}

function saveCurrentScript() {
  const text = scriptInput.value.trim()
  if (!text) return
  const name = text.split('\n')[0].substring(0, 40) || 'Untitled'
  const storedText = serializeScriptText(scriptInput.value, state.currentScriptImages)
  if (state.currentScriptIndex >= 0) {
    state.scripts[state.currentScriptIndex] = { name, text: storedText }
  } else {
    state.scripts.unshift({ name, text: storedText })
    state.currentScriptIndex = 0
  }
  saveScripts()
  renderScriptList()
}

function loadScript(i) {
  state.currentScriptIndex = i
  const parsed = parseStoredScript(state.scripts[i].text || '')
  scriptInput.value = parsed.text
  state.currentScriptImages = parsed.images
  updateStats(parsed.text)
  renderScriptImagePreview()
  renderScriptList()
}

function deleteScript(i) {
  state.scripts.splice(i, 1)
  if (state.currentScriptIndex >= i) state.currentScriptIndex--
  saveScripts()
  renderScriptList()
}



// ── Word count + read time ─────────────────────────────────
function updateStats(text) {
  const words = text.trim() ? text.trim().split(/\s+/).length : 0
  const mins = Math.ceil(words / 130)
  const secs = Math.round((words / 130) * 60)
  const timeStr = secs < 60 ? `${secs}s` : `${Math.floor(secs/60)}m ${secs%60}s`
  scriptStats.innerHTML = words
    ? `<span>${words} words</span><span>~${timeStr} at 130 WPM</span>`
    : ''
}

function parseStoredScript(storedText) {
  const marker = '\n[[__images__:'
  const markerIndex = storedText.lastIndexOf(marker)
  if (markerIndex === -1 || !storedText.endsWith(']]')) {
    return { text: storedText, images: {} }
  }
  const encoded = storedText.slice(markerIndex + marker.length, -2)
  const text = storedText.slice(0, markerIndex)
  try {
    const images = JSON.parse(atob(encoded))
    if (images && typeof images === 'object') return { text, images }
  } catch (_) {}
  return { text: storedText, images: {} }
}

function serializeScriptText(text, images) {
  if (!images || !Object.keys(images).length) return text
  return `${text}\n[[__images__:${btoa(JSON.stringify(images))}]]`
}

function getImageRefsFromScript(text) {
  const refs = []
  const rx = /\[\[image:([^\]]+)\]\]/g
  let match
  while ((match = rx.exec(text)) !== null) {
    refs.push(match[1])
  }
  return refs
}

function renderScriptImagePreview() {
  if (!scriptImagePreview) return
  const refs = getImageRefsFromScript(scriptInput.value)
  const uniqueRefs = Array.from(new Set(refs))
  if (!uniqueRefs.length) {
    scriptImagePreview.innerHTML = ''
    scriptImagePreview.style.display = 'none'
    return
  }
  scriptImagePreview.style.display = 'flex'
  scriptImagePreview.innerHTML = ''
  uniqueRefs.forEach((ref) => {
    const src = state.currentScriptImages[ref] || (ref.startsWith('data:image/') ? ref : null)
    if (!src) return
    const item = document.createElement('div')
    item.className = 'script-image-item'
    const img = document.createElement('img')
    img.src = src
    img.alt = 'Script image preview'
    img.className = 'script-image-thumb'
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'script-image-remove'
    btn.textContent = '✕'
    btn.addEventListener('click', () => removeImageToken(ref))
    item.appendChild(img)
    item.appendChild(btn)
    scriptImagePreview.appendChild(item)
  })
}

function removeImageToken(ref) {
  const escaped = ref.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const linePattern = new RegExp(`(^|\\n)\\[\\[image:${escaped}\\]\\](?=\\n|$)`, 'g')
  scriptInput.value = scriptInput.value.replace(linePattern, '')
  const inlinePattern = new RegExp(`\\[\\[image:${escaped}\\]\\]\\n?`, 'g')
  scriptInput.value = scriptInput.value.replace(inlinePattern, '')
  scriptInput.value = scriptInput.value.replace(/\n{3,}/g, '\n\n').replace(/^\n+/, '')
  delete state.currentScriptImages[ref]
  updateStats(scriptInput.value)
  renderScriptImagePreview()
}

// ── Build script ───────────────────────────────────────────
function buildScript(text) {
  scriptText.innerHTML = ''
  scriptText.classList.remove('has-images', 'image-only')
  const topImages = []
  const textLines = []
  const lines = text.split('\n')
  for (const line of lines) {
    const imageMatch = line.trim().match(/^\[\[image:(.+)\]\]$/)
    if (imageMatch) {
      const imageRef = imageMatch[1]
      const src = state.currentScriptImages[imageRef] || imageRef
      if (src) topImages.push(src)
      continue
    }
    textLines.push(line)
  }
  topImages.forEach((src) => {
    const img = document.createElement('img')
    img.src = src
    img.alt = 'Script image'
    img.className = 'script-inline-image script-top-image'
    scriptText.appendChild(img)
  })
  textLines.forEach((line) => {
    const p = document.createElement('p')
    p.textContent = line.length ? line : '\u00A0'
    scriptText.appendChild(p)
  })
  if (!topImages.length && !textLines.length) {
    const p = document.createElement('p')
    p.textContent = '\u00A0'
    scriptText.appendChild(p)
  }
  if (topImages.length) scriptText.classList.add('has-images')
  if (topImages.length && !textLines.some((line) => line.trim().length)) scriptText.classList.add('image-only')
}

async function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

function insertAtCursor(el, value) {
  const start = el.selectionStart ?? el.value.length
  const end = el.selectionEnd ?? el.value.length
  const before = el.value.slice(0, start)
  const after = el.value.slice(end)
  el.value = before + value + after
  const caret = start + value.length
  el.selectionStart = caret
  el.selectionEnd = caret
  updateStats(el.value)
  renderScriptImagePreview()
}

async function insertImageFiles(files) {
  const imageFiles = Array.from(files).filter((file) => file.type.startsWith('image/'))
  if (!imageFiles.length) return
  for (const file of imageFiles) {
    const dataUrl = await fileToDataUrl(file)
    const imageId = `img_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    state.currentScriptImages[imageId] = dataUrl
    const token = `${scriptInput.value.endsWith('\n') || !scriptInput.value ? '' : '\n'}[[image:${imageId}]]\n`
    insertAtCursor(scriptInput, token)
  }
}

// ── Speed ──────────────────────────────────────────────────
function setSpeed(index) {
  speedIndex = Math.max(0, Math.min(SPEEDS.length - 1, index))
  state.scrollSpeed = SPEEDS[speedIndex]
  speedVal.textContent = state.scrollSpeed + '×'
}

// Use float scroll position for perfectly smooth sub-pixel motion
let scrollPos = 0

// ── Scroll loop ────────────────────────────────────────────
let lastFrameTime = 0
function scrollLoop(timestamp) {
  if (!state.isRunning) return
  const paused = state.isPaused || state.isHoverPaused
  const shouldScroll = autoScroll ? !paused : (state.isSpeaking && !paused)
  if (shouldScroll) {
    const delta = lastFrameTime ? Math.min((timestamp - lastFrameTime) / 16.667, 3) : 1
    lastFrameTime = timestamp
    const maxScroll = scriptText.scrollHeight - scrollVP.clientHeight
    if (scrollPos < maxScroll - 1) {
      scrollPos += SCROLL_SPEED_BASE * state.scrollSpeed * delta
      scrollPos = Math.min(scrollPos, maxScroll)
      scriptText.style.transform = `translateY(${-scrollPos}px)`
    }
  } else {
    lastFrameTime = 0
  }
  state.scrollAnimFrame = requestAnimationFrame(scrollLoop)
}

// ── Mic ────────────────────────────────────────────────────
async function startMic() {
  // In auto-scroll mode — skip mic, just scroll
  if (autoScroll) {
    state.isRunning = true
    state.isSpeaking = false
    setMicState('auto', 'Auto')
    requestAnimationFrame(scrollLoop)
    return
  }

  try {
    const cfg = await API.getConfig()
    const deviceId = cfg.micDeviceId && cfg.micDeviceId !== 'default' ? cfg.micDeviceId : undefined

    const audioConstraints = {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
      suppressLocalAudioPlayback: true,
    }
    if (deviceId) audioConstraints.deviceId = { exact: deviceId }

    try {
      state.micStream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints })
    } catch(e) {
      if (e.name === 'OverconstrainedError' && deviceId) {
        // Saved device ID is no longer valid — fall back to default mic
        console.warn('Saved mic device unavailable, falling back to default')
        delete audioConstraints.deviceId
        state.micStream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints })
      } else {
        throw e
      }
    }
  } catch(e) { console.error('MIC ERROR:', e.name, e.message, e); setMicState('error', 'Mic blocked'); return }

  state.audioCtx = new AudioContext()
  const source = state.audioCtx.createMediaStreamSource(state.micStream)
  const analyser = state.audioCtx.createAnalyser()
  analyser.fftSize = 2048
  analyser.smoothingTimeConstant = 0.3
  source.connect(analyser)

  const freqData = new Float32Array(analyser.frequencyBinCount)
  const timeData = new Float32Array(analyser.fftSize)
  const sampleRate = state.audioCtx.sampleRate
  const binHz = sampleRate / analyser.fftSize

  // Sustained voice detection — requires N consecutive frames of voice activity
  // This prevents bursts of music/audio from triggering scroll
  let voiceFrameCount = 0
  const VOICE_FRAMES_REQUIRED = 8  // ~130ms of sustained voice before scrolling

  function isVoiceFrequency() {
    analyser.getFloatFrequencyData(freqData)
    const voiceLow = Math.floor(85 / binHz)
    const voiceHigh = Math.ceil(3400 / binHz)
    const highStart = Math.ceil(4000 / binHz)
    const highEnd = Math.ceil(8000 / binHz)

    let voiceEnergy = 0, highEnergy = 0
    for (let i = voiceLow; i < voiceHigh && i < freqData.length; i++)
      voiceEnergy += Math.pow(10, freqData[i] / 20)
    for (let i = highStart; i < highEnd && i < freqData.length; i++)
      highEnergy += Math.pow(10, freqData[i] / 20)

    const voiceAvg = voiceEnergy / (voiceHigh - voiceLow)
    const highAvg = highEnergy / (highEnd - highStart)
    const passesFreq = highAvg > 0 ? (voiceAvg / highAvg) > 2.5 : false

    if (passesFreq) {
      voiceFrameCount = Math.min(voiceFrameCount + 1, VOICE_FRAMES_REQUIRED)
    } else {
      voiceFrameCount = Math.max(voiceFrameCount - 2, 0)
    }

    return voiceFrameCount >= VOICE_FRAMES_REQUIRED
  }

  state.analyserInterval = setInterval(() => {
    analyser.getFloatTimeDomainData(timeData)
    let sum = 0
    for (let i = 0; i < timeData.length; i++) sum += timeData[i] * timeData[i]
    const rms = Math.sqrt(sum / timeData.length)
    const db = rms > 0 ? 20 * Math.log10(rms) : -100
    const pct = Math.max(0, Math.min(100, (db + 60) / 60 * 100))

    // Dual check: volume threshold AND voice frequency profile
    const isSpeech = rms > VOLUME_THRESHOLD && isVoiceFrequency()

    volBar.style.setProperty('--vol', pct.toFixed(1) + '%')
    volBar.style.setProperty('--vol-color', isSpeech ? '#22c55e' : 'rgba(255,255,255,0.25)')
    volLabel.textContent = db.toFixed(1) + ' dB'

    if (state.isPaused || state.isHoverPaused) return

    if (isSpeech) {
      if (state.silenceTimer) { clearTimeout(state.silenceTimer); state.silenceTimer = null }
      if (!state.isSpeaking) { state.isSpeaking = true; setMicState('listening', 'Speaking') }
    } else if (state.isSpeaking && !state.silenceTimer) {
      state.silenceTimer = setTimeout(() => {
        state.isSpeaking = false
        state.silenceTimer = null
        setMicState('waiting', 'Waiting…')
      }, SILENCE_DELAY_MS)
    }
  }, 16)

  state.isRunning = true
  state.isSpeaking = false
  setMicState('waiting', 'Waiting…')
  requestAnimationFrame(scrollLoop)
}

function stopMic() {
  state.isRunning = false
  state.isSpeaking = false
  if (state.analyserInterval) { clearInterval(state.analyserInterval); state.analyserInterval = null }
  if (state.silenceTimer) { clearTimeout(state.silenceTimer); state.silenceTimer = null }
  if (state.scrollAnimFrame) { cancelAnimationFrame(state.scrollAnimFrame); state.scrollAnimFrame = null }
  if (state.audioCtx) { state.audioCtx.close(); state.audioCtx = null }
  if (state.micStream) { state.micStream.getTracks().forEach(t => t.stop()); state.micStream = null }
}

function setMicState(type, label) {
  statusText.textContent = label
  micRing.className = 'mic-ring' + (type === 'listening' || type === 'auto' ? '' : type === 'error' ? ' error' : ' paused')
  idleDot.className = 'idle-dot' + (type === 'listening' || type === 'auto' ? ' listening' : type === 'waiting' ? '' : ' paused')
  // Auto-scroll: purple tint
  micRing.style.borderColor = type === 'auto' ? '#818cf8' : ''
  document.querySelector('.mic-core').style.background = type === 'auto' ? '#818cf8' : ''
}

function togglePause() {
  state.isPaused = !state.isPaused
  const btn = document.getElementById('btn-pause')
  if (state.isPaused) {
    state.isSpeaking = false
    btn.textContent = '▶'
    setMicState('paused', 'Paused')
  } else {
    btn.textContent = '⏸'
    setMicState('waiting', 'Waiting…')
  }
}

// ── Mouse wheel scroll (manual since overflow is hidden) ───
scrollVP.addEventListener('wheel', (e) => {
  e.preventDefault()
  const maxScroll = scriptText.scrollHeight - scrollVP.clientHeight
  scrollPos = Math.max(0, Math.min(scrollPos + e.deltaY, maxScroll))
  scriptText.style.transform = `translateY(${-scrollPos}px)`
}, { passive: false })

// Native drag via start_dragging Tauri command
function updateDragRegion(mode) {
  // no-op — drag handled via mousedown → start_drag command
}

island.addEventListener('mousedown', (e) => {
  if (currentMode !== 'classic') return
  // Don't drag when clicking buttons/inputs
  if (e.target.closest('button, input, textarea, select, #script-list')) return
  e.preventDefault()
  API.startDrag()
})

// ── Hover to pause + mouse passthrough (notch mode only) ───
let currentMode = 'notch'

function setupMouseBehavior(mode) {
  currentMode = mode
  updateDragRegion(mode)
  if (mode === 'notch') {
    document.body.classList.remove('mode-classic')
    API.setIgnoreMouse(false)
    API.setMovable(false)
  } else {
    document.body.classList.add('mode-classic')
    API.setIgnoreMouse(false)
    API.setMovable(true)
  }
}

island.addEventListener('mouseenter', () => {
  if (currentMode === 'notch') API.setIgnoreMouse(false)
  // Only hover-pause when actively reading (not in edit/idle)
  if (state.isRunning && island.classList.contains('state-read')) {
    state.isHoverPaused = true
    state.isSpeaking = false
    setMicState('paused', 'Hover pause')
  }
})
island.addEventListener('mouseleave', () => {
  // Only re-enable passthrough when actively reading — not in edit/idle states
  if (currentMode === 'notch' && state.isRunning && island.classList.contains('state-read')) {
    API.setIgnoreMouse(true)
  }
  if (state.isRunning && state.isHoverPaused) {
    state.isHoverPaused = false
    setMicState('waiting', 'Waiting…')
  }
})

// ── Global shortcuts from main process ────────────────────
API.onShortcut((action) => {
  if (action === 'pause') togglePause()
  if (action === 'faster') { setSpeed(speedIndex + 1); API.setConfig({ scrollSpeed: state.scrollSpeed }) }
  if (action === 'slower') { setSpeed(speedIndex - 1); API.setConfig({ scrollSpeed: state.scrollSpeed }) }
  if (action === 'reset') { scrollPos = 0; scriptText.style.transform = "translateY(0px)" }
  if (action === 'stop') { stopMic(); showView('idle') }
})

// ── Config updates from settings ───────────────────────────
API.onConfigUpdate((cfg) => {
  if (cfg.scrollSpeed !== undefined) {
    const i = SPEEDS.indexOf(cfg.scrollSpeed)
    if (i !== -1) setSpeed(i)
  }
  if (cfg.threshold !== undefined) VOLUME_THRESHOLD = cfg.threshold
  if (cfg.mode !== undefined) setupMouseBehavior(cfg.mode)
  if (cfg.autoScroll !== undefined) autoScroll = cfg.autoScroll
  if (cfg.opacity !== undefined) document.documentElement.style.opacity = cfg.opacity

  if (cfg.micDeviceId !== undefined && state.isRunning) {
    stopMic()
    setTimeout(() => startMic(), 200)
  }
})

// ── Events ─────────────────────────────────────────────────
document.getElementById('btn-open').addEventListener('click', () => showView('edit'))

document.getElementById('btn-collapse').addEventListener('click', () => { stopMic(); showView('idle') })

document.getElementById('btn-save').addEventListener('click', () => {
  saveCurrentScript()
})

document.getElementById('btn-start').addEventListener('click', () => {
  const text = scriptInput.value.trim()
  if (!text) return
  saveCurrentScript()
  buildScript(scriptInput.value)
  showView('read')
  scrollPos = 0
  scrollPos = 0; scriptText.style.transform = "translateY(0px)"
  startMic()
})

document.getElementById('btn-done').addEventListener('click', () => { stopMic(); showView('idle') })
document.getElementById('btn-back').addEventListener('click', () => { scrollPos = 0; scrollPos = 0; scriptText.style.transform = "translateY(0px)" })
document.getElementById('btn-pause').addEventListener('click', togglePause)

document.getElementById('btn-faster').addEventListener('click', () => setSpeed(speedIndex + 1))
document.getElementById('btn-slower').addEventListener('click', () => setSpeed(speedIndex - 1))

function setFontSize(size) {
  fontSize = Math.max(11, Math.min(32, size))
  scriptText.style.fontSize = fontSize + 'px'
}
document.getElementById('btn-font-up').addEventListener('click', () => setFontSize(fontSize + 2))
document.getElementById('btn-font-down').addEventListener('click', () => setFontSize(fontSize - 2))

document.getElementById('btn-new-script').addEventListener('click', () => {
  state.currentScriptIndex = -1
  state.currentScriptImages = {}
  scriptInput.value = ''
  updateStats('')
  renderScriptImagePreview()
  scriptInput.focus()
})

hideCaptureBtn?.addEventListener('click', () => {
  applyHideFromCapture(!hideFromCapture)
})

scriptInput.addEventListener('input', () => {
  updateStats(scriptInput.value)
  renderScriptImagePreview()
})
scriptInput.addEventListener('paste', async (e) => {
  const files = Array.from(e.clipboardData?.items || [])
    .map((item) => item.getAsFile())
    .filter(Boolean)
  if (!files.some((file) => file.type.startsWith('image/'))) return
  e.preventDefault()
  await insertImageFiles(files)
})
scriptInput.addEventListener('dragover', (e) => {
  e.preventDefault()
})
scriptInput.addEventListener('drop', async (e) => {
  e.preventDefault()
  await insertImageFiles(Array.from(e.dataTransfer?.files || []))
})

document.addEventListener('keydown', (e) => {
  if (e.code === 'Space' && document.activeElement !== scriptInput) { e.preventDefault(); togglePause() }
  if (e.code === 'ArrowDown' && document.activeElement !== scriptInput) scrollPos = Math.min(scrollPos + 40, scriptText.scrollHeight - scrollVP.clientHeight); scriptText.style.transform = `translateY(${-scrollPos}px)`
  if (e.code === 'ArrowUp' && document.activeElement !== scriptInput) scrollPos = Math.max(0, scrollPos - 40); scriptText.style.transform = `translateY(${-scrollPos}px)`
  if (e.code === 'Escape') { stopMic(); showView('idle') }
})

// ── Init ───────────────────────────────────────────────────
setSpeed(speedIndex)
setFontSize(fontSize)
loadScripts()
renderScriptImagePreview()
renderHideCaptureButton()

const initialHideCapture = localStorage.getItem(HIDE_CAPTURE_KEY) === '1'
applyHideFromCapture(initialHideCapture)
API.refreshOverlayBehavior().catch(() => {})

// Load config and init mouse behavior based on mode
API.getConfig().then(cfg => {
  if (cfg && cfg.scrollSpeed) { const i = SPEEDS.indexOf(cfg.scrollSpeed); if (i !== -1) setSpeed(i) }
  if (cfg && cfg.threshold) VOLUME_THRESHOLD = cfg.threshold
  if (cfg && cfg.autoScroll) autoScroll = cfg.autoScroll
  if (cfg && cfg.opacity !== undefined) document.documentElement.style.opacity = cfg.opacity
  setupMouseBehavior((cfg && cfg.mode) || 'notch')
})

// Probe mic permission on load so macOS shows the permission dialog immediately
// instead of waiting until the user hits Go
;(async () => {
  try {
    console.log('Probing mic permission...')
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    console.log('Mic probe success:', stream)
    stream.getTracks().forEach(t => t.stop())
  } catch(e) {
    console.error('Mic probe failed:', e.name, e.message, e)
  }
})()

showView('idle')
