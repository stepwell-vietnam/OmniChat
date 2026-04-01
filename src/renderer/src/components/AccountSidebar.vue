<script setup lang="ts">
import type { Account } from '../types'
import { getInitials } from '../utils'

defineProps<{
  visibleAccounts: Account[]
  activeTab: string
  unreadCounts: Record<string, number>
  totalUnreadAll: number
  hasNewMessage: Record<string, boolean>
}>()

const emit = defineEmits<{
  selectTab: [id: string]
  openSettings: []
}>()
</script>

<template>
  <aside class="w-16 h-full bg-zalo-bg-sidebar flex flex-col items-center py-4 gap-4 flex-shrink-0 border-r border-zalo-bg-sidebar-icon z-10 relative">

    <!-- Danh sách tài khoản Zalo -->
    <div
      v-for="acc in visibleAccounts"
      :key="acc.id"
      class="relative flex-shrink-0"
    >
      <!-- Avatar Button -->
      <button
        class="w-12 h-12 rounded-full flex items-center justify-center font-bold text-lg text-white shadow-sm transition focus:outline-none border-2 overflow-hidden"
        :class="[
          activeTab === acc.id ? 'border-white ring-2 ring-white/50' : 'border-transparent hover:border-gray-300',
          !(acc.avatarBase64 || acc.zaloAvatarUrl) ? acc.color : ''
        ]"
        @click="emit('selectTab', acc.id)"
        :title="acc.name + (acc.zaloDisplayName ? ' (' + acc.zaloDisplayName + ')' : '')"
      >
        <img v-if="acc.avatarBase64" :src="acc.avatarBase64" class="w-full h-full object-cover rounded-full" />
        <img v-else-if="acc.zaloAvatarUrl" :src="acc.zaloAvatarUrl" class="w-full h-full object-cover rounded-full" referrerpolicy="no-referrer" />
        <span v-else>{{ getInitials(acc.name) }}</span>
      </button>

      <!-- 🔔 CHUÔNG VÀNG — Có tin nhắn mới (nhấp nháy + bounce) -->
      <div
        v-if="hasNewMessage[acc.id]"
        class="absolute -top-1 -right-1 w-6 h-6 flex items-center justify-center z-30 pointer-events-none bell-bounce"
      >
        <div class="w-6 h-6 bg-yellow-400 rounded-full flex items-center justify-center shadow-lg border-2 border-white">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="currentColor" class="text-yellow-800">
            <path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.63-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.64 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z"/>
          </svg>
        </div>
      </div>

      <!-- 🟢 Chấm xanh trạng thái khi active -->
      <div
        v-if="activeTab === acc.id"
        class="absolute bottom-0 right-0 w-3 h-3 bg-green-400 rounded-full border-2 border-[#0056cc] z-20 pointer-events-none"
      ></div>
    </div>

    <!-- Settings Icon -->
    <div class="mt-auto relative group">
      <button @click="emit('openSettings')" class="w-12 h-12 rounded-xl hover:bg-zalo-bg-sidebar-icon flex items-center justify-center text-white focus:outline-none" title="Quản lý Tài khoản">
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
      </button>
    </div>
  </aside>
</template>

<style scoped>
.bell-bounce {
  animation: bellBounce 1s ease-in-out infinite;
}

@keyframes bellBounce {
  0%, 100% { transform: translateY(0) rotate(0deg); }
  15% { transform: translateY(-3px) rotate(-10deg); }
  30% { transform: translateY(0) rotate(10deg); }
  45% { transform: translateY(-2px) rotate(-5deg); }
  60% { transform: translateY(0) rotate(5deg); }
  75% { transform: translateY(-1px) rotate(0deg); }
}
</style>
