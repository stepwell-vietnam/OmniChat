Phase 1:
- Tạo màn hình đăng nhập QR
- Tạo giao diện Zalo web từng TK
- Tính năng thông báo tin nhắn mới
- Tính năng chuyển đổi thư mục lưu data chống tràn ổ hệ điều hành
- Hiệu chỉnh tính năng đếm số tin nhắn mới chưa đọc
- Tối ưu code 85% và thêm thông báo khi nhận tin nhắn
- [V1.2] Bổ sung nút Refresh Webview và cấu trúc mở rộng đa nền tảng (Zalo, FB,...)
- [V1.3] Tính năng tự động thông báo cập nhật (Auto Update Banner) - Cập nhật tính năng tin nhắn nhanh kèm tối đa 6 hình ảnh - Cập nhật bật tắt thông báo cập nhật phiên bản mới
- [V1.4] Tích hợp chức năng nhắn tin đa nền tảng Shopee và TikTok Shop
- [V1.5] Load lại cài đặt tài khoản và tin nhắn mẫu trước đó khi khởi động
- [V1.6] Tích hợp Facebook Messenger & Fanpage - Nút chuyển đổi Chat/Seller/Facebook trực tiếp trên giao diện - Chặn popup bytedance:// gây phiền - Hỗ trợ xóa tài khoản kèm giải phóng bộ nhớ partition
- [V1.7] Tối ưu hiệu suất hệ thống:
  + Lazy-Load Seller/Facebook: webview chỉ tạo khi bấm toggle, tiết kiệm ~600MB RAM khi khởi động
  + Hủy webview Seller khi quay về Chat: giải phóng RAM ngay lập tức
  + Tạm dừng scanner trên tab ẩn: DOM Scanner, Avatar Scraper, Snippet Polling ngừng khi tab không active, giảm ~40% CPU
  + Tài khoản đã ẩn = tắt hẳn webview, không tốn tài nguyên
  + Kiểm tra cập nhật thủ công trong Settings (không còn tự động gọi API)
  + Tính năng Nạp dữ liệu: load profile từ USB/máy khác mà không cần copy
- [V1.8] Cập nhật giao diện ứng dụng, tối ưu màn hình cài đặt (SettingsModal) và nâng cấp hệ thống thông báo (useNotifications)
- [V1.8.1] Tích hợp nền tảng nhắn tin Telegram Web K
