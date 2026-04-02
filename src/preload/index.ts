import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import path from 'path'

// Custom APIs for renderer
const api = {
  getWebviewPreloadPath: () => `file://${path.join(__dirname, 'webview.js').replace(/\\/g, '/')}`,

  // ===== Storage Path APIs =====
  getStoragePath: (): Promise<string> => ipcRenderer.invoke('get-storage-path'),
  selectStorageFolder: (): Promise<{ success: boolean; newPath?: string; error?: string }> =>
    ipcRenderer.invoke('select-storage-folder'),
  restartApp: (): Promise<void> => ipcRenderer.invoke('restart-app'),

  // ===== Migration APIs =====
  getMigrationStatus: (): Promise<{
    status: 'none' | 'completed' | 'dismissed'
    oldPath?: string
    newPath?: string
    oldSizeBytes?: number
  }> => ipcRenderer.invoke('get-migration-status'),
  deleteOldStorage: (): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('delete-old-storage'),
  dismissMigration: (): Promise<{ success: boolean }> => ipcRenderer.invoke('dismiss-migration'),

  // ===== Snippet Image APIs =====
  saveSnippetImages: (snippetId: number, base64Images: string[]): Promise<string[]> =>
    ipcRenderer.invoke('save-snippet-images', snippetId, base64Images),
  deleteSnippetImages: (filePaths: string[]): Promise<boolean> =>
    ipcRenderer.invoke('delete-snippet-images', filePaths),
  pasteImagesToWebview: (webContentsId: number, filePaths: string[]): Promise<boolean> =>
    ipcRenderer.invoke('paste-images-to-webview', webContentsId, filePaths),

  // ===== Snippet Relay =====
  saveSnippetsCache: (data: string): Promise<boolean> =>
    ipcRenderer.invoke('save-snippets-cache', data)
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
