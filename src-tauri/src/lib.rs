use tauri::Manager;

fn configure_main_window_overlay(app: &tauri::AppHandle) -> Result<(), String> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "main window not found".to_string())?;
    window.set_always_on_top(true).map_err(|e| e.to_string())?;
    #[cfg(target_os = "macos")]
    {
        window
            .set_visible_on_all_workspaces(true)
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn set_hide_from_capture(app: tauri::AppHandle, hide: bool) -> Result<(), String> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "main window not found".to_string())?;
    window
        .set_content_protected(hide)
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn refresh_overlay_behavior(app: tauri::AppHandle) -> Result<(), String> {
    configure_main_window_overlay(&app)?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_positioner::init())
        .setup(|app| {
            if let Err(err) = configure_main_window_overlay(&app.handle()) {
                eprintln!("overlay setup failed: {err}");
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            set_hide_from_capture,
            refresh_overlay_behavior
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
