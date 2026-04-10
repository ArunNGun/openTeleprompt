// VAD + scroll engine — extracted from original app.js, adapted for React use via refs

export const SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2]
export const SCROLL_SPEED_BASE = 0.1
export const SILENCE_DELAY_MS = 400
const VOICE_FRAMES_REQUIRED = 8

export function createMicEngine({ onSpeaking, onSilence, onError, threshold }) {
  let micStream = null
  let audioCtx = null
  let analyserInterval = null
  let silenceTimer = null
  let voiceFrameCount = 0
  let isSpeaking = false
  let VOLUME_THRESHOLD = threshold ?? 0.018

  function isVoiceFrequency(analyser, freqData, binHz) {
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

    if (passesFreq) voiceFrameCount = Math.min(voiceFrameCount + 1, VOICE_FRAMES_REQUIRED)
    else voiceFrameCount = Math.max(voiceFrameCount - 2, 0)

    return voiceFrameCount >= VOICE_FRAMES_REQUIRED
  }

  async function start(micDeviceId) {
    const audioConstraints = {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
      suppressLocalAudioPlayback: true,
    }
    const deviceId = micDeviceId && micDeviceId !== 'default' ? micDeviceId : undefined
    if (deviceId) audioConstraints.deviceId = { exact: deviceId }

    try {
      try {
        micStream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints })
      } catch (e) {
        if (e.name === 'OverconstrainedError' && deviceId) {
          delete audioConstraints.deviceId
          micStream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints })
        } else throw e
      }
    } catch (e) {
      onError?.(e)
      return false
    }

    audioCtx = new AudioContext()
    const source = audioCtx.createMediaStreamSource(micStream)
    const analyser = audioCtx.createAnalyser()
    analyser.fftSize = 2048
    analyser.smoothingTimeConstant = 0.3
    source.connect(analyser)

    const freqData = new Float32Array(analyser.frequencyBinCount)
    const timeData = new Float32Array(analyser.fftSize)
    const binHz = audioCtx.sampleRate / analyser.fftSize

    analyserInterval = setInterval(() => {
      analyser.getFloatTimeDomainData(timeData)
      let sum = 0
      for (let i = 0; i < timeData.length; i++) sum += timeData[i] * timeData[i]
      const rms = Math.sqrt(sum / timeData.length)

      const isSpeech = rms > VOLUME_THRESHOLD && isVoiceFrequency(analyser, freqData, binHz)

      if (isSpeech) {
        if (silenceTimer) { clearTimeout(silenceTimer); silenceTimer = null }
        if (!isSpeaking) { isSpeaking = true; onSpeaking?.() }
      } else if (isSpeaking && !silenceTimer) {
        silenceTimer = setTimeout(() => {
          isSpeaking = false
          silenceTimer = null
          onSilence?.()
        }, SILENCE_DELAY_MS)
      }
    }, 16)

    return true
  }

  function stop() {
    if (analyserInterval) { clearInterval(analyserInterval); analyserInterval = null }
    if (silenceTimer) { clearTimeout(silenceTimer); silenceTimer = null }
    if (audioCtx) { audioCtx.close(); audioCtx = null }
    if (micStream) { micStream.getTracks().forEach(t => t.stop()); micStream = null }
    voiceFrameCount = 0
    isSpeaking = false
  }

  function setThreshold(v) { VOLUME_THRESHOLD = v }

  return { start, stop, setThreshold }
}
