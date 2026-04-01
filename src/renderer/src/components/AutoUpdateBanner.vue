<script setup lang="ts">
import { ref, onMounted } from 'vue'

const CURRENT_VERSION = 1.3 // Số phiên bản hiện hành

const hasUpdate = ref(false)
const updateInfo = ref({
  version: '',
  mac_url: '',
  win_url: '',
  changelog: ''
})

const isDismissed = ref(false)

onMounted(async () => {
  try {
    // Sử dụng link RAW của Gitlab dự án Stepwell OmniChat (đã check: đang Public)
    const response = await fetch('https://gitlab.com/stepwellvietnam/chatportal/-/raw/main/version.json', { cache: 'no-store' })
    if (response.ok) {
      const data = await response.json()
      const remoteVersion = parseFloat(data.version)
      
      // So sánh phiên bản (VD: 1.3 > 1.2)
      if (remoteVersion > CURRENT_VERSION) {
        updateInfo.value = data
        hasUpdate.value = true
      }
    }
  } catch (error) {
    console.log('OmniChat: Không tìm thấy bản cập nhật mới.')
  }
})

const dismiss = () => {
  isDismissed.value = true
}
</script>

<template>
  <div 
    v-if="hasUpdate && !isDismissed" 
    class="bg-blue-600 text-white px-4 py-3 flex items-center justify-between z-50 relative drop-shadow-lg"
  >
    <div class="flex items-center space-x-3">
      <div class="bg-white/20 p-2 rounded-full hidden sm:block">
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
          <polyline points="7 10 12 15 17 10"></polyline>
          <line x1="12" y1="15" x2="12" y2="3"></line>
        </svg>
      </div>
      <div>
        <p class="font-bold text-sm tracking-wide">Đã có OmniChat bản mới — VỊ NHỮNG {{ updateInfo.version }}</p>
        <p class="text-[13px] text-blue-100 mt-0.5 line-clamp-1 max-w-xl">{{ updateInfo.changelog }}</p>
      </div>
    </div>
    
    <div class="flex items-center space-x-2 shrink-0">
      <a 
        v-if="updateInfo.win_url"
        :href="updateInfo.win_url"
        target="_blank" 
        class="bg-white text-blue-700 hover:bg-gray-100 px-3 py-1.5 rounded font-bold text-sm transition-colors flex items-center gap-1.5 shadow"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect><line x1="8" y1="21" x2="16" y2="21"></line><line x1="12" y1="17" x2="12" y2="21"></line></svg>
        Windows
      </a>
      
      <a 
        v-if="updateInfo.mac_url"
        :href="updateInfo.mac_url"
        target="_blank" 
        class="bg-white text-blue-700 hover:bg-gray-100 px-3 py-1.5 rounded font-bold text-sm transition-colors flex items-center gap-1.5 shadow"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20.94c1.5 0 2.75 1.06 4 1.06 3 0 6-8 6-12.22A4.91 4.91 0 0 0 17 5c-2.22 0-4 1.44-5 2-1-.56-2.78-2-5-2a4.9 4.9 0 0 0-5 4.78C2 14 5 22 8 22c1.25 0 2.5-1.06 4-1.06Z"></path><path d="M10 2c1 .5 2 2 2 5"></path></svg>
        Macbook
      </a>

      <button 
        @click="dismiss" 
        class="ml-2 text-white hover:text-white p-1.5 rounded hover:bg-white/10 transition-colors"
        title="Bỏ qua nhắc nhở"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
      </button>
    </div>
  </div>
</template>
