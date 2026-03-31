<script setup lang="ts">
import { ref, watch, onMounted, computed } from 'vue'
import type { Account, Conversation, ChatMessage } from './types'
import { ACCOUNT_COLORS } from './utils'
import { db, getSetting, setSetting } from './database/db'
import { useNotifications } from './composables/useNotifications'
import AccountSidebar from './components/AccountSidebar.vue'
import ConversationList from './components/ConversationList.vue'
import ChatWindow from './components/ChatWindow.vue'
import CrmPanel from './components/CrmPanel.vue'
import SettingsModal from './components/SettingsModal.vue'

// ===== STATE =====
const activeTab = ref<string>('1')
const activeChat = ref<string | null>(null)
const showSettings = ref(false)
const accounts = ref<Account[]>([])
const globalConversations = ref<Conversation[]>([])
const currentMessages = ref<ChatMessage[]>([])
const webviewPreloadPath = ref(window.api?.getWebviewPreloadPath?.() || '')

// ===== SETTINGS STATE =====
const soundEnabled = ref(true)
const notificationEnabled = ref(true)
const storagePath = ref('')

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

const activeConversation = computed(() =>
  globalConversations.value.find(c => c.id === activeChat.value) || null
)

// ===== NOTIFICATIONS =====
const { requestPermission, watchUnreadChanges } = useNotifications(soundEnabled, notificationEnabled)

// ===== LIFECYCLE: Load từ Dexie.js =====
onMounted(async () => {
  requestPermission()

  // Load notification settings
  try {
    const sound = await getSetting('soundEnabled', 'true')
    const notif = await getSetting('notificationEnabled', 'true')
    soundEnabled.value = sound === 'true'
    notificationEnabled.value = notif === 'true'
  } catch (e) {
    console.error('OmniChat: Lỗi load settings', e)
  }

  // Load storage path
  try {
    storagePath.value = await window.api.getStoragePath()
  } catch (e) {
    storagePath.value = 'Không xác định'
  }

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
    console.error('OmniChat: Lỗi load Dexie.js', e)
    accounts.value = [
      { id: '1', name: 'Zalo 1', color: 'bg-blue-600', isHidden: false, unread: 0 },
      { id: '2', name: 'Zalo 2', color: 'bg-green-600', isHidden: false, unread: 0 }
    ]
  }
  if (visibleAccounts.value.length > 0 && !visibleAccounts.value.some(a => a.id === activeTab.value)) {
    activeTab.value = visibleAccounts.value[0].id
  }
})

// Persist accounts vào Dexie.js
watch(accounts, async (val) => {
  try {
    for (const acc of val) {
      const { unread: _, ...dbAcc } = acc
      await db.accounts.put(dbAcc)
    }
  } catch (e) { console.error('OmniChat: Lỗi lưu Dexie.js', e) }
}, { deep: true })

// Persist notification settings
watch(soundEnabled, async (val) => {
  await setSetting('soundEnabled', String(val))
})
watch(notificationEnabled, async (val) => {
  await setSetting('notificationEnabled', String(val))
})

watchUnreadChanges(accounts, unreadCounts)

// ===== ACCOUNT MANAGEMENT =====
const handleSelectTab = (id: string) => { activeTab.value = id; if (id !== 'all') activeChat.value = null }
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
      activeTab.value = visibleAccounts.value.length > 0 ? visibleAccounts.value[0].id : 'all'
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

// ===== IPC HANDLING (Webview → Vue) =====
const handleIpcMessage = (event: any, acc: Account) => {
  if (event.channel !== 'zalo-data') return
  const payload = event.args[0]

  if (payload.type === 'conversations') {
    (payload.data as any[]).forEach(conv => {
      const globalId = `${acc.id}_${conv.id}`
      const idx = globalConversations.value.findIndex(c => c.id === globalId)
      const newConv: Conversation = {
        id: globalId, name: conv.name, lastMessage: conv.lastMessage,
        time: conv.time, avatar: conv.avatar, unread: conv.unread,
        zaloId: acc.id, zaloName: acc.name, zaloColor: acc.color
      }
      if (idx > -1) globalConversations.value[idx] = newConv
      else globalConversations.value.push(newConv)
    })
  } else if (payload.type === 'messages') {
    const active = globalConversations.value.find(c => c.id === activeChat.value)
    if (active && active.zaloId === acc.id) currentMessages.value = payload.data
  } else if (payload.type === 'global-unread') {
    const target = accounts.value.find(a => a.id === acc.id)
    if (target) target.unread = payload.data || 0
  } else if (payload.type === 'account-info') {
    const target = accounts.value.find(a => a.id === acc.id)
    if (target) {
      if (payload.data.avatar) target.zaloAvatarUrl = payload.data.avatar
      if (payload.data.name) target.zaloDisplayName = payload.data.name
    }
  }
}

// ===== OPEN CHAT =====
const openChat = (conv: Conversation) => {
  activeChat.value = conv.id
  currentMessages.value = []
  const originalId = conv.id.replace(`${conv.zaloId}_`, '')
  const wv = document.getElementById(`webview_${conv.zaloId}`) as any
  if (wv?.send) {
    wv.send('open-conversation', originalId)
  }
}
</script>

<template>
  <div class="flex h-screen w-screen bg-zalo-bg text-zalo-text overflow-hidden">

    <!-- Cột 1: Sidebar -->
    <AccountSidebar
      :visible-accounts="visibleAccounts"
      :active-tab="activeTab"
      :unread-counts="unreadCounts"
      :total-unread-all="totalUnreadAll"
      @select-tab="handleSelectTab"
      @open-settings="showSettings = true"
    />

    <!-- Cột 2: Danh sách chat (chỉ hiện khi All mode) -->
    <ConversationList
      v-if="activeTab === 'all'"
      :conversations="globalConversations"
      :active-chat="activeChat"
      @open-chat="openChat"
    />

    <!-- Cột 3: Khu vực chính -->
    <main class="flex-1 flex flex-col bg-white relative min-w-0 z-0">
      <ChatWindow
        :active-chat="activeChat"
        :active-conversation="activeConversation"
        :messages="currentMessages"
        :active-tab="activeTab"
        @open-settings="showSettings = true"
      />

      <!-- Webview Pool: luôn render tất cả, ẩn bằng opacity -->
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

    <!-- Cột 4: CRM Panel -->
    <CrmPanel v-if="activeTab === 'all'" />

    <!-- Modal Settings -->
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
</template>

<style>
::-webkit-scrollbar { width: 6px; }
::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.15); border-radius: 4px; }
::-webkit-scrollbar-thumb:hover { background: rgba(0,0,0,0.3); }
</style>
