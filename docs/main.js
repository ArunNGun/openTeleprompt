/* ── OpenTeleprompter Landing — main.js ── */

// ── THEME: run before first paint to avoid flash ──
;(function () {
  const saved = localStorage.getItem('ot-theme')
  document.documentElement.setAttribute('data-theme', saved || 'light')
})()

document.addEventListener('DOMContentLoaded', () => {

  // ── THEME TOGGLE (button in menubar right) ──
  function getCurrentTheme () {
    return document.documentElement.getAttribute('data-theme') || 'light'
  }
  function applyTheme (t) {
    document.documentElement.setAttribute('data-theme', t)
    localStorage.setItem('ot-theme', t)
    // keep View menu item label in sync
    const item = document.getElementById('mbThemeItem')
    if (item) item.textContent = t === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'
  }

  const themeBtn = document.getElementById('themeToggle')
  if (themeBtn) {
    themeBtn.addEventListener('click', () => {
      applyTheme(getCurrentTheme() === 'dark' ? 'light' : 'dark')
    })
  }

  // Sync label on load
  applyTheme(getCurrentTheme())

  // ── PSST HINT ──
  const hint = document.getElementById('menubarHint')
  if (hint) {
    // show after 1.2s, hide after 4s, then never again
    const shown = sessionStorage.getItem('ot-hint-shown')
    if (!shown) {
      setTimeout(() => hint.classList.add('visible'), 1200)
      setTimeout(() => {
        hint.classList.remove('visible')
        setTimeout(() => hint.classList.add('gone'), 500)
      }, 5000)
      sessionStorage.setItem('ot-hint-shown', '1')
    } else {
      hint.classList.add('gone')
    }
  }

  // ── MENUBAR DROPDOWNS ──
  let openMenu = null
  function closeAll () {
    document.querySelectorAll('.mb-menu.open').forEach(m => m.classList.remove('open'))
    openMenu = null
  }
  document.querySelectorAll('.mb-menu').forEach(menu => {
    const trigger = menu.querySelector('.mb-trigger')
    trigger.addEventListener('click', (e) => {
      e.stopPropagation()
      if (menu.classList.contains('open')) {
        closeAll()
      } else {
        closeAll()
        menu.classList.add('open')
        openMenu = menu
        // hide hint immediately on first interaction
        if (hint) { hint.classList.remove('visible'); setTimeout(() => hint.classList.add('gone'), 400); }
      }
    })
    // Hover navigation: if another menu is already open, open this one
    trigger.addEventListener('mouseenter', () => {
      if (openMenu && openMenu !== menu) {
        closeAll()
        menu.classList.add('open')
        openMenu = menu
      }
    })
  })
  document.addEventListener('click', closeAll)
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeAll() })

  // Fun menu item actions
  document.getElementById('mbThemeItem')?.addEventListener('click', () => {
    applyTheme(getCurrentTheme() === 'dark' ? 'light' : 'dark')
    closeAll()
  })
  document.getElementById('mbQuit')?.addEventListener('click', () => {
    closeAll()
    // cheeky fake quit
    document.body.style.transition = 'opacity 0.4s'
    document.body.style.opacity = '0'
    setTimeout(() => {
      document.body.style.opacity = '1'
      document.body.style.transition = ''
    }, 600)
  })
  document.getElementById('mbClose')?.addEventListener('click', () => {
    closeAll()
    window.scrollTo({ top: 0, behavior: 'smooth' })
  })

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
