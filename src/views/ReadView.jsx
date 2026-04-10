import { useEffect, useRef, useState } from 'react'
import { tokenizeDoc } from '../lib/tokenizer'
import { useAppStore } from '../store'
import { API } from '../lib/api'
import { createMicEngine, SPEEDS, SCROLL_SPEED_BASE } from '../lib/mic'

export default function ReadView() {
  const { scriptText, scriptDoc, config, setView } = useAppStore()
  const tokens = scriptDoc ? tokenizeDoc(scriptDoc) : []

  // Live config refs — updated whenever config changes, used inside RAF/mic without remount
  const configRef = useRef(config)
  useEffect(() => { configRef.current = config }, [config])

  // Local state for everything playback-related (avoids stale closure issues)
  const [isPaused, setIsPaused] = useState(false)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [speedIdx, setSpeedIdx] = useState(
    SPEEDS.indexOf(config.scrollSpeed) !== -1 ? SPEEDS.indexOf(config.scrollSpeed) : 3
  )
  const [fontSize, setFontSize] = useState(config.fontSize || 16)
  const [micStatus, setMicStatus] = useState('Waiting…')

  // Refs for values used inside RAF/interval (must not be stale)
  const isPausedRef = useRef(false)
  const isSpeakingRef = useRef(false)
  const isHoverPausedRef = useRef(false)
  const speedIdxRef = useRef(speedIdx)
  const scrollPosRef = useRef(0)
  const lastFrameRef = useRef(0)
  const rafRef = useRef(null)
  const scrollVPRef = useRef(null)
  const scriptTextRef = useRef(null)
  const markerRefs = useRef({})     // token index → DOM el
  const firedMarkers = useRef(new Set()) // indices already fired
  const speedIdxSetRef = useRef(null) // ref to setSpeedIdx for use inside RAF
  const micEngineRef = useRef(null)
  const silenceTimer = useRef(null)
  const isCountingDownRef = useRef(false)

  // Keep refs in sync
  useEffect(() => { isPausedRef.current = isPaused }, [isPaused])
  useEffect(() => { isSpeakingRef.current = isSpeaking }, [isSpeaking])
  useEffect(() => { speedIdxRef.current = speedIdx }, [speedIdx])

  // React to live config changes while ReadView is mounted
  useEffect(() => {
    // Opacity applied globally in App.jsx already
    // Sync speed from settings — use closest match to handle float precision
    if (config.scrollSpeed !== undefined) {
      const i = SPEEDS.reduce((best, s, idx) =>
        Math.abs(s - config.scrollSpeed) < Math.abs(SPEEDS[best] - config.scrollSpeed) ? idx : best
      , 0)
      setSpeedIdx(i)
    }
    // Threshold update
    micEngineRef.current?.setThreshold(config.threshold)
    // If mic device changed, restart mic
    if (configRef.current.micDeviceId !== config.micDeviceId) {
      micEngineRef.current?.stop()
      const engine = createMicEngine({
        threshold: config.threshold,
        onSpeaking: () => { isSpeakingRef.current = true; setIsSpeaking(true); setMicStatus('Speaking') },
        onSilence:  () => { isSpeakingRef.current = false; setIsSpeaking(false); setMicStatus('Waiting…') },
        onError:    () => setMicStatus('Mic error'),
      })
      micEngineRef.current = engine
      engine.start(config.micDeviceId)
    }
  }, [config.threshold, config.micDeviceId, config.autoScroll, config.scrollSpeed])

  // On mount: set content, start mic, start scroll loop
  useEffect(() => {
    // Cue marker checker — fires actions when markers enter reading zone
    function checkMarkers() {
      if (!scrollVPRef.current) return
      const vpRect = scrollVPRef.current.getBoundingClientRect()
      const readingZoneBottom = vpRect.top + vpRect.height * 0.4

      Object.entries(markerRefs.current).forEach(([idxStr, el]) => {
        if (!el) return
        const idx = Number(idxStr)
        if (firedMarkers.current.has(idx)) return
        const rect = el.getBoundingClientRect()
        if (rect.top < readingZoneBottom) {
          firedMarkers.current.add(idx)
          const marker = el.dataset.marker
          if (marker === 'PAUSE') {
            isPausedRef.current = true
            setIsPaused(true)
            setMicStatus('Paused')
            setTimeout(() => {
              isPausedRef.current = false
              setIsPaused(false)
              setMicStatus('Waiting…')
            }, 1200)
          } else if (marker === 'BREATHE') {
            isPausedRef.current = true
            setIsPaused(true)
            setMicStatus('Breathe…')
            setTimeout(() => {
              isPausedRef.current = false
              setIsPaused(false)
              setMicStatus('Waiting…')
            }, 2500)
          } else if (marker === 'SLOW') {
            setSpeedIdx(prev => {
              const n = Math.max(0, prev - 1)
              API.setConfig({ scrollSpeed: SPEEDS[n] })
              return n
            })
          }
        }
      })
    }

    // Start scroll RAF
    function loop(ts) {
      const paused = isPausedRef.current || isHoverPausedRef.current
      const shouldScroll = configRef.current.autoScroll ? !paused : (isSpeakingRef.current && !paused)

      if (shouldScroll && scrollVPRef.current && scriptTextRef.current) {
        const delta = lastFrameRef.current ? Math.min((ts - lastFrameRef.current) / 16.667, 3) : 1
        lastFrameRef.current = ts
        const maxScroll = scriptTextRef.current.scrollHeight - scrollVPRef.current.clientHeight
        if (scrollPosRef.current < maxScroll - 1) {
          scrollPosRef.current += SCROLL_SPEED_BASE * SPEEDS[speedIdxRef.current] * delta
          scrollPosRef.current = Math.min(scrollPosRef.current, maxScroll)
          scriptTextRef.current.style.transform = `translateY(${-scrollPosRef.current}px)`
        }
        // Check cue markers in reading zone (top 40% of viewport)
        checkMarkers()
      } else {
        lastFrameRef.current = 0
      }
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)

    // Start mic
    const engine = createMicEngine({
      threshold: configRef.current.threshold,
      onSpeaking: () => { isSpeakingRef.current = true; setIsSpeaking(true); setMicStatus('Speaking') },
      onSilence:  () => { isSpeakingRef.current = false; setIsSpeaking(false); setMicStatus('Waiting…') },
      onError:    () => setMicStatus('Mic error'),
    })
    micEngineRef.current = engine
    engine.start(configRef.current.micDeviceId)

    // Shortcuts — capture unlisten fn for cleanup
    let unlistenShortcut
    API.onShortcut((action) => {
      if (action === 'pause') togglePause()
      if (action === 'faster') setSpeedIdx(i => Math.min(SPEEDS.length - 1, i + 1))
      if (action === 'slower') setSpeedIdx(i => Math.max(0, i - 1))
      if (action === 'reset') {
        scrollPosRef.current = 0
        if (scriptTextRef.current) scriptTextRef.current.style.transform = 'translateY(0px)'
      }
      if (action === 'stop') handleDone()
    }).then(fn => { unlistenShortcut = fn })

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      if (silenceTimer.current) clearTimeout(silenceTimer.current)
      micEngineRef.current?.stop()
      unlistenShortcut?.()
    }
  }, [])

  function togglePause() {
    const next = !isPausedRef.current
    isPausedRef.current = next
    setIsPaused(next)
    setMicStatus(next ? 'Paused' : 'Waiting…')
    if (next) { isSpeakingRef.current = false; setIsSpeaking(false) }
  }

  function handleDone() {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    if (silenceTimer.current) clearTimeout(silenceTimer.current)
    micEngineRef.current?.stop()
    API.setIgnoreMouse(false)
    setView('idle') // App.jsx resize effect handles window resize on view change
  }

  function handleReset() {
    scrollPosRef.current = 0
    if (scriptTextRef.current) scriptTextRef.current.style.transform = 'translateY(0px)'
    firedMarkers.current.clear() // reset so markers fire again on replay
  }

  function handleMouseEnter() {
    isHoverPausedRef.current = true
    setMicStatus('Hover pause')
  }

  function handleMouseLeave() {
    isHoverPausedRef.current = false
    if (!isPausedRef.current) setMicStatus(isSpeakingRef.current ? 'Speaking' : 'Waiting…')
  }

  function handleWheel(e) {
    e.preventDefault()
    if (!scrollVPRef.current || !scriptTextRef.current) return
    const maxScroll = scriptTextRef.current.scrollHeight - scrollVPRef.current.clientHeight
    scrollPosRef.current = Math.max(0, Math.min(scrollPosRef.current + e.deltaY, maxScroll))
    scriptTextRef.current.style.transform = `translateY(${-scrollPosRef.current}px)`
  }

  const micRingClass = `mic-ring${isSpeaking ? '' : ' paused'}`

  return (
    <div
      style={{
        position: 'absolute', inset: 0,
        display: 'flex', flexDirection: 'column',
      }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <div id="progress-bar" />

      <div
        ref={scrollVPRef}
        id="scroll-viewport"
        onWheel={handleWheel}
        style={{ flex: 1, overflowY: 'hidden', position: 'relative' }}
      >
        <div
          ref={scriptTextRef}
          id="script-text"
          style={{ fontSize: `${fontSize}px` }}
        >
          {tokens.length > 0 ? tokens.map((token, i) => {
            if (token.type === 'newline') return <br key={i} />
            if (token.type === 'marker') return (
              <span
                key={i}
                ref={el => { markerRefs.current[i] = el }}
                data-marker={token.marker}
                className={`read-marker read-marker-${token.marker.toLowerCase()}`}
              >
                {token.text}
              </span>
            )
            return (
              <span
                key={i}
                style={{
                  fontWeight: token.bold ? 700 : undefined,
                  color: token.color || undefined,
                }}
              >
                {token.text}{' '}
              </span>
            )
          }) : scriptText}
        </div>
      </div>

      <div id="read-controls">
        <div className="ctrl-left">
          <span className={micRingClass}>
            <span className="mic-core" />
          </span>
          <span id="status-text">{micStatus}</span>
        </div>
        <div className="ctrl-right">
          <button className="ctrl-btn" onClick={() => setFontSize(f => Math.max(11, f - 2))}>A−</button>
          <button className="ctrl-btn" onClick={() => setFontSize(f => Math.min(32, f + 2))}>A+</button>
          <button className="ctrl-btn" onClick={() => setSpeedIdx(i => { const n = Math.max(0, i - 1); API.setConfig({ scrollSpeed: SPEEDS[n] }); return n })}>−</button>
          <span id="speed-val">{SPEEDS[speedIdx]}×</span>
          <button className="ctrl-btn" onClick={() => setSpeedIdx(i => { const n = Math.min(SPEEDS.length - 1, i + 1); API.setConfig({ scrollSpeed: SPEEDS[n] }); return n })}>+</button>
          <button className="ctrl-btn" onClick={togglePause}>{isPaused ? '▶' : '⏸'}</button>
          <button className="ctrl-btn" onClick={handleReset}>↺</button>
          <button className="ctrl-btn" onClick={handleDone}>✕</button>
        </div>
      </div>
    </div>
  )
}
