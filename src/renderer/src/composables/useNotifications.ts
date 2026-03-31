// ===== STEPWELL OMNICHAT — NOTIFICATION COMPOSABLE =====
// Quản lý âm thanh "ting" + Windows Desktop Toast — có toggle tắt/mở

import { ref, watch, type ComputedRef, type Ref } from 'vue'
import type { Account } from '../types'

export function useNotifications(
  soundEnabled: Ref<boolean>,
  notificationEnabled: Ref<boolean>
) {
  const previousUnreadCounts = ref<Record<string, number>>({})

  /** Phát sóng âm thanh "ting" bằng Web Audio API */
  const playNotificationSound = (): void => {
    if (!soundEnabled.value) return  // ← Toggle guard

    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext
      if (!AudioCtx) return
      const ctx = new AudioCtx()
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()

      osc.connect(gain)
      gain.connect(ctx.destination)

      osc.type = 'sine'
      osc.frequency.setValueAtTime(800, ctx.currentTime)
      osc.frequency.exponentialRampToValueAtTime(1200, ctx.currentTime + 0.1)

      gain.gain.setValueAtTime(0, ctx.currentTime)
      gain.gain.linearRampToValueAtTime(0.5, ctx.currentTime + 0.05)
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.2)

      osc.start(ctx.currentTime)
      osc.stop(ctx.currentTime + 0.2)
    } catch (e) {
      console.error('OmniChat: Lỗi phát âm thanh', e)
    }
  }

  /** Xin quyền thông báo Windows khi khởi động */
  const requestPermission = (): void => {
    if (Notification.permission !== 'granted' && Notification.permission !== 'denied') {
      Notification.requestPermission()
    }
  }

  /** Theo dõi thay đổi unread → bắn thông báo */
  const watchUnreadChanges = (
    accounts: Ref<Account[]>,
    unreadCounts: ComputedRef<Record<string, number>>
  ): void => {
    watch(
      unreadCounts,
      (newCounts) => {
        for (const accId in newCounts) {
          const newVal = newCounts[accId] || 0
          const oldVal =
            previousUnreadCounts.value[accId] !== undefined
              ? previousUnreadCounts.value[accId]
              : newVal

          if (newVal > oldVal && Object.keys(previousUnreadCounts.value).length > 0) {
            const acc = accounts.value.find((a) => a.id === accId)
            if (acc) {
              playNotificationSound()
              if (notificationEnabled.value && Notification.permission === 'granted') {  // ← Toggle guard
                new Notification(`📥 Zalo Mới: ${acc.name}`, {
                  body: `Sếp ơi, ${acc.name} vừa có khách nhắn tin! (Tổng: ${newVal} chờ xử lý)`
                })
              }
            }
          }
        }
        previousUnreadCounts.value = { ...newCounts }
      },
      { deep: true, immediate: true }
    )
  }

  return { playNotificationSound, requestPermission, watchUnreadChanges }
}
