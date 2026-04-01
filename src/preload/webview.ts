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

// === 3. ENGINE: Title Observer + Periodic Avatar Sync ===
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
        ipcRenderer.sendToHost('zalo-data', {
          type: 'global-unread',
          data: count
        })
      }
    })
    titleObs.observe(titleEl, { childList: true, characterData: true, subtree: true })
  }
})
