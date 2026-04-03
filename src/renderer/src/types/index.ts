// ===== STEPWELL OMNICHAT — TYPE DEFINITIONS =====

export type Platform = 'zalo' | 'whatsapp' | 'messenger' | 'shopee' | 'tiktok' | 'fanpage'

/** Platform configuration */
export const PLATFORMS: Record<Platform, { name: string; url: string; color: string; icon: string }> = {
  zalo: { name: 'Zalo', url: 'https://chat.zalo.me', color: 'bg-blue-600', icon: 'Z' },
  whatsapp: { name: 'WhatsApp', url: 'https://web.whatsapp.com', color: 'bg-green-600', icon: 'W' },
  messenger: { name: 'Messenger', url: 'https://www.messenger.com', color: 'bg-purple-600', icon: 'M' },
  shopee: { name: 'Shopee', url: 'https://seller.shopee.vn/webchat', color: 'bg-orange-500', icon: 'S' },
  tiktok: { name: 'TikTok', url: 'https://seller-vn.tiktok.com/chat/', color: 'bg-black', icon: 'T' },
  fanpage: { name: 'Fanpage', url: 'https://business.facebook.com/latest/inbox/', color: 'bg-blue-800', icon: 'F' }
}

/** Account in the system */
export interface Account {
  id: string
  slot?: number
  linkedToId?: string  // Fanpage liên kết với Messenger account nào
  name: string
  platform: Platform
  avatarBase64?: string
  zaloAvatarUrl?: string
  zaloDisplayName?: string
  color: string
  isHidden: boolean
  unread: number
}
