<script setup lang="ts">
import { ref } from 'vue'
import type { Account, Platform } from '../types'
import { PLATFORMS } from '../types'
import { getInitials } from '../utils'

const props = defineProps<{
  show: boolean
  accounts: Account[]
  soundEnabled: boolean
  notificationEnabled: boolean
  storagePath: string
}>()

const emit = defineEmits<{
  close: []
  addAccount: [platform: Platform]
  toggleVisibility: [id: string]
  updateName: [id: string, name: string]
  uploadAvatar: [id: string, data: string]
  'update:soundEnabled': [val: boolean]
  'update:notificationEnabled': [val: boolean]
  changeStoragePath: []
  restartApp: []
}>()

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

const handleRestart = () => {
  window.api.restartApp()
}

// Active tab
const activeSection = ref<'accounts' | 'system'>('accounts')
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
            Tài khoản Zalo
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
      </div>

      <!-- Content -->
      <div class="flex-1 overflow-y-auto p-6 bg-white">

        <!-- ===== TAB 1: QUẢN LÝ TÀI KHOẢN ===== -->
        <div v-if="activeSection === 'accounts'" class="space-y-4">
          <div
            v-for="acc in accounts"
            :key="acc.id"
            class="flex items-center gap-4 p-4 border rounded-lg bg-gray-50/50 hover:bg-white transition shadow-sm"
            :class="acc.isHidden ? 'opacity-50' : ''"
          >
            <!-- Avatar Upload -->
            <div class="relative group w-14 h-14 rounded-full flex-shrink-0 cursor-pointer overflow-hidden border-2 border-white shadow-sm flex items-center justify-center font-bold text-white text-xl" :class="!(acc.avatarBase64 || acc.zaloAvatarUrl) ? acc.color : ''">
              <img v-if="acc.avatarBase64" :src="acc.avatarBase64" class="w-full h-full object-cover" />
              <img v-else-if="acc.zaloAvatarUrl" :src="acc.zaloAvatarUrl" class="w-full h-full object-cover" referrerpolicy="no-referrer" />
              <span v-else>{{ getInitials(acc.name) }}</span>

              <label class="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition cursor-pointer" title="Upload Avatar (ghi đè ảnh Zalo)">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-white"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
                <input type="file" accept="image/*" class="hidden" @change="(e: Event) => handleAvatarUpload(e, acc.id)" />
              </label>
            </div>

            <!-- Name & Info -->
            <div class="flex-1 min-w-0">
              <input
                type="text"
                :value="acc.name"
                @input="emit('updateName', acc.id, ($event.target as HTMLInputElement).value)"
                class="font-semibold text-gray-800 text-lg bg-transparent border-b border-transparent hover:border-gray-300 focus:border-zalo-primary focus:outline-none py-0.5 w-full transition truncate"
                placeholder="Nhập tên gọi nhớ (VD: Zalo Bán Hàng)"
              />
              <div class="text-xs text-gray-400 mt-1 flex items-center gap-2 flex-wrap">
                <span class="px-1.5 py-0.5 rounded text-[10px] font-bold text-white" :class="PLATFORMS[acc.platform || 'zalo']?.color || 'bg-gray-500'">{{ PLATFORMS[acc.platform || 'zalo']?.name || 'Unknown' }}</span>
                <span class="truncate">Partition: <code class="bg-gray-200 px-1 py-0.5 rounded text-[10px] text-gray-500 font-mono">persist:{{ acc.platform || 'zalo' }}_{{ acc.id }}</code></span>
                <span v-if="acc.zaloDisplayName" class="text-blue-500">• Zalo: {{ acc.zaloDisplayName }}</span>
                <span v-if="acc.zaloAvatarUrl" class="text-green-500">• Ảnh tự động ✓</span>
                <span v-if="acc.unread > 0" class="text-red-500 font-bold">• {{ acc.unread }} chưa đọc</span>
              </div>
            </div>

            <!-- Toggle Visibility -->
            <div class="flex items-center gap-2 flex-shrink-0">
              <button
                @click="emit('toggleVisibility', acc.id)"
                class="px-3 py-1.5 rounded-md text-sm font-medium transition flex items-center gap-1.5"
                :class="acc.isHidden ? 'bg-indigo-50 text-indigo-600 hover:bg-indigo-100' : 'bg-orange-50 text-orange-600 hover:bg-orange-100'"
              >
                <template v-if="acc.isHidden">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                  Bật Lên Lại
                </template>
                <template v-else>
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>
                  Gập Khỏi Menu
                </template>
              </button>
            </div>
          </div>

          <!-- Add Account Buttons -->
          <div class="flex gap-3">
            <button @click="emit('addAccount', 'zalo')" class="flex-1 py-3 border-2 border-dashed border-blue-200 rounded-lg text-blue-600 font-bold hover:border-blue-500 hover:bg-blue-50 transition flex justify-center items-center gap-2 focus:outline-none">
              <span class="w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-xs font-bold">Z</span>
              Zalo
            </button>
            <button @click="emit('addAccount', 'whatsapp')" class="flex-1 py-3 border-2 border-dashed border-green-200 rounded-lg text-green-600 font-bold hover:border-green-500 hover:bg-green-50 transition flex justify-center items-center gap-2 focus:outline-none">
              <span class="w-6 h-6 bg-green-600 text-white rounded-full flex items-center justify-center text-xs font-bold">W</span>
              WhatsApp
            </button>
            <button @click="emit('addAccount', 'messenger')" class="flex-1 py-3 border-2 border-dashed border-purple-200 rounded-lg text-purple-600 font-bold hover:border-purple-500 hover:bg-purple-50 transition flex justify-center items-center gap-2 focus:outline-none">
              <span class="w-6 h-6 bg-purple-600 text-white rounded-full flex items-center justify-center text-xs font-bold">M</span>
              Messenger
            </button>
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
                  Thay đổi
                </template>
              </button>
            </div>

            <!-- Migration Error -->
            <div v-if="migrationError" class="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg p-3 mt-2 mb-2">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-red-500 flex-shrink-0"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>
              <p class="text-sm text-red-700 flex-1">{{ migrationError }}</p>
            </div>

            <!-- Restart Banner -->
            <div v-if="needsRestart" class="flex flex-col gap-2 bg-emerald-50 border border-emerald-200 rounded-lg p-4 mt-2">
              <div class="flex items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-emerald-600 flex-shrink-0"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
                <p class="text-sm font-bold text-emerald-800">✅ Đã chuyển phiên đăng nhập thành công!</p>
              </div>
              <p class="text-xs text-emerald-700 ml-7">Phiên đăng nhập Zalo đã được sao chép sang thư mục mới. Tin nhắn cũ sẽ được Zalo tự động đồng bộ lại sau khi khởi động.</p>
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
