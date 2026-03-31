<script setup lang="ts">
import { ref, computed } from 'vue'
import type { Conversation } from '../types'
import { getInitials } from '../utils'

const props = defineProps<{
  conversations: Conversation[]
  activeChat: string | null
}>()

const emit = defineEmits<{
  openChat: [conv: Conversation]
}>()

const searchQuery = ref('')

const filtered = computed(() => {
  if (!searchQuery.value.trim()) return props.conversations
  const q = searchQuery.value.toLowerCase()
  return props.conversations.filter(
    (c) => c.name.toLowerCase().includes(q) || c.lastMessage.toLowerCase().includes(q)
  )
})
</script>

<template>
  <section class="w-[300px] bg-zalo-bg flex flex-col border-r border-zalo-border flex-shrink-0 z-0">
    <!-- Thanh tìm kiếm -->
    <div class="h-16 flex items-center px-4 border-b border-zalo-border">
      <input
        v-model="searchQuery"
        type="text"
        placeholder="Tìm kiếm trên tất cả Zalo..."
        class="w-full bg-[#eaedf0] text-[13px] rounded-md px-3 py-1.5 focus:outline-none focus:bg-white focus:ring-1 focus:ring-zalo-primary transition-colors"
      />
    </div>

    <!-- Danh sách hội thoại -->
    <div class="flex-1 overflow-y-auto">
      <template v-if="filtered.length > 0">
        <div
          v-for="conv in filtered"
          :key="conv.id"
          class="h-[76px] flex items-center px-4 hover:bg-zalo-bg-hover cursor-pointer border-b border-gray-100 transition-colors relative"
          :class="activeChat === conv.id ? 'bg-zalo-bg-hover' : ''"
          @click="emit('openChat', conv)"
        >
          <!-- Avatar -->
          <div class="relative w-12 h-12 flex-shrink-0 mr-3 mt-1">
            <img v-if="conv.avatar.startsWith('http')" :src="conv.avatar" class="w-full h-full object-cover rounded-full border border-gray-200" />
            <div v-else class="w-full h-full bg-blue-100 rounded-full flex items-center justify-center text-blue-600 font-bold border border-blue-200">
              {{ getInitials(conv.name) }}
            </div>
            <div v-if="conv.unread > 0" class="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center border border-white z-10">!</div>
          </div>

          <!-- Nội dung -->
          <div class="flex-1 min-w-0 mt-3 relative">
            <div class="flex justify-between w-full items-baseline">
              <div class="flex items-center gap-1.5 min-w-0 pr-2">
                <span class="font-semibold text-[15px] text-gray-800 truncate" style="max-width: 110px;">{{ conv.name }}</span>
                <span class="text-[8px] px-1 py-0.5 rounded text-white font-bold opacity-90 shadow-sm flex-shrink-0" :class="conv.zaloColor">
                  {{ conv.zaloName }}
                </span>
              </div>
              <span class="text-[11px] text-gray-400 font-medium whitespace-nowrap">{{ conv.time }}</span>
            </div>
            <div class="mt-0.5 text-[13px] text-gray-500 truncate" :class="conv.unread > 0 ? 'font-bold text-gray-800' : ''">
              {{ conv.lastMessage }}
            </div>
          </div>
        </div>
      </template>

      <!-- Empty state -->
      <div v-else class="h-full flex flex-col items-center justify-center p-4">
        <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="text-gray-300 mb-2 animate-pulse"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
        <p class="text-[13px] text-gray-400 text-center leading-relaxed">Đang dò quét tin nhắn từ các Phân vùng Zalo...</p>
      </div>
    </div>
  </section>
</template>
