# OpenTeleprompter

A free, open source voice-activated teleprompter that lives in your Mac's notch.

**Speak → it scrolls. Stop → it pauses. No subscriptions. No cloud. No accounts.**

![OpenTeleprompter Demo](docs/assets/demo.gif)

---

## Download

| Platform | Version | Link |
|---|---|---|
| 🍎 Apple Silicon (M1–M4) | v2.0.0 | [Download .dmg](https://github.com/ArunNGun/openTeleprompt/releases/latest) |
| 🍎 Intel Mac | v2.0.0 | [Download .dmg](https://github.com/ArunNGun/openTeleprompt/releases/latest) |
| 🪟 Windows | v1.1.0-beta | [Download .exe](https://github.com/ArunNGun/openTeleprompt/releases/tag/v1.1.0-beta-win) |

**Landing page:** https://arunngun.github.io/openTeleprompt/

---

## Features

- 🏝️ **Lives in the notch** — right below your camera, eyes stay natural
- 🎙️ **Voice-activated scroll** — speaks = scrolls, silence = pauses, fully local
- 🔇 **Invisible during screen share** — only you can see it
- 🖱️ **Hover to pause** — instant freeze without clicking
- ⚡ **Auto-scroll mode** — no mic needed
- 💾 **Auto-saves scripts** — no cloud, no account
- ⌨️ **Keyboard shortcuts** — ⌘⇧Space, ⌘⇧↑↓, ⌘⇧R
- 🌗 **Opacity control** — see through it to your camera feed
- 🖥️ **Classic floating mode** — draggable, resizable, works on any Mac

---

## v2.0 — Now built with Tauri + Rust

v2.0 is a complete rewrite of the backend in Rust using [Tauri v2](https://tauri.app).

**Same features, massively smaller:**

| | v1.x (Electron) | v2.0 (Tauri) |
|---|---|---|
| Binary size | ~150MB | **4.6MB** |
| DMG size | ~80MB | **2.6MB** |
| Memory usage | ~200MB | ~40MB |

The frontend (HTML/CSS/JS) is identical. Only the native backend changed.

---

## Project Structure

```
openTeleprompt/
├── src-tauri/        ← Rust backend (v2.0, primary)
│   ├── src/lib.rs    ← All native commands
│   └── tauri.conf.json
├── frontend/         ← Shared web frontend
│   └── renderer/     ← HTML, CSS, JS
├── electron/         ← Legacy Electron backend (v1.x)
└── docs/             ← GitHub Pages landing page
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

**Requirements:** Rust + Cargo, Node.js

---

## First launch (macOS)

Right-click the app → Open → click **Open** in the security dialog.

### ⚠️ "App is damaged" error?

macOS tags apps downloaded from the internet with a "quarantine" flag. Since OpenTeleprompter isn't signed with an Apple Developer certificate, Gatekeeper blocks it with a misleading "damaged" warning — **the app is fine**.

Fix it by running this in Terminal:

```bash
xattr -cr /Applications/OpenTeleprompter.app
```

**What this does:** `xattr` manages extended file attributes on macOS. The `-c` flag clears all attributes, and `-r` applies recursively to the entire `.app` bundle. This removes the quarantine flag that macOS attached when you downloaded the file. After running it once, the app opens normally forever — macOS stops asking.

---

## Contributing

PRs welcome! See [CONTRIBUTING.md](CONTRIBUTING.md).

---

## License

MIT — free forever.
