import type { IpcMain } from 'electron'
import { getDb } from '../db/database'
import { getAllSettings, getSetting, setSetting } from '../db/schema'
import type { IpcResponse, SettingKey, SettingSetPayload } from '../../shared/types'

export function registerSettingsHandlers(ipcMain: IpcMain): void {
  ipcMain.handle('settings:getAll', async (): Promise<IpcResponse<Record<string, string>>> => {
    try {
      const data = getAllSettings(getDb())
      return { success: true, data }
    } catch (e) {
      return { success: false, error: String(e) }
    }
  })

  ipcMain.handle(
    'settings:get',
    async (_, key: SettingKey): Promise<IpcResponse<string | null>> => {
      try {
        const data = getSetting(getDb(), key)
        return { success: true, data }
      } catch (e) {
        return { success: false, error: String(e) }
      }
    }
  )

  ipcMain.handle(
    'settings:set',
    async (_, payload: SettingSetPayload): Promise<IpcResponse<void>> => {
      try {
        setSetting(getDb(), payload.key, payload.value)
        return { success: true }
      } catch (e) {
        return { success: false, error: String(e) }
      }
    }
  )
}
