<script setup lang="ts">
import { ref, computed } from 'vue'
import type { Account, Platform } from '../types'
import { PLATFORMS } from '../types'
import { getInitials } from '../utils'
import type { DbQuickReply } from '../database/db'

const props = defineProps<{
  show: boolean
  accounts: Account[]
  soundEnabled: boolean
  notificationEnabled: boolean
  isCheckingUpdate?: boolean
  storagePath: string
  snippets: DbQuickReply[]
}>()

const emit = defineEmits<{
  close: []
  addAccount: [platform: Platform]
  addFanpage: [linkedAccId: string]
  toggleVisibility: [id: string]
  deleteAccount: [id: string]
  updateName: [id: string, name: string]
  uploadAvatar: [id: string, data: string]
  'update:soundEnabled': [val: boolean]
  'update:notificationEnabled': [val: boolean]
  checkForUpdate: []
  changeStoragePath: []
  restartApp: []
  addSnippet: [shortcut: string, content: string, formImages?: string[]]
  deleteSnippet: [id: number]
  updateSnippet: [id: number, shortcut: string, content: string, formImages?: string[]]
}>()

// Fanpage linking popup
const showFanpagePicker = ref(false)

// Nhóm tài khoản theo nền tảng
const groupedAccounts = computed(() => {
  const platformOrder: Platform[] = ['zalo', 'messenger', 'fanpage', 'whatsapp', 'telegram', 'shopee', 'tiktok']
  const groups: { platform: Platform; label: string; accounts: Account[] }[] = []
  for (const p of platformOrder) {
    const accs = props.accounts.filter(a => (a.platform || 'zalo') === p)
    if (accs.length > 0) {
      groups.push({ platform: p, label: PLATFORMS[p].name, accounts: accs })
    }
  }
  return groups
})


const handleFanpageClick = () => {
  const fbAccs = props.accounts.filter(a => a.platform === 'messenger')
  if (fbAccs.length === 0) {
    // Không có Messenger nào → cho tạo Fanpage độc lập
    const choice = confirm('Bạn chưa có tài khoản Messenger nào.\n\n• Bấm OK để tạo Fanpage độc lập (phải đăng nhập Facebook riêng).\n• Bấm Hủy để thêm Messenger trước.')
    if (choice) {
      emit('addAccount', 'fanpage')
    }
    return
  }
  // Có Messenger → luôn hiện popup để chọn liên kết hoặc tạo độc lập
  showFanpagePicker.value = true
}

const selectFanpageLink = (accId: string) => {
  showFanpagePicker.value = false
  emit('addFanpage', accId)
}

const handleDeleteAccount = (acc: Account) => {
  const confirmMsg = `Bạn có chắc muốn XÓA tài khoản "${acc.name}"?\n\nHành động này sẽ xóa toàn bộ dữ liệu đăng nhập, cache và ảnh của tài khoản này. Không thể hoàn tác!`
  if (confirm(confirmMsg)) {
    emit('deleteAccount', acc.id)
  }
}

const needsRestart = ref(false)
const newStoragePath = ref('')
const isMigrating = ref(false)
const migrationError = ref('')

const handleAvatarUpload = (event: Event, id: string) => {
  const input = event.target as HTMLInputElement
  if (input.files && input.files[0]) {
    const reader = new FileReader()
    reader.onload = (e) => {
      if (e.target?.result) {
        emit('uploadAvatar', id, e.target.result as string)
      }
    }
    reader.readAsDataURL(input.files[0])
  }
}

const handleChangeStorage = async () => {
  isMigrating.value = true
  migrationError.value = ''
  try {
    const result = await window.api.selectStorageFolder()
    if (result.success && result.newPath) {
      newStoragePath.value = result.newPath
      needsRestart.value = true
    } else if (result.error && result.error !== 'cancelled') {
      migrationError.value = result.error
    }
  } catch (e) {
    migrationError.value = String(e)
  } finally {
    isMigrating.value = false
  }
}

const isLoadingStorage = ref(false)
const loadStorageError = ref('')
const loadStorageSuccess = ref(false)

const handleLoadStorage = async () => {
  isLoadingStorage.value = true
  loadStorageError.value = ''
  loadStorageSuccess.value = false
  try {
    const result = await window.api.loadStorageFolder()
    if (result.success && result.newPath) {
      newStoragePath.value = result.newPath
      loadStorageSuccess.value = true
      needsRestart.value = true
    } else if (result.error && result.error !== 'cancelled') {
      loadStorageError.value = result.error
    }
  } catch (e) {
    loadStorageError.value = String(e)
  } finally {
    isLoadingStorage.value = false
  }
}

const handleOpenSellerCenter = (acc: Account) => {
  const partition = 'persist:' + (acc.platform || 'zalo') + '_' + acc.id
  let url = ''
  if (acc.platform === 'shopee') {
    url = 'https://seller.shopee.vn/'
  } else if (acc.platform === 'tiktok') {
    url = 'https://seller-vn.tiktok.com/'
  }
  
  if (url) {
    window.api.openSellerWindow(partition, url)
  }
}

// ===== UPDATE CHECK (inline trong modal) =====
const CURRENT_VERSION = 1.81
const updateCheckState = ref<'idle' | 'checking' | 'up-to-date' | 'has-update' | 'error'>('idle')
const updateData = ref({ version: '', mac_url: '', win_url: '', changelog: '' })

const handleCheckUpdate = async () => {
  updateCheckState.value = 'checking'
  try {
    const result = await window.api.checkForUpdate()
    if (result.success && result.data) {
      const remoteVersion = parseFloat(result.data.version)
      if (remoteVersion > CURRENT_VERSION) {
        updateData.value = result.data
        updateCheckState.value = 'has-update'
      } else {
        updateCheckState.value = 'up-to-date'
      }
    } else {
      updateCheckState.value = 'error'
    }
  } catch (e) {
    updateCheckState.value = 'error'
  }
}

const handleRestart = () => {
  window.api.restartApp()
}

// Active tab
const activeSection = ref<'accounts' | 'system' | 'snippets'>('accounts')

// Snippet State
const snippetForm = ref({ shortcut: '', content: '', images: [] as string[] })
const isEditingSnippetId = ref<number | null>(null)

const handleSaveSnippet = () => {
  if (!snippetForm.value.shortcut || (!snippetForm.value.content && snippetForm.value.images.length === 0)) return
  const cleanShortcut = snippetForm.value.shortcut.trim()
  if (isEditingSnippetId.value) {
    emit('updateSnippet', isEditingSnippetId.value, cleanShortcut, snippetForm.value.content, snippetForm.value.images)
    isEditingSnippetId.value = null
  } else {
    emit('addSnippet', cleanShortcut, snippetForm.value.content, snippetForm.value.images)
  }
  snippetForm.value.shortcut = ''
  snippetForm.value.content = ''
  snippetForm.value.images = []
}

const handleEditSnippet = (snippet: DbQuickReply) => {
  isEditingSnippetId.value = snippet.id!
  snippetForm.value.shortcut = snippet.shortcut
  snippetForm.value.content = snippet.content
  // Load ảnh cũ từ file paths → truyền qua tham số path để không bị URL parser làm hỏng (đổi chữ hoa thành thường ở phần Users)
  snippetForm.value.images = (snippet.imagePaths || []).map(p => 'local-img://asset?path=' + encodeURIComponent(p))
}

const handleCancelEdit = () => {
  isEditingSnippetId.value = null
  snippetForm.value.shortcut = ''
  snippetForm.value.content = ''
  snippetForm.value.images = []
}

const handleSnippetImageUpload = async (event: Event) => {
  const input = event.target as HTMLInputElement
  if (!input.files || input.files.length === 0) return
  
  if (snippetForm.value.images.length + input.files.length > 6) {
     alert("Chỉ được lưu tối đa 6 ảnh cho mỗi mẫu tin nhắn.")
     return
  }

  const files = Array.from(input.files)
  
  const promises = files.map(file => {
    return new Promise<string>((resolve) => {
      const reader = new FileReader()
      reader.onload = (e) => {
        if (e.target?.result) resolve(e.target.result as string)
      }
      reader.readAsDataURL(file)
    })
  })
  
  const base64Images = await Promise.all(promises)
  snippetForm.value.images.push(...base64Images)
  
  // reset input
  input.value = ''
}

const handleRemoveSnippetImage = (index: number) => {
  snippetForm.value.images.splice(index, 1)
}
</script>

<template>
  <div v-show="show" class="fixed inset-0 bg-black/50 z-50 flex items-center justify-center backdrop-blur-sm">
    <div class="bg-white rounded-xl shadow-2xl w-[680px] max-w-[90vw] overflow-hidden flex flex-col max-h-[85vh]">

      <!-- Header -->
      <div class="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
        <h2 class="text-xl font-bold text-gray-800">Cài đặt OmniChat</h2>
        <button @click="emit('close')" class="text-gray-400 hover:text-gray-600 focus:outline-none bg-transparent" title="Đóng">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </button>
      </div>

      <!-- Tab Navigation -->
      <div class="flex border-b border-gray-200 px-6 bg-white">
        <button
          class="px-4 py-3 text-sm font-semibold transition border-b-2"
          :class="activeSection === 'accounts' ? 'border-zalo-primary text-zalo-primary' : 'border-transparent text-gray-500 hover:text-gray-700'"
          @click="activeSection = 'accounts'"
        >
          <span class="flex items-center gap-1.5">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
            Tài Khoản
          </span>
        </button>
        <button
          class="px-4 py-3 text-sm font-semibold transition border-b-2"
          :class="activeSection === 'system' ? 'border-zalo-primary text-zalo-primary' : 'border-transparent text-gray-500 hover:text-gray-700'"
          @click="activeSection = 'system'"
        >
          <span class="flex items-center gap-1.5">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
            Hệ thống
          </span>
        </button>
        <button
          class="px-4 py-3 text-sm font-semibold transition border-b-2"
          :class="activeSection === 'snippets' ? 'border-zalo-primary text-zalo-primary' : 'border-transparent text-gray-500 hover:text-gray-700'"
          @click="activeSection = 'snippets'"
        >
          <span class="flex items-center gap-1.5">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
            Tin nhắn mẫu
          </span>
        </button>
      </div>

      <!-- Content -->
      <div class="flex-1 overflow-y-auto p-6 bg-white">

        <!-- ===== TAB 1: QUẢN LÝ TÀI KHOẢN ===== -->
        <div v-if="activeSection === 'accounts'" class="space-y-5">

          <!-- Nhóm tài khoản theo nền tảng -->
          <div v-for="group in groupedAccounts" :key="group.platform" class="border rounded-lg overflow-hidden">
            <!-- Header nhóm -->
            <div class="flex items-center gap-2 px-4 py-2.5 border-b" :class="PLATFORMS[group.platform]?.color + '/10 bg-opacity-10'" style="background: linear-gradient(135deg, rgba(0,0,0,0.02), rgba(0,0,0,0.05));">
              <span class="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold text-white" :class="PLATFORMS[group.platform]?.color || 'bg-gray-500'">{{ PLATFORMS[group.platform]?.icon || '?' }}</span>
              <span class="font-bold text-gray-700 text-sm">{{ group.label }}</span>
              <span class="text-[11px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full">{{ group.accounts.length }}</span>
            </div>

            <!-- Danh sách tài khoản trong nhóm -->
            <div class="divide-y divide-gray-100 bg-white">
              <div
                v-for="acc in group.accounts"
                :key="acc.id"
                class="flex items-center gap-3 px-4 py-3 hover:bg-gray-50/80 transition"
                :class="acc.isHidden ? 'opacity-40' : ''"
              >
                <!-- Avatar -->
                <div class="relative group w-11 h-11 rounded-full flex-shrink-0 cursor-pointer overflow-hidden border-2 border-white shadow-sm flex items-center justify-center font-bold text-white text-base" :class="!(acc.avatarBase64 || acc.zaloAvatarUrl) ? acc.color : ''">
                  <img v-if="acc.avatarBase64" :src="acc.avatarBase64" class="w-full h-full object-cover" />
                  <img v-else-if="acc.zaloAvatarUrl" :src="acc.zaloAvatarUrl" class="w-full h-full object-cover" referrerpolicy="no-referrer" />
                  <span v-else>{{ getInitials(acc.name) }}</span>
                  <label class="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition cursor-pointer" title="Upload Avatar">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-white"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
                    <input type="file" accept="image/*" class="hidden" @change="(e: Event) => handleAvatarUpload(e, acc.id)" />
                  </label>
                </div>

                <!-- Name & Info -->
                <div class="flex-1 min-w-0">
                  <input
                    type="text"
                    :value="acc.name"
                    @input="emit('updateName', acc.id, ($event.target as HTMLInputElement).value)"
                    class="font-semibold text-gray-800 text-sm bg-transparent border-b border-transparent hover:border-gray-300 focus:border-zalo-primary focus:outline-none py-0.5 w-full transition truncate"
                    placeholder="Nhập tên gọi nhớ"
                  />
                  <div class="text-[11px] text-gray-400 mt-0.5 flex items-center gap-1.5 flex-wrap">
                    <template v-if="acc.platform === 'fanpage' && acc.linkedToId">
                      <span class="text-green-600 font-semibold">🔗 {{ accounts.find(a => a.id === acc.linkedToId)?.name || 'Messenger' }}</span>
                    </template>
                    <span v-if="acc.zaloDisplayName" class="text-blue-500">{{ acc.zaloDisplayName }}</span>
                    <span v-if="acc.zaloAvatarUrl" class="text-green-500">✓ Ảnh tự động</span>
                    <span v-if="acc.unread > 0" class="text-red-500 font-bold">{{ acc.unread }} chưa đọc</span>
                  </div>
                </div>

                <!-- Actions -->
                <div class="flex items-center gap-1.5 flex-shrink-0">
                  <button
                    v-if="acc.platform === 'shopee' || acc.platform === 'tiktok'"
                    @click="handleOpenSellerCenter(acc)"
                    class="px-2 py-1.5 rounded-md text-xs font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 transition border border-blue-200 mr-2 flex items-center gap-1"
                    title="Mở Kênh Người Bán trong cửa sổ mới (không cần đăng nhập lại)"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"></path><line x1="3" y1="6" x2="21" y2="6"></line><path d="M16 10a4 4 0 0 1-8 0"></path></svg>
                    Kênh Bán
                  </button>
                  <button
                    @click="emit('toggleVisibility', acc.id)"
                    class="p-1.5 rounded-md text-sm transition"
                    :class="acc.isHidden ? 'text-indigo-500 hover:bg-indigo-50' : 'text-orange-500 hover:bg-orange-50'"
                    :title="acc.isHidden ? 'Bật lại' : 'Ẩn'"
                  >
                    <svg v-if="acc.isHidden" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                    <svg v-else xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>
                  </button>
                  <button
                    @click="handleDeleteAccount(acc)"
                    class="p-1.5 rounded-md text-red-400 hover:text-red-600 hover:bg-red-50 transition"
                    title="Xóa tài khoản"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                  </button>
                </div>
              </div>
            </div>
          </div>

          <!-- Add Account Buttons -->
          <div class="grid grid-cols-3 gap-3">
            <button @click="emit('addAccount', 'zalo')" class="py-3 border-2 border-dashed border-blue-200 rounded-lg text-blue-600 font-bold hover:border-blue-500 hover:bg-blue-50 transition flex justify-center items-center gap-2 focus:outline-none">
              <span class="w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-xs font-bold">Z</span>
              Zalo
            </button>
            <button @click="emit('addAccount', 'whatsapp')" class="py-3 border-2 border-dashed border-green-200 rounded-lg text-green-600 font-bold hover:border-green-500 hover:bg-green-50 transition flex justify-center items-center gap-2 focus:outline-none">
              <span class="w-6 h-6 bg-green-600 text-white rounded-full flex items-center justify-center text-xs font-bold">W</span>
              WhatsApp
            </button>
            <button @click="emit('addAccount', 'messenger')" class="py-3 border-2 border-dashed border-purple-200 rounded-lg text-purple-600 font-bold hover:border-purple-500 hover:bg-purple-50 transition flex justify-center items-center gap-2 focus:outline-none">
              <span class="w-6 h-6 bg-purple-600 text-white rounded-full flex items-center justify-center text-xs font-bold">M</span>
              Messenger
            </button>
            <button @click="emit('addAccount', 'telegram')" class="py-3 border-2 border-dashed border-blue-200 rounded-lg text-blue-500 font-bold hover:border-blue-400 hover:bg-blue-50 transition flex justify-center items-center gap-2 focus:outline-none">
              <span class="w-6 h-6 bg-blue-400 text-white rounded-full flex items-center justify-center text-xs font-bold">Tg</span>
              Telegram
            </button>
            <button @click="emit('addAccount', 'shopee')" class="py-3 border-2 border-dashed border-orange-200 rounded-lg text-orange-500 font-bold hover:border-orange-500 hover:bg-orange-50 transition flex justify-center items-center gap-2 focus:outline-none">
              <span class="w-6 h-6 bg-orange-500 text-white rounded-full flex items-center justify-center text-xs font-bold">S</span>
              Shopee
            </button>
            <button @click="emit('addAccount', 'tiktok')" class="py-3 border-2 border-dashed border-gray-300 rounded-lg text-black font-bold hover:border-black hover:bg-gray-100 transition flex justify-center items-center gap-2 focus:outline-none">
              <span class="w-6 h-6 bg-black text-white rounded-full flex items-center justify-center text-xs font-bold">T</span>
              TikTok
            </button>
            <button @click="handleFanpageClick" class="col-span-3 py-3 border-2 border-dashed border-blue-300 rounded-lg text-blue-800 font-bold hover:border-blue-800 hover:bg-blue-50 transition flex justify-center items-center gap-2 focus:outline-none">
              <span class="w-6 h-6 bg-blue-800 text-white rounded-full flex items-center justify-center text-xs font-bold">F</span>
              Fanpage
            </button>
          </div>

          <!-- Popup chọn tài khoản Facebook để liên kết Fanpage -->
          <div v-if="showFanpagePicker" class="border-2 border-blue-200 rounded-lg p-4 bg-blue-50/50 mt-3">
            <h4 class="font-bold text-blue-800 mb-2 text-sm">🔗 Chọn tài khoản Messenger để liên kết Fanpage:</h4>
            <p class="text-xs text-gray-500 mb-3">Fanpage sẽ dùng chung phiên đăng nhập Facebook (không cần login lại)</p>
            <div class="space-y-2">
              <button
                v-for="msgAcc in accounts.filter(a => a.platform === 'messenger')"
                :key="msgAcc.id"
                @click="selectFanpageLink(msgAcc.id)"
                class="w-full flex items-center gap-3 p-3 rounded-lg bg-white hover:bg-blue-100 border border-gray-200 hover:border-blue-400 transition"
              >
                <div class="w-10 h-10 rounded-full flex items-center justify-center font-bold text-white text-sm overflow-hidden" :class="!(msgAcc.avatarBase64 || msgAcc.zaloAvatarUrl) ? msgAcc.color : ''">
                  <img v-if="msgAcc.avatarBase64" :src="msgAcc.avatarBase64" class="w-full h-full object-cover rounded-full" />
                  <img v-else-if="msgAcc.zaloAvatarUrl" :src="msgAcc.zaloAvatarUrl" class="w-full h-full object-cover rounded-full" referrerpolicy="no-referrer" />
                  <span v-else>{{ getInitials(msgAcc.name) }}</span>
                </div>
                <div class="text-left flex-1">
                  <div class="font-semibold text-gray-800 text-sm">{{ msgAcc.name }}</div>
                  <div class="text-[11px] text-gray-400">{{ msgAcc.zaloDisplayName || 'Messenger' }} • Dùng chung cookie Facebook</div>
                </div>
                <span class="text-blue-500 text-xs font-bold">🔗 Liên kết</span>
              </button>
              <!-- Tùy chọn tạo độc lập -->
              <button
                @click="showFanpagePicker = false; emit('addAccount', 'fanpage')"
                class="w-full flex items-center gap-3 p-3 rounded-lg bg-gray-50 hover:bg-gray-100 border border-dashed border-gray-300 hover:border-gray-400 transition"
              >
                <div class="w-10 h-10 rounded-full flex items-center justify-center font-bold text-white text-sm bg-gray-400">
                  <span>+</span>
                </div>
                <div class="text-left flex-1">
                  <div class="font-semibold text-gray-600 text-sm">Tạo Fanpage độc lập</div>
                  <div class="text-[11px] text-gray-400">Partition riêng, phải đăng nhập Facebook mới</div>
                </div>
              </button>
            </div>
            <button @click="showFanpagePicker = false" class="mt-2 text-xs text-gray-400 hover:text-gray-600">Hủy</button>
          </div>
        </div>

        <!-- ===== TAB 2: CÀI ĐẶT HỆ THỐNG ===== -->
        <div v-if="activeSection === 'system'" class="space-y-6">

          <!-- Section: Thư mục lưu trữ -->
          <div class="border rounded-lg p-5 bg-gray-50/50">
            <h3 class="text-base font-bold text-gray-800 mb-1 flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-blue-500"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>
              Thư mục lưu trữ dữ liệu
            </h3>
            <p class="text-xs text-gray-400 mb-4">Toàn bộ cache Zalo, ảnh, và database sẽ được lưu tại thư mục này. Nên chọn ổ đĩa có dung lượng lớn để tránh tràn ổ C.</p>

            <div class="flex items-center gap-3 mb-3">
              <div class="flex-1 bg-white border border-gray-200 rounded-lg px-4 py-2.5 text-sm font-mono text-gray-600 truncate select-all">
                {{ needsRestart ? newStoragePath : storagePath }}
              </div>
              <button
                @click="handleChangeStorage"
                :disabled="isMigrating"
                class="px-4 py-2.5 bg-white border border-gray-300 rounded-lg text-sm font-semibold text-gray-700 hover:bg-gray-50 hover:border-zalo-primary hover:text-zalo-primary transition flex items-center gap-1.5 flex-shrink-0 disabled:opacity-50 disabled:cursor-wait"
              >
                <template v-if="isMigrating">
                  <svg class="animate-spin h-3.5 w-3.5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Đang chuyển...
                </template>
                <template v-else>
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>
                  Chuyển nhà
                </template>
              </button>
              <button
                @click="handleLoadStorage"
                :disabled="isLoadingStorage"
                class="px-4 py-2.5 bg-white border border-emerald-300 rounded-lg text-sm font-semibold text-emerald-700 hover:bg-emerald-50 hover:border-emerald-500 transition flex items-center gap-1.5 flex-shrink-0 disabled:opacity-50 disabled:cursor-wait"
                title="Kết nối tới thư mục OmniChatData đã có sẵn (ví dụ từ USB hoặc máy tính khác)"
              >
                <template v-if="isLoadingStorage">
                  <svg class="animate-spin h-3.5 w-3.5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Đang kết nối...
                </template>
                <template v-else>
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                  Nạp dữ liệu
                </template>
              </button>
            </div>

            <!-- Migration Error -->
            <div v-if="migrationError" class="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg p-3 mt-2 mb-2">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-red-500 flex-shrink-0"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>
              <p class="text-sm text-red-700 flex-1">{{ migrationError }}</p>
            </div>

            <!-- Load Storage Error -->
            <div v-if="loadStorageError" class="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg p-3 mt-2 mb-2">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-red-500 flex-shrink-0"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>
              <p class="text-sm text-red-700 flex-1">{{ loadStorageError }}</p>
            </div>

            <!-- Restart Banner -->
            <div v-if="needsRestart" class="flex flex-col gap-2 bg-emerald-50 border border-emerald-200 rounded-lg p-4 mt-2">
              <div class="flex items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-emerald-600 flex-shrink-0"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
                <p v-if="loadStorageSuccess" class="text-sm font-bold text-emerald-800">✅ Đã kết nối dữ liệu thành công!</p>
                <p v-else class="text-sm font-bold text-emerald-800">✅ Đã chuyển phiên đăng nhập thành công!</p>
              </div>
              <p v-if="loadStorageSuccess" class="text-xs text-emerald-700 ml-7">Ứng dụng sẽ sử dụng dữ liệu từ thư mục đã chọn. Vui lòng khởi động lại để áp dụng.</p>
              <p v-else class="text-xs text-emerald-700 ml-7">Phiên đăng nhập Zalo đã được sao chép sang thư mục mới. Tin nhắn cũ sẽ được Zalo tự động đồng bộ lại sau khi khởi động.</p>
              <div class="ml-7 mt-1">
                <button
                  @click="handleRestart"
                  class="px-5 py-2 bg-emerald-600 text-white rounded-lg text-sm font-bold hover:bg-emerald-700 transition shadow-sm"
                >
                  🔄 Khởi động lại ngay
                </button>
              </div>
            </div>
          </div>

          <!-- Section: Thông báo -->
          <div class="border rounded-lg p-5 bg-gray-50/50">
            <h3 class="text-base font-bold text-gray-800 mb-1 flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-blue-500"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.73 21a2 2 0 0 1-3.46 0"></path></svg>
              Thông báo
            </h3>
            <p class="text-xs text-gray-400 mb-4">Cấu hình cách ứng dụng thông báo khi có tin nhắn mới.</p>

            <div class="space-y-4">
              <!-- Toggle: Windows Notification -->
              <div class="flex items-center justify-between">
                <div>
                  <p class="text-sm font-semibold text-gray-700">Hiển thị thông báo Windows</p>
                  <p class="text-xs text-gray-400 mt-0.5">Bật/tắt popup thông báo Windows Desktop khi có khách nhắn tin mới</p>
                </div>
                <button
                  @click="emit('update:notificationEnabled', !notificationEnabled)"
                  class="relative w-12 h-7 rounded-full transition-colors duration-200 focus:outline-none flex-shrink-0"
                  :class="notificationEnabled ? 'bg-zalo-primary' : 'bg-gray-300'"
                >
                  <span
                    class="absolute top-0.5 left-0.5 w-6 h-6 bg-white rounded-full shadow-md transition-transform duration-200"
                    :class="notificationEnabled ? 'translate-x-5' : 'translate-x-0'"
                  ></span>
                </button>
              </div>

              <div class="border-t border-gray-100"></div>

              <!-- Toggle: Sound -->
              <div class="flex items-center justify-between">
                <div>
                  <p class="text-sm font-semibold text-gray-700">Âm thanh thông báo</p>
                  <p class="text-xs text-gray-400 mt-0.5">Phát tiếng "ting" khi có tin nhắn mới trên bất kỳ tài khoản nào</p>
                </div>
                <button
                  @click="emit('update:soundEnabled', !soundEnabled)"
                  class="relative w-12 h-7 rounded-full transition-colors duration-200 focus:outline-none flex-shrink-0"
                  :class="soundEnabled ? 'bg-zalo-primary' : 'bg-gray-300'"
                >
                  <span
                    class="absolute top-0.5 left-0.5 w-6 h-6 bg-white rounded-full shadow-md transition-transform duration-200"
                    :class="soundEnabled ? 'translate-x-5' : 'translate-x-0'"
                  ></span>
                </button>
              </div>

              <div class="border-t border-gray-100"></div>

              <!-- Kiểm tra cập nhật thủ công -->
              <div class="space-y-3">
                <div class="flex items-center justify-between">
                  <div>
                    <p class="text-sm font-semibold text-gray-700">Phiên bản ứng dụng</p>
                    <p class="text-xs text-gray-400 mt-0.5">Đang sử dụng phiên bản <span class="font-bold text-gray-600">V1.8.1</span></p>
                  </div>
                  <button
                    @click="handleCheckUpdate"
                    :disabled="updateCheckState === 'checking'"
                    class="px-4 py-2 bg-blue-50 border border-blue-200 rounded-lg text-sm font-semibold text-blue-600 hover:bg-blue-100 hover:border-blue-400 transition flex items-center gap-1.5 flex-shrink-0 disabled:opacity-50 disabled:cursor-wait"
                  >
                    <svg 
                      xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"
                      :class="updateCheckState === 'checking' ? 'animate-spin' : ''"
                    >
                      <polyline points="23 4 23 10 17 10"></polyline>
                      <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
                    </svg>
                    <span v-if="updateCheckState === 'checking'">Đang kiểm tra...</span>
                    <span v-else>Kiểm tra cập nhật</span>
                  </button>
                </div>

                <!-- Kết quả: Đã mới nhất -->
                <div v-if="updateCheckState === 'up-to-date'" class="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-lg p-3 transition-all">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="text-emerald-600 flex-shrink-0">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                    <polyline points="22 4 12 14.01 9 11.01"></polyline>
                  </svg>
                  <p class="text-sm font-semibold text-emerald-700">✅ Ứng dụng đang ở phiên bản mới nhất!</p>
                </div>

                <!-- Kết quả: Có bản mới -->
                <div v-if="updateCheckState === 'has-update'" class="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-2 transition-all">
                  <p class="text-sm font-bold text-blue-800">🎉 Đã có phiên bản mới: <span class="text-blue-600">v{{ updateData.version }}</span></p>
                  <p v-if="updateData.changelog" class="text-xs text-blue-600">{{ updateData.changelog }}</p>
                  <div class="flex gap-2 mt-2">
                    <a v-if="updateData.win_url" :href="updateData.win_url" target="_blank" class="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-bold hover:bg-blue-700 transition flex items-center gap-1">
                      <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect><line x1="8" y1="21" x2="16" y2="21"></line><line x1="12" y1="17" x2="12" y2="21"></line></svg>
                      Tải Windows
                    </a>
                    <a v-if="updateData.mac_url" :href="updateData.mac_url" target="_blank" class="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-bold hover:bg-blue-700 transition flex items-center gap-1">
                      <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20.94c1.5 0 2.75 1.06 4 1.06 3 0 6-8 6-12.22A4.91 4.91 0 0 0 17 5c-2.22 0-4 1.44-5 2-1-.56-2.78-2-5-2a4.9 4.9 0 0 0-5 4.78C2 14 5 22 8 22c1.25 0 2.5-1.06 4-1.06Z"></path><path d="M10 2c1 .5 2 2 2 5"></path></svg>
                      Tải Macbook
                    </a>
                  </div>
                </div>

                <!-- Kết quả: Lỗi -->
                <div v-if="updateCheckState === 'error'" class="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg p-3">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-red-500 flex-shrink-0"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>
                  <p class="text-sm text-red-700">Không thể kết nối tới máy chủ cập nhật. Vui lòng thử lại.</p>
                </div>
              </div>
            </div>
          </div>

        </div>

        <!-- ===== TAB 3: TIN NHẮN MẪU (SNIPPETS) ===== -->
        <div v-if="activeSection === 'snippets'" class="space-y-6">
          
          <h2 class="text-lg font-bold text-gray-800">{{ isEditingSnippetId ? 'Sửa tin nhắn nhanh' : 'Tạo tin nhắn nhanh' }}</h2>

          <!-- Form Thêm Mới Chuẩn Zalo -->
          <div class="border border-gray-300 rounded-lg bg-white overflow-hidden shadow-sm">
            <!-- Header: Phím tắt -->
            <div class="flex items-center gap-2 border-b border-gray-300 px-3 py-2 bg-white">
              <div class="bg-gray-200 text-gray-600 font-bold px-3 py-1 rounded text-sm select-none">\</div>
              <input type="text" v-model="snippetForm.shortcut" class="flex-1 bg-transparent border-none outline-none text-sm py-1 font-mono text-gray-700" placeholder="Phím tắt (Ví dụ: xinchao)" maxlength="20" @keyup.enter="handleSaveSnippet">
              <span class="text-xs text-gray-400 font-mono">{{ snippetForm.shortcut.length }}/20</span>
            </div>
            
            <!-- Body: Nội dung -->
            <div class="p-0 border-b border-gray-200">
              <textarea v-model="snippetForm.content" class="w-full bg-transparent border-none outline-none text-sm p-4 resize-none h-32 text-gray-800 placeholder-gray-400 leading-relaxed" placeholder="Nhập nội dung tin nhắn"></textarea>
            </div>
            
            <!-- Footer: Hình ảnh & Actions -->
            <div class="flex flex-col gap-3 p-3 bg-white border-t border-gray-100">
              
              <!-- Image Previews Horizontal list -->
              <div v-if="snippetForm.images.length > 0" class="flex flex-wrap gap-2 px-1">
                <div v-for="(img, idx) in snippetForm.images" :key="idx" class="relative group">
                  <img :src="img" class="h-16 w-16 object-cover rounded border border-gray-200 shadow-sm">
                  <button @click="handleRemoveSnippetImage(idx)" class="absolute -top-1.5 -right-1.5 bg-red-500 hover:bg-red-600 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition shadow" title="Xóa ảnh">
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                  </button>
                </div>
              </div>

              <div class="flex justify-between items-center mt-1">
                <!-- Nút Thêm Ảnh -->
                <div class="flex items-center gap-3">
                  <button v-if="snippetForm.images.length < 6" class="px-3.5 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-semibold rounded-full flex items-center gap-1.5 transition" @click="$refs.snippetImageInput && ($refs.snippetImageInput as any).click()">
                    <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>
                    Thêm ảnh {{ snippetForm.images.length > 0 ? `(${snippetForm.images.length}/6)` : '' }}
                  </button>
                  <input type="file" ref="snippetImageInput" class="hidden" accept="image/*" multiple @change="handleSnippetImageUpload">
                </div>

                <!-- Buttons Hủy / Thêm -->
                <div class="flex gap-2">
                  <button @click="handleCancelEdit" class="px-5 py-2 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded font-semibold text-sm transition">Hủy</button>
                  <button @click="handleSaveSnippet" :disabled="!snippetForm.shortcut || (!snippetForm.content && snippetForm.images.length === 0)" class="px-5 py-2 bg-blue-400 hover:bg-blue-500 text-white rounded font-bold text-sm transition disabled:opacity-50 disabled:cursor-not-allowed">
                    {{ isEditingSnippetId ? 'Lưu' : 'Thêm' }}
                  </button>
                </div>
              </div>
            </div>
          </div>

          <!-- Danh sách Mẫu -->
          <div class="border rounded-lg overflow-hidden border-gray-200">
            <div class="bg-gray-50 px-4 py-3 border-b border-gray-200 flex justify-between items-center">
              <h3 class="text-sm font-bold text-gray-700 flex items-center gap-2">
                Kho lưu trữ mẫu ({{ snippets.length }})
              </h3>
            </div>
            <div class="bg-white">
              <div v-if="snippets.length === 0" class="p-8 text-center flex flex-col items-center justify-center border-t border-gray-50">
                 <div class="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-3">
                   <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="text-gray-400"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
                 </div>
                 <p class="text-sm font-semibold text-gray-600">Trống</p>
                 <p class="text-xs text-gray-400 mt-1 max-w-[250px]">Chưa có mẫu nào. Hãy thêm một mẫu mới ở trên để tăng tốc độ trả lời khách hàng nhé.</p>
              </div>
              <ul v-else class="divide-y divide-gray-100 max-h-[260px] overflow-y-auto">
                <li v-for="snip in snippets" :key="snip.id" class="p-3.5 hover:bg-blue-50/30 transition flex items-start gap-4">
                  <div class="text-sm font-mono font-bold text-gray-700 bg-gray-100 border border-gray-200 shadow-inner px-2 py-1 rounded w-20 flex-shrink-0 text-center select-all flex items-center justify-center gap-0.5">
                    <span class="text-gray-400 font-normal">\</span>{{ snip.shortcut }}
                  </div>
                  <div class="flex-1 min-w-0 pt-0.5">
                    <p v-if="snip.content" class="text-sm text-gray-700 whitespace-pre-wrap break-words line-clamp-3 leading-relaxed opacity-90" :title="snip.content">{{ snip.content }}</p>
                    <div v-if="snip.imagePaths && snip.imagePaths.length > 0" class="mt-1 flex items-center gap-1.5 text-xs text-blue-500 font-semibold">
                      <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>
                      Đính kèm {{ snip.imagePaths.length }} ảnh
                    </div>
                  </div>
                  <div class="flex flex-col gap-1 items-center">
                    <button @click="handleEditSnippet(snip)" class="p-1.5 text-blue-500 bg-white border border-blue-100 hover:bg-blue-50 hover:border-blue-200 rounded-md transition shadow-sm" title="Sửa">
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                    </button>
                    <button @click="emit('deleteSnippet', snip.id!)" class="p-1.5 text-red-500 bg-white border border-red-100 hover:bg-red-50 hover:border-red-200 rounded-md transition shadow-sm" title="Xóa">
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                    </button>
                  </div>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      <!-- Footer -->
      <div class="px-6 py-4 bg-gray-50 border-t border-gray-100 flex justify-end">
        <button @click="emit('close')" class="px-6 py-2 bg-zalo-primary text-white font-semibold rounded-lg hover:bg-blue-700 transition focus:outline-none shadow-sm">
          Hoàn tất
        </button>
      </div>
    </div>
  </div>
</template>
