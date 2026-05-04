import { app, shell, BrowserWindow, ipcMain, dialog, webContents, protocol, clipboard, nativeImage, session, net } from 'electron'
import { join } from 'path'
import icon from '../../resources/icon.png?asset'
import fs from 'fs'

// Đăng ký quyền ưu tiên cho custom protocol để tránh lỗi CORS và sai lệch path
protocol.registerSchemesAsPrivileged([{
  scheme: 'local-img',
  privileges: { bypassCSP: true, standard: true, supportFetchAPI: true, secure: true }
}])

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
    title: 'Stepwell OmniChat - V1.7',
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
    const url = new URL(details.url)
    if (url.protocol === 'http:' || url.protocol === 'https:') {
      shell.openExternal(details.url)
    }
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

  // Chặn tất cả URL custom protocol lạ (ví dụ: bytedance:// của TikTok) đòi mở app ngoài
  app.on('web-contents-created', (_, contents) => {
    contents.on('will-navigate', (event, navigationUrl) => {
      const parsedUrl = new URL(navigationUrl)
      if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:' && parsedUrl.protocol !== 'file:' && parsedUrl.protocol !== 'local-img:') {
        console.log('OmniChat: Chặn WebView điều hướng tới protocol lạ:', navigationUrl)
        event.preventDefault()
      }
    })
    
    // Sử dụng bộ lọc WebRequest để chặn từ trong network (mạnh nhất, xử lý cả iframe & AJAX)
    try {
      contents.session.webRequest.onBeforeRequest((details, callback) => {
        if (details.url.startsWith('bytedance://')) {
          console.log('OmniChat: Chặn triệt để request bytedance:// :', details.url)
          return callback({ cancel: true })
        }
        callback({ cancel: false })
      })
    } catch (e) {
      // Bỏ qua lỗi nếu session chưa sẵn sàng
    }

    contents.on('did-create-window', (window) => {
      // Bắt sự kiện khi cửa sổ popup (vd: about:blank) vừa được tạo
      // Ngay khi Zalo Web cố gắng điều hướng cửa sổ này tới link thật, ta sẽ bắt lại và đẩy ra trình duyệt ngoài
      window.webContents.on('will-navigate', (e, url) => {
        e.preventDefault()
        const parsedUrl = new URL(url)
        if (parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:') {
          shell.openExternal(url)
        }
        window.close() // Đóng ngay cửa sổ tạm
      })
    })

    contents.setWindowOpenHandler((details) => {
      try {
        const url = new URL(details.url)

        // Cho phép about:blank (Zalo Web thường dùng about:blank làm bước đệm để mở link)
        if (details.url === 'about:blank') {
          return {
            action: 'allow',
            overrideBrowserWindowOptions: {
              show: false // Ẩn cửa sổ này đi để không bị chớp nháy trên màn hình
            }
          }
        }

        // Chặn triệt để protocol lạ (bytedance://, tiktok://, v.v.) — KHÔNG cho hệ điều hành xử lý
        if (url.protocol !== 'http:' && url.protocol !== 'https:') {
          console.log('OmniChat: Chặn popup protocol lạ:', details.url)
          return { action: 'deny' }
        }

        // Cho phép popup đăng nhập Facebook/Meta mở trong app (OAuth login flow)
        const fbDomains = ['facebook.com', 'messenger.com', 'instagram.com', 'meta.com', 'accountkit.com']
        const isFbLogin = fbDomains.some(d => url.hostname.endsWith(d))

        if (isFbLogin) {
          return {
            action: 'allow',
            overrideBrowserWindowOptions: {
              width: 600,
              height: 700,
              title: 'Đăng nhập Facebook',
              autoHideMenuBar: true
            }
          }
        }

        shell.openExternal(details.url)
      } catch (e) {
        // URL parse thất bại (protocol lạ) → chặn luôn
        console.log('OmniChat: Chặn popup URL không hợp lệ:', details.url)
      }
      return { action: 'deny' }
    })
  })

  // Chặn tận gốc custom protocol từ iframe bằng cách đăng ký nó vào lõi trình duyệt nội bộ
  protocol.handle('bytedance', () => {
    console.log('OmniChat: Đã nuốt request bytedance:// tránh văng popup hệ thống.')
    return new Response(null, { status: 204 }) // Nuốt request không làm gì cả
  })

  // Đăng ký custom protocol để renderer có thể tải ảnh local (bypass web security)
  protocol.handle('local-img', async (request) => {
    try {
      console.log('[Protocol local-img] Yêu cầu URL:', request.url)
      
      // Dùng regex đơn giản để extract path — không dùng new URL() vì Chromium parse sai
      const pathMatch = request.url.match(/[?&]path=([^&]+)/)
      let filePath: string
      
      if (pathMatch) {
        filePath = decodeURIComponent(pathMatch[1])
      } else {
        filePath = decodeURIComponent(request.url.replace(/^local-img:\/\//i, ''))
      }

      if (process.platform === 'win32' && filePath.startsWith('/')) {
        filePath = filePath.substring(1)
      }

      console.log('[Protocol local-img] Đường dẫn vật lý:', filePath)

      if (fs.existsSync(filePath)) {
        const data = await fs.promises.readFile(filePath)
        const ext = filePath.split('.').pop()?.toLowerCase() || 'png'
        const mime = ext === 'jpg' ? 'image/jpeg' : `image/${ext}`
        console.log('[Protocol local-img] Tải ảnh thành công!')
        return new Response(data, { headers: { 'Content-Type': mime } })
      } else {
        console.error('[Protocol local-img] KHÔNG TÌM THẤY ẢNH:', filePath)
        return new Response('Not Found', { status: 404 })
      }
    } catch (err) {
      console.error('[Protocol local-img] LỖI:', err)
      return new Response('Error', { status: 500 })
    }
  })

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

  // ===== IPC: Kết nối thư mục dữ liệu CÓ SẴN (Restore/Load) =====
  ipcMain.handle('load-storage-folder', async () => {
    const win = BrowserWindow.getAllWindows()[0]
    if (!win) return { success: false, error: 'Phát hiện lỗi không tìm thấy cửa sổ.' }

    const result = await dialog.showOpenDialog(win, {
      title: 'Chọn thư mục chứa dữ liệu OmniChat đã lưu (OmniChatData)',
      properties: ['openDirectory'],
      buttonLabel: 'Khôi phục từ thư mục này'
    })

    if (result.canceled || result.filePaths.length === 0) {
      return { success: false, error: 'cancelled' }
    }

    const selectedPath = result.filePaths[0]
    // Thường dữ liệu cũ đã nằm trong thư mục mang tên 'OmniChatData', cần kiểm tra xem họ trỏ thẳng hay trỏ thư mục cha
    let targetPath = selectedPath
    if (!selectedPath.endsWith('OmniChatData')) {
      const maybeChild = join(selectedPath, 'OmniChatData')
      if (fs.existsSync(maybeChild)) {
        targetPath = maybeChild
      } else {
        targetPath = join(selectedPath, 'OmniChatData') // Nếu ép buộc
      }
    }

    // Kiểm tra xem có vẻ đúng cấu trúc OmniChat ko (có thể bỏ qua bước check cứng ngắc, nhưng check IndexedDB thì an tâm hơn)
    // if (!fs.existsSync(join(targetPath, 'IndexedDB'))) { ... }

    try {
      const cfg = readConfig()
      const currentPath = cfg.storagePath || app.getPath('userData')

      if (targetPath === currentPath) {
        return { success: false, error: 'Thư mục đã chọn đang là thư mục hoạt động hiện tại.' }
      }

      // Chỉ việc cập nhật config, KHÔNG COPY GÌ CẢ
      cfg.storagePath = targetPath
      // Xóa các key migration cũ nếu có
      delete cfg.migrationStatus
      delete cfg.oldStoragePath
      
      writeConfig(cfg)

      console.log(`OmniChat: ✅ Kết nối dữ liệu thành công tới: ${targetPath}`)
      return { success: true, newPath: targetPath }
    } catch (e) {
      console.error('OmniChat: ❌ Lỗi kết nối dữ liệu:', e)
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

  // ===== IPC: Kiểm tra cập nhật từ Main Process (tránh CORS) =====
  ipcMain.handle('check-for-update', async () => {
    try {
      const response = await net.fetch('https://gitlab.com/stepwellvietnam/chatportal/-/raw/main/version.json', { cache: 'no-store' })
      if (response.ok) {
        const data = await response.json()
        return { success: true, data }
      }
      return { success: false, error: 'Server trả về lỗi: ' + response.status }
    } catch (e) {
      console.error('OmniChat: Lỗi kiểm tra cập nhật:', e)
      return { success: false, error: String(e) }
    }
  })

  // ===== IPC: Restart App =====
  ipcMain.handle('restart-app', () => {
    app.relaunch()
    app.exit(0)
  })

  // ===== IPC: Clear Partition Data (xóa tài khoản → giải phóng bộ nhớ) =====
  ipcMain.handle('clear-partition-data', async (_e, partition: string) => {
    try {
      const ses = session.fromPartition(partition)
      await ses.clearStorageData()
      await ses.clearCache()
      console.log('OmniChat: ✅ Đã xóa dữ liệu partition:', partition)
      return true
    } catch (err) {
      console.error('OmniChat: Lỗi xóa partition:', err)
      return false
    }
  })

  // ===== IPC: Mở Kênh Người Bán (Shopee/TikTok Seller Center) chung partition
  ipcMain.on('open-seller-window', (_e, partition: string, url: string) => {
    const sellerWindow = new BrowserWindow({
      width: 1200,
      height: 800,
      title: 'Kênh Người Bán',
      webPreferences: {
        partition: partition, // Dùng chung partition để không phải đăng nhập lại
        nodeIntegration: false,
        contextIsolation: true
      }
    })
    sellerWindow.setMenu(null)
    sellerWindow.loadURL(url)
  })

  // ===== IPC: Snippet Images — Lưu base64 thành file trên ổ cứng =====
  ipcMain.handle('save-snippet-images', async (_e, snippetId: number, base64Images: string[]) => {
    const dir = join(app.getPath('userData'), 'snippet-images')
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })

    const paths: string[] = []
    for (let i = 0; i < base64Images.length; i++) {
      const match = base64Images[i].match(/^data:image\/(\w+);base64,(.+)$/)
      if (!match) continue
      const ext = match[1] === 'jpeg' ? 'jpg' : match[1]
      const buffer = Buffer.from(match[2], 'base64')
      const filename = `snippet_${snippetId}_${Date.now()}_${i}.${ext}`
      const filePath = join(dir, filename)
      fs.writeFileSync(filePath, buffer)
      paths.push(filePath)
    }
    return paths
  })

  // ===== IPC: Snippet Images — Xóa file ảnh khỏi ổ cứng =====
  ipcMain.handle('delete-snippet-images', async (_e, filePaths: string[]) => {
    for (const p of filePaths) {
      try { if (fs.existsSync(p)) fs.unlinkSync(p) } catch { /* skip */ }
    }
    return true
  })

// ===== IPC: Paste ảnh vào webview qua OS Clipboard (đáng tin cậy nhất) =====
  ipcMain.handle('paste-images-to-webview', async (_e, wcId: number, filePaths: string[]) => {
    const wc = webContents.fromId(wcId)
    if (!wc) {
      console.error(`[Main] Không tìm thấy WebContents với ID ${wcId}`)
      return false
    }

    console.log(`[Main] Bắt đầu paste ${filePaths.length} ảnh vào webview (ID: ${wcId})`)

    // Focus vào ô nhập liệu trong webview trước
    try {
      await wc.executeJavaScript(`
        const el = document.activeElement || document.querySelector('[contenteditable="true"]');
        if (el) el.focus();
      `)
    } catch (err) {
      console.warn('[Main] Không thể focus input:', err)
    }

    await new Promise(resolve => setTimeout(resolve, 200))

    for (const filePath of filePaths) {
      try {
        if (!fs.existsSync(filePath)) {
          console.error(`[Main] ❌ FILE KHÔNG TỒN TẠI: ${filePath}`)
          continue
        }
        const image = nativeImage.createFromPath(filePath)
        if (image.isEmpty()) {
          console.error(`[Main] ❌ Ảnh rỗng: ${filePath}`)
          continue
        }

        // Ghi ảnh vào OS clipboard
        clipboard.writeImage(image)
        
        // Gọi paste trực tiếp trên webContents
        wc.paste()
        console.log(`[Main] ✔ Đã paste: ${filePath}`)
        
        // Chờ 800ms giữa mỗi ảnh để Zalo kịp xử lý
        await new Promise(resolve => setTimeout(resolve, 800))
      } catch (err) {
        console.error('[Main] Lỗi paste ảnh:', err)
      }
    }
    return true
  })

  // ===== IPC: Snippet Relay (Main Process as bridge) =====
  let snippetsCacheStore = '[]'
  ipcMain.handle('save-snippets-cache', (_e, data: string) => {
    snippetsCacheStore = data
    return true
  })
  ipcMain.on('get-snippets-sync', (event) => {
    event.returnValue = snippetsCacheStore
  })

  // ===== IPC: Backup/Restore — Lưu accounts & snippets ra file JSON (chống mất dữ liệu khi cài mới) =====
  const BACKUP_DIR = join(app.getPath('userData'), 'omnichat-backup')

  ipcMain.handle('save-accounts-backup', (_e, data: string) => {
    try {
      if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true })
      fs.writeFileSync(join(BACKUP_DIR, 'accounts.json'), data, 'utf-8')
      return true
    } catch (e) {
      console.error('OmniChat: Lỗi backup accounts:', e)
      return false
    }
  })

  ipcMain.handle('load-accounts-backup', () => {
    try {
      const f = join(BACKUP_DIR, 'accounts.json')
      if (fs.existsSync(f)) return fs.readFileSync(f, 'utf-8')
    } catch (e) {
      console.error('OmniChat: Lỗi đọc backup accounts:', e)
    }
    return null
  })

  ipcMain.handle('save-snippets-backup', (_e, data: string) => {
    try {
      if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true })
      fs.writeFileSync(join(BACKUP_DIR, 'snippets.json'), data, 'utf-8')
      return true
    } catch (e) {
      console.error('OmniChat: Lỗi backup snippets:', e)
      return false
    }
  })

  ipcMain.handle('load-snippets-backup', () => {
    try {
      const f = join(BACKUP_DIR, 'snippets.json')
      if (fs.existsSync(f)) return fs.readFileSync(f, 'utf-8')
    } catch (e) {
      console.error('OmniChat: Lỗi đọc backup snippets:', e)
    }
    return null
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
