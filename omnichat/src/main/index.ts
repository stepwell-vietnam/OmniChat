import { app, shell, BrowserWindow, ipcMain, dialog } from 'electron'
import { join } from 'path'
import icon from '../../resources/icon.png?asset'
import fs from 'fs'

// ===== CONFIG: Đọc đường dẫn lưu trữ từ file cấu hình =====
// Config file lưu ở %APPDATA%/OmniChat (luôn trên ổ C, nhỏ gọn < 1KB)
const CONFIG_DIR = join(app.getPath('appData'), 'OmniChat')
const CONFIG_FILE = join(CONFIG_DIR, 'omnichat-config.json')

interface AppConfig {
  storagePath?: string
}

function readConfig(): AppConfig {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'))
    }
  } catch (e) {
    console.error('OmniChat: Lỗi đọc config:', e)
  }
  return {}
}

function writeConfig(config: AppConfig): void {
  try {
    if (!fs.existsSync(CONFIG_DIR)) {
      fs.mkdirSync(CONFIG_DIR, { recursive: true })
    }
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8')
  } catch (e) {
    console.error('OmniChat: Lỗi ghi config:', e)
  }
}

// PRD Mục 4.3: Chuyển dữ liệu sang thư mục do user chọn — tránh tràn ổ C
const config = readConfig()
if (config.storagePath && fs.existsSync(config.storagePath)) {
  app.setPath('userData', config.storagePath)
} else {
  // Fallback: nếu chưa chọn, thử ổ D, nếu không có thì dùng mặc định ổ C
  try {
    if (fs.existsSync('D:\\')) {
      app.setPath('userData', 'D:\\OmniChatData')
    }
  } catch (e) {
    console.log('OmniChat: Dùng mặc định %APPDATA%.')
  }
}

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    title: 'Stepwell OmniChat',
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.maximize()
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer — electron-vite chỉ set ELECTRON_RENDERER_URL khi dev
  if (process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  app.setAppUserModelId('com.stepwell.omnichat')

  // ===== IPC: Storage Path =====
  ipcMain.handle('get-storage-path', () => {
    return app.getPath('userData')
  })

  ipcMain.handle('select-storage-folder', async () => {
    const win = BrowserWindow.getFocusedWindow()
    if (!win) return null

    const result = await dialog.showOpenDialog(win, {
      title: 'Chọn thư mục lưu trữ dữ liệu OmniChat',
      properties: ['openDirectory', 'createDirectory'],
      buttonLabel: 'Chọn thư mục này'
    })

    if (!result.canceled && result.filePaths.length > 0) {
      const selectedPath = join(result.filePaths[0], 'OmniChatData')
      // Tạo thư mục nếu chưa có
      if (!fs.existsSync(selectedPath)) {
        fs.mkdirSync(selectedPath, { recursive: true })
      }
      // Lưu vào config
      const cfg = readConfig()
      cfg.storagePath = selectedPath
      writeConfig(cfg)
      return selectedPath
    }
    return null
  })

  ipcMain.handle('restart-app', () => {
    app.relaunch()
    app.exit(0)
  })

  // IPC Handlers
  ipcMain.on('ping', () => console.log('pong'))

  createWindow()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
