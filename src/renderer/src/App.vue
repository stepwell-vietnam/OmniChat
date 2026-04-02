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
const snippets = ref<DbQuickReply[]>([])

// ===== SETTINGS =====
const soundEnabled = ref(true)
const notificationEnabled = ref(true)
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
    soundEnabled.value = sound === 'true'
    notificationEnabled.value = notif === 'true'
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
    // Tạo mẫu mặc định nếu chưa có snippet nào
    if (snippets.value.length === 0) {
      const defaultSnippet = {
        shortcut: 'xinchao',
        content: 'Đây là nội dung tin nhắn mẫu. Tin nhắn sẽ được đính kèm tối đa 6 hình ảnh. Khi gửi phần text sẽ gửi trước và hình ảnh gửi sau.',
        imagePaths: [] as string[],
        createdAt: Date.now()
      }
      const id = await db.quickReplies.add(defaultSnippet) as number
      snippets.value.push({ id, ...defaultSnippet })
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
    if (saved.length > 0) {
      accounts.value = saved.map(a => ({ ...a, platform: (a as any).platform || 'zalo', unread: 0 } as Account))
    } else {
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
})

// Persist accounts
watch(accounts, async (val) => {
  try {
    for (const acc of val) {
      const { unread: _, ...dbAcc } = acc
      await db.accounts.put(dbAcc)
    }
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
  activeTab.value = id
  if (hasNewMessage.value[id]) {
    hasNewMessage.value = { ...hasNewMessage.value, [id]: false }
  }
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
</script>

<template>
  <div class="flex flex-col h-screen w-screen bg-zalo-bg text-zalo-text overflow-hidden">

    <AutoUpdateBanner />

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
      />

      <!-- Main: Webview Pool -->
      <main class="flex-1 flex flex-col bg-white relative min-w-0 z-0">
        <webview
          v-for="acc in accounts"
          :id="'webview_' + acc.id"
          :key="'wv-' + acc.id"
          :src="PLATFORMS[acc.platform || 'zalo']?.url || 'https://chat.zalo.me'"
          :partition="'persist:' + (acc.platform || 'zalo') + '_' + acc.id"
          :preload="webviewPreloadPath"
          @ipc-message="(e: any) => handleIpcMessage(e, acc)"
          class="absolute top-0 left-0 w-full h-full flex-1 outline-none border-none bg-[#f1f2f4]"
          :style="{
            opacity: (activeTab === acc.id && !acc.isHidden) ? 1 : 0.001,
            pointerEvents: (activeTab === acc.id && !acc.isHidden) ? 'auto' : 'none',
            zIndex: (activeTab === acc.id && !acc.isHidden) ? 10 : 0
          }"
          useragent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
          allowpopups
        ></webview>

        <!-- Floating Refresh Button -->
        <button
          @click="handleRefreshWebview"
          class="absolute top-3 right-3 z-20 w-9 h-9 rounded-full bg-black/20 hover:bg-black/50 text-white flex items-center justify-center transition-all opacity-40 hover:opacity-100 backdrop-blur-sm"
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
        :storage-path="storagePath"
        :snippets="snippets"
        @close="showSettings = false"
        @add-account="handleAddAccount"
        @toggle-visibility="handleToggleVisibility"
        @update-name="handleUpdateName"
        @upload-avatar="handleUploadAvatar"
        @update:sound-enabled="(val) => soundEnabled = val"
        @update:notification-enabled="(val) => notificationEnabled = val"
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
