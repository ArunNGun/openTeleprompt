/* ── OpenTeleprompter Landing — main.js ── */

// ── THEME: run before first paint to avoid flash ──
;(function () {
  const saved = localStorage.getItem('ot-theme')
  document.documentElement.setAttribute('data-theme', saved || 'light')
})()

document.addEventListener('DOMContentLoaded', () => {

  // ── THEME TOGGLE ──
  const themeBtn = document.getElementById('themeToggle')
  if (themeBtn) {
    themeBtn.addEventListener('click', () => {
      const current = document.documentElement.getAttribute('data-theme') || 'dark'
      const next = current === 'dark' ? 'light' : 'dark'
      document.documentElement.setAttribute('data-theme', next)
      localStorage.setItem('ot-theme', next)
    })
  }

  // ── ISLAND HOVER LABEL ──
  const island = document.getElementById('notchPill')
  if (island) {
    const micLabel = island.querySelector('.app-mic-label')
    if (micLabel) {
      island.addEventListener('mouseenter', () => { micLabel.textContent = 'Hover pause' })
      island.addEventListener('mouseleave', () => { micLabel.textContent = 'Speaking' })
    }
  }

  // ── LIVE MENUBAR CLOCK ──
  function updateClock () {
    const t = new Date()
    const h = t.getHours().toString().padStart(2, '0')
    const m = t.getMinutes().toString().padStart(2, '0')
    const el = document.getElementById('mbTime')
    if (el) el.textContent = `${h}:${m}`
  }
  updateClock()
  setInterval(updateClock, 10000)

  // ── SCROLL REVEAL ──
  const io = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        e.target.classList.add('visible')
        io.unobserve(e.target)
      }
    })
  }, { threshold: 0.08 })
  document.querySelectorAll('.reveal').forEach(el => io.observe(el))

  // ── FAQ ACCORDION ──
  document.querySelectorAll('.faq-q').forEach(btn => {
    btn.addEventListener('click', () => {
      const item = btn.closest('.faq-item')
      const isOpen = item.classList.contains('open')
      document.querySelectorAll('.faq-item').forEach(i => i.classList.remove('open'))
      if (!isOpen) item.classList.add('open')
    })
  })

})
