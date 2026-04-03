// ===== STEPWELL OMNICHAT — NOTIFICATION COMPOSABLE (Optimized) =====
import { ref, watch, type ComputedRef, type Ref } from 'vue'
import type { Account } from '../types'

export function useNotifications(
  soundEnabled: Ref<boolean>,
  _notificationEnabled: Ref<boolean>
) {
  const previousUnreadCounts = ref<Record<string, number>>({})

  /** Play "ting" sound via Web Audio API */
  const playNotificationSound = (): void => {
    if (!soundEnabled.value) return

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
    } catch (e) { /* silent */ }
  }

  /** Request notification permission */
  const requestPermission = (): void => {
    if (Notification.permission !== 'granted' && Notification.permission !== 'denied') {
      Notification.requestPermission()
    }
  }

  /** Watch unread changes -> trigger callback (for bell icon) */
  const watchUnreadChanges = (
    _accounts: Ref<Account[]>,
    unreadCounts: ComputedRef<Record<string, number>>,
    onNewMessage?: (accId: string) => void
  ): void => {
    watch(
      unreadCounts,
      (newCounts) => {
        const hasPrev = Object.keys(previousUnreadCounts.value).length > 0
        for (const accId in newCounts) {
          const newVal = newCounts[accId] || 0
          const oldVal = previousUnreadCounts.value[accId] !== undefined
            ? previousUnreadCounts.value[accId]
            : newVal

          if (newVal > oldVal && hasPrev) {
            onNewMessage?.(accId)
          }
        }
        previousUnreadCounts.value = { ...newCounts }
      },
      { deep: true, immediate: true }
    )
  }

  return { playNotificationSound, requestPermission, watchUnreadChanges }
}
