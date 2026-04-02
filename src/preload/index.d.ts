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
      // Snippet Image APIs
      saveSnippetImages: (snippetId: number, base64Images: string[]) => Promise<string[]>
      deleteSnippetImages: (filePaths: string[]) => Promise<boolean>
      pasteImagesToWebview: (webContentsId: number, filePaths: string[]) => Promise<boolean>
      // Snippet Relay
      saveSnippetsCache: (data: string) => Promise<boolean>
      // Backup/Restore
      saveAccountsBackup: (data: string) => Promise<boolean>
      loadAccountsBackup: () => Promise<string | null>
      saveSnippetsBackup: (data: string) => Promise<boolean>
      loadSnippetsBackup: () => Promise<string | null>
    }
  }
}
