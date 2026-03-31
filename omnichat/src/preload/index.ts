import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import path from 'path'

// Custom APIs for renderer
const api = {
  getWebviewPreloadPath: () => `file://${path.join(__dirname, 'webview.js').replace(/\\/g, '/')}`,

  // ===== Storage Path APIs =====
  getStoragePath: (): Promise<string> => ipcRenderer.invoke('get-storage-path'),
  selectStorageFolder: (): Promise<string | null> => ipcRenderer.invoke('select-storage-folder'),
  restartApp: (): Promise<void> => ipcRenderer.invoke('restart-app')
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
