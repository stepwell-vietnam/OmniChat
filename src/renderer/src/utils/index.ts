// ===== STEPWELL OMNICHAT — UTILITY FUNCTIONS =====

/** Lấy 2 ký tự đầu làm avatar text */
export function getInitials(name: string): string {
  return name.substring(0, 2).toUpperCase()
}

/** Bảng màu xoay vòng cho tài khoản mới */
export const ACCOUNT_COLORS = [
  'bg-blue-600',
  'bg-green-600',
  'bg-purple-600',
  'bg-orange-600',
  'bg-red-600'
]
