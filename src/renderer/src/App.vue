<script setup lang="ts">
import { ref, watch, onMounted, computed } from 'vue'
import type { Account } from './types'
import { ACCOUNT_COLORS } from './utils'
import { db, getSetting, setSetting } from './database/db'
import { useNotifications } from './composables/useNotifications'
import AccountSidebar from './components/AccountSidebar.vue'
import SettingsModal from './components/SettingsModal.vue'
import MigrationBanner from './components/MigrationBanner.vue'

// ===== STATE =====
const activeTab = ref<string>('1')
const showSettings = ref(false)
const accounts = ref<Account[]>([])
const webviewPreloadPath = ref(window.api?.getWebviewPreloadPath?.() || '')
const hasNewMessage = ref<Record<string, boolean>>({})

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
      accounts.value = saved.map(a => ({ ...a, unread: 0 }))
    } else {
      const defaults: Account[] = [
        { id: '1', name: 'Zalo 1', color: 'bg-blue-600', isHidden: false, unread: 0 },
        { id: '2', name: 'Zalo 2', color: 'bg-green-600', isHidden: false, unread: 0 }
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
      { id: '1', name: 'Zalo 1', color: 'bg-blue-600', isHidden: false, unread: 0 },
      { id: '2', name: 'Zalo 2', color: 'bg-green-600', isHidden: false, unread: 0 }
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

const handleAddAccount = () => {
  accounts.value.push({
    id: Date.now().toString(),
    name: 'Zalo ' + (accounts.value.length + 1),
    color: ACCOUNT_COLORS[accounts.value.length % ACCOUNT_COLORS.length],
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
      new Notification(acc.zaloDisplayName || acc.name, {
        body: payload.data.body || payload.data.title || 'Tin nhan moi!'
      })
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
          :src="'https://chat.zalo.me'"
          :partition="'persist:zalo_' + acc.id"
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
      </main>

      <!-- Settings -->
      <SettingsModal
        :show="showSettings"
        :accounts="accounts"
        :sound-enabled="soundEnabled"
        :notification-enabled="notificationEnabled"
        :storage-path="storagePath"
        @close="showSettings = false"
        @add-account="handleAddAccount"
        @toggle-visibility="handleToggleVisibility"
        @update-name="handleUpdateName"
        @upload-avatar="handleUploadAvatar"
        @update:sound-enabled="(val) => soundEnabled = val"
        @update:notification-enabled="(val) => notificationEnabled = val"
      />
    </div>
  </div>
</template>

<style>
::-webkit-scrollbar { width: 6px; }
::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.15); border-radius: 4px; }
::-webkit-scrollbar-thumb:hover { background: rgba(0,0,0,0.3); }
</style>
