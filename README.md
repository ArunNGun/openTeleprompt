# OpenTeleprompter

**A voice-activated teleprompter that lives in your Mac's notch.**

No subscriptions. No clutter. Just speak — it scrolls.

---

## What it does

OpenTeleprompter sits quietly in your Mac's Dynamic Island notch as a tiny pill. When you're ready to present, click it — your script expands right where your camera is. Start speaking and it scrolls with your voice. Go quiet and it pauses. It's that simple.

Built for creators, founders, engineers, and anyone who presents on camera and wants to look natural doing it.

---

## Features

### 🎙️ Voice-activated scroll
Speak and the teleprompter scrolls. Pause and it stops. No hands, no clicking — just talk. Powered by real-time microphone volume detection, so it works offline, instantly, with zero latency.

### 🏝️ Lives in the notch
In Notch mode, OpenTeleprompter positions itself at the top center of your screen — right below your camera. Your eyes stay natural, your audience stays engaged.

### 🖼️ Classic floating mode
Prefer a movable window? Switch to Classic mode. Drag it anywhere on your screen, resize it freely, and set it up however works for your setup.

### 🔇 Invisible during screen share
Toggle "Hide on screen share" and the prompter disappears from your screen share, recordings, and screenshots. Only you can see it.

### 🖱️ Hover to pause
Move your cursor over the prompter to instantly freeze the scroll. Move away and it resumes. No clicking needed mid-presentation.

### 🔤 Font size control
Use **A−** and **A+** in the reading view to dial in the perfect font size for your distance from the screen.

### ⚡ Auto-scroll mode
Don't want to use your mic? Toggle "Voice Input" off and the teleprompter scrolls at a constant speed — no microphone required.

### 💾 Script storage
Your scripts save automatically. Click any saved script chip to reload it instantly. Add as many as you need.

### 📊 Word count + read time
The edit view shows your word count and estimated read time as you type. Know exactly how long your script will take before you hit Go.

### 🎛️ Adjustable sensitivity
The voice sensitivity slider lets you set exactly how loud you need to be for the scroll to trigger. Works great in noisy environments too.

### 🌗 Opacity control
Make the teleprompter semi-transparent so you can see through it to your camera feed or background. Dial it from 20% to 100%.

### ⌨️ Keyboard shortcuts
| Action | Shortcut |
|---|---|
| Pause / Resume | `⌘⇧Space` |
| Speed Up | `⌘⇧↑` |
| Speed Down | `⌘⇧↓` |
| Reset to Top | `⌘⇧R` |
| Pause (in read view) | `Space` |

---

## Download

| Platform | Download |
|---|---|
| Apple Silicon (M1/M2/M3/M4) | `OpenTeleprompter-1.0.0-arm64.dmg` |
| Intel Mac | `OpenTeleprompter-1.0.0.dmg` |

> **First launch on macOS:** Since the app isn't notarized yet, macOS will block it on double-click. Here's how to open it:
>
> **Option 1 (easiest):** Right-click the app → **Open** → click **Open** in the dialog.
>
> **Option 2 (terminal):** Run this once after installing:
> ```bash
> xattr -cr /Applications/OpenTeleprompter.app
> ```
> After that, it opens normally every time.

---

## Getting Started

1. Download and install the DMG
2. Launch OpenTeleprompter — a **✦** icon appears in your menu bar
3. Click **✦** to open settings
4. Toggle **Show Prompter** on
5. Click the pill in your notch → paste your script → hit **Go**
6. Start speaking — the teleprompter follows your voice

---

## Settings

| Setting | Description |
|---|---|
| Show Prompter | Toggle the prompter on/off |
| Style | Notch (top center) or Classic (draggable) |
| Voice Input | On = voice-activated, Off = constant auto-scroll |
| Hide on screen share | Invisible to viewers and in screenshots |
| Opacity | 20%–100% window transparency |
| Scroll Speed | 0.25× to 2× reading pace multiplier |
| Voice Sensitivity | Mic threshold from whisper (-50 dB) to loud (-5 dB) |

---

## Run from source

```bash
git clone https://github.com/ArunNGun/openTeleprompt
cd openTeleprompt
npm install
open node_modules/electron/dist/Electron.app --args "$(pwd)"
```

## Build DMG

```bash
# Apple Silicon
npm run build

# Intel
npx electron-builder --mac dmg --x64
```

---

## Stack

- **Electron** — frameless transparent window, global shortcuts, tray
- **Web Audio API** — real-time microphone volume detection (no network, no transcription)
- **Vanilla JS** — zero framework dependencies in the renderer
- **electron-builder** — DMG packaging for macOS

---

## Why not use webkitSpeechRecognition?

Short answer: it doesn't work in unsigned Electron apps — it silently hits Google's speech servers and fails with a network error. We use raw microphone volume (RMS) detection instead, which is instant, offline, and more reliable for live scrolling than transcription ever could be.

---

## Roadmap

- [ ] Mirror mode (for physical teleprompter glass)
- [ ] Script export / import
- [ ] Scroll position memory per script
- [ ] Apple Developer signing + notarization

---

Built by [Arun Kumar](https://ar-k.vercel.app) · MIT License
