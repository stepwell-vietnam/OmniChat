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
  // === Migration tracking ===
  migrationStatus?: 'completed' | 'dismissed' | 'cleaned'
  oldStoragePath?: string
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

// ===== HELPER: Copy file/thư mục an toàn =====
function copyFileSync(src: string, dest: string): void {
  const destDir = join(dest, '..')
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true })
  }
  fs.copyFileSync(src, dest)
}

function copyDirSync(src: string, dest: string): void {
  if (!fs.existsSync(src)) return
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true })
  }
  const entries = fs.readdirSync(src, { withFileTypes: true })
  for (const entry of entries) {
    const srcPath = join(src, entry.name)
    const destPath = join(dest, entry.name)
    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath)
    } else {
      fs.copyFileSync(srcPath, destPath)
    }
  }
}

/** Tính dung lượng thư mục (đệ quy) */
function getDirSize(dirPath: string): number {
  if (!fs.existsSync(dirPath)) return 0
  let totalSize = 0
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = join(dirPath, entry.name)
      if (entry.isDirectory()) {
        totalSize += getDirSize(fullPath)
      } else {
        try {
          totalSize += fs.statSync(fullPath).size
        } catch {
          // Skip files that can't be stat'd
        }
      }
    }
  } catch {
    // Skip directories that can't be read
  }
  return totalSize
}

/**
 * Copy phiên đăng nhập cho 1 partition.
 * Chỉ copy: Cookies, Cookies-journal, Local Storage/, Session Storage/, Preferences
 */
function copySessionForPartition(srcPartition: string, destPartition: string): void {
  if (!fs.existsSync(srcPartition)) return
  if (!fs.existsSync(destPartition)) {
    fs.mkdirSync(destPartition, { recursive: true })
  }

  // Files đơn lẻ cần copy
  const sessionFiles = [
    'Cookies',
    'Cookies-journal',
    'Preferences',
    'Network Persistent State',
    'TransportSecurity'
  ]

  for (const fileName of sessionFiles) {
    const srcFile = join(srcPartition, fileName)
    if (fs.existsSync(srcFile)) {
      try {
        copyFileSync(srcFile, join(destPartition, fileName))
      } catch (e) {
        console.warn(`OmniChat: Không thể copy ${fileName}:`, e)
      }
    }
  }

  // Thư mục cần copy
  const sessionDirs = ['Local Storage', 'Session Storage']
  for (const dirName of sessionDirs) {
    const srcDir = join(srcPartition, dirName)
    if (fs.existsSync(srcDir)) {
      try {
        copyDirSync(srcDir, join(destPartition, dirName))
      } catch (e) {
        console.warn(`OmniChat: Không thể copy ${dirName}:`, e)
      }
    }
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

  // ===== IPC: Smart Storage Migration =====
  ipcMain.handle('select-storage-folder', async () => {
    const win = BrowserWindow.getFocusedWindow()
    if (!win) return { success: false, error: 'Không tìm thấy cửa sổ' }

    const result = await dialog.showOpenDialog(win, {
      title: 'Chọn thư mục lưu trữ dữ liệu OmniChat',
      properties: ['openDirectory', 'createDirectory'],
      buttonLabel: 'Chọn thư mục này'
    })

    if (result.canceled || result.filePaths.length === 0) {
      return { success: false, error: 'cancelled' }
    }

    const newBasePath = join(result.filePaths[0], 'OmniChatData')
    const currentUserData = app.getPath('userData')

    // Không cho chọn cùng thư mục hiện tại
    if (newBasePath === currentUserData) {
      return { success: false, error: 'Thư mục đã chọn trùng với thư mục hiện tại' }
    }

    try {
      // Tạo thư mục đích nếu chưa có
      if (!fs.existsSync(newBasePath)) {
        fs.mkdirSync(newBasePath, { recursive: true })
      }

      // === BƯỚC 1: Copy phiên đăng nhập cho từng partition ===
      const partitionsDir = join(currentUserData, 'Partitions')
      if (fs.existsSync(partitionsDir)) {
        const partitions = fs.readdirSync(partitionsDir, { withFileTypes: true })
        for (const partition of partitions) {
          if (partition.isDirectory()) {
            const srcPartition = join(partitionsDir, partition.name)
            const destPartition = join(newBasePath, 'Partitions', partition.name)
            console.log(`OmniChat: Copy phiên đăng nhập: ${partition.name}`)
            copySessionForPartition(srcPartition, destPartition)
          }
        }
      }

      // === BƯỚC 2: Copy IndexedDB renderer chính (OmniChatDB) ===
      const mainIndexedDB = join(currentUserData, 'IndexedDB')
      if (fs.existsSync(mainIndexedDB)) {
        console.log('OmniChat: Copy OmniChatDB (IndexedDB renderer chính)')
        copyDirSync(mainIndexedDB, join(newBasePath, 'IndexedDB'))
      }

      // === BƯỚC 3: Copy các file cấu hình app chính ===
      const mainSessionFiles = [
        'Cookies', 'Cookies-journal', 'Preferences',
        'Network Persistent State', 'TransportSecurity'
      ]
      for (const fileName of mainSessionFiles) {
        const srcFile = join(currentUserData, fileName)
        if (fs.existsSync(srcFile)) {
          try {
            copyFileSync(srcFile, join(newBasePath, fileName))
          } catch (e) {
            console.warn(`OmniChat: Không thể copy main ${fileName}:`, e)
          }
        }
      }
      // Copy Local Storage + Session Storage renderer chính
      for (const dirName of ['Local Storage', 'Session Storage', 'WebStorage']) {
        const srcDir = join(currentUserData, dirName)
        if (fs.existsSync(srcDir)) {
          try {
            copyDirSync(srcDir, join(newBasePath, dirName))
          } catch (e) {
            console.warn(`OmniChat: Không thể copy main ${dirName}:`, e)
          }
        }
      }

      // === BƯỚC 4: Ghi config với trạng thái migration ===
      const cfg = readConfig()
      cfg.storagePath = newBasePath
      cfg.migrationStatus = 'completed'
      cfg.oldStoragePath = currentUserData
      writeConfig(cfg)

      console.log('OmniChat: ✅ Migration phiên đăng nhập thành công!')
      console.log(`  Từ: ${currentUserData}`)
      console.log(`  Đến: ${newBasePath}`)

      return { success: true, newPath: newBasePath }
    } catch (e) {
      console.error('OmniChat: ❌ Lỗi migration:', e)
      return { success: false, error: String(e) }
    }
  })

  // ===== IPC: Kiểm tra trạng thái migration khi khởi động =====
  ipcMain.handle('get-migration-status', () => {
    const cfg = readConfig()
    if (!cfg.migrationStatus || cfg.migrationStatus === 'cleaned') {
      return { status: 'none' }
    }

    let oldSize = 0
    if (cfg.oldStoragePath && fs.existsSync(cfg.oldStoragePath)) {
      oldSize = getDirSize(cfg.oldStoragePath)
    } else {
      // Thư mục cũ đã bị xóa bằng tay → đánh dấu đã xong
      cfg.migrationStatus = 'cleaned'
      writeConfig(cfg)
      return { status: 'none' }
    }

    return {
      status: cfg.migrationStatus,
      oldPath: cfg.oldStoragePath,
      newPath: cfg.storagePath,
      oldSizeBytes: oldSize
    }
  })

  // ===== IPC: Xóa dữ liệu cũ =====
  ipcMain.handle('delete-old-storage', async () => {
    const cfg = readConfig()
    if (!cfg.oldStoragePath) {
      return { success: false, error: 'Không có đường dẫn cũ trong config' }
    }

    if (!fs.existsSync(cfg.oldStoragePath)) {
      cfg.migrationStatus = 'cleaned'
      delete cfg.oldStoragePath
      writeConfig(cfg)
      return { success: true }
    }

    try {
      // Xác nhận lần cuối qua dialog hệ thống
      const win = BrowserWindow.getFocusedWindow()
      if (win) {
        const confirm = await dialog.showMessageBox(win, {
          type: 'warning',
          title: 'Xác nhận xóa dữ liệu cũ',
          message: `Bạn có chắc chắn muốn xóa toàn bộ dữ liệu cũ tại:\n${cfg.oldStoragePath}?\n\nHành động này KHÔNG THỂ hoàn tác!`,
          buttons: ['Hủy', 'Xóa vĩnh viễn'],
          defaultId: 0,
          cancelId: 0
        })
        if (confirm.response === 0) {
          return { success: false, error: 'cancelled' }
        }
      }

      console.log(`OmniChat: 🗑️ Đang xóa thư mục cũ: ${cfg.oldStoragePath}`)
      fs.rmSync(cfg.oldStoragePath, { recursive: true, force: true })

      cfg.migrationStatus = 'cleaned'
      delete cfg.oldStoragePath
      writeConfig(cfg)

      console.log('OmniChat: ✅ Đã xóa thư mục cũ thành công!')
      return { success: true }
    } catch (e) {
      console.error('OmniChat: ❌ Lỗi xóa thư mục cũ:', e)
      return { success: false, error: String(e) }
    }
  })

  // ===== IPC: Đóng banner (Để sau) =====
  ipcMain.handle('dismiss-migration', () => {
    const cfg = readConfig()
    cfg.migrationStatus = 'dismissed'
    writeConfig(cfg)
    return { success: true }
  })

  // ===== IPC: Restart App =====
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
