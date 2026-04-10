

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

// ── macOS: elevate window above menu bar/notch AND position it at screen top ─
// Strategy: window height = notch_content_h + overlap_h (e.g. 160+40=200px)
// Position window so its TOP is flush with screen top (above menu bar).
// The 40px overlap at the bottom keeps WKWebView rendering (it stops
// rendering when 100% above visible area).
// CSS island sits at top:0 = physically in the notch.
#[cfg(target_os = "macos")]
fn elevate_to_notch_level(window: &WebviewWindow) {
    use objc2_foundation::{NSRect, NSPoint, NSSize};
    let ns_win_ptr = match window.ns_window() {
        Ok(p) => p,
        Err(e) => { eprintln!("[notch] ns_window error: {e}"); return; }
    };
    unsafe {
        let mtm = objc2::MainThreadMarker::new_unchecked();
        let ns_win = ns_win_ptr as *mut objc2_app_kit::NSWindow;

        // Level 27 = NSMainMenuWindowLevel(24) + 3 — floats above menu bar (same as Atoll)
        (*ns_win).setLevel(27);
        // All spaces, stationary, ignored in cmd+tab, fullscreen safe
        (*ns_win).setCollectionBehavior(
            objc2_app_kit::NSWindowCollectionBehavior((1<<0)|(1<<4)|(1<<6)|(1<<8))
        );
        (*ns_win).setHasShadow(false);

        // Reposition: flush to screen top so CSS island appears in physical notch.
        // Use full screen width, height=200 (notch content area).
        // y = screenFrame.maxY - windowHeight positions top of window at screen top.
        // WKWebView renders because level=27 makes the window "visible" to compositor
        // even when fully above the menu bar.
        if let Some(screen) = objc2_app_kit::NSScreen::mainScreen(mtm) {
            let sf = screen.frame(); // NSScreen uses bottom-left origin
            let win_h = (*ns_win).frame().size.height;
            let new_y = sf.origin.y + sf.size.height - win_h;
            let new_frame = NSRect {
                origin: NSPoint { x: sf.origin.x, y: new_y },
                size: NSSize { width: sf.size.width, height: win_h },
            };
            (*ns_win).setFrame_display(new_frame, true);
            eprintln!("[notch] elevated+positioned: level=27 y={new_y} (screen top at {})",
                sf.origin.y + sf.size.height);
        } else {
            eprintln!("[notch] elevated: level=27 (no screen for reposition)");
        }
    }
}

#[cfg(not(target_os = "macos"))]
fn elevate_to_notch_level(_window: &WebviewWindow) {}




use std::sync::{Mutex, atomic::{AtomicBool, Ordering}};

// Set to true once the tray icon has been clicked — positioner needs this before TrayCenter works
static TRAY_CLICKED: AtomicBool = AtomicBool::new(false);
use tauri::{
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, LogicalPosition, LogicalSize, Manager, PhysicalPosition, State, WebviewWindow,
};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};
use tauri_plugin_positioner::{Position, WindowExt};

// ── Config ─────────────────────────────────────────────────
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Config {
    pub scroll_speed: f64,
    pub threshold: f64,
    pub screenshare_hidden: bool,
    pub mode: String,
    pub opacity: f64,
    pub auto_scroll: bool,
    pub mic_device_id: String,
    pub theme: String,
}

impl Default for Config {
    fn default() -> Self {
        // macOS: notch mode, Windows: classic mode
        #[cfg(target_os = "windows")]
        let default_mode = "classic".to_string();
        #[cfg(not(target_os = "windows"))]
        let default_mode = "notch".to_string();

        Self {
            scroll_speed: 1.0,
            threshold: 0.018,
            screenshare_hidden: true,  // hide on screenshare: ON by default (both platforms)
            mode: default_mode,
            opacity: 1.0,
            auto_scroll: true,         // voice input: ON by default (both platforms)
            mic_device_id: "default".to_string(),
            theme: "dark".to_string(),
        }
    }
}

// ── Script ─────────────────────────────────────────────────
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Script {
    pub name: String,
    pub text: String,
    #[serde(default)]
    pub content: String, // Tiptap JSON string
}

// ── App state ──────────────────────────────────────────────
pub struct AppState {
    config:      Mutex<Config>,
    classic_pos: Mutex<Option<(f64, f64)>>,

}

// ── File paths ─────────────────────────────────────────────
fn config_path() -> PathBuf {
    dirs::home_dir().unwrap_or_default().join(".teleprompter-config.json")
}

fn first_launch_path() -> PathBuf {
    dirs::home_dir().unwrap_or_default().join(".teleprompter-launched")
}

fn is_first_launch() -> bool {
    !first_launch_path().exists()
}

fn mark_launched() {
    let _ = fs::write(first_launch_path(), "1");
}
fn scripts_path() -> PathBuf {
    dirs::home_dir().unwrap_or_default().join(".teleprompter-scripts.json")
}
fn load_config() -> Config {
    fs::read_to_string(config_path())
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}
fn save_config(cfg: &Config) {
    if let Ok(json) = serde_json::to_string_pretty(cfg) {
        let _ = fs::write(config_path(), json);
    }
}

fn default_scripts() -> Vec<Script> {
    let about_me_content = serde_json::json!({
        "type": "doc",
        "content": [
            { "type": "paragraph", "content": [
                { "type": "text", "text": "Hi, I'm " },
                { "type": "text", "marks": [{"type": "bold"}], "text": "Arun" },
                { "type": "text", "text": " — a full-stack engineer with " },
                { "type": "text", "marks": [{"type": "textStyle", "attrs": {"color": "#4ade80"}}], "text": "five years of experience" },
                { "type": "text", "text": " building products that scale." }
            ]},
            { "type": "paragraph", "content": [
                { "type": "text", "text": "I've worked on systems serving " },
                { "type": "text", "marks": [{"type": "textStyle", "attrs": {"color": "#60a5fa"}}], "text": "over thirty million customers" },
                { "type": "text", "text": ", and I love building things that actually " },
                { "type": "text", "marks": [{"type": "bold"}], "text": "matter to people" },
                { "type": "text", "text": "." }
            ]},
            { "type": "paragraph", "content": [
                { "type": "text", "text": "My stack spans " },
                { "type": "text", "marks": [{"type": "textStyle", "attrs": {"color": "#4ade80"}}], "text": "React, Node.js, TypeScript" },
                { "type": "text", "text": ", and cloud infrastructure on " },
                { "type": "text", "marks": [{"type": "bold"}], "text": "GCP" },
                { "type": "text", "text": ". I'm comfortable across the entire stack — from pixel-perfect frontends to distributed backend systems." }
            ]},
            { "type": "paragraph", "content": [
                { "type": "text", "text": "I thrive in environments where " },
                { "type": "text", "marks": [{"type": "textStyle", "attrs": {"color": "#facc15"}}], "text": "ownership and impact" },
                { "type": "text", "text": " go hand in hand. I've led cross-functional features, mentored engineers, and shipped products used by real people every day." }
            ]},
            { "type": "paragraph", "content": [
                { "type": "text", "text": "Outside of work, I'm into " },
                { "type": "text", "marks": [{"type": "bold"}], "text": "game development" },
                { "type": "text", "text": ", guitar, and building side projects that push what's possible on the web." }
            ]}
        ]
    }).to_string();

    let meeting_content = serde_json::json!({
        "type": "doc",
        "content": [
            { "type": "paragraph", "content": [
                { "type": "text", "text": "Quick recap from " },
                { "type": "text", "marks": [{"type": "bold"}], "text": "yesterday's sync" },
                { "type": "text", "text": "." }
            ]},
            { "type": "paragraph", "content": [
                { "type": "text", "text": "We aligned on the " },
                { "type": "text", "marks": [{"type": "textStyle", "attrs": {"color": "#facc15"}}], "text": "Q2 roadmap priorities" },
                { "type": "text", "text": " — performance improvements take the lead." }
            ]},
            { "type": "paragraph", "content": [
                { "type": "text", "marks": [{"type": "bold"}], "text": "Action items:" },
                { "type": "text", "text": " design review by " },
                { "type": "text", "marks": [{"type": "textStyle", "attrs": {"color": "#f87171"}}], "text": "Friday" },
                { "type": "text", "text": ", API spec finalized by " },
                { "type": "text", "marks": [{"type": "textStyle", "attrs": {"color": "#f87171"}}], "text": "end of next week" },
                { "type": "text", "text": "." }
            ]}
        ]
    }).to_string();

    let demo_content = serde_json::json!({
        "type": "doc",
        "content": [
            { "type": "paragraph", "content": [
                { "type": "text", "text": "Let me walk you through what we've built." }
            ]},
            { "type": "paragraph", "content": [
                { "type": "text", "marks": [{"type": "bold"}], "text": "OpenTeleprompter" },
                { "type": "text", "text": " is a " },
                { "type": "text", "marks": [{"type": "textStyle", "attrs": {"color": "#4ade80"}}], "text": "voice-activated teleprompter" },
                { "type": "text", "text": " that lives right in your Mac's notch." }
            ]},
            { "type": "paragraph", "content": [
                { "type": "text", "marks": [{"type": "textStyle", "attrs": {"color": "#60a5fa"}}], "text": "Speak" },
                { "type": "text", "text": " — it scrolls. " },
                { "type": "text", "marks": [{"type": "textStyle", "attrs": {"color": "#f87171"}}], "text": "Stop" },
                { "type": "text", "text": " — it pauses. " },
                { "type": "text", "marks": [{"type": "bold"}], "text": "No subscriptions, no setup" },
                { "type": "text", "text": ", just open and go." }
            ]}
        ]
    }).to_string();

    vec![
        Script { name: "About Me".to_string(), text: "Hi, I'm Arun.".to_string(), content: about_me_content },
        Script { name: "Meeting Notes".to_string(), text: "Quick recap.".to_string(), content: meeting_content },
        Script { name: "Product Demo".to_string(), text: "Let me walk you through what we've built.".to_string(), content: demo_content },
    ]
}

fn load_scripts() -> Vec<Script> {
    fs::read_to_string(scripts_path())
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_else(default_scripts)
}
fn save_scripts_to_disk(scripts: &[Script]) {
    if let Ok(json) = serde_json::to_string_pretty(scripts) {
        let _ = fs::write(scripts_path(), json);
    }
}

// ── Helpers ────────────────────────────────────────────────
fn get_prompter(app: &AppHandle) -> Option<WebviewWindow> { app.get_webview_window("prompter") }
fn get_settings(app: &AppHandle) -> Option<WebviewWindow> { app.get_webview_window("settings") }
fn apply_screenshare_mode(window: &WebviewWindow, hidden: bool) {
    let _ = window.set_content_protected(hidden);
}

// ── Commands ───────────────────────────────────────────────

// Called from JS after window mounts — runs on Tauri's main thread dispatcher
#[tauri::command]
fn elevate_notch_window(window: WebviewWindow) -> String {
    let cfg = window.app_handle()
        .try_state::<AppState>()
        .map(|s| s.config.lock().unwrap().mode.clone())
        .unwrap_or_default();
    eprintln!("[notch-cmd] called, mode={cfg}");
    if cfg != "classic" {
        // elevate_to_notch_level now handles both level=27 AND repositioning to screen top
        elevate_to_notch_level(&window);
    }
    format!("ok:mode={cfg}")
}

#[tauri::command]
fn get_config(state: State<AppState>) -> Config {
    state.config.lock().unwrap().clone()
}

#[tauri::command]
fn set_config(app: AppHandle, state: State<AppState>, patch: serde_json::Value) {
    let mut cfg = state.config.lock().unwrap();
    if let Some(v) = patch.get("scrollSpeed").and_then(|v| v.as_f64()) { cfg.scroll_speed = v; }
    if let Some(v) = patch.get("threshold").and_then(|v| v.as_f64()) { cfg.threshold = v; }
    if let Some(v) = patch.get("screenshareHidden").and_then(|v| v.as_bool()) { cfg.screenshare_hidden = v; }
    if let Some(v) = patch.get("mode").and_then(|v| v.as_str()) { cfg.mode = v.to_string(); }
    if let Some(v) = patch.get("opacity").and_then(|v| v.as_f64()) { cfg.opacity = v; }
    if let Some(v) = patch.get("autoScroll").and_then(|v| v.as_bool()) { cfg.auto_scroll = v; }
    if let Some(v) = patch.get("micDeviceId").and_then(|v| v.as_str()) { cfg.mic_device_id = v.to_string(); }
    if let Some(v) = patch.get("theme").and_then(|v| v.as_str()) { cfg.theme = v.to_string(); }

    let cfg_clone = cfg.clone();
    save_config(&cfg_clone);
    drop(cfg);

    if let Some(w) = get_prompter(&app) {
        apply_screenshare_mode(&w, cfg_clone.screenshare_hidden);
    }
    let _ = app.emit("config-update", &cfg_clone);
}

/// Safe mode switch — collapses JS first, then recreates window
#[tauri::command]
fn switch_mode(app: AppHandle, state: State<AppState>, mode: String) {
    {
        let mut cfg = state.config.lock().unwrap();
        cfg.mode = mode.clone();
        save_config(&cfg);
    }
    let _ = app.emit_to("prompter", "shortcut", "stop");
    let app2 = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_millis(200));
        if let Some(w) = get_prompter(&app2) { let _ = w.close(); }
        // Wait up to 3s for the window to actually close
        for _ in 0..60 {
            std::thread::sleep(std::time::Duration::from_millis(50));
            if app2.get_webview_window("prompter").is_none() { break; }
        }
        std::thread::sleep(std::time::Duration::from_millis(150));
        // Window creation + NSWindow APIs MUST be on main thread (macOS Sequoia requirement)
        let app3 = app2.clone();
        let _ = app2.run_on_main_thread(move || {
            create_prompter_window(&app3);
        });
    });
}

#[tauri::command]
fn get_scripts() -> Vec<Script> { load_scripts() }

#[tauri::command]
fn save_scripts(scripts: Vec<Script>) { save_scripts_to_disk(&scripts); }

#[tauri::command]
fn set_ignore_mouse(app: AppHandle, state: State<AppState>, ignore: bool) -> Result<(), String> {
    // Never enable click-through in classic mode — buttons must be clickable
    let cfg = state.config.lock().unwrap();
    let is_classic = cfg.mode == "classic";
    drop(cfg);
    if let Some(w) = get_prompter(&app) {
        let effective = if is_classic { false } else { ignore };
        w.set_ignore_cursor_events(effective).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn resize_prompter(app: AppHandle, state: State<AppState>, dims: serde_json::Value) -> Result<(), String> {
    let Some(w) = get_prompter(&app) else { return Ok(()) };
    let width  = dims.get("width").and_then(|v| v.as_f64()).unwrap_or(560.0);
    let height = dims.get("height").and_then(|v| v.as_f64()).unwrap_or(400.0);

    let cfg = state.config.lock().unwrap();
    let is_notch = cfg.mode != "classic";
    drop(cfg);

    // Notch mode:
    // - idle (small pill): use exact size so window doesn't block clicks behind it
    // - edit/read (expanded): use full screen width so island can animate from center
    if is_notch {
        let monitor = w.current_monitor().map_err(|e| e.to_string())?
            .or_else(|| w.primary_monitor().ok().flatten());
        let scale = monitor.as_ref().map(|m| m.scale_factor()).unwrap_or(1.0);
        let screen_w = monitor.as_ref().map(|m| m.size().width as f64 / scale).unwrap_or(1440.0);

        // Always use exact island size — center the window horizontally
        // Island is centered via CSS within this window, so no full-screen-width needed
        let win_w = width.max(200.0);
        let win_h = height.max(36.0);
        let x = (screen_w - win_w) / 2.0;
        w.set_size(LogicalSize::new(win_w, win_h)).map_err(|e| e.to_string())?;
        w.set_position(LogicalPosition::new(x, 0.0)).map_err(|e| e.to_string())?;
        return Ok(());
    }

    let monitor = w.current_monitor().map_err(|e| e.to_string())?
        .or_else(|| w.primary_monitor().ok().flatten());
    let scale = monitor.as_ref().map(|m| m.scale_factor()).unwrap_or(1.0);
    let cur = w.outer_position().unwrap_or(PhysicalPosition::new(0, 0));
    let (x, y) = (cur.x as f64 / scale, cur.y as f64 / scale);

    w.set_size(LogicalSize::new(width, height)).map_err(|e| e.to_string())?;
    w.set_position(LogicalPosition::new(x, y)).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn toggle_prompter(app: AppHandle) -> Result<bool, String> {
    let Some(w) = get_prompter(&app) else { return Ok(false) };
    let visible = w.is_visible().unwrap_or(false);
    if visible {
        let _ = app.emit_to("prompter", "shortcut", "stop");
        w.hide().map_err(|e| e.to_string())?;
        Ok(false)
    } else {
        w.show().map_err(|e| e.to_string())?;
        w.set_focus().map_err(|e| e.to_string())?;
        Ok(true)
    }
}

#[tauri::command]
fn resize_settings(app: AppHandle, dims: serde_json::Value) -> Result<(), String> {
    let Some(w) = get_settings(&app) else { return Ok(()) };
    let height = dims.get("height").and_then(|v| v.as_f64()).unwrap_or(380.0);

    #[cfg(target_os = "windows")]
    let panel_w = 220.0_f64;
    #[cfg(not(target_os = "windows"))]
    let panel_w = 280.0_f64;

    let monitor = w.current_monitor().ok().flatten();
    let scale = monitor.as_ref().map(|m| m.scale_factor()).unwrap_or(1.0);
    let screen_h = monitor.as_ref().map(|m| m.size().height as f64 / scale).unwrap_or(900.0);
    let capped_h = height.min(screen_h - 40.0);

    w.set_size(LogicalSize::new(panel_w, capped_h)).map_err(|e| e.to_string())?;
    // Re-anchor after resize — only use positioner after tray has been clicked
    if !TRAY_CLICKED.load(Ordering::Relaxed) || w.move_window(Position::TrayCenter).is_err() {
        // Positioner not ready — fall back to bottom-right corner
        let monitor = w.current_monitor().ok().flatten();
        let scale = monitor.as_ref().map(|m| m.scale_factor()).unwrap_or(1.0);
        let screen_w = monitor.as_ref().map(|m| m.size().width as f64 / scale).unwrap_or(1440.0);
        let screen_h = monitor.map(|m| m.size().height as f64 / scale).unwrap_or(900.0);
        let x = screen_w - panel_w - 12.0;
        let y = screen_h - capped_h - 48.0;
        let _ = w.set_position(LogicalPosition::new(x, y));
    }
    Ok(())
}

#[tauri::command]
fn quit_app(app: AppHandle) { app.exit(0); }

#[tauri::command]
fn focus_prompter(app: AppHandle) {
    if let Some(w) = get_prompter(&app) {
        let _ = w.set_focus();
    }
}

#[tauri::command]
fn open_devtools(app: AppHandle) {
    if let Some(w) = get_prompter(&app) { w.open_devtools(); }
}

#[tauri::command]
fn set_movable(_app: AppHandle, _movable: bool) -> Result<(), String> { Ok(()) }

#[tauri::command]
fn move_window(app: AppHandle, pos: serde_json::Value) -> Result<(), String> {
    let Some(w) = get_prompter(&app) else { return Ok(()) };
    let x = pos.get("x").and_then(|v| v.as_f64()).unwrap_or(0.0);
    let y = pos.get("y").and_then(|v| v.as_f64()).unwrap_or(0.0);
    w.set_position(LogicalPosition::new(x, y)).map_err(|e| e.to_string())?;
    if let Some(state) = app.try_state::<AppState>() {
        *state.classic_pos.lock().unwrap() = Some((x, y));
    }
    Ok(())
}

#[tauri::command]
fn get_window_pos(app: AppHandle) -> serde_json::Value {
    if let Some(w) = get_prompter(&app) {
        if let Ok(pos) = w.outer_position() {
            return serde_json::json!({ "x": pos.x, "y": pos.y });
        }
    }
    serde_json::json!({ "x": 0, "y": 0 })
}

#[tauri::command]
fn start_drag(app: AppHandle) -> Result<(), String> {
    if let Some(w) = get_prompter(&app) {
        w.start_dragging().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn hide_settings(app: AppHandle) {
    if let Some(w) = get_settings(&app) { let _ = w.hide(); }
}

#[tauri::command]
fn open_settings(app: AppHandle) {
    show_settings(&app);
}

#[tauri::command]
fn close_welcome(app: AppHandle) {
    if let Some(w) = app.get_webview_window("welcome") {
        let _ = w.close();
    }
}

#[tauri::command]
fn open_url(_app: AppHandle, url: String) {
    let _ = open::that(url);
}

// ── Window creation ────────────────────────────────────────

fn create_prompter_window(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("prompter") {
        let _ = w.close();
        std::thread::sleep(std::time::Duration::from_millis(200));
    }

    let cfg = app.try_state::<AppState>()
        .map(|s| s.config.lock().unwrap().clone())
        .unwrap_or_default();

    let is_notch = cfg.mode != "classic";

    let monitor = app.primary_monitor().ok().flatten();
    let scale   = monitor.as_ref().map(|m| m.scale_factor()).unwrap_or(1.0);
    let screen_w: f64 = monitor.map(|m| m.size().width as f64 / scale).unwrap_or(1440.0);

    // Notch: full-screen-width transparent window — CSS shows only the pill
    let (width, height): (f64, f64) = if is_notch { (screen_w, 200.0) } else { (560.0, 400.0) };
    let saved_pos = app.try_state::<AppState>()
        .and_then(|s| s.classic_pos.lock().ok().and_then(|p| *p));
    let (x, y) = if !is_notch {
        saved_pos.unwrap_or(((screen_w - width) / 2.0, 100.0))
    } else {
        (0.0, 0.0)
    };

    // In dev mode use Vite dev server, in release use bundled dist
    #[cfg(debug_assertions)]
    let prompter_url = tauri::WebviewUrl::External("http://localhost:1420".parse().unwrap());
    #[cfg(not(debug_assertions))]
    let prompter_url = tauri::WebviewUrl::App("index.html".into());

    let window = tauri::WebviewWindowBuilder::new(
        app, "prompter",
        prompter_url,
    )
    .title("Teleprompter")
    .decorations(false)
    .transparent(true)
    .always_on_top(true)
    .skip_taskbar(true)
    .resizable(cfg.mode == "classic")
    .accept_first_mouse(true)
    .inner_size(width, height)
    .position(x, y)
    .visible_on_all_workspaces(true)
    .content_protected(false)
    .build();

    let window = match window {
        Ok(w) => w,
        Err(e) => { eprintln!("Failed to create prompter window: {e}"); return; }
    };

    // NOTE: do NOT set_ignore_cursor_events here — breaks WKWebView rendering
    // JS side calls API.setIgnoreMouse after React mounts
    apply_screenshare_mode(&window, cfg.screenshare_hidden);

    // Elevate window level above menu bar (NSWindow APIs — must be on main thread).
    // switch_mode now dispatches create_prompter_window to main thread, so this is safe.
    eprintln!("[OT] is_notch={is_notch}, mode={}", cfg.mode);
    if is_notch {
        eprintln!("[OT] calling elevate_to_notch_level");
        elevate_to_notch_level(&window);
    }


}

fn position_settings_window(app: &AppHandle, w: &WebviewWindow) {
    let scale = app.primary_monitor().ok().flatten().map(|m| m.scale_factor()).unwrap_or(1.0);
    let screen_w = app.primary_monitor().ok().flatten().map(|m| m.size().width as f64 / scale).unwrap_or(1440.0);
    let screen_h = app.primary_monitor().ok().flatten().map(|m| m.size().height as f64 / scale).unwrap_or(900.0);

    #[cfg(target_os = "windows")]
    let (panel_w, panel_h) = (220.0_f64, 400.0_f64);
    #[cfg(not(target_os = "windows"))]
    let (panel_w, panel_h) = (280.0_f64, 380.0_f64);

    // Only use positioner after tray has been clicked — calling it before panics
    if TRAY_CLICKED.load(Ordering::Relaxed) {
        if w.move_window(Position::TrayCenter).is_ok() { return; }
    }

    // Fallback: bottom-right corner above taskbar
    let x = screen_w - panel_w - 12.0;
    let y = screen_h - panel_h - 48.0;
    let _ = w.set_position(LogicalPosition::new(x, y));
}

fn show_settings(app: &AppHandle) {
    #[cfg(target_os = "windows")]
    let (settings_url, win_w, win_h) = ("renderer/settings-win.html", 220.0_f64, 500.0_f64);
    #[cfg(not(target_os = "windows"))]
    let (settings_url, win_w, win_h) = ("settings.html", 280.0_f64, 420.0_f64);

    if let Some(w) = get_settings(app) {
        position_settings_window(app, &w);
        let _ = w.show();
        let _ = w.set_focus();
    } else {
        let _ = tauri::WebviewWindowBuilder::new(
            app, "settings",
            tauri::WebviewUrl::App(settings_url.into()),
        )
        .title("Settings")
        .decorations(false)
        .transparent(true)
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(false)
        .inner_size(win_w, win_h)
        .build()
        .ok();
        if let Some(w) = get_settings(app) {
            position_settings_window(app, &w);
            w.set_always_on_top(true).ok();
            w.set_focus().ok();
        }
    }
}

fn hide_settings_internal(app: &AppHandle) {
    if let Some(w) = get_settings(app) { let _ = w.hide(); }
}

fn toggle_settings(app: &AppHandle) {
    if let Some(w) = get_settings(app) {
        if w.is_visible().unwrap_or(false) { hide_settings_internal(app); return; }
    }
    show_settings(app);
}

// ── Run ────────────────────────────────────────────────────

pub fn run() {
    eprintln!("[OT] starting up");
    let config = load_config();
    let state  = AppState {
        config:      Mutex::new(config),
        classic_pos: Mutex::new(None),

    };

    tauri::Builder::default()
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_positioner::init())
        .manage(state)
        .invoke_handler(tauri::generate_handler![
            get_config, set_config, switch_mode,
            get_scripts, save_scripts,
            set_ignore_mouse, resize_prompter,
            toggle_prompter, resize_settings,
            quit_app, open_devtools,
            hide_settings, start_drag,
            set_movable, move_window, get_window_pos,
            close_welcome, open_url, open_settings,
            focus_prompter, elevate_notch_window,
        ])
        .setup(|app| {
            let app_handle = app.handle().clone();

            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);

            let cfg = app_handle.state::<AppState>().config.lock().unwrap().clone();
            let is_notch = cfg.mode != "classic";

            let monitor  = app_handle.primary_monitor().ok().flatten();
            let scale    = monitor.as_ref().map(|m| m.scale_factor()).unwrap_or(1.0);
            let screen_w = monitor.map(|m| m.size().width as f64 / scale).unwrap_or(1440.0);

            let (width, height): (f64, f64) = if is_notch { (screen_w, 200.0) } else { (560.0, 400.0) };
            let x: f64 = if is_notch { 0.0 } else { (screen_w - width) / 2.0 };
            let y: f64 = if is_notch { 0.0 } else { 100.0 };

            #[cfg(debug_assertions)]
            let prompter_url = tauri::WebviewUrl::External("http://localhost:1420".parse().unwrap());
            #[cfg(not(debug_assertions))]
            let prompter_url = tauri::WebviewUrl::App("renderer/index.html".into());

            let prompter = tauri::WebviewWindowBuilder::new(
                app, "prompter",
                prompter_url,
            )
            .title("Teleprompter")
            .decorations(false)
            .transparent(true)
            .always_on_top(true)
            .skip_taskbar(true)
            .resizable(cfg.mode == "classic")
            .accept_first_mouse(true)
            .inner_size(width, height)
            .position(x, y)
            .visible_on_all_workspaces(true)
            .content_protected(false)
            .build()?;

            eprintln!("[OT] setup: prompter window built, is_notch={is_notch}");

            // Elevate above menu bar in notch mode (must be on main thread)
            if is_notch {
                elevate_to_notch_level(&prompter);
            }

            if cfg.screenshare_hidden {
                prompter.set_content_protected(true).ok();
            }

            // ── Welcome screen (first launch only) ────────
            if is_first_launch() {
                mark_launched();
                let monitor  = app_handle.primary_monitor().ok().flatten();
                let scale    = monitor.as_ref().map(|m| m.scale_factor()).unwrap_or(1.0);
                let screen_w = monitor.as_ref().map(|m| m.size().width  as f64 / scale).unwrap_or(1440.0);
                let screen_h = monitor.as_ref().map(|m| m.size().height as f64 / scale).unwrap_or(900.0);
                let win_w = 460.0_f64;
                let win_h = 600.0_f64;
                let wx = (screen_w - win_w) / 2.0;
                let wy = (screen_h - win_h) / 2.0;

                // On Windows: use decorations (no transparent borderless) to avoid invisible window bug
                #[cfg(target_os = "windows")]
                let _ = tauri::WebviewWindowBuilder::new(
                    app, "welcome",
                    tauri::WebviewUrl::App("renderer/welcome.html".into()),
                )
                .title("Welcome to OpenTeleprompter")
                .decorations(true)
                .transparent(false)
                .always_on_top(true)
                .resizable(false)
                .inner_size(win_w, win_h)
                .position(wx, wy)
                .build();

                #[cfg(not(target_os = "windows"))]
                let _ = tauri::WebviewWindowBuilder::new(
                    app, "welcome",
                    tauri::WebviewUrl::App("renderer/welcome.html".into()),
                )
                .title("Welcome to OpenTeleprompter")
                .decorations(false)
                .transparent(true)
                .always_on_top(true)
                .resizable(false)
                .inner_size(win_w, win_h)
                .position(wx, wy)
                .build();
            }

            // ── Tray ───────────────────────────────────────
            let icon = tauri::image::Image::from_bytes(include_bytes!("../icons/tray-icon.png"))
                .unwrap_or_else(|_| app_handle.default_window_icon().unwrap().clone());

            #[cfg(target_os = "macos")]
            TrayIconBuilder::with_id("main-tray")
                .icon(icon)
                .icon_as_template(true)
                .tooltip("OpenTeleprompter")
                .build(app)?;

            #[cfg(not(target_os = "macos"))]
            {
                use tauri::menu::{Menu, MenuItem};
                let s = MenuItem::with_id(app, "settings", "Settings", true, None::<&str>)?;
                let q = MenuItem::with_id(app, "quit",     "Quit",     true, None::<&str>)?;
                let menu = Menu::with_items(app, &[&s, &q])?;
                TrayIconBuilder::with_id("main-tray")
                    .icon(icon)
                    .tooltip("OpenTeleprompter")
                    .menu(&menu)
                    .show_menu_on_left_click(false)
                    .build(app)?;
            }

            let app_tray = app_handle.clone();
            app_handle.on_tray_icon_event(move |tray, event| {
                // Feed event to positioner so it knows tray position
                tauri_plugin_positioner::on_tray_event(tray, &event);
                TRAY_CLICKED.store(true, Ordering::Relaxed);
                if let TrayIconEvent::Click {
                    button: MouseButton::Left,
                    button_state: MouseButtonState::Up, ..
                } = event { toggle_settings(&app_tray); }
            });

            // Handle Windows tray menu item clicks
            let app_menu = app_handle.clone();
            app_handle.on_menu_event(move |_app, event| {
                match event.id().as_ref() {
                    "settings" => toggle_settings(&app_menu),
                    "quit"     => app_menu.exit(0),
                    _ => {}
                }
            });

            // ── Shortcuts ──────────────────────────────────
            // Use only Ctrl+Shift variants on Windows (Super/Win key combos conflict with system shortcuts)
            #[cfg(target_os = "windows")]
            let shortcuts = vec![
                Shortcut::new(Some(Modifiers::CONTROL | Modifiers::SHIFT), Code::Space),
                Shortcut::new(Some(Modifiers::CONTROL | Modifiers::SHIFT), Code::ArrowUp),
                Shortcut::new(Some(Modifiers::CONTROL | Modifiers::SHIFT), Code::ArrowDown),
                Shortcut::new(Some(Modifiers::CONTROL | Modifiers::SHIFT), Code::KeyR),
            ];
            #[cfg(not(target_os = "windows"))]
            let shortcuts = vec![
                Shortcut::new(Some(Modifiers::SUPER   | Modifiers::SHIFT), Code::Space),
                Shortcut::new(Some(Modifiers::CONTROL | Modifiers::SHIFT), Code::Space),
                Shortcut::new(Some(Modifiers::SUPER   | Modifiers::SHIFT), Code::ArrowUp),
                Shortcut::new(Some(Modifiers::CONTROL | Modifiers::SHIFT), Code::ArrowUp),
                Shortcut::new(Some(Modifiers::SUPER   | Modifiers::SHIFT), Code::ArrowDown),
                Shortcut::new(Some(Modifiers::CONTROL | Modifiers::SHIFT), Code::ArrowDown),
                Shortcut::new(Some(Modifiers::SUPER   | Modifiers::SHIFT), Code::KeyR),
                Shortcut::new(Some(Modifiers::CONTROL | Modifiers::SHIFT), Code::KeyR),
            ];

            // Register shortcuts — skip any that are already taken by the OS
            for sc in shortcuts {
                let _ = app_handle.global_shortcut().on_shortcut(sc, move |app, shortcut, event| {
                    if event.state() != ShortcutState::Pressed { return; }
                    let action = match shortcut.key {
                        Code::Space     => "pause",
                        Code::ArrowUp   => "faster",
                        Code::ArrowDown => "slower",
                        Code::KeyR      => "reset",
                        _ => return,
                    };
                    let _ = app.emit_to("prompter", "shortcut", action);
                });
            }

            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                if window.label() == "settings" {
                    window.hide().ok();
                    api.prevent_close();
                }
                // Note: do NOT prevent prompter close — switch_mode needs to close and recreate it
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
