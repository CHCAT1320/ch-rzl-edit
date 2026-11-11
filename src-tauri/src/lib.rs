
use tauri::Manager;

#[tauri::command]
fn toggle_devtools(app: tauri::AppHandle) {
    let Some(window) = app.get_webview_window("main") else { return };
    if window.is_devtools_open() {
        window.close_devtools();
    } else {
        window.open_devtools();
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![toggle_devtools])
        .setup(|_app| {
            #[cfg(debug_assertions)]
            _app.get_webview_window("main")
                .expect("main window not found")
                .open_devtools();

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
