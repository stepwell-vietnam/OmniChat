// ===== STEPWELL OMNICHAT — TYPE DEFINITIONS =====

/** Zalo account in the system */
export interface Account {
  id: string
  name: string
  avatarBase64?: string       // User-uploaded avatar (highest priority)
  zaloAvatarUrl?: string      // Auto-scraped from Zalo Web (priority 2)
  zaloDisplayName?: string    // Auto-scraped display name
  color: string
  isHidden: boolean
  unread: number              // Runtime-only: unread count from webview
}
