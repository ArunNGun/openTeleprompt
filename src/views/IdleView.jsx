import { useAppStore } from '../store'

export default function IdleView({ isHovered }) {
  const { setView, isSpeaking, isPaused } = useAppStore()

  function handleOpen() {
    setView('edit')
  }

  // Status-driven appearance
  const isActive  = isSpeaking
  const isPausedS = isPaused && !isSpeaking

  const dotColor = isActive  ? '#22c55e'
                 : isPausedS ? '#f59e0b'
                 : 'rgba(255,255,255,0.4)'
  const dotGlow  = isActive  ? '0 0 8px #22c55ecc'
                 : isPausedS ? '0 0 8px #f59e0baa'
                 : 'none'

  const label    = isActive  ? 'Recording'
                 : isPausedS ? 'Paused'
                 : 'Teleprompter'

  return (
    <div
      className="idle-notch-wrap"
      onClick={handleOpen}
    >
      <div className={`idle-pill-content${isHovered ? ' hovered' : ''}`}>

        {/* Camera/status dot — mimics Apple's camera indicator placement */}
        <span
          className={`idle-status-dot${isActive ? ' pulse' : ''}`}
          style={{ background: dotColor, boxShadow: dotGlow }}
        />

        {/* Label — slides in on hover */}
        <span className="idle-pill-label" aria-hidden="true">
          {label}
        </span>

        {/* Down chevron — appears on hover */}
        <svg
          className="idle-chevron"
          width="9" height="9" viewBox="0 0 9 9" fill="none"
          aria-hidden="true"
        >
          <path
            d="M2 3.5L4.5 6L7 3.5"
            stroke="rgba(255,255,255,0.5)"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>

      </div>
    </div>
  )
}
