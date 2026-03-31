<script setup lang="ts">
import type { Account } from '../types'
import { getInitials } from '../utils'

defineProps<{
  visibleAccounts: Account[]
  activeTab: string
  unreadCounts: Record<string, number>
  totalUnreadAll: number
}>()

const emit = defineEmits<{
  selectTab: [id: string]
  openSettings: []
}>()
</script>

<template>
  <aside class="w-16 h-full bg-zalo-bg-sidebar flex flex-col items-center py-4 gap-4 flex-shrink-0 border-r border-zalo-bg-sidebar-icon z-10 relative">

    <!-- Nút "ALL" (Ẩn theo yêu cầu tạm thời) -->
    <button
      v-show="false"
      class="w-12 h-12 rounded-xl flex items-center justify-center transition focus:outline-none relative"
      :class="activeTab === 'all' ? 'bg-[#003c99]' : 'hover:bg-zalo-bg-sidebar-icon'"
      @click="emit('selectTab', 'all')"
      title="Hộp thư hợp nhất"
    >
      <span class="text-white font-bold text-xs leading-none text-center">Tất<br/>cả</span>
      <div v-if="totalUnreadAll > 0" class="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[10px] font-bold rounded-full h-[18px] min-w-[18px] px-1 flex items-center justify-center border border-white shadow-sm z-20">
        {{ totalUnreadAll > 99 ? '99+' : totalUnreadAll }}
      </div>
    </button>

    <div class="w-10 h-[1px] bg-[#004dc0] my-2"></div>

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

      <!-- 🔴 BADGE ĐỎ NỔI BẬT — Nằm NGOÀI button, không bị cắt -->
      <div
        v-if="unreadCounts[acc.id] > 0"
        class="absolute -top-1.5 -right-1.5 bg-red-500 text-white font-black rounded-full min-w-[24px] h-[24px] px-1 flex items-center justify-center border-2 border-[#0056cc] z-30 pointer-events-none"
        :class="unreadCounts[acc.id] > 9 ? 'text-[10px]' : 'text-[12px]'"
        style="box-shadow: 0 2px 8px rgba(239, 68, 68, 0.7);"
      >
        {{ unreadCounts[acc.id] > 99 ? '99+' : (unreadCounts[acc.id] > 9 ? '9+' : unreadCounts[acc.id]) }}
      </div>

      <!-- 🟢 Chấm xanh trạng thái -->
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
