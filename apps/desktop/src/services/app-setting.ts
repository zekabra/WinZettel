import { logger } from '@/helper/logger'
import useAppSettingStore from '@/stores/useAppSettingStore'
import { invoke } from '@tauri-apps/api/core'
import { emit } from '@tauri-apps/api/event'

export const appSettingStoreSetup = async () => {
  const { setSettingData } = useAppSettingStore.getState()

  try {
    logger.debug('Invoking get_app_conf...')
    const settingData = await invoke<Record<string, any>>('get_app_conf')
    logger.info('Loaded app settings')
    setSettingData(settingData)
    return settingData
  } catch (error) {
    logger.error('Failed to load app setting:', error)
    logger.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace')
    const defaultSetting = {
      theme: 'dark',
      theme_mode: 'dark',
      theme_accent_color: 'system',
      language: 'en',
      webview_zoom: '1.0',
      auto_update: false,
      open_file_in_new_window: true,
      editor_enable_preview_tabs: true,
    }
    setSettingData(defaultSetting)
    return defaultSetting
  }
}

let settingWriteQueue: Promise<void> = Promise.resolve()

/** Commit only changed fields; Rust merges them with the latest shared config. */
export const writeSettingPatch = (patch: Record<string, unknown>): Promise<void> => {
  const write = settingWriteQueue.then(async () => {
    const { settingData, setSettingData } = useAppSettingStore.getState()
    // Remembered dialog choices become active only after they are persisted.
    const { dialog_preferences: _preferences, ...optimisticPatch } = patch
    const newSettingData = {
      ...settingData,
      ...optimisticPatch,
    }

    setSettingData(newSettingData)

    try {
      const committed = await invoke<Record<string, unknown>>('save_app_conf', { data: patch })
      setSettingData(committed)

      void emit('app_conf_change').catch((error: unknown) => {
        logger.error('Failed to notify other windows about saved settings:', error)
      })
    } catch (error) {
      logger.error('Failed to write app setting:', error)
      setSettingData(settingData)
      throw error
    }
  })
  settingWriteQueue = write.catch(() => undefined)
  return write
}

export const writeSettingData = async (
  item: Pick<Setting.SettingItem, 'key' | 'afterWrite'>,
  value: any,
) => {
  await writeSettingPatch({ [item.key]: value })
  item.afterWrite?.(value)
}

const appSettingService = {
  appSettingStoreSetup,
  writeSettingData,
  writeSettingPatch,
}

export default appSettingService
