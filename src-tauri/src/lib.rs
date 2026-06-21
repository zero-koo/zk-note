// ZK-Note Tauri library entry point.
// App logic lives in the React frontend (src/).
// This shell exposes only OS-level features via IPC commands.

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
