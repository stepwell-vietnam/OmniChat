<script setup lang="ts">
import type { Conversation, ChatMessage } from '../types'

defineProps<{
  activeChat: string | null
  activeConversation: Conversation | null
  messages: ChatMessage[]
  activeTab: string
}>()

const emit = defineEmits<{
  openSettings: []
}>()
</script>

<template>
  <!-- Placeholder: Chế độ hợp nhất nhưng chưa chọn chat -->
  <div v-if="activeTab === 'all' && !activeChat" class="flex-1 flex flex-col items-center justify-center bg-gray-50">
    <div class="w-24 h-24 mb-4 opacity-30 bg-blue-100 rounded-2xl flex items-center justify-center text-blue-500">
      <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="9" y1="3" x2="9" y2="21"></line></svg>
    </div>
    <h2 class="text-xl font-bold text-gray-500">Chế độ Hộp thư hợp nhất</h2>
    <p class="text-gray-400 mt-2 text-sm max-w-sm text-center">
      Sếp bấm chọn 1 cuộc hội thoại bên Cột trái để xem nội dung nhé!
    </p>
    <button @click="emit('openSettings')" class="mt-6 px-6 py-2 border-2 border-dashed border-gray-300 rounded-lg text-gray-500 font-semibold hover:border-zalo-primary hover:text-zalo-primary hover:bg-blue-50 transition flex items-center gap-2">
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
      Quản lý Tài Khoản Zalo
    </button>
  </div>

  <!-- Khung chat khi đã chọn hội thoại -->
  <div v-else-if="activeTab === 'all' && activeChat" class="flex-1 flex flex-col bg-[#e6ebf5] relative z-20 w-full overflow-hidden">

    <!-- Header Phiên Chat -->
    <div class="h-16 bg-white border-b border-gray-200 flex flex-col justify-center px-4 flex-shrink-0 shadow-sm z-10">
      <h2 class="font-bold text-lg text-gray-800">{{ activeConversation?.name || 'Khách hàng' }}</h2>
      <span class="text-xs text-gray-500 inline-flex items-center gap-1">
        <div class="w-1.5 h-1.5 rounded-full bg-green-500"></div>
        Nguồn: {{ activeConversation?.zaloName }}
      </span>
    </div>

    <!-- Vùng Tin Nhắn -->
    <div class="flex-1 overflow-y-auto p-4 flex flex-col space-y-3 h-full pb-6">
      <template v-if="messages.length > 0">
        <div v-for="msg in messages" :key="msg.id" class="flex w-full" :class="msg.isSender ? 'justify-end' : 'justify-start'">
          <div
            class="px-3.5 py-2.5 rounded-2xl max-w-[65%] shadow-sm text-[15px] leading-relaxed break-words"
            :class="msg.isSender ? 'bg-[#e5efff] text-black border border-blue-100 rounded-tr-sm' : 'bg-white text-black border border-gray-100 rounded-tl-sm'"
          >
            {{ msg.text }}
          </div>
        </div>
      </template>
      <div v-else class="h-full flex flex-col items-center justify-center">
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-blue-400 mb-2 animate-bounce"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
        <span class="text-gray-400 text-sm">Đang thâm nhập phòng chat... Vui lòng đợi</span>
      </div>
    </div>

    <!-- Khung nhập liệu -->
    <div class="h-[120px] bg-white border-t border-gray-200 p-4 flex flex-col flex-shrink-0 shadow-inner">
      <div class="flex items-center gap-2 mb-2 px-1 text-gray-400">
        <button class="hover:text-blue-500 transition"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"></path></svg></button>
        <button class="hover:text-blue-500 transition"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg></button>
      </div>
      <textarea class="w-full flex-1 resize-none focus:outline-none text-[15px] placeholder-gray-400" placeholder="Nhập tin nhắn @tag hoặc gõ nhanh..."></textarea>
    </div>
  </div>
</template>
