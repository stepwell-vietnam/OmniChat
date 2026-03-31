// ===== STEPWELL OMNICHAT — TYPE DEFINITIONS =====

/** Tài khoản Zalo trong hệ thống */
export interface Account {
  id: string
  name: string
  avatarBase64?: string       // Avatar do user upload thủ công (ưu tiên cao nhất)
  zaloAvatarUrl?: string      // Avatar tự động scrape từ Zalo Web (ưu tiên 2)
  zaloDisplayName?: string    // Tên hiển thị tự động lấy từ Zalo
  color: string
  isHidden: boolean
  unread: number              // Runtime-only: số tin chưa đọc từ Webview
}

/** Hội thoại đã scrape từ Zalo */
export interface Conversation {
  id: string
  name: string
  lastMessage: string
  time: string
  avatar: string
  unread: number
  zaloId: string
  zaloName: string
  zaloColor: string
}

/** Tin nhắn trong 1 phòng chat */
export interface ChatMessage {
  id: string
  text: string
  isSender: boolean
  time: string
}
