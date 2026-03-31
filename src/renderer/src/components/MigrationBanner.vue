<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  show: boolean
  oldPath: string
  oldSizeMB: number
  isDeleting: boolean
}>()

const emit = defineEmits<{
  delete: []
  dismiss: []
}>()

const formattedSize = computed(() => {
  if (props.oldSizeMB >= 1024) {
    return (props.oldSizeMB / 1024).toFixed(1) + ' GB'
  }
  return props.oldSizeMB.toFixed(0) + ' MB'
})
</script>

<template>
  <Transition name="slide-down">
    <div
      v-if="show"
      class="fixed top-0 left-0 right-0 z-[100] flex items-center gap-3 px-5 py-3 shadow-lg border-b"
      style="background: linear-gradient(135deg, #fff7ed 0%, #fef3c7 50%, #fff7ed 100%); border-color: #f59e0b;"
    >
      <!-- Icon -->
      <div class="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0 border border-amber-300">
        <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-amber-600">
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
          <line x1="9" y1="14" x2="15" y2="14"></line>
        </svg>
      </div>

      <!-- Content -->
      <div class="flex-1 min-w-0">
        <p class="text-sm font-bold text-amber-900">
          📦 Dữ liệu cũ vẫn tồn tại trên ổ đĩa
        </p>
        <p class="text-xs text-amber-700 mt-0.5 truncate">
          Thư mục: <code class="bg-amber-100 px-1 py-0.5 rounded text-[11px] font-mono">{{ oldPath }}</code>
          <span class="ml-2 font-semibold">({{ formattedSize }})</span>
        </p>
      </div>

      <!-- Actions -->
      <div class="flex items-center gap-2 flex-shrink-0">
        <!-- Dismiss Button -->
        <button
          @click="emit('dismiss')"
          :disabled="isDeleting"
          class="px-3 py-1.5 bg-white border border-amber-300 rounded-lg text-xs font-semibold text-amber-700 hover:bg-amber-50 transition disabled:opacity-50"
        >
          Để sau
        </button>

        <!-- Delete Button -->
        <button
          @click="emit('delete')"
          :disabled="isDeleting"
          class="px-4 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 disabled:opacity-50"
          :class="isDeleting
            ? 'bg-gray-400 text-white cursor-wait'
            : 'bg-red-500 text-white hover:bg-red-600 shadow-sm'"
        >
          <template v-if="isDeleting">
            <!-- Spinner -->
            <svg class="animate-spin h-3.5 w-3.5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            Đang xóa...
          </template>
          <template v-else>
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              <line x1="10" y1="11" x2="10" y2="17"></line>
              <line x1="14" y1="11" x2="14" y2="17"></line>
            </svg>
            Xóa dữ liệu cũ
          </template>
        </button>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.slide-down-enter-active,
.slide-down-leave-active {
  transition: all 0.4s cubic-bezier(0.22, 1, 0.36, 1);
}
.slide-down-enter-from {
  transform: translateY(-100%);
  opacity: 0;
}
.slide-down-leave-to {
  transform: translateY(-100%);
  opacity: 0;
}
</style>
