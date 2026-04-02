import { ipcRenderer } from 'electron'

// ============================================================================
// STEPWELL OMNICHAT — Webview Preload (Optimized)
// 1. Notification Intercept (instant new message detection)
// 2. Avatar Scrape (periodic, 15s)
// 3. Title Observer (backup unread detection)
// ============================================================================

// === 1. NOTIFICATION INTERCEPTOR ===
const OriginalNotification = window.Notification

;(window as any).Notification = function(title: string, options?: NotificationOptions) {
  ipcRenderer.sendToHost('zalo-data', {
    type: 'zalo-notification',
    data: {
      title: title,
      body: options?.body || '',
      icon: options?.icon || '',
      timestamp: Date.now()
    }
  })
  return new OriginalNotification(title, options)
}

Object.defineProperty(window.Notification, 'permission', {
  get: () => OriginalNotification.permission
})
;(window.Notification as any).requestPermission = OriginalNotification.requestPermission.bind(OriginalNotification)

// === 2. AVATAR SCRAPER ===
let lastScrapedAvatar = ''

function scrapeAccountInfo() {
  let avatarUrl = ''
  let displayName = ''

  const allImages = Array.from(document.querySelectorAll('img'))

  // Strategy 1: Avatar at bottom-left navbar (user profile area)
  for (const img of allImages) {
    const r = img.getBoundingClientRect()
    if (r.left >= 0 && r.right < 75
        && r.top > window.innerHeight - 120
        && r.width >= 25 && r.width <= 60
        && r.height >= 25 && r.height <= 60
        && (img as HTMLImageElement).src.startsWith('http')) {
      avatarUrl = (img as HTMLImageElement).src
      break
    }
  }

  // Strategy 2: Last small image in left column
  if (!avatarUrl) {
    const leftImages = allImages.filter(img => {
      const r = img.getBoundingClientRect()
      return r.left >= 0 && r.right < 75 && r.width >= 25 && r.width <= 60
             && (img as HTMLImageElement).src.startsWith('http')
    })
    if (leftImages.length > 0) {
      avatarUrl = (leftImages[leftImages.length - 1] as HTMLImageElement).src
    }
  }

  // Strategy 3: CSS class-based search
  if (!avatarUrl) {
    const candidates = document.querySelectorAll('img[class*="avatar"], img[class*="profile"], img[class*="user"]')
    for (const img of Array.from(candidates)) {
      const r = img.getBoundingClientRect()
      const src = (img as HTMLImageElement).src
      if (r.left < 80 && r.width >= 20 && src.startsWith('http')) {
        avatarUrl = src
        break
      }
    }
  }

  // Extract display name near avatar
  if (avatarUrl) {
    const avatarImg = allImages.find(img => (img as HTMLImageElement).src === avatarUrl)
    if (avatarImg) {
      displayName = avatarImg.getAttribute('alt') || avatarImg.getAttribute('title') || ''
      if (!displayName) {
        const parent = avatarImg.closest('[title]')
        if (parent) displayName = parent.getAttribute('title') || ''
      }
    }
  }

  // Only send when avatar changes (avoid IPC spam)
  if (avatarUrl && avatarUrl.startsWith('http') && avatarUrl !== lastScrapedAvatar) {
    lastScrapedAvatar = avatarUrl
    ipcRenderer.sendToHost('zalo-data', {
      type: 'account-info',
      data: { avatar: avatarUrl, name: displayName }
    })
  }
}

// === 3. ENGINE: Title Observer + DOM Unread Scanner + Avatar Sync ===
let lastReportedUnread = -1

function reportUnread(count: number): void {
  if (count !== lastReportedUnread) {
    lastReportedUnread = count
    ipcRenderer.sendToHost('zalo-data', {
      type: 'global-unread',
      data: count
    })
  }
}

// Quét DOM để đếm số tin chưa đọc (hoạt động ngay cả khi tiêu đề không đổi)
function scanDomForUnread(): number {
  let totalUnread = 0

  // === CHIẾN THUẬT 1: Đếm badge số trong danh sách chat Zalo ===
  // Zalo hiển thị số chưa đọc dạng: <span>5</span> hoặc <div>99+</div> bên cạnh tên cuộc trò chuyện
  const badges = document.querySelectorAll(
    '[class*="unread"], [class*="badge"], [class*="count"]'
  )
  for (const el of Array.from(badges)) {
    const text = (el as HTMLElement).textContent?.trim() || ''
    const rect = (el as HTMLElement).getBoundingClientRect()
    // Chỉ tính các badge nhỏ, nằm trong vùng danh sách chat (bên trái)
    if (rect.width > 0 && rect.width < 40 && rect.height > 0 && rect.height < 30) {
      const num = parseInt(text.replace('+', ''))
      if (!isNaN(num) && num > 0) {
        totalUnread += num
      }
    }
  }

  // === CHIẾN THUẬT 2: Tìm các chấm tròn đỏ/cam nhỏ (visual unread dot) ===
  if (totalUnread === 0) {
    const allSpans = document.querySelectorAll('span, div')
    for (const el of Array.from(allSpans)) {
      const s = window.getComputedStyle(el)
      const rect = (el as HTMLElement).getBoundingClientRect()
      const bg = s.backgroundColor
      const text = (el as HTMLElement).textContent?.trim() || ''
      // Tìm phần tử nhỏ, tròn, màu đỏ/cam, có chứa số
      if (
        rect.width >= 14 && rect.width <= 32 &&
        rect.height >= 14 && rect.height <= 32 &&
        (bg.includes('255') || bg.includes('233') || bg.includes('244')) && // đỏ/cam
        /^\d+\+?$/.test(text)
      ) {
        const num = parseInt(text.replace('+', ''))
        if (!isNaN(num) && num > 0) {
          totalUnread += num
        }
      }
    }
  }

  // === CHIẾN THUẬT 3: Fallback từ tiêu đề trang ===
  const titleMatch = document.title.match(/\((\d+)\)/)
  if (titleMatch) {
    const titleCount = parseInt(titleMatch[1]) || 0
    if (titleCount > totalUnread) {
      totalUnread = titleCount
    }
  }

  return totalUnread
}

window.addEventListener('load', () => {
  // Initial avatar scrape
  setTimeout(scrapeAccountInfo, 4000)

  // Periodic avatar sync (every 15s)
  setInterval(scrapeAccountInfo, 15000)

  // Title observer — detect unread changes instantly
  let lastTitle = document.title
  const titleEl = document.querySelector('title')
  if (titleEl) {
    const titleObs = new MutationObserver(() => {
      const newTitle = document.title
      if (newTitle !== lastTitle) {
        lastTitle = newTitle
        const m = newTitle.match(/\((\d+)\)/)
        const count = m ? parseInt(m[1]) || 0 : 0
        reportUnread(count)
      }
    })
    titleObs.observe(titleEl, { childList: true, characterData: true, subtree: true })
  }

  // DOM Scanner — quét DOM mỗi 3 giây để đếm unread (backup cho title observer)
  setTimeout(() => {
    setInterval(() => {
      const count = scanDomForUnread()
      reportUnread(count)
    }, 3000)
  }, 5000) // Chờ 5s cho trang load xong
})

// ============================================================================
// === 4. QUICK SNIPPETS ENGINE ===
// Lắng nghe phím "\", hiển thị bảng gợi ý, chèn nội dung vào khung chat
// ============================================================================

interface SnippetMeta {
  id: number
  shortcut: string
  content: string
  imageCount: number
}

let snippetsCache: SnippetMeta[] = []
let isSnippetMode = false
let snippetBuffer = ''
let selectedIndex = 0
let overlayEl: HTMLDivElement | null = null

// --- Đọc snippets từ Main Process qua IPC (kênh đã proven hoạt động) ---
function loadSnippetsFromMainProcess() {
  try {
    const raw = ipcRenderer.sendSync('get-snippets-sync')
    if (raw && typeof raw === 'string') {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed) && parsed.length > 0) {
        snippetsCache = parsed
      }
    }
  } catch { /* ignore */ }
}

// Poll mỗi 3s + on load
window.addEventListener('load', () => {
  setTimeout(loadSnippetsFromMainProcess, 3000)
  setInterval(loadSnippetsFromMainProcess, 5000)
})

// --- Lọc snippets theo ký tự đã gõ ---
function getFilteredSnippets(): SnippetMeta[] {
  if (!snippetBuffer) return snippetsCache
  return snippetsCache.filter(s =>
    s.shortcut.toLowerCase().startsWith(snippetBuffer.toLowerCase())
  )
}

// --- Tạo & cập nhật Overlay UI ---
function showOverlay(): void {
  const filtered = getFilteredSnippets()
  if (filtered.length === 0) {
    hideOverlay()
    return
  }

  if (!overlayEl) {
    overlayEl = document.createElement('div')
    overlayEl.id = 'omnichat-snippet-overlay'
    Object.assign(overlayEl.style, {
      position: 'fixed',
      zIndex: '999999',
      background: '#ffffff',
      borderRadius: '10px',
      boxShadow: '0 6px 24px rgba(0,0,0,0.18), 0 0 0 1px rgba(0,0,0,0.05)',
      maxHeight: '220px',
      overflowY: 'auto',
      minWidth: '300px',
      maxWidth: '420px',
      fontSize: '13px',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
      padding: '4px 0',
      display: 'none'
    })
    document.body.appendChild(overlayEl)
  }

  // Định vị overlay gần khung nhập liệu
  const active = document.activeElement as HTMLElement
  if (active) {
    const rect = active.getBoundingClientRect()
    const spaceAbove = rect.top
    const spaceBelow = window.innerHeight - rect.bottom

    if (spaceAbove > spaceBelow) {
      // Hiện phía trên
      overlayEl.style.bottom = (window.innerHeight - rect.top + 6) + 'px'
      overlayEl.style.top = 'auto'
    } else {
      // Hiện phía dưới
      overlayEl.style.top = (rect.bottom + 6) + 'px'
      overlayEl.style.bottom = 'auto'
    }
    overlayEl.style.left = Math.max(8, Math.min(rect.left, window.innerWidth - 430)) + 'px'
  }

  // Render danh sách
  overlayEl.innerHTML = filtered.map((s, i) => `
    <div data-idx="${i}" style="
      padding: 8px 14px;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 10px;
      background: ${i === selectedIndex ? '#e8f4fd' : '#ffffff'};
      border-left: 3px solid ${i === selectedIndex ? '#0068ff' : 'transparent'};
      transition: background 0.1s;
    " onmouseenter="this.style.background='#f0f5ff'" onmouseleave="this.style.background='${i === selectedIndex ? '#e8f4fd' : '#ffffff'}'">
      <span style="
        background: #f0f2f5;
        color: #444;
        font-family: 'SF Mono', Monaco, Consolas, monospace;
        font-size: 11px;
        padding: 3px 8px;
        border-radius: 5px;
        font-weight: 700;
        flex-shrink: 0;
        letter-spacing: 0.3px;
      ">\\${s.shortcut}</span>
      <span style="
        flex: 1;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        color: #1a1a1a;
        font-size: 13px;
      ">${escapeHtml(s.content.substring(0, 60))}${s.content.length > 60 ? '…' : ''}</span>
      ${s.imageCount > 0 ? `<span style="color: #0068ff; font-size: 11px; flex-shrink: 0; opacity: 0.8;">📷${s.imageCount}</span>` : ''}
    </div>
  `).join('')

  overlayEl.style.display = 'block'

  // Click để chọn snippet
  overlayEl.querySelectorAll('[data-idx]').forEach(el => {
    el.addEventListener('mousedown', (e) => {
      e.preventDefault()
      e.stopPropagation()
      const idx = parseInt((el as HTMLElement).dataset.idx || '0')
      if (filtered[idx]) selectSnippet(filtered[idx])
    })
  })
}

function hideOverlay(): void {
  if (overlayEl) overlayEl.style.display = 'none'
  isSnippetMode = false
  snippetBuffer = ''
  selectedIndex = 0
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

// --- Chọn snippet: xóa trigger text + chèn nội dung ---
function selectSnippet(snippet: SnippetMeta): void {
  // Lấy độ dài chuỗi cần xóa TRƯỚC khi gọi hideOverlay() (vì hideOverlay sẽ reset snippetBuffer)
  const triggerLength = snippetBuffer.length + 1 // +1 cho dấu "\"
  
  hideOverlay()

  // Xóa chuỗi trigger (\xxx) bằng Selection API
  const sel = window.getSelection()
  if (sel && sel.rangeCount > 0) {
    // Mở rộng selection về phía trái để chọn chuỗi trigger
    for (let i = 0; i < triggerLength; i++) {
      sel.modify('extend', 'backward', 'character')
    }
    // Xóa phần đã chọn
    document.execCommand('delete', false)
  }

  // Chèn nội dung text
  if (snippet.content) {
    document.execCommand('insertText', false, snippet.content)
  }

  // Gửi yêu cầu paste ảnh nếu có
  if (snippet.imageCount > 0) {
    ipcRenderer.sendToHost('zalo-data', {
      type: 'snippet-paste-images',
      data: { snippetId: snippet.id }
    })
  }
}

// --- Keyboard Listener (Capture Phase) ---
document.addEventListener('keydown', (e: KeyboardEvent) => {
  // Bỏ qua nếu không có snippets
  if (snippetsCache.length === 0) return

  // === SNIPPET MODE ĐANG BẬT ===
  if (isSnippetMode) {
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopImmediatePropagation()
      hideOverlay()
      return
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault()
      e.stopImmediatePropagation()
      selectedIndex = Math.max(0, selectedIndex - 1)
      showOverlay()
      return
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      e.stopImmediatePropagation()
      const filtered = getFilteredSnippets()
      selectedIndex = Math.min(filtered.length - 1, selectedIndex + 1)
      showOverlay()
      return
    }

    if (e.key === 'Enter') {
      const filtered = getFilteredSnippets()
      if (filtered.length > 0 && selectedIndex < filtered.length) {
        e.preventDefault()
        e.stopImmediatePropagation()
        selectSnippet(filtered[selectedIndex])
      } else {
        hideOverlay()
      }
      return
    }

    if (e.key === 'Backspace') {
      if (snippetBuffer.length > 0) {
        snippetBuffer = snippetBuffer.slice(0, -1)
        selectedIndex = 0
        // Delay nhỏ để ký tự bị xóa trong input trước khi re-render
        setTimeout(() => showOverlay(), 10)
      } else {
        // Buffer rỗng = user xóa hết → đóng overlay
        hideOverlay()
      }
      return // Cho phép backspace xóa ký tự trong input bình thường
    }

    // Đóng overlay khi gõ khoảng trắng hoặc Tab
    if (e.key === ' ' || e.key === 'Tab') {
      hideOverlay()
      return
    }

    // Ký tự thường → thêm vào buffer
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      snippetBuffer += e.key
      selectedIndex = 0
      setTimeout(() => showOverlay(), 10)
      return
    }

    return
  }

  // === PHÁT HIỆN DẤU "\" → BẬT SNIPPET MODE ===
  if (e.key === '\\' && !e.ctrlKey && !e.metaKey && !e.altKey) {
    // Chỉ kích hoạt khi đang focus vào ô nhập liệu
    const active = document.activeElement as HTMLElement
    if (!active) return

    const tag = active.tagName.toLowerCase()
    const isEditable = tag === 'input' || tag === 'textarea' ||
                       active.isContentEditable ||
                       active.getAttribute('contenteditable') === 'true' ||
                       active.closest('[contenteditable="true"]') !== null

    if (!isEditable) return

    isSnippetMode = true
    snippetBuffer = ''
    selectedIndex = 0
    setTimeout(() => showOverlay(), 50) // Chờ dấu "\" được gõ vào input
  }
}, true) // Capture phase — chặn trước khi Zalo/FB xử lý

// Ẩn overlay khi click ra ngoài
document.addEventListener('mousedown', (e) => {
  if (isSnippetMode && overlayEl && !overlayEl.contains(e.target as Node)) {
    hideOverlay()
  }
}, true)
// ============================================================================
// === 5. BATCH PASTE IMAGES (DOM INJECTION) ===
// ============================================================================
ipcRenderer.on('execute-paste-images', (_e, base64List: string[]) => {
  console.log(`OmniChat: Nhận ${base64List.length} ảnh Base64 từ Main Process`)
  
  const processImages = async () => {
    const files: File[] = []
    
    for (let i = 0; i < base64List.length; i++) {
      const base64Str = base64List[i]
      if (!base64Str.includes(',')) continue
      
      try {
        const res = await fetch(base64Str)
        const blob = await res.blob()
        const mime = blob.type || 'image/png'
        const ext = mime.split('/')[1] === 'jpeg' ? 'jpg' : mime.split('/')[1] || 'png'
        
        const file = new File([blob], `snippet_image_${Date.now()}_${i}.${ext}`, {
          type: mime,
          lastModified: Date.now()
        })
        files.push(file)
      } catch (err) {
        console.error('OmniChat: Lỗi convert base64 image', err)
      }
    }

    if (files.length === 0) {
      console.log('OmniChat: Không có ảnh hợp lệ để paste.')
      return
    }

    console.log(`OmniChat: Đã tạo ${files.length} File object, thử các chiến thuật inject...`)

    // Tìm input element phù hợp
    const chatInput = document.activeElement as HTMLElement
      || document.querySelector('[contenteditable="true"]') as HTMLElement
      || document.querySelector('[data-testid="composer-input"]') as HTMLElement

    if (!chatInput) {
      console.error('OmniChat: Không tìm thấy ô nhập liệu để paste ảnh')
      return
    }

    // === CHIẾN THUẬT 1: Drop Event (Zalo/Messenger dùng React, xử lý drop tốt) ===
    try {
      const dt = new DataTransfer()
      files.forEach(f => dt.items.add(f))

      const dropEvent = new DragEvent('drop', {
        bubbles: true,
        cancelable: true,
        dataTransfer: dt
      })
      chatInput.dispatchEvent(dropEvent)
      console.log('OmniChat: ✅ Chiến thuật DROP — đã dispatch')
    } catch (err) {
      console.warn('OmniChat: Drop event thất bại:', err)
    }

    // === CHIẾN THUẬT 2: Tìm hidden file input và inject trực tiếp ===
    try {
      const fileInputs = document.querySelectorAll('input[type="file"][accept*="image"]')
      if (fileInputs.length > 0) {
        const fileInput = fileInputs[fileInputs.length - 1] as HTMLInputElement
        const dt = new DataTransfer()
        files.forEach(f => dt.items.add(f))
        fileInput.files = dt.files
        fileInput.dispatchEvent(new Event('change', { bubbles: true }))
        console.log('OmniChat: ✅ Chiến thuật FILE INPUT — đã inject vào', fileInput)
      } else {
        console.log('OmniChat: ⚠ Không tìm thấy file input trên trang')
      }
    } catch (err) {
      console.warn('OmniChat: File input inject thất bại:', err)
    }

    // === CHIẾN THUẬT 3: Paste event (fallback) ===
    try {
      const dt = new DataTransfer()
      files.forEach(f => dt.items.add(f))
      
      const pasteEvent = new ClipboardEvent('paste', {
        bubbles: true,
        cancelable: true
      })
      Object.defineProperty(pasteEvent, 'clipboardData', {
        value: dt,
        writable: false
      })
      chatInput.dispatchEvent(pasteEvent)
      console.log('OmniChat: ✅ Chiến thuật PASTE — đã dispatch')
    } catch (err) {
      console.warn('OmniChat: Paste event thất bại:', err)
    }
  }
  
  processImages()
})
