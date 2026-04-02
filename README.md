# OpenTeleprompter

A free, open source voice-activated teleprompter for **macOS and Windows**.

**Speak → it scrolls. Stop → it pauses. No subscriptions. No cloud. No accounts.**

---

## Download — v2.2.1

| Platform | Link |
|---|---|
| 🍎 Apple Silicon (M1–M4) | [Download .dmg](https://github.com/ArunNGun/openTeleprompt/releases/latest) |
| 🍎 Intel Mac | [Download .dmg](https://github.com/ArunNGun/openTeleprompt/releases/latest) |
| 🪟 Windows (x64) | [Download .exe](https://github.com/ArunNGun/openTeleprompt/releases/latest) |

**Landing page:** https://arunngun.github.io/openTeleprompt/

---

## Features

- 🏝️ **Notch mode (macOS)** — lives right below your camera, eyes stay natural
- 🖥️ **Top Bar + Classic mode** — pin to top or use as a draggable floating window (Mac & Windows)
- 🎙️ **Voice-activated scrolling** — frequency analysis (85–3400 Hz), not just volume. Only your voice triggers it
- 🔇 **Invisible during screen share** — only you can see it (macOS & Windows)
- 🖱️ **Hover to pause** — instant freeze without clicking
- ✦ **Welcome/onboarding screen** — guided setup on first launch
- ⚙️ **Quick settings** — gear icon in edit view, or click the tray icon
- 💾 **Auto-saves scripts** — no cloud, no account
- ⌨️ **Keyboard shortcuts** — ⌘⇧Space / Ctrl+Shift+Space, speed up/down, reset
- 🌗 **Opacity control** — see through it to your camera feed

---

## What's New

### v2.2 — Windows Support
- ✅ Full Windows support (Classic + Top Bar modes)
- ✅ Welcome/onboarding screen on first launch
- ✅ Settings gear icon in edit view
- ✅ Native Windows tray icon with settings panel
- ✅ Buttons fully clickable in read mode on Windows
- ✅ Fixed icon (transparent bg, no white borders)
- ✅ GitHub Actions CI — auto-builds Mac + Windows on every release

### v2.0 — Tauri/Rust Rewrite
| | v1.x (Electron) | v2.x (Tauri) |
|---|---|---|
| Binary size | ~150MB | **4.6MB** |
| DMG size | ~80MB | **2.6MB** |
| Memory usage | ~200MB | ~40MB |

---

## Project Structure

```
openTeleprompt/
├── src-tauri/          ← Rust backend
│   ├── src/lib.rs      ← All native commands
│   └── tauri.conf.json
├── frontend/           ← Web frontend (shared Mac + Windows)
│   └── renderer/       ← HTML, CSS, JS
├── .github/workflows/  ← CI — auto-builds Mac + Windows on release tag
├── electron/           ← Legacy Electron backend (v1.x, archived)
└── docs/               ← GitHub Pages landing page
```

---

## Development

```bash
# Install dependencies
npm install

# Dev mode (hot reload)
npm run dev

# Production build
npm run build
```

**Requirements:** Rust + Cargo, Node.js 18+

---

## First Launch

### macOS
Right-click the app → **Open** → click **Open** in the security dialog.

If you see "App is damaged":
```bash
xattr -cr /Applications/OpenTeleprompter.app
```

### Windows
Run the `.exe` installer. If Windows SmartScreen blocks it, click **More info → Run anyway**.

---

## Contributing

PRs welcome! See [CONTRIBUTING.md](CONTRIBUTING.md).

---

## License

MIT — free forever.
