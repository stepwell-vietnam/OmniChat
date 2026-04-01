// ===== STEPWELL OMNICHAT — TYPE DEFINITIONS =====

export type Platform = 'zalo' | 'whatsapp' | 'messenger'

/** Platform configuration */
export const PLATFORMS: Record<Platform, { name: string; url: string; color: string; icon: string }> = {
  zalo: { name: 'Zalo', url: 'https://chat.zalo.me', color: 'bg-blue-600', icon: 'Z' },
  whatsapp: { name: 'WhatsApp', url: 'https://web.whatsapp.com', color: 'bg-green-600', icon: 'W' },
  messenger: { name: 'Messenger', url: 'https://www.messenger.com', color: 'bg-purple-600', icon: 'M' }
}

/** Account in the system */
export interface Account {
  id: string
  name: string
  platform: Platform
  avatarBase64?: string
  zaloAvatarUrl?: string
  zaloDisplayName?: string
  color: string
  isHidden: boolean
  unread: number
}
