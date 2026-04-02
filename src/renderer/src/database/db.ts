// ===== STEPWELL OMNICHAT — DEXIE.JS DATABASE =====
import Dexie, { type Table } from 'dexie'

/** Dữ liệu tài khoản (persistent, không chứa unread count) */
export interface DbAccount {
  id: string
  name: string
  avatarBase64?: string
  zaloAvatarUrl?: string
  zaloDisplayName?: string
  color: string
  isHidden: boolean
}

/** Thẻ phân loại khách hàng (Phase 2) */
export interface DbTag {
  id?: number
  name: string
  color: string
  createdAt: number
}

/** Ghi chú nội bộ cho khách hàng (Phase 2) */
export interface DbCustomerNote {
  id?: number
  conversationId: string
  content: string
  createdAt: number
  updatedAt: number
}

/** Mẫu trả lời nhanh — ảnh lưu dạng file trên ổ cứng */
export interface DbQuickReply {
  id?: number
  shortcut: string
  content: string
  imagePaths?: string[]
  createdAt: number
}

/** Cài đặt ứng dụng (key-value store) */
export interface DbSetting {
  key: string
  value: string
}

export class OmniChatDB extends Dexie {
  accounts!: Table<DbAccount>
  tags!: Table<DbTag>
  customerNotes!: Table<DbCustomerNote>
  quickReplies!: Table<DbQuickReply>
  settings!: Table<DbSetting>

  constructor() {
    super('OmniChatDB')
    // Version 3: thêm settings table
    this.version(3).stores({
      accounts: 'id, name',
      tags: '++id, name',
      customerNotes: '++id, conversationId',
      quickReplies: '++id, shortcut',
      settings: 'key'
    })
  }
}

export const db = new OmniChatDB()

// ===== HELPER: get/set settings =====
export async function getSetting(key: string, defaultValue: string = ''): Promise<string> {
  const row = await db.settings.get(key)
  return row ? row.value : defaultValue
}

export async function setSetting(key: string, value: string): Promise<void> {
  await db.settings.put({ key, value })
}
