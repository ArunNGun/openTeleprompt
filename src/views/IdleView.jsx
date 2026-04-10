import { useAppStore } from '../store'

export default function IdleView({ isHovered }) {
  const { setView, isSpeaking, isPaused, config } = useAppStore()
  const isClassic = config.mode === 'classic'

  function handleOpen() {
    setView('edit')
  }

  function handleChevronClick(e) {
    e.stopPropagation()
    setView('edit')
  }

  const isActive  = isSpeaking
  const isPausedS = isPaused && !isSpeaking

  // Theme-aware dot color via CSS vars (set inline only for active states)
  const dotColor = isActive  ? '#22c55e'
                 : isPausedS ? '#f59e0b'
                 : 'var(--text-muted)'
  const dotGlow  = isActive  ? '0 0 8px #22c55ecc'
                 : isPausedS ? '0 0 8px #f59e0baa'
                 : 'none'

  const label    = isActive  ? 'Recording'
                 : isPausedS ? 'Paused'
                 : 'Teleprompter'

  return (
    <div
      className="idle-notch-wrap"
      onClick={isClassic ? undefined : handleOpen}
    >
      <div className={`idle-pill-content${isHovered ? ' hovered' : ''}`}>

        {/* Status dot */}
        <span
          className={`idle-status-dot${isActive ? ' pulse' : ''}`}
          style={{ background: dotColor, boxShadow: dotGlow }}
        />

        {/* Label */}
        <span className="idle-pill-label" aria-hidden="true">
          {label}
        </span>

        {/* Chevron — classic: always visible + clickable; notch: hover reveal */}
        <svg
          className="idle-chevron"
          width={isClassic ? '16' : '9'}
          height={isClassic ? '16' : '9'}
          viewBox="0 0 9 9"
          fill="none"
          aria-hidden="true"
          onClick={isClassic ? handleChevronClick : undefined}
          style={isClassic ? { cursor: 'pointer', padding: '4px', margin: '-4px' } : {}}
        >
          <path
            d="M2 3.5L4.5 6L7 3.5"
            stroke="var(--text-secondary)"
            strokeWidth={isClassic ? '2' : '1.5'}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>

      </div>
    </div>
  )
}
