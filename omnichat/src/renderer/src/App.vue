<script setup lang="ts">
import { ref, watch, onMounted, computed } from 'vue'
import type { Account, Platform } from './types'
import { PLATFORMS } from './types'
import { db, getSetting, setSetting } from './database/db'
import type { DbQuickReply } from './database/db'
import { useNotifications } from './composables/useNotifications'
import AccountSidebar from './components/AccountSidebar.vue'
import SettingsModal from './components/SettingsModal.vue'
import MigrationBanner from './components/MigrationBanner.vue'
import AutoUpdateBanner from './components/AutoUpdateBanner.vue'

// ===== STATE =====
const activeTab = ref<string>('1')
const showSettings = ref(false)
const accounts = ref<Account[]>([])
const webviewPreloadPath = ref(window.api?.getWebviewPreloadPath?.() || '')
const hasNewMessage = ref<Record<string, boolean>>({})
const isSellerMode = ref<Record<string, boolean>>({})
const snippets = ref<DbQuickReply[]>([])

// ===== SETTINGS =====
const soundEnabled = ref(true)
const notificationEnabled = ref(true)
const autoUpdateEnabled = ref(true)
const isCheckingUpdate = ref(false)
const autoUpdateBannerRef = ref<InstanceType<typeof AutoUpdateBanner> | null>(null)
const storagePath = ref('')

// ===== MIGRATION =====
const showMigrationBanner = ref(false)
const migrationOldPath = ref('')
const migrationOldSizeMB = ref(0)
const isMigrationDeleting = ref(false)

// ===== COMPUTED =====
const visibleAccounts = computed(() => accounts.value.filter(a => !a.isHidden))

const unreadCounts = computed(() => {
  const counts: Record<string, number> = {}
  accounts.value.forEach(a => { counts[a.id] = a.unread || 0 })
  return counts
})

const totalUnreadAll = computed(() =>
  Object.values(unreadCounts.value).reduce((sum, val) => sum + val, 0)
)

// ===== NOTIFICATIONS =====
const { playNotificationSound, requestPermission, watchUnreadChanges } = useNotifications(soundEnabled, notificationEnabled)

// ===== LIFECYCLE =====
onMounted(async () => {
  requestPermission()

  // Load settings
  try {
    const sound = await getSetting('soundEnabled', 'true')
    const notif = await getSetting('notificationEnabled', 'true')
    const autoUp = await getSetting('autoUpdateEnabled', 'true')
    soundEnabled.value = sound === 'true'
    notificationEnabled.value = notif === 'true'
    autoUpdateEnabled.value = autoUp === 'true'
  } catch (e) {
    console.error('OmniChat: Error loading settings', e)
  }

  // Load storage path
  try {
    storagePath.value = await window.api.getStoragePath()
  } catch (e) {
    storagePath.value = ''
  }

  // Load snippets
  try {
    snippets.value = await db.quickReplies.toArray()
    // Nếu IndexedDB trống snippet, thử khôi phục từ backup
    if (snippets.value.length === 0) {
      let snippetRestored = false
      try {
        const backupJson = await window.api.loadSnippetsBackup()
        if (backupJson) {
          const backupSnippets = JSON.parse(backupJson) as any[]
          if (backupSnippets.length > 0) {
            for (const s of backupSnippets) {
              const id = await db.quickReplies.add({ shortcut: s.shortcut, content: s.content, imagePaths: s.imagePaths || [], createdAt: s.createdAt || Date.now() }) as number
              snippets.value.push({ id, shortcut: s.shortcut, content: s.content, imagePaths: s.imagePaths || [], createdAt: s.createdAt || Date.now() })
            }
            snippetRestored = true
            console.log('OmniChat: ✅ Khôi phục thành công', backupSnippets.length, 'tin nhắn mẫu từ backup!')
          }
        }
      } catch (e) {
        console.warn('OmniChat: Không thể đọc backup snippets:', e)
      }

      if (!snippetRestored) {
        const defaultSnippet = {
          shortcut: 'xinchao',
          content: 'Đây là nội dung tin nhắn mẫu. Tin nhắn sẽ được đính kèm tối đa 6 hình ảnh. Khi gửi phần text sẽ gửi trước và hình ảnh gửi sau.',
          imagePaths: [] as string[],
          createdAt: Date.now()
        }
        const id = await db.quickReplies.add(defaultSnippet) as number
        snippets.value.push({ id, ...defaultSnippet })
      }
    }
    syncSnippetsToWebviews()
  } catch (e) {
    console.error('OmniChat: Error loading snippets', e)
  }

  // Check migration
  try {
    const migration = await window.api.getMigrationStatus()
    if (migration.status === 'completed' || migration.status === 'dismissed') {
      migrationOldPath.value = migration.oldPath || ''
      migrationOldSizeMB.value = Math.round((migration.oldSizeBytes || 0) / 1024 / 1024)
      showMigrationBanner.value = true
    }
  } catch (e) { /* migration check optional */ }

  // Load accounts
  try {
    const saved = await db.accounts.toArray()
    let shouldRestore = saved.length === 0

    // Kiểm tra xem có đang ở trạng thái mặc định (chỉ có Zalo 1, Zalo 2) không
    const isDefaultState = saved.length <= 2 && saved.every(a => a.name.startsWith('Zalo '))
    
    let backupAccounts: any[] = []
    try {
      const backupJson = await window.api.loadAccountsBackup()
      if (backupJson) {
        backupAccounts = JSON.parse(backupJson) as any[]
      }
    } catch(e) {}

    // Nếu đang rỗng hoặc đang ở trạng thái mặc định mà đĩa lại có nhiều tài khoản hơn -> Khôi phục
    if (shouldRestore || (isDefaultState && backupAccounts.length > saved.length)) {
      if (backupAccounts.length > 0) {
        accounts.value = backupAccounts.map(a => ({ ...a, platform: a.platform || 'zalo', unread: 0 } as Account))
        await db.accounts.clear() // Xóa sạch dữ liệu mặc định cũ
        for (const acc of accounts.value) {
          const { unread: _, ...dbAcc } = acc
          await db.accounts.put(dbAcc)
        }
        console.log('OmniChat: ✅ Khôi phục đè thành công', backupAccounts.length, 'tài khoản từ backup!')
      } else {
        // Backup cũng rỗng -> Tạo mặc định
        const defaults: Account[] = [
          { id: '1', name: 'Zalo 1', platform: 'zalo', color: 'bg-blue-600', isHidden: false, unread: 0 },
          { id: '2', name: 'Zalo 2', platform: 'zalo', color: 'bg-green-600', isHidden: false, unread: 0 }
        ]
        accounts.value = defaults
        for (const acc of defaults) {
          const { unread: _, ...dbAcc } = acc
          await db.accounts.put(dbAcc)
        }
      }
    } else {
      // Load bình thường từ IndexedDB
      accounts.value = saved.map(a => ({ ...a, platform: (a as any).platform || 'zalo', unread: 0 } as Account))
    }
  } catch (e) {
    console.error('OmniChat: Error loading accounts', e)
    accounts.value = [
      { id: '1', name: 'Zalo 1', platform: 'zalo', color: 'bg-blue-600', isHidden: false, unread: 0 },
      { id: '2', name: 'Zalo 2', platform: 'zalo', color: 'bg-green-600', isHidden: false, unread: 0 }
    ]
  }

  if (visibleAccounts.value.length > 0 && !visibleAccounts.value.some(a => a.id === activeTab.value)) {
    activeTab.value = visibleAccounts.value[0].id
  }

  // Sau khi webview load xong → tín hiệu pause cho các tab ẩn
  setTimeout(() => {
    accounts.value.forEach(acc => {
      if (acc.id !== activeTab.value) {
        signalWebviewVisibility(acc.id, false)
      }
    })
  }, 8000) // Chờ 8s cho webview load xong rồi mới gửi tín hiệu
})

// Persist accounts + backup to JSON file
watch(accounts, async (val) => {
  try {
    for (const acc of val) {
      const { unread: _, ...dbAcc } = acc
      await db.accounts.put(dbAcc)
    }
    // Backup ra file JSON trên ổ cứng (đề phòng mất IndexedDB)
    const backupData = val.map(a => ({ id: a.id, name: a.name, platform: a.platform, avatarBase64: a.avatarBase64, zaloAvatarUrl: a.zaloAvatarUrl, zaloDisplayName: a.zaloDisplayName, color: a.color, isHidden: a.isHidden }))
    window.api.saveAccountsBackup(JSON.stringify(backupData))
  } catch (e) { /* silent */ }
}, { deep: true })

// Persist settings
watch(soundEnabled, async (val) => { await setSetting('soundEnabled', String(val)) })
watch(notificationEnabled, async (val) => { await setSetting('notificationEnabled', String(val)) })

// Watch unread count changes -> bell icon
watchUnreadChanges(accounts, unreadCounts, (accId: string) => {
  hasNewMessage.value = { ...hasNewMessage.value, [accId]: true }
})

// ===== ACCOUNT MANAGEMENT =====
const handleSelectTab = (id: string) => {
  const oldTabId = activeTab.value

  // Hủy Seller webview khi rời tab (Lazy-Load: giải phóng RAM)
  if (isSellerMode.value[oldTabId]) {
    isSellerMode.value[oldTabId] = false
  }

  activeTab.value = id
  if (hasNewMessage.value[id]) {
    hasNewMessage.value = { ...hasNewMessage.value, [id]: false }
  }

  // Tạm dừng scanner tab cũ, kích hoạt scanner tab mới
  signalWebviewVisibility(oldTabId, false)
  signalWebviewVisibility(id, true)
}

// Gửi tín hiệu pause/resume scanner tới webview
const signalWebviewVisibility = (accId: string, visible: boolean) => {
  try {
    const wv = document.getElementById('webview_' + accId) as any
    if (wv?.executeJavaScript) {
      wv.executeJavaScript(`window.__omnichat_visible = ${visible};`)
    }
  } catch (e) { /* silent */ }
}

// Tính partition cho mỗi tài khoản
const getPartition = (acc: Account): string => {
  // Fanpage liên kết với Messenger → dùng chung partition
  if (acc.platform === 'fanpage' && acc.linkedToId) {
    const linked = accounts.value.find(a => a.id === acc.linkedToId)
    if (linked) return 'persist:' + (linked.platform || 'messenger') + '_' + linked.id
  }
  return 'persist:' + (acc.platform || 'zalo') + '_' + acc.id
}

const handleAddAccount = (platform: Platform = 'zalo') => {
  const pf = PLATFORMS[platform]
  const count = accounts.value.filter(a => a.platform === platform).length + 1
  accounts.value.push({
    id: Date.now().toString(),
    name: pf.name + ' ' + count,
    platform: platform,
    color: pf.color,
    isHidden: false, unread: 0
  })
}

// Thêm Fanpage liên kết với tài khoản Messenger đã chọn (chung phiên đăng nhập)
const handleAddFanpage = (linkedAccId: string) => {
  const linkedAcc = accounts.value.find(a => a.id === linkedAccId)
  const count = accounts.value.filter(a => a.platform === 'fanpage').length + 1
  accounts.value.push({
    id: Date.now().toString(),
    name: 'Fanpage ' + count + (linkedAcc ? ' (' + linkedAcc.name + ')' : ''),
    platform: 'fanpage',
    linkedToId: linkedAccId,
    color: PLATFORMS.fanpage.color,
    isHidden: false, unread: 0
  })
}

// Xóa tài khoản + giải phóng bộ nhớ partition
const handleDeleteAccount = async (id: string) => {
  const acc = accounts.value.find(a => a.id === id)
  if (!acc) return

  // Xóa partition data (cache, cookies, localStorage) qua Main Process
  const partition = getPartition(acc)
  try {
    await window.api.clearPartitionData(partition)
  } catch (e) {
    console.warn('OmniChat: Không thể xóa partition data:', e)
  }

  // Xóa khỏi IndexedDB + bộ nhớ
  await db.accounts.delete(id)
  accounts.value = accounts.value.filter(a => a.id !== id)

  // Nếu đang xem tab này → chuyển sang tab khác
  if (activeTab.value === id) {
    activeTab.value = visibleAccounts.value.length > 0 ? visibleAccounts.value[0].id : '1'
  }
}

const handleToggleVisibility = (id: string) => {
  const acc = accounts.value.find(a => a.id === id)
  if (acc) {
    acc.isHidden = !acc.isHidden
    if (acc.isHidden && activeTab.value === id)
      activeTab.value = visibleAccounts.value.length > 0 ? visibleAccounts.value[0].id : '1'
  }
}

const handleUpdateName = (id: string, name: string) => {
  const acc = accounts.value.find(a => a.id === id)
  if (acc) acc.name = name
}

const handleUploadAvatar = (id: string, data: string) => {
  const acc = accounts.value.find(a => a.id === id)
  if (acc) acc.avatarBase64 = data
}

// ===== WEBVIEW CONTROLS =====
const handleRefreshWebview = () => {
  const wv = document.getElementById('webview_' + activeTab.value) as any
  if (wv?.reload) wv.reload()
}

// Sync snippets qua Main Process relay (kênh IPC đã proven hoạt động)
const syncSnippetsToWebviews = () => {
  const metadata = snippets.value.map(s => ({
    id: s.id,
    shortcut: s.shortcut,
    content: s.content,
    imageCount: (s.imagePaths || []).length
  }))
  window.api.saveSnippetsCache(JSON.stringify(metadata))

  // Backup snippets ra file JSON trên ổ cứng (đề phòng mất IndexedDB khi cài mới)
  const backupData = snippets.value.map(s => ({
    shortcut: s.shortcut,
    content: s.content,
    imagePaths: s.imagePaths || [],
    createdAt: s.createdAt
  }))
  window.api.saveSnippetsBackup(JSON.stringify(backupData))
}

// ===== SNIPPETS MANAGEMENT =====
const handleAddSnippet = async (shortcut: string, content: string, base64Images?: string[]) => {
  // Validate trùng shortcut
  if (snippets.value.some(s => s.shortcut.toLowerCase() === shortcut.toLowerCase())) {
    alert(`Phím tắt "\\${shortcut}" đã tồn tại. Vui lòng chọn phím tắt khác.`)
    return
  }

  const payload = { shortcut, content, imagePaths: [] as string[], createdAt: Date.now() }
  const id = await db.quickReplies.add(payload) as number

  // Lưu ảnh ra file nếu có
  if (base64Images && base64Images.length > 0) {
    const paths = await window.api.saveSnippetImages(id, base64Images)
    payload.imagePaths = paths
    await db.quickReplies.update(id, { imagePaths: paths })
  }

  snippets.value.push({ id, ...payload })
  syncSnippetsToWebviews()
}

const handleUpdateSnippet = async (id: number, shortcut: string, content: string, formImages?: string[]) => {
  // Validate trùng shortcut (trừ chính nó)
  if (snippets.value.some(s => s.id !== id && s.shortcut.toLowerCase() === shortcut.toLowerCase())) {
    alert(`Phím tắt "\\${shortcut}" đã tồn tại. Vui lòng chọn phím tắt khác.`)
    return
  }

  const existing = snippets.value.find(s => s.id === id)
  const oldPaths = existing?.imagePaths || []

  // Phân tách: ảnh cũ (file://) vs ảnh mới (base64)
  const keptPaths: string[] = []
  const newBase64: string[] = []
  for (const img of (formImages || [])) {
    if (img.startsWith('data:image/')) {
      newBase64.push(img)
    } else if (img.startsWith('local-img://')) {
      try {
        const urlObj = new URL(img)
        keptPaths.push(urlObj.searchParams.get('path') || img.replace('local-img://', ''))
      } catch (e) {
        keptPaths.push(img.replace('local-img://', ''))
      }
    } else if (img.startsWith('file://')) {
      keptPaths.push(img.replace('file://', ''))
    }
  }

  // Xóa các file ảnh cũ mà user đã bỏ
  const deletedPaths = oldPaths.filter(p => !keptPaths.includes(p))
  if (deletedPaths.length > 0) {
    await window.api.deleteSnippetImages(deletedPaths)
  }

  // Lưu ảnh mới ra file
  let newPaths: string[] = []
  if (newBase64.length > 0) {
    newPaths = await window.api.saveSnippetImages(id, newBase64)
  }

  const finalPaths = [...keptPaths, ...newPaths]
  await db.quickReplies.update(id, { shortcut, content, imagePaths: finalPaths })

  const index = snippets.value.findIndex(s => s.id === id)
  if (index !== -1) {
    snippets.value[index].shortcut = shortcut
    snippets.value[index].content = content
    snippets.value[index].imagePaths = finalPaths
  }
  syncSnippetsToWebviews()
}

const handleDeleteSnippet = async (id: number) => {
  const existing = snippets.value.find(s => s.id === id)
  if (existing?.imagePaths && existing.imagePaths.length > 0) {
    await window.api.deleteSnippetImages(existing.imagePaths)
  }
  await db.quickReplies.delete(id)
  snippets.value = snippets.value.filter(s => s.id !== id)
  syncSnippetsToWebviews()
}

// ===== IPC HANDLING =====
const handleIpcMessage = (event: any, acc: Account) => {
  if (event.channel !== 'zalo-data') return
  const payload = event.args[0]

  if (payload.type === 'global-unread') {
    const target = accounts.value.find(a => a.id === acc.id)
    if (target) target.unread = payload.data || 0

  } else if (payload.type === 'account-info') {
    const target = accounts.value.find(a => a.id === acc.id)
    if (target) {
      if (payload.data.avatar) target.zaloAvatarUrl = payload.data.avatar
      if (payload.data.name) target.zaloDisplayName = payload.data.name
    }

  } else if (payload.type === 'zalo-notification') {
    // Zalo Web fired a notification -> instant response
    playNotificationSound()
    hasNewMessage.value = { ...hasNewMessage.value, [acc.id]: true }

    if (notificationEnabled.value && Notification.permission === 'granted') {
      const icon = payload.data.icon || acc.zaloAvatarUrl || acc.avatarBase64 || ''
      new Notification(acc.zaloDisplayName || acc.name, {
        body: payload.data.body || payload.data.title || 'Tin nhan moi!',
        icon: icon
      })
    }

  } else if (payload.type === 'snippet-paste-images') {
    console.log('[App.vue] Nhận yêu cầu paste ảnh từ webview! snippetId:', payload.data?.snippetId)
    const snippetId = payload.data?.snippetId
    const snippet = snippets.value.find(s => s.id === snippetId)
    console.log('[App.vue] Tìm snippet:', snippet ? `OK (${snippet.imagePaths?.length} ảnh)` : 'KHÔNG TÌM THẤY')
    if (snippet?.imagePaths && snippet.imagePaths.length > 0) {
      const wv = document.getElementById('webview_' + acc.id) as any
      console.log('[App.vue] Webview element:', wv ? 'OK' : 'NOT FOUND', 'getWebContentsId:', !!wv?.getWebContentsId)
      if (wv?.getWebContentsId) {
        const wcId = wv.getWebContentsId()
        const plainPaths = [...snippet.imagePaths!] // Convert Vue Proxy → plain array cho IPC
        console.log('[App.vue] Gọi pasteImagesToWebview — wcId:', wcId, 'paths:', plainPaths)
        setTimeout(() => {
          window.api.pasteImagesToWebview(wcId, plainPaths)
        }, 300)
      }
    }
  }
}

// ===== MIGRATION =====
const handleDeleteOldStorage = async () => {
  isMigrationDeleting.value = true
  try {
    const result = await window.api.deleteOldStorage()
    if (result.success) showMigrationBanner.value = false
  } catch (e) { /* silent */ }
  finally { isMigrationDeleting.value = false }
}

const handleDismissMigration = async () => {
  showMigrationBanner.value = false
  try { await window.api.dismissMigration() } catch (e) { /* silent */ }
}

const handleQuitApp = () => {
  window.close()
}

const handleCheckForUpdate = () => {
  autoUpdateBannerRef.value?.checkForUpdate()
}
</script>

<template>
  <div class="flex flex-col h-screen w-screen bg-zalo-bg text-zalo-text overflow-hidden">

    <AutoUpdateBanner ref="autoUpdateBannerRef" @update:is-checking="(val) => isCheckingUpdate = val" />

    <MigrationBanner
      :show="showMigrationBanner"
      :old-path="migrationOldPath"
      :old-size-m-b="migrationOldSizeMB"
      :is-deleting="isMigrationDeleting"
      @delete="handleDeleteOldStorage"
      @dismiss="handleDismissMigration"
    />

    <div class="flex flex-1 min-h-0">

      <!-- Sidebar -->
      <AccountSidebar
        :visible-accounts="visibleAccounts"
        :active-tab="activeTab"
        :unread-counts="unreadCounts"
        :total-unread-all="totalUnreadAll"
        :has-new-message="hasNewMessage"
        @select-tab="handleSelectTab"
        @open-settings="showSettings = true"
        @quit-app="handleQuitApp"
      />

      <!-- Main: Webview Pool -->
      <main class="flex-1 flex flex-col bg-white relative min-w-0 z-0">
        <webview
          v-for="acc in visibleAccounts"
          :id="'webview_' + acc.id"
          :key="'wv-' + acc.id"
          :src="PLATFORMS[acc.platform || 'zalo']?.url || 'https://chat.zalo.me'"
          :partition="getPartition(acc)"
          :preload="webviewPreloadPath"
          @ipc-message="(e: any) => handleIpcMessage(e, acc)"
          class="absolute top-0 left-0 w-full h-full flex-1 outline-none border-none bg-[#f1f2f4]"
          :style="{
            opacity: (activeTab === acc.id && !isSellerMode[acc.id]) ? 1 : 0.001,
            pointerEvents: (activeTab === acc.id && !isSellerMode[acc.id]) ? 'auto' : 'none',
            zIndex: (activeTab === acc.id && !isSellerMode[acc.id]) ? 10 : 0
          }"
          useragent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
          allowpopups
        ></webview>

        <!-- Alternate View Webview (Seller Center / Facebook) — Lazy-Load: chỉ tạo khi bấm toggle -->
        <template v-for="acc in accounts.filter(a => ['shopee', 'tiktok', 'messenger'].includes(a.platform || ''))" :key="'wv-alt-wrap-' + acc.id">
          <webview
            v-if="activeTab === acc.id && isSellerMode[acc.id]"
            :id="'webview_alt_' + acc.id"
            :key="'wv-alt-' + acc.id"
            :src="acc.platform === 'shopee' ? 'https://seller.shopee.vn/' : (acc.platform === 'tiktok' ? 'https://seller-vn.tiktok.com/' : 'https://www.facebook.com/')"
            :partition="getPartition(acc)"
            allowpopups
            class="absolute top-0 left-0 w-full h-full flex-1 outline-none border-none bg-white"
            style="z-index: 10;"
            useragent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
          ></webview>
        </template>

        <!-- Floating Toggle Mode Button -->
        <button
          v-if="['shopee', 'tiktok', 'messenger'].includes(accounts.find(a => a.id === activeTab)?.platform || '')"
          @click="isSellerMode[activeTab] = !isSellerMode[activeTab]"
          class="absolute top-2 left-1/2 -translate-x-[calc(50%+1.5rem)] z-20 px-3 h-9 rounded-full bg-blue-600/90 hover:bg-blue-600 text-white flex items-center gap-1.5 justify-center transition-all shadow-md backdrop-blur-sm shadow-blue-500/20 hover:scale-105"
          :title="isSellerMode[activeTab] ? 'Quay lại Chat' : (accounts.find(a => a.id === activeTab)?.platform === 'messenger' ? 'Mở Facebook' : 'Mở Kênh Người Bán')"
        >
          <!-- Giao diện nút lúc ở bên Chat -->
          <template v-if="!isSellerMode[activeTab]">
            <template v-if="accounts.find(a => a.id === activeTab)?.platform === 'messenger'">
              <!-- Facebook Icon -->
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"></path></svg>
              <span class="text-xs font-bold">Facebook</span>
            </template>
            <template v-else>
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"></path><line x1="3" y1="6" x2="21" y2="6"></line><path d="M16 10a4 4 0 0 1-8 0"></path></svg>
              <span class="text-xs font-bold">Kênh Bán</span>
            </template>
          </template>
          <!-- Giao diện lúc ở bên kia (mời quay lại Chat) -->
          <template v-else>
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
            <span class="text-xs font-bold">Về Chat</span>
          </template>
        </button>
        <!-- Floating Refresh Button -->
        <button
          @click="handleRefreshWebview"
          class="absolute top-2 left-1/2 translate-x-[calc(-50%+3.5rem)] z-20 w-9 h-9 rounded-full bg-black/20 hover:bg-black/50 text-white flex items-center justify-center transition-all opacity-40 hover:opacity-100 backdrop-blur-sm"
          title="Tải lại trang (Refresh)"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="23 4 23 10 17 10"></polyline>
            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
          </svg>
        </button>
      </main>

      <!-- Settings -->
      <SettingsModal
        :show="showSettings"
        :accounts="accounts"
        :sound-enabled="soundEnabled"
        :notification-enabled="notificationEnabled"
        :is-checking-update="isCheckingUpdate"
        :storage-path="storagePath"
        :snippets="snippets"
        @close="showSettings = false"
        @add-account="handleAddAccount"
        @add-fanpage="handleAddFanpage"
        @delete-account="handleDeleteAccount"
        @toggle-visibility="handleToggleVisibility"
        @update-name="handleUpdateName"
        @upload-avatar="handleUploadAvatar"
        @update:sound-enabled="(val) => soundEnabled = val"
        @update:notification-enabled="(val) => notificationEnabled = val"
        @check-for-update="handleCheckForUpdate"
        @add-snippet="handleAddSnippet"
        @update-snippet="handleUpdateSnippet"
        @delete-snippet="handleDeleteSnippet"
      />
    </div>
  </div>
</template>

<style>
::-webkit-scrollbar { width: 6px; }
::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.15); border-radius: 4px; }
::-webkit-scrollbar-thumb:hover { background: rgba(0,0,0,0.3); }
</style>
