import { ElectronAPI } from '@electron-toolkit/preload'

declare global {
  interface Window {
    electron: ElectronAPI
    api: {
      getWebviewPreloadPath: () => string
      getStoragePath: () => Promise<string>
      selectStorageFolder: () => Promise<{ success: boolean; newPath?: string; error?: string }>
      restartApp: () => Promise<void>
      // Migration APIs
      getMigrationStatus: () => Promise<{
        status: 'none' | 'completed' | 'dismissed'
        oldPath?: string
        newPath?: string
        oldSizeBytes?: number
      }>
      deleteOldStorage: () => Promise<{ success: boolean; error?: string }>
      dismissMigration: () => Promise<{ success: boolean }>
    }
  }
}
