import { invoke } from '@tauri-apps/api/core'

/**
 * Deletes the application's settings and interface state.
 * Returns the paths that could not be removed (the WebView profile is in use while the
 * application runs, so a few files may survive until the next start).
 */
export const resetAppData = (restart: boolean): Promise<string[]> =>
  invoke<string[]>('reset_app_data', { restart })
