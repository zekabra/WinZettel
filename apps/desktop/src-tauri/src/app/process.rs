use tauri::{AppHandle, Runtime};

#[tauri::command]
pub fn app_exit<R: Runtime>(app: AppHandle<R>, code: i32) {
    // Keys live in memory only, but drop them explicitly: a slow shutdown must not keep a
    // repository readable after the owner asked to quit.
    crate::repo::lock_volume();
    app.exit(code)
}

#[tauri::command]
pub fn app_restart<R: Runtime>(app: AppHandle<R>) {
    app.restart()
}

