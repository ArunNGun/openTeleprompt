# OpenTeleprompter

A free, open source voice-activated teleprompter for **macOS** (Windows v3 coming soon).

**Speak → it scrolls. Stop → it pauses. No subscriptions. No cloud. No accounts.**

---

## Download — v3.0.0

| Platform | Link | Notes |
|---|---|---|
| 🍎 Apple Silicon (M1–M4) | [Download .dmg](https://github.com/ArunNGun/openTeleprompt/releases/latest) | macOS 13+ |
| 🍎 Intel Mac | [Download .dmg](https://github.com/ArunNGun/openTeleprompt/releases/latest) | macOS 13+ |
| 🪟 Windows (x64) | [v2.2.1 stable](https://github.com/ArunNGun/openTeleprompt/releases/tag/v2.2.1) | v3 coming soon |

**Landing page:** https://arunngun.github.io/openTeleprompt/

---

## What's New in v3.0

### Dynamic Island — properly done
The notch overlay now has real concave corners that bite into the menubar bezel exactly like Apple's Dynamic Island. Apple spring physics (`cubic-bezier(0.32, 0.72, 0, 1)`) for all expand/collapse animations. Looks like part of the OS.

### Full React frontend
Entire UI rebuilt in React + Vite with Zustand state management. Faster, cleaner, easier to extend.

### Rich text editor
Bold, color highlights, and smart cue markers: `[PAUSE]` `[SLOW]` `[BREATHE]`. Format your script exactly how you want to deliver it.

### Script library
Save multiple scripts, switch instantly. Auto-saves on start. Local only — no cloud, no account.

### Light & dark theme
Pastel light mode default. Toggle from settings or the menubar. Persists across sessions.

### Live controls while reading
Adjust scroll speed and font size on the fly — no need to pause your delivery.

### Redesigned settings panel
Clean React settings view with auto-height. All preferences in one place, persisted across sessions.

---

## Features

- 🏝️ **Dynamic Island mode** — real concave corners, Apple spring physics, pixel-perfect notch fit
- 🖥️ **Classic mode** — draggable floating pill, works on any Mac (notch or not)
- 🎙️ **Voice-activated scroll** — frequency analysis (85–3400 Hz), not just volume. Only your voice triggers it
- 📝 **Rich text editor** — bold, highlights, cue markers `[PAUSE]` `[SLOW]` `[BREATHE]`
- 📚 **Script library** — save and switch multiple scripts, auto-saves
- 🔇 **Invisible during screen share** — Zoom, Meet, Loom can't see it. Only you can
- 🌗 **Light & dark theme** — pastel light default, toggleable
- ⚡ **Live controls** — speed + font size adjustable while reading
- 🌫️ **Opacity control** — barely-there to solid
- ⌨️ **Global shortcuts** — ⌘⇧Space, ⌘⇧↑↓, ⌘⇧R

---

## Version History

### v3.0.0 — Dynamic Island Redesign *(latest)*
- Full React + Vite frontend rewrite
- Dynamic Island with real concave corners + spring physics
- Rich text editor (Tiptap), script library, light/dark theme
- Live speed + font control while reading
- Playwright visual test suite (16 tests, 48 state combos)
- macOS only — Windows v3 in progress

### v2.2.1 — Windows Polish
- Platform-aware tray hint images (Mac + Windows)
- Author GitHub link in settings

### v2.2.0 — Windows Support
- Full Windows support (Classic + Top Bar modes)
- Native Windows settings panel (Fluent-style)
- GitHub Actions CI — auto-builds Mac + Windows on tag push

### v2.0.0 — Tauri/Rust Rewrite

| | v1.x (Electron) | v2.x+ (Tauri) |
|---|---|---|
| Binary size | ~150 MB | **4.6 MB** |
| DMG size | ~80 MB | **2.6 MB** |
| RAM usage | ~200 MB | **~40 MB** |

---

## Project Structure

```
openTeleprompt/
├── src-tauri/          ← Rust backend
│   ├── src/lib.rs      ← All Tauri commands
│   └── tauri.conf.json
├── frontend/           ← React + Vite frontend
│   └── src/            ← App.jsx, views, Zustand store
├── index.html          ← Vite entry point
├── settings.html       ← Settings panel entry
├── .github/workflows/  ← CI — auto-builds macOS on release tag
├── electron/           ← Legacy Electron v1.x (archived)
└── docs/               ← GitHub Pages landing page
```

---

## Development

```bash
# Install dependencies
npm install

# Dev mode (hot reload)
npm run dev

# Production build — macOS
npm run build

# Production build — Windows
npm run build:win
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
This strips the macOS quarantine flag. One-time, you won't need it again.

### Windows (v2.2.1)
Run the `.exe` installer. If Windows SmartScreen blocks it, click **More info → Run anyway**.

---

## Contributing

PRs welcome! See [CONTRIBUTING.md](CONTRIBUTING.md).

---

## License

MIT — free forever.
