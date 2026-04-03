<script setup lang="ts">
import { computed } from 'vue'
import type { Account, Platform } from '../types'
import { PLATFORMS } from '../types'
import { getInitials } from '../utils'

const props = defineProps<{
  visibleAccounts: Account[]
  activeTab: string
  unreadCounts: Record<string, number>
  totalUnreadAll: number
  hasNewMessage: Record<string, boolean>
}>()

const emit = defineEmits<{
  selectTab: [id: string]
  openSettings: []
  quitApp: []
}>()

// Group accounts by platform
const groupedAccounts = computed(() => {
  const groups: { platform: Platform; accounts: Account[] }[] = []
  const seen = new Set<Platform>()
  for (const acc of props.visibleAccounts) {
    const p = acc.platform || 'zalo'
    if (!seen.has(p)) {
      seen.add(p)
      groups.push({ platform: p, accounts: [] })
    }
    groups.find(g => g.platform === p)!.accounts.push(acc)
  }
  return groups
})
</script>

<template>
  <aside class="w-16 h-full bg-zalo-bg-sidebar flex flex-col items-center py-4 gap-2 flex-shrink-0 border-r border-zalo-bg-sidebar-icon z-10 relative overflow-y-auto">

    <template v-for="(group, gi) in groupedAccounts" :key="group.platform">
      <!-- Platform separator between groups -->
      <div v-if="gi > 0" class="w-8 border-t border-white/20 my-1"></div>

      <!-- Accounts in this group -->
      <div
        v-for="acc in group.accounts"
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

        <!-- Bell icon (new message) -->
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

        <!-- Platform badge (bottom-left) -->
        <div
          class="absolute -bottom-0.5 -left-0.5 w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold text-white z-20 pointer-events-none border border-[#0056cc]"
          :class="PLATFORMS[acc.platform || 'zalo']?.color || 'bg-gray-500'"
        >{{ PLATFORMS[acc.platform || 'zalo']?.icon || '?' }}</div>

        <!-- Active dot -->
        <div
          v-if="activeTab === acc.id"
          class="absolute bottom-0 right-0 w-3 h-3 bg-green-400 rounded-full border-2 border-[#0056cc] z-20 pointer-events-none"
        ></div>
      </div>
    </template>

    <!-- Settings Icon (biểu tượng lưới — khác biệt với cài đặt Zalo) -->
    <div class="mt-auto flex flex-col items-center gap-1.5 pb-1">
      <button @click="emit('openSettings')" class="w-11 h-11 rounded-xl hover:bg-zalo-bg-sidebar-icon flex items-center justify-center text-white/80 hover:text-white focus:outline-none transition" title="Quản lý tài khoản">
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>
      </button>
      <button @click="emit('quitApp')" class="w-11 h-11 rounded-xl hover:bg-red-500/30 flex items-center justify-center text-white/50 hover:text-red-300 focus:outline-none transition" title="Thoát ứng dụng">
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>
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
