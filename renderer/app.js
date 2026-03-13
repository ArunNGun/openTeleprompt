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
const scriptStats = document.getElementById('script-stats')
const volBar = document.getElementById('vol-bar')
const volLabel = document.getElementById('vol-label')
const idleDot = document.getElementById('idle-dot')

// ── View switching ─────────────────────────────────────────
function showView(name) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'))
  island.className = ''
  if (name === 'idle') {
    document.getElementById('view-idle').classList.add('active')
    window.electronAPI.resizePrompter({ width: 220, height: 50 })
  } else if (name === 'edit') {
    document.getElementById('view-edit').classList.add('active')
    island.classList.add('state-edit')
    window.electronAPI.resizePrompter({ width: 560, height: 300 })
    setTimeout(() => scriptInput.focus(), 300)
  } else if (name === 'read') {
    document.getElementById('view-read').classList.add('active')
    island.classList.add('state-read')
    window.electronAPI.resizePrompter({ width: 420, height: 170 })
  }
}

// ── Scripts persistence ────────────────────────────────────
async function loadScripts() {
  state.scripts = await window.electronAPI.getScripts()
  renderScriptList()
}

function saveScripts() {
  window.electronAPI.saveScripts(state.scripts)
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
  if (state.currentScriptIndex >= 0) {
    state.scripts[state.currentScriptIndex] = { name, text }
  } else {
    state.scripts.unshift({ name, text })
    state.currentScriptIndex = 0
  }
  saveScripts()
  renderScriptList()
}

function loadScript(i) {
  state.currentScriptIndex = i
  scriptInput.value = state.scripts[i].text
  updateStats(state.scripts[i].text)
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

// ── Build script ───────────────────────────────────────────
function buildScript(text) {
  scriptText.textContent = text
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
function scrollLoop() {
  if (!state.isRunning) return
  const paused = state.isPaused || state.isHoverPaused
  const shouldScroll = autoScroll ? !paused : (state.isSpeaking && !paused)
  if (shouldScroll) {
    const maxScroll = scrollVP.scrollHeight - scrollVP.clientHeight
    if (scrollPos < maxScroll - 10) {
      scrollPos += SCROLL_SPEED_BASE * state.scrollSpeed
      scrollPos = Math.min(scrollPos, maxScroll)
      scrollVP.scrollTo({ top: scrollPos })
    }
  }


  state.scrollAnimFrame = requestAnimationFrame(scrollLoop)
}

// Sync scrollPos when user manually scrolls
scrollVP.addEventListener('scroll', () => {
  if (!state.isSpeaking) scrollPos = scrollVP.scrollTop
})

// ── Mic ────────────────────────────────────────────────────
async function startMic() {
  // In auto-scroll mode — skip mic, just scroll
  if (autoScroll) {
    state.isRunning = true
    state.isSpeaking = false
    setMicState('auto', 'Auto')
    scrollLoop()
    return
  }

  try {
    state.micStream = await navigator.mediaDevices.getUserMedia({ audio: true })
  } catch(e) { setMicState('error', 'Mic blocked'); return }

  state.audioCtx = new AudioContext()
  const source = state.audioCtx.createMediaStreamSource(state.micStream)
  const analyser = state.audioCtx.createAnalyser()
  analyser.fftSize = 1024
  source.connect(analyser)
  const data = new Float32Array(analyser.fftSize)

  state.analyserInterval = setInterval(() => {
    analyser.getFloatTimeDomainData(data)
    let sum = 0
    for (let i = 0; i < data.length; i++) sum += data[i] * data[i]
    const rms = Math.sqrt(sum / data.length)
    const db = rms > 0 ? 20 * Math.log10(rms) : -100
    const pct = Math.max(0, Math.min(100, (db + 60) / 60 * 100))
    const isSpeech = rms > VOLUME_THRESHOLD

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
  scrollLoop()
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

// ── JS drag (classic mode) ─────────────────────────────────
let dragState = null

island.addEventListener('mousedown', async (e) => {
  if (currentMode !== 'classic') return
  // Don't drag if clicking a button/input
  if (e.target !== island && e.target.closest('button, input, textarea, #script-list')) return
  e.preventDefault()
  const winPos = await window.electronAPI.getWindowPos()
  dragState = { startX: e.screenX, startY: e.screenY, winX: winPos.x, winY: winPos.y }
})

document.addEventListener('mousemove', (e) => {
  if (!dragState) return
  const dx = e.screenX - dragState.startX
  const dy = e.screenY - dragState.startY
  window.electronAPI.moveWindow({ x: dragState.winX + dx, y: dragState.winY + dy })
})

document.addEventListener('mouseup', () => { dragState = null })

// ── Hover to pause + mouse passthrough (notch mode only) ───
let currentMode = 'notch'

function setupMouseBehavior(mode) {
  currentMode = mode
  if (mode === 'notch') {
    document.body.classList.remove('mode-classic')
    window.electronAPI.setIgnoreMouse(true)
    window.electronAPI.setMovable(false)
  } else {
    document.body.classList.add('mode-classic')
    window.electronAPI.setIgnoreMouse(false)
    window.electronAPI.setMovable(true)
  }
}

island.addEventListener('mouseenter', () => {
  if (currentMode === 'notch') window.electronAPI.setIgnoreMouse(false)
  if (state.isRunning) {
    state.isHoverPaused = true
    state.isSpeaking = false
    setMicState('paused', 'Hover pause')
  }
})
island.addEventListener('mouseleave', () => {
  if (currentMode === 'notch') window.electronAPI.setIgnoreMouse(true)
  if (state.isRunning && state.isHoverPaused) {
    state.isHoverPaused = false
    setMicState('waiting', 'Waiting…')
  }
})

// ── Global shortcuts from main process ────────────────────
window.electronAPI.onShortcut((action) => {
  if (action === 'pause') togglePause()
  if (action === 'faster') { setSpeed(speedIndex + 1); window.electronAPI.setConfig({ scrollSpeed: state.scrollSpeed }) }
  if (action === 'slower') { setSpeed(speedIndex - 1); window.electronAPI.setConfig({ scrollSpeed: state.scrollSpeed }) }
  if (action === 'reset') { scrollVP.scrollTop = 0 }
  if (action === 'stop') { stopMic(); showView('idle') }
})

// ── Config updates from settings ───────────────────────────
window.electronAPI.onConfigUpdate((cfg) => {
  if (cfg.scrollSpeed !== undefined) {
    const i = SPEEDS.indexOf(cfg.scrollSpeed)
    if (i !== -1) setSpeed(i)
  }
  if (cfg.threshold !== undefined) VOLUME_THRESHOLD = cfg.threshold
  if (cfg.mode !== undefined) setupMouseBehavior(cfg.mode)
  if (cfg.autoScroll !== undefined) autoScroll = cfg.autoScroll
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
  buildScript(text)
  showView('read')
  scrollPos = 0
  scrollVP.scrollTop = 0
  startMic()
})

document.getElementById('btn-done').addEventListener('click', () => { stopMic(); showView('idle') })
document.getElementById('btn-back').addEventListener('click', () => { scrollPos = 0; scrollVP.scrollTop = 0 })
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
  scriptInput.value = ''
  updateStats('')
  scriptInput.focus()
})

scriptInput.addEventListener('input', () => updateStats(scriptInput.value))

document.addEventListener('keydown', (e) => {
  if (e.code === 'Space' && document.activeElement !== scriptInput) { e.preventDefault(); togglePause() }
  if (e.code === 'ArrowDown' && document.activeElement !== scriptInput) scrollVP.scrollTop += 40
  if (e.code === 'ArrowUp' && document.activeElement !== scriptInput) scrollVP.scrollTop = Math.max(0, scrollVP.scrollTop - 40)
  if (e.code === 'Escape') { stopMic(); showView('idle') }
})

// ── Init ───────────────────────────────────────────────────
setSpeed(speedIndex)
setFontSize(fontSize)
loadScripts()

// Load config and init mouse behavior based on mode
window.electronAPI.getConfig().then(cfg => {
  if (cfg.scrollSpeed) { const i = SPEEDS.indexOf(cfg.scrollSpeed); if (i !== -1) setSpeed(i) }
  if (cfg.threshold) VOLUME_THRESHOLD = cfg.threshold
  if (cfg.autoScroll) autoScroll = cfg.autoScroll
  setupMouseBehavior(cfg.mode || 'notch')
})

showView('idle')
