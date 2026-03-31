#!/bin/bash

# ========================================================
#    STEPWELL OMNICHAT — KHỞI ĐỘNG LẠI DỰ ÁN (macOS)
# ========================================================

# Lấy đường dẫn thư mục chứa file này
DIR="$(cd "$(dirname "$0")" && pwd)"

echo ""
echo "========================================================"
echo "   STEPWELL OMNICHAT — KHỞI ĐỘNG LẠI DỰ ÁN"
echo "========================================================"
echo ""
echo "🔍 Đang tìm và tắt tiến trình cũ..."

# Kill Electron processes
pkill -f "electron.*omnichat" 2>/dev/null && echo "   ✅ Đã tắt Electron cũ" || echo "   ⏭️  Không có Electron cũ"

# Kill Vite dev server (port 5173)
lsof -ti:5173 | xargs kill -9 2>/dev/null && echo "   ✅ Đã giải phóng port 5173" || echo "   ⏭️  Port 5173 đã trống"

# Kill any node process related to omnichat
pkill -f "node.*omnichat" 2>/dev/null && echo "   ✅ Đã tắt Node.js cũ" || echo "   ⏭️  Không có Node.js cũ"

# Chờ 1 giây cho process clean up
sleep 1

echo ""
echo "🚀 Đang khởi động lại OmniChat..."
echo "   📂 Thư mục: $DIR"
echo "   ⚠️  Không đóng cửa sổ Terminal này khi đang sử dụng!"
echo "========================================================"
echo ""

# Chuyển vào thư mục dự án và chạy
cd "$DIR"
npm run dev
