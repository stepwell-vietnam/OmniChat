import { ElectronAPI } from '@electron-toolkit/preload'

declare global {
  interface Window {
    electron: ElectronAPI
    api: {
      getWebviewPreloadPath: () => string
      getStoragePath: () => Promise<string>
      selectStorageFolder: () => Promise<string | null>
      restartApp: () => Promise<void>
    }
  }
}
