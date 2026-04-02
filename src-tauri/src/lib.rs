use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

use std::sync::Mutex;
use tauri::{
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, LogicalPosition, LogicalSize, Manager, PhysicalPosition, State, WebviewWindow,
};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

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

}

impl Default for Config {
    fn default() -> Self {
        // On Windows: classic mode (no notch), screenshare protection off (causes render issues)
        #[cfg(target_os = "windows")]
        let (default_mode, default_screenshare) = ("classic".to_string(), false);
        #[cfg(not(target_os = "windows"))]
        let (default_mode, default_screenshare) = ("notch".to_string(), true);

        Self {
            scroll_speed: 1.0,
            threshold: 0.018,
            screenshare_hidden: default_screenshare,
            mode: default_mode,
            opacity: 1.0,
            auto_scroll: false,
            mic_device_id: "default".to_string(),
        }
    }
}

// ── Script ─────────────────────────────────────────────────
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Script {
    pub name: String,
    pub text: String,
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
    vec![
        Script {
            name: "About Me".to_string(),
            text: "Hi, I'm Arun — a full-stack engineer with five years of experience building products that scale.\n\nI've worked on systems serving over ten million customers, and I love building things that actually matter to people.\n".to_string(),
        },
        Script {
            name: "Meeting Notes".to_string(),
            text: "Quick recap from yesterday's sync.\n\nWe aligned on the Q2 roadmap priorities — performance improvements take the lead, followed by the new onboarding flow.\n\nAction items: design review by Friday, API spec finalized by end of next week.\n".to_string(),
        },
        Script {
            name: "Product Demo".to_string(),
            text: "Let me walk you through what we've built.\n\nOpenTeleprompter is a voice-activated teleprompter that lives right in your Mac's notch.\n\nSpeak — it scrolls. Stop — it pauses. No subscriptions, no setup, just open and go.\n".to_string(),
        },
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
        std::thread::sleep(std::time::Duration::from_millis(300));
        if let Some(w) = get_prompter(&app2) { let _ = w.close(); }
        for _ in 0..20 {
            std::thread::sleep(std::time::Duration::from_millis(100));
            if app2.get_webview_window("prompter").is_none() { break; }
        }
        std::thread::sleep(std::time::Duration::from_millis(100));
        create_prompter_window(&app2);
    });
}

#[tauri::command]
fn get_scripts() -> Vec<Script> { load_scripts() }

#[tauri::command]
fn save_scripts(scripts: Vec<Script>) { save_scripts_to_disk(&scripts); }

#[tauri::command]
fn set_ignore_mouse(app: AppHandle, ignore: bool) -> Result<(), String> {
    if let Some(w) = get_prompter(&app) {
        w.set_ignore_cursor_events(ignore).map_err(|e| e.to_string())?;
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
        let win_w = width.max(220.0);
        let win_h = (height + 20.0).max(50.0);
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
    let pos = w.outer_position().map_err(|e| e.to_string())?;
    w.set_size(LogicalSize::new(280.0, height)).map_err(|e| e.to_string())?;
    w.set_position(pos).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn quit_app(app: AppHandle) { app.exit(0); }

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

    let window = tauri::WebviewWindowBuilder::new(
        app, "prompter",
        tauri::WebviewUrl::App("renderer/index.html".into()),
    )
    .title("Teleprompter")
    .decorations(false)
    .transparent(true)
    .always_on_top(true)
    .skip_taskbar(true)
    .resizable(cfg.mode == "classic")
    .inner_size(width, height)
    .position(x, y)
    .visible_on_all_workspaces(true)
    .content_protected(false)
    .build();

    let window = match window {
        Ok(w) => w,
        Err(e) => { eprintln!("Failed to create prompter window: {e}"); return; }
    };

    window.set_ignore_cursor_events(true).ok(); // passthrough by default for notch
    apply_screenshare_mode(&window, cfg.screenshare_hidden);
}

fn get_settings_position(app: &AppHandle) -> (f64, f64) {
    let win_w: f64 = 280.0;
    let win_h: f64 = 380.0;
    let scale = app.primary_monitor().ok().flatten().map(|m| m.scale_factor()).unwrap_or(1.0);
    let screen_w = app.primary_monitor().ok().flatten().map(|m| m.size().width as f64 / scale).unwrap_or(1440.0);

    if let Some(tray) = app.tray_by_id("main-tray") {
        if let Ok(Some(rect)) = tray.rect() {
            let (tx, ty) = match rect.position {
                tauri::Position::Physical(p) => (p.x as f64 / scale, p.y as f64 / scale),
                tauri::Position::Logical(p)  => (p.x, p.y),
            };
            let (tw, th) = match rect.size {
                tauri::Size::Physical(s) => (s.width as f64 / scale, s.height as f64 / scale),
                tauri::Size::Logical(s)  => (s.width, s.height),
            };
            let mut x = tx + tw / 2.0 - win_w / 2.0;
            x = x.max(8.0).min(screen_w - win_w - 8.0);
            let y = if cfg!(target_os = "windows") { ty - win_h - 4.0 } else { ty + th + 4.0 };
            return (x, y);
        }
    }
    (screen_w - win_w - 20.0, 40.0)
}

fn show_settings(app: &AppHandle) {
    let (x, y) = get_settings_position(app);
    if let Some(w) = get_settings(app) {
        let _ = w.set_position(LogicalPosition::new(x, y));
        let _ = w.show();
        let _ = w.set_focus();
    } else {
        let _ = tauri::WebviewWindowBuilder::new(
            app, "settings",
            tauri::WebviewUrl::App("renderer/settings.html".into()),
        )
        .title("Settings")
        .decorations(false)
        .transparent(true)
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(false)
        .inner_size(280.0, 380.0)
        .position(x, y)
        .build()
        .ok();
        if let Some(w) = get_settings(app) {
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
            close_welcome, open_url,

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

            let prompter = tauri::WebviewWindowBuilder::new(
                app, "prompter",
                tauri::WebviewUrl::App("renderer/index.html".into()),
            )
            .title("Teleprompter")
            .decorations(false)
            .transparent(true)
            .always_on_top(true)
            .skip_taskbar(true)
            .resizable(cfg.mode == "classic")
            .inner_size(width, height)
            .position(x, y)
            .visible_on_all_workspaces(true)
            .content_protected(false)
            .build()?;

            // Only enable mouse passthrough in notch mode — in classic mode the window must be interactive
            if is_notch {
                prompter.set_ignore_cursor_events(true).ok();
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
            app_handle.on_tray_icon_event(move |_, event| {
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
            app_handle.global_shortcut().on_shortcuts(
                [
                    Shortcut::new(Some(Modifiers::SUPER   | Modifiers::SHIFT), Code::Space),
                    Shortcut::new(Some(Modifiers::CONTROL | Modifiers::SHIFT), Code::Space),
                    Shortcut::new(Some(Modifiers::SUPER   | Modifiers::SHIFT), Code::ArrowUp),
                    Shortcut::new(Some(Modifiers::CONTROL | Modifiers::SHIFT), Code::ArrowUp),
                    Shortcut::new(Some(Modifiers::SUPER   | Modifiers::SHIFT), Code::ArrowDown),
                    Shortcut::new(Some(Modifiers::CONTROL | Modifiers::SHIFT), Code::ArrowDown),
                    Shortcut::new(Some(Modifiers::SUPER   | Modifiers::SHIFT), Code::KeyR),
                    Shortcut::new(Some(Modifiers::CONTROL | Modifiers::SHIFT), Code::KeyR),
                ],
                move |app, shortcut, event| {
                    if event.state() != ShortcutState::Pressed { return; }
                    let action = match shortcut.key {
                        Code::Space     => "pause",
                        Code::ArrowUp   => "faster",
                        Code::ArrowDown => "slower",
                        Code::KeyR      => "reset",
                        _ => return,
                    };
                    let _ = app.emit_to("prompter", "shortcut", action);
                },
            )?;

            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                if window.label() == "settings" {
                    window.hide().ok();
                    api.prevent_close();
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
