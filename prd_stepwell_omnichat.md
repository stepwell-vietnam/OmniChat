# TÀI LIỆU ĐẶC TẢ YÊU CẦU SẢN PHẨM (PRD)
**Tên dự án:** Stepwell OmniChat (Desktop Application)  
**Phiên bản:** v2.0  
**Cập nhật:** 30/03/2026  
**Mục tiêu:** Quản lý tập trung đa tài khoản Zalo cá nhân cho bộ phận Telesale & CSKH nội bộ.  
**Phạm vi sử dụng:** Nội bộ doanh nghiệp — không phân phối thương mại.

---

## 1. TỔNG QUAN DỰ ÁN (PROJECT OVERVIEW)

Dự án Stepwell OmniChat được phát triển nhằm giải quyết bài toán quản lý phân tán do giới hạn bảo mật của Zalo (chỉ hỗ trợ đăng nhập 1 phiên làm việc trên trình duyệt). Ứng dụng cung cấp một nền tảng Desktop duy nhất cho bộ phận Telesale và CSKH, cho phép vận hành đồng thời từ 2 đến 5 tài khoản Zalo cá nhân với giao diện hợp nhất, đi kèm các công cụ CRM thu nhỏ nhằm tối ưu hóa quy trình bán hàng.

### 1.1 Bảng Thuật Ngữ (Glossary)

| Thuật ngữ | Giải thích |
|---|---|
| **Webview Partition** | Không gian lưu trữ biệt lập (cookie, cache, localStorage) cho mỗi phiên Zalo trong Electron |
| **Content Script** | Đoạn mã JavaScript được nhúng vào Webview để trích xuất dữ liệu DOM |
| **IPC** | Inter-Process Communication — kênh giao tiếp giữa Main Process và Renderer |
| **Headless Action** | Thao tác tự động ngầm (gõ, gửi) trên Webview mà không cần người dùng tương tác |
| **Simulated Drop** | Giả lập sự kiện kéo-thả tệp tin vào khung chat Zalo |
| **Fingerprint Profile** | Tập hợp thông số phần cứng/trình duyệt giả lập để mỗi Webview có danh tính riêng |
| **DOM Scraping** | Kỹ thuật trích xuất dữ liệu từ cấu trúc HTML của trang web |

---

## 2. KIẾN TRÚC KỸ THUẬT (TECHNICAL ARCHITECTURE)

### 2.1 Công Nghệ Nền Tảng

*   **Môi trường chạy (Runtime):** Khung ứng dụng Electron.js.
*   **Kỹ thuật Đa tài khoản:** Sử dụng tính năng `Webview Partitions` của Chromium tích hợp trong Electron để tạo ra các không gian lưu trữ biệt lập (Isolated Contexts) cho từng tài khoản Zalo.
*   **Ngôn ngữ & Framework (Frontend):** Vue 3 (Composition API), Vite, Tailwind CSS. Sử dụng kiến trúc Layout 4 cột tiêu chuẩn.
*   **Trích xuất Dữ liệu (DOM Scraping):** Đoạn mã Content Script sẽ được nhúng vào các phiên Webview để sử dụng `MutationObserver` lắng nghe DOM thay đổi và gửi dữ liệu qua kênh IPC.
*   **Cơ sở dữ liệu cục bộ (Local Database):** Dexie.js (hỗ trợ IndexedDB) cho Phase MVP. Lộ trình nâng cấp lên SQLite (better-sqlite3) từ Phase 3 để hỗ trợ Full-Text Search và Worker Thread.

### 2.2 Kiến Trúc Webview Pool (Tối Ưu Tài Nguyên)

Thay vì duy trì đồng thời 5 Webview fully-loaded (ước tính 1.5 – 3 GB RAM), hệ thống áp dụng cơ chế **Webview Pool** phân tầng:

```
┌──────────────────────────────────────────────────────────┐
│                   Main Process (Electron)                │
│  ┌────────────┐  ┌───────────┐  ┌──────────────────┐   │
│  │  Session    │  │  IPC      │  │  Scheduler       │   │
│  │  Guardian   │  │  Router   │  │  (Cron Engine)   │   │
│  └────────────┘  └───────────┘  └──────────────────┘   │
│  ┌────────────────────────────────────────────────────┐ │
│  │          Fingerprint Profile Manager               │ │
│  │  Profile 1 → WV-1 | Profile 2 → WV-2 | ...        │ │
│  └────────────────────────────────────────────────────┘ │
├──────────────────────────────────────────────────────────┤
│              Renderer Process (Vue 3 Frontend)           │
│              Layout 4 cột + Unified Inbox                │
├──────────────────────────────────────────────────────────┤
│  Webview Pool                                            │
│  ┌────────┐ ┌────────┐ ┌─────────┐ ┌─────────┐ ┌─────┐│
│  │  WV-1  │ │  WV-2  │ │  WV-3   │ │  WV-4   │ │WV-5 ││
│  │ ACTIVE │ │ ACTIVE │ │  WARM   │ │  COLD   │ │COLD ││
│  │ ~300MB │ │ ~300MB │ │ ~150MB  │ │ ~20MB   │ │~20MB││
│  └────────┘ └────────┘ └─────────┘ └─────────┘ └─────┘│
│  Tổng ước tính: ~800MB – 1.2GB (thay vì 2-3GB)          │
└──────────────────────────────────────────────────────────┘
```

**Phân tầng trạng thái Webview:**

| Trạng thái | Mô tả | RAM ước tính | Chuyển đổi |
|---|---|---|---|
| **ACTIVE** (tối đa 2) | Fully loaded, DOM sẵn sàng, nhận real-time messages | ~250-400 MB | Ngay lập tức |
| **WARM** (tối đa 2) | DOM loaded, JS throttled (`setBackgroundThrottling(true)`) | ~100-200 MB | < 1 giây |
| **COLD** (còn lại) | Chỉ giữ session cookie, DOM destroyed | ~10-30 MB | 2-4 giây reload |

*   Khi user click chọn account ở Sidebar → hệ thống chuyển Webview target sang ACTIVE, Webview cũ nhất không tương tác chuyển xuống WARM hoặc COLD.
*   **Smart Preloading:** Dự đoán account sắp chuyển dựa trên lịch sử sử dụng (account có tin nhắn mới ưu tiên ở WARM).

### 2.3 Multi-Strategy DOM Selector Engine

Zalo Web thường xuyên thay đổi class names (obfuscation). Hệ thống sử dụng **chuỗi chiến lược dự phòng** thay vì dựa vào 1 bộ selector duy nhất:

```
Selector Engine (Fallback Chain)
├── Strategy 1: Remote Selector Rules (CDN-hosted JSON)
│   └── Ưu tiên cao nhất, cập nhật nhanh bởi đội IT
├── Strategy 2: Structural Pattern Matching
│   └── Dựa vào cấu trúc DOM (role="textbox", contenteditable, scroll container)
│   └── Không phụ thuộc class name
├── Strategy 3: Content-based Heuristics
│   └── Nhận diện chat bubble bằng: có timestamp + có avatar + nằm trong scroll container
└── Strategy 4: Manual Fallback
    └── Thông báo Admin, cho phép chỉ định selector thủ công qua Settings
```

*   **Automated Health Check:** Mỗi 6 giờ, hệ thống tự kiểm tra tỷ lệ scrape thành công. Nếu < 90% → gửi cảnh báo qua Notification tray của Windows.
*   **Remote Rules:** Tệp cấu hình selector được host trên Server/CDN. Ứng dụng tải tệp này mỗi khi khởi động, đội IT chỉ cần bảo trì 1 file trung tâm.

---

## 3. TÍNH NĂNG CỐT LÕI (CORE FEATURES)

### 3.1 Giao diện Hộp thư Hợp nhất (Unified Inbox)

*   **Vận dụng Nguyên lý "Thiết kế quen thuộc" (Familiarity Principle):** Để nhân sự cảm thấy như đang sử dụng chính Zalo PC gốc, bảng màu chủ đạo sẽ tuân thủ nghiêm ngặt mã màu Trắng Xanh đặc trưng của Zalo (Primary Blue: `#0068ff`). Font chữ sử dụng bộ thẻ hệ thống Segoe UI / Inter để đem lại tỷ lệ khoảng trắng y hệt bản gốc.
*   **Bố cục 4 Cột:** Giao diện chỉ bổ sung duy nhất 1 dải mỏng hẹp ở sát rìa trái màn hình (chứa 5 avatar đại diện cho 5 tài khoản Zalo). Từ dải số 2 trở đi (Danh sách chat → Khung chat chính → Khu vực File), mọi thiết kế từ độ cong góc (border-radius), khoảng cách (padding), đến sắc độ bóng chat (light blue `#e5f1ff` cho tin gửi đi) đều bắt chước 95% tỷ lệ của Zalo PC nhằm triệt tiêu hoàn toàn chi phí học lại phần mềm.
*   **Gộp luồng (All-in-One):** Hiển thị luồng tin nhắn chưa đọc của tất cả các tài khoản Zalo đang hoạt động theo dòng thời gian.
*   **Phân luồng độc lập:** Người dùng có thể click chọn từng tài khoản Zalo cụ thể ở thanh điều hướng bên trái (Sidebar) để chỉ xem các cuộc hội thoại thuộc về tài khoản đó.
*   **Định danh thông minh:** Mỗi đoạn hội thoại ở chế độ Hợp nhất sẽ có chú thích rõ ràng đang thuộc về tài khoản Zalo gốc nào (badge màu + tên viết tắt).

### 3.2 Hệ thống Quản lý Thẻ (Tagging System)
*   Cho phép người dùng tạo các thẻ phân loại động (Tên thẻ + Mã màu CSS). Ví dụ: `VIP`, `Chờ thanh toán`, `Đang giao`.
*   Gán nhiều thẻ đồng thời cho một khách hàng bằng cách thao tác chuột phải hoặc click trực tiếp vào Avatar.
*   Hỗ trợ bộ lọc mạnh mẽ: Lọc danh sách hội thoại theo một hoặc nhiều thẻ kết hợp trên toàn bộ 5 tài khoản.

### 3.3 Trả lời nhanh định tuyến (Smart Quick Replies)
*   Cung cấp tính năng phản hồi văn mẫu bằng phím tắt (Ví dụ: Gọi lệnh `/`).
*   Một menu thả xuống sẽ xuất hiện ngay trên khung nhập văn bản, hỗ trợ tìm kiếm mờ (Fuzzy Search) theo từ khóa.
*   Hỗ trợ cú pháp biến số động (Ví dụ: `{name}` sẽ tự động được thay thế bằng tên hiển thị của tài khoản Zalo đang chat).

### 3.4 Quản lý Thông tin Khách hàng (Mini-CRM Panel)
*   **Tự động trích xuất liên hệ (Data Extraction):** Thuật toán Regex quét qua nội dung tin nhắn để nhận diện và trích xuất thông tin liên hệ (Số điện thoại, Email), tự động điền vào hồ sơ khách hàng ở cột bên phải.
*   **Ghi chú nội bộ:** Tính năng lưu vĩnh viễn các ghi chú riêng của nhân viên cho từng khách hàng (lưu độc lập trong Dexie.js, đối tác trò chuyện không nhìn thấy) giúp theo vết lịch sử tư vấn.

### 3.5 Trả lời Tự động (Event-driven Auto Responder)
*   Hệ thống thiết lập kịch bản lắng nghe từ khóa (Ví dụ: "giá bao nhiêu", "xin địa chỉ") hoặc cảnh báo mốc thời gian ngoài giờ hành chính (22h00 - 07h00).
*   Phản hồi tự động đi qua **Human Behavior Engine** (xem Mục 5.2) để mô phỏng hành vi người thật — không gửi ngay lập tức mà delay 5-30 giây kèm typing simulation.
*   **Cơ chế an toàn:** Xem chi tiết tại Mục 5.3 — Headless Action Safety.

### 3.6 Lên lịch Nhắn tin (Scheduled Auto-Nurturing)
*   Cho phép người dùng tạo lệnh "Hẹn giờ gửi tin nhắn" (Ví dụ: Nhắc nhở thanh toán lúc 08:00 sáng mai).
*   Đến thời điểm đã hẹn, hệ thống tự động bám theo luồng (Webview Session) của tài khoản chứa khách hàng đó, thực hiện gửi qua **Headless Action Queue** (Mục 5.3) đảm bảo không xung đột với thao tác thủ công của nhân viên.

### 3.7 Kho Tệp đính kèm và Ảnh thông minh (Cloud Media Library)
*   Tích hợp sẵn một Thư viện nội bộ trực quan liệt kê cấu trúc Bảng giá PDF, Ảnh sản phẩm bán chạy ngay tại cột bên phải (Cột 4).
*   Áp dụng kỹ thuật giả lập kéo-thả (Simulated DropEvent), cho phép nhân viên gửi tệp tin sang khung chat của đối tác chỉ bằng "Một chạm" (1-Click), triệt tiêu thao tác tìm kiếm tập tin theo kiểu truyền thống.

### 3.8 Định tuyến Nhóm thông minh (Smart Group De-duplication)
*   **Tình huống (Edge Case):** Khi nhập 3 tài khoản Zalo vào chung hệ thống OmniChat và cả 3 tài khoản này cùng là thành viên của 1 Group chat (Nhóm nội bộ/Nhóm khách). Nếu không được xử lý, 1 tin nhắn vào Group sẽ bị nhân 3 lần trên giao diện Hộp thư hợp nhất.
*   **Cơ chế Gộp luồng (Smart Merge):** Hệ thống được tích hợp bộ lọc nhận diện `Group ID` (thông qua URL hoặc ID ẩn của DOM). Khi phát hiện các tin nhắn dội về từ cùng 1 Group từ nhiều tài khoản khác nhau trong cùng 1 thời điểm con (timestamp), hệ thống sẽ gộp và chỉ thả **1 dòng duy nhất** tên Nhóm chat đó ra Giao diện Cột 2 (Danh sách chat).
*   **Quyền định danh gốc (Send-As Switcher):** Khi người dùng nhấp vào Nhóm chung đã được gộp, kế bên ô nhập văn bản tại Cột 3 sẽ xuất hiện một menu Dropdown chức năng: *Gửi dưới tư cách: [Tài khoản Zalo 1] | [Tài khoản Zalo 2]*. Giao thức này cho phép nhân viên chọn đích danh tài khoản sẽ thực thi lệnh chèn phím giả lập (`Simulated Paste`), đảm bảo tuyệt đối không bị gửi nhầm tài khoản.

---

## 4. QUẢN TRỊ DỮ LIỆU VÀ LƯU TRỮ (DATA MANAGEMENT)

### 4.1 Cấu trúc Dữ liệu Lõi (Chống nhân đôi dung lượng)
*   **Vấn đề:** Ứng dụng duy trì Webview ẩn (tuần tự sinh cache/hình ảnh của Zalo gốc) đồng thời lưu lịch sử hiển thị trên ứng dụng chính (Vue 3).
*   **Giải pháp phân tách (Split-Storage):**
    *   **Zalo Webview (Phân vùng nặng):** Chịu trách nhiệm lưu trữ tệp nguồn, hình ảnh (Media), tệp đính kèm. Khối lượng này được quản lý tự động bởi mã nguồn của Zalo Web trong thư mục cấu hình.
    *   **OmniChat DB (Phân vùng nhẹ):** Ứng dụng (Vue 3) chỉ sao chép và lưu trữ **văn bản thô (text), thẻ phân loại (Tags), và đường dẫn URL của hình ảnh**. Cơ sở dữ liệu Dexie.js độc lập này có dung lượng cực kỳ nhỏ (chỉ vài chục MB cho hàng trăm ngàn tin nhắn). Không có hiện tượng nhân đôi tải trọng Media.

### 4.2 Lộ Trình Nâng Cấp Database

| Phase | Công nghệ | Ưu điểm | Hạn chế |
|---|---|---|---|
| **Phase 1-2 (MVP)** | Dexie.js (IndexedDB) | Nhanh triển khai, zero-config | Không có Full-Text Search, single-thread |
| **Phase 3+ (Scale)** | SQLite via `better-sqlite3` | FTS5, Worker Thread, dễ backup/export | Cần build native module |
| **Phase 5 (Team)** | SQLite + Sync Layer | Đồng bộ đa máy, real-time replication | Cần backend API |

### 4.3 Quản lý Thư mục Cục bộ (Tránh tràn ổ đĩa C)
*   **Vấn đề:** Mặc định toàn bộ ứng dụng Electron (kể cả cache của 5 tài khoản Zalo) sẽ bung vào thư mục `%APPDATA%` trên ổ đĩa C của hệ điều hành, gây rủi ro đầy ổ đĩa C sau nhiều tháng sử dụng.
*   **Giải pháp Di dời (Custom Storage Path):**
    *   Bước khởi tạo cốt lõi (Main Process), Electron cho phép sử dụng API `app.setPath('userData', customPath)`.
    *   Ứng dụng sẽ cung cấp phần "Cài đặt hệ thống", cho phép người Quản trị (Admin) **trỏ toàn bộ dải Data (kể cả bộ nhớ đệm Chromium của Zalo) sang ổ đĩa D hoặc E** trước khi đăng nhập. Việc này giải phóng hoàn toàn gánh nặng cho ổ cài đặt hệ điều hành (Ổ C).

### 4.4 Sao Lưu & Phục Hồi (Backup & Recovery)
*   **Tự động sao lưu:** Dexie.js database được export sang JSON mỗi 24 giờ, lưu tại thư mục backup (retention: 7 bản gần nhất).
*   **Export/Import thủ công:** Giao diện Settings cho phép export toàn bộ Tags, Quick Reply templates, Customer Notes sang file `.omnichat-backup`.
*   **Crash Recovery:** Sử dụng cơ chế write-ahead (ghi tạm trước khi commit) để tránh mất dữ liệu khi ứng dụng crash giữa chừng.

---

## 5. CHIẾN LƯỢC BẢO VỆ TÀI KHOẢN (ACCOUNT PROTECTION)

> **Nguyên tắc cốt lõi:** Mỗi tài khoản Zalo trong OmniChat phải trông như đang chạy trên một máy tính vật lý riêng biệt. Zalo sử dụng 3 tầng phát hiện: (1) Session Binding, (2) Browser Fingerprinting, (3) Behavioral Analysis — cần đối phó cả 3 tầng.

### 5.1 Fingerprint Isolation (Cô Lập Danh Tính Thiết Bị)

**Vấn đề:** Mặc dù Electron Partition tách cookie/storage, tất cả Webview vẫn chia sẻ cùng hardware fingerprint (Canvas, WebGL, Navigator). Nếu 5 account có cùng fingerprint → Zalo phát hiện là cùng 1 máy chạy multi-account.

**Giải pháp — Fingerprint Profile Manager:**

Mỗi tài khoản Zalo được gán 1 **Fingerprint Profile** riêng biệt, inject qua `preload` script trước khi Zalo Web load. Các thông số được giả lập:

| Thông số | Profile 1 | Profile 2 | Profile 3 |
|---|---|---|---|
| User-Agent | Chrome/120, Win10 | Chrome/121, Win11 | Chrome/119, Win10 |
| Screen | 1920×1080 | 1366×768 | 1440×900 |
| Canvas Seed | 0xA3F2 | 0x7B1D | 0x812A |
| WebGL GPU | NVIDIA RTX 3060 | Intel UHD 630 | AMD Radeon |
| CPU Cores | 8 | 4 | 6 |
| RAM | 8 GB | 4 GB | 16 GB |

**Nguyên tắc quan trọng:**
*   Các giá trị trong mỗi profile phải **nhất quán nội bộ** (consistent) — không set RAM 4 GB mà GPU RTX 4090.
*   Sử dụng **Seeded PRNG** (Pseudo-Random Number Generator) để Canvas noise ổn định qua mỗi lần khởi động — fingerprint phải deterministic, không random mỗi lần.
*   **Không block** Canvas/WebGL hoàn toàn — việc block tạo ra fingerprint bất thường ("hiệu ứng mặt nạ trượt tuyết"), dễ bị phát hiện hơn cả fingerprint giả.
*   Timezone giữ nguyên `Asia/Ho_Chi_Minh` cho tất cả profile — thay đổi sẽ gây nghi ngờ vì tất cả account đều dùng ở VN.

**Kỹ thuật Override (Preload Script):**
*   `HTMLCanvasElement.prototype.toDataURL` — Inject deterministic pixel noise (±1 giá trị, 5% pixels).
*   `WebGLRenderingContext.getParameter` — Trả về fake GPU vendor/renderer (UNMASKED_VENDOR_WEBGL, UNMASKED_RENDERER_WEBGL).
*   `navigator.hardwareConcurrency`, `navigator.deviceMemory`, `screen.width/height` — Override bằng `Object.defineProperty`.
*   `AudioContext` fingerprint — Thêm micro-offset vào oscillator frequency.

### 5.2 Human Behavior Simulation (Mô Phỏng Hành Vi Người Thật)

Áp dụng cho tất cả thao tác tự động (Auto-Reply, Scheduled Messaging, Simulated Drop):

| Hành vi | ❌ Bot (dễ bị phát hiện) | ✅ OmniChat Simulation |
|---|---|---|
| **Thời gian phản hồi** | Luôn 1-2 giây | 5-30 giây (Gaussian random) |
| **Tốc độ gõ chữ** | Paste ngay lập tức | 80-200ms/ký tự, pause ở dấu câu |
| **Lỗi gõ** | Không bao giờ sai | 5% xác suất gõ nhầm + Backspace sửa |
| **Tần suất** | 60 tin/phút | 2-5 tin/phút, có nghỉ giữa |
| **Giờ hoạt động** | 24/7 đều đặn | Chỉ 7h-22h (Activity Window) |
| **Pattern** | Lặp lại chính xác | Biến thiên nhẹ mỗi lần (Gaussian distribution) |

**Reading Delay:** Trước khi auto-reply, hệ thống tính thời gian "đọc" dựa trên độ dài tin nhắn (200 từ/phút) + thời gian "suy nghĩ" (2-8 giây). Không ai đọc xong và reply ngay lập tức.

**Rate Limiting cứng cho tin nhắn tự động:**

| Giới hạn | Giá trị | Mục đích |
|---|---|---|
| Tối đa tin auto / giờ | 20 tin | Tránh spam detection |
| Tối đa tin auto / ngày | 100 tin | Tránh pattern bất thường |
| Khoảng cách tối thiểu | 30 giây | Giữa 2 tin auto liên tiếp |
| Burst protection | Max 5 tin / 5 phút | Chống gửi dồn |
| Cool-down sau burst | Nghỉ 10 phút | Sau khi đạt burst limit |

### 5.3 Cơ Chế An Toàn Headless Action (Tránh Gửi Nhầm)

Mọi thao tác tự động (Auto-Reply, Scheduled Message) phải đi qua **Headless Action Queue** với quy trình 6 bước:

```
┌─────────────────────────────────────────────────────┐
│              Headless Action Queue                   │
│                                                      │
│  1. CHECK ──→ User đang active trên Webview này?    │
│     │          ├─ CÓ → Defer (chờ user idle 30s)    │
│     │          └─ KHÔNG → Tiếp tục                   │
│     ▼                                                │
│  2. LOCK ───→ Khóa Webview, chặn thao tác thủ công  │
│     ▼                                                │
│  3. EXECUTE → Typing simulation + Gửi tin            │
│     ▼                                                │
│  4. VERIFY ─→ Kiểm tra tin nhắn đã xuất hiện        │
│     │          trong DOM (delivery confirmation)      │
│     ▼                                                │
│  5. LOG ────→ Ghi nhận kết quả vào Activity Log      │
│     ▼                                                │
│  6. UNLOCK ─→ Mở khóa Webview                       │
│     │                                                │
│     └─→ Nếu VERIFY thất bại → Retry tối đa 3 lần   │
└─────────────────────────────────────────────────────┘
```

*   **Bước CHECK** là quan trọng nhất: Nếu nhân viên đang gõ tin cho khách A, hệ thống KHÔNG ĐƯỢC can thiệp vào Webview đó. Action được defer (hoãn) và chờ user idle ≥ 30 giây.
*   **Bước VERIFY:** Sau khi gửi, kiểm tra trong DOM xem tin nhắn vừa gửi đã xuất hiện chưa. Nếu không → retry. Nếu retry 3 lần vẫn fail → đánh dấu FAILED và thông báo nhân viên xử lý thủ công.

### 5.4 Session Management (Quản Lý Phiên Đăng Nhập)

**Quy trình đăng nhập:**
*   Mỗi account đăng nhập bằng QR Code scan từ điện thoại (cơ chế mặc định của Zalo Web).
*   **Staggered Login:** Không đăng nhập 5 account cùng lúc. Delay 2-5 phút giữa mỗi lần login để tránh pattern bất thường.

**Giám sát phiên:**
*   **Health Monitor:** Mỗi 60 giây, kiểm tra trạng thái đăng nhập của từng Webview (có xuất hiện QR Code / dialog login không).
*   **Status Indicators:** Mỗi avatar ở Sidebar hiển thị trạng thái:  🟢 Online | 🟡 Reconnecting | 🔴 Disconnected.
*   **Auto-Reconnect:** Khi phát hiện session expired → tự reload Webview với exponential backoff (30s → 60s → 120s → 240s → 480s). Nếu 5 lần thất bại → thông báo yêu cầu quét QR lại.
*   **Alert System:** Khi bất kỳ account nào bị disconnect → hiện Desktop Notification + badge đỏ trên avatar tương ứng.

### 5.5 Những Điều KHÔNG Được Làm (Anti-Patterns)

| ❌ Tránh | Lý do |
|---|---|
| Gửi tin nhắn hàng loạt (broadcast) cùng nội dung cho nhiều người | Trigger spam detection ngay lập tức |
| Đăng nhập > 5 account trên 1 máy | Quá nhiều sessions từ cùng 1 IP → flagged |
| Auto-reply hoạt động 24/7 không nghỉ | Không ai online 24 giờ liên tục |
| Gửi tin giống hệt nhau cho nhiều người liên tiếp | Pattern detection sẽ bắt |
| Thay đổi fingerprint mỗi lần khởi động | Fingerprint phải ổn định (deterministic seed) |
| Sử dụng Proxy/VPN nước ngoài | Account dùng ở VN mà IP ở Singapore → red flag |

---

## 6. BẢO MẬT DỮ LIỆU (DATA SECURITY)

### 6.1 Mã Hóa Dữ Liệu Cục Bộ
*   **IndexedDB / SQLite:** Dữ liệu tin nhắn và thông tin khách hàng (SĐT, ghi chú) được **mã hóa AES-256** trước khi lưu vào database. Key được bảo vệ bởi Windows DPAPI (Data Protection API), chỉ giải mã được trên đúng máy + đúng user Windows đã đăng nhập.
*   **Session Cookies:** Cookie Zalo trong mỗi partition được bảo vệ bởi Electron's built-in session encryption. Không export cookie ra file plaintext.

### 6.2 An Toàn IPC (Inter-Process Communication)
*   Validate origin cho mọi IPC message giữa Main ↔ Renderer ↔ Webview.
*   Sử dụng `contextBridge` để inject preload script an toàn, không expose Node.js APIs cho guest content.
*   Webview `nodeIntegration: false`, `contextIsolation: true` bắt buộc cho tất cả partition.

### 6.3 Quản Lý Log
*   **Quy tắc:** Log hệ thống KHÔNG ĐƯỢC chứa nội dung tin nhắn hoặc thông tin cá nhân khách hàng.
*   Log chỉ ghi metadata: timestamp, account ID, action type, success/fail status.
*   Log files retention: 30 ngày, tự động xóa bản cũ.

---

## 7. GIÁM SÁT & THỐNG KÊ (MONITORING & ANALYTICS)

### 7.1 Dashboard Vận Hành (Operational Dashboard)
*   **Trạng thái hệ thống:** RAM usage tổng, CPU usage, trạng thái từng Webview (Active/Warm/Cold/Disconnected).
*   **Thống kê tin nhắn:** Số tin gửi/nhận theo ngày, theo account. Tỷ lệ phản hồi. Thời gian phản hồi trung bình.
*   **Thống kê Tags:** Số khách hàng theo từng loại tag, xu hướng thay đổi.

### 7.2 Health Check & Alerting
*   **Webview Health:** Kiểm tra tỷ lệ DOM scrape thành công mỗi 6 giờ. Alert nếu < 90%.
*   **Session Health:** Monitor trạng thái login mỗi 60 giây. Alert ngay khi phát hiện disconnect.
*   **Storage Monitor:** Cảnh báo khi dung lượng data vượt ngưỡng cấu hình (mặc định 10 GB).
*   **Kênh thông báo:** Windows Desktop Notification (mặc định). Tuỳ chọn mở rộng: webhook Telegram/Slack.

---

## 8. PHÂN TÍCH TÍNH NĂNG ĐỐI CHIẾU (NATIVE VS OMNICHAT)

Dưới đây là bản phân tích 4 tính năng bản lề của Zalo và cách OmniChat kế thừa, cũng như nâng cấp chúng thành "Vũ khí chốt Sale" diện rộng.

### 8.1 Trả lời nhanh (Quick Reply)
*   **Zalo Native:** Đã cung cấp tính năng phím tắt `/`, tuy nhiên nó bị giới hạn lưu trữ cấu hình theo từng tài khoản riêng lẻ và thiếu tính cá nhân hóa.
*   **Phát triển trên OmniChat (Centralized Quick Reply):**
    *   **Kho dữ liệu hợp nhất:** Quản trị viên chỉ cần soạn 1 bộ văn mẫu (Ví dụ: Chào buổi sáng, Chính sách Đổi trả), toàn bộ 5 tài khoản Zalo con sẽ được kế thừa sử dụng chung. Nhân sự không phải cài đặt thủ công 5 lần.
    *   **Cá nhân hóa tự động (Dynamic Variables):** Hệ thống OmniChat tự động cắm tên khách hàng vào văn mẫu (Ví dụ: `Dạ Stepwell chào {name}`) thông qua việc quét tên DOM trước khi dán chữ.

### 8.2 Lên lịch nhắn tin (Schedule Messaging)
*   **Zalo Native:** Zalo Cá Nhân **hoàn toàn không có** tính năng này (chỉ có trên Zalo OA hoặc gói trả phí Business).
*   **Phát triển trên OmniChat (Auto-Nurturing):** Đây là sự lột xác của dự án.
    *   Nhờ cơ chế lưu trữ nội bộ Dexie.js, người dùng có thể hẹn giờ: "Sáng mai 8h00 gửi tin nhắn nài nỉ chốt Sale cho khách hàng A".
    *   Đúng 8h00, OmniChat sẽ tự động đánh thức Webview của tài khoản Zalo chứa khách A, tạo sự kiện chọn đoạn hội thoại, dán văn bản và giả lập phím Gửi qua **Headless Action Queue** (Mục 5.3) — đảm bảo an toàn, không xung đột với thao tác thủ công.

### 8.3 Trả lời tự động (Auto Reply)
*   **Zalo Native:** Zalo Cá nhân không có trả lời tự động.
*   **Phát triển trên OmniChat (Event-driven Auto Responder):**
    *   Xây dựng thuật toán bám sát sự kiện `on-new-message` từ luồng Webview.
    *   Nếu tin nhắn đến ngoài giờ hành chính (22h00 - 07h00) hoặc có chứa từ khóa nhất định (Ví dụ: "báo giá"), hệ thống trích xuất văn bản tự động, chạy qua **Human Behavior Engine** (Mục 5.2) rồi phản hồi với delay tự nhiên 5-30 giây. Nhân sự tiết kiệm thời gian lọc khách hàng chỉ hỏi tham khảo.

### 8.4 Gửi ảnh/video và Tệp đính kèm (Media Attachment)
*   **Zalo Native:** Bắt buộc bấm biểu tượng đính kèm, mở hộp thoại (`File Picker`) của Windows để tìm tệp, hoặc kéo thả tệp vật lý từ màn hình vào khung chat. Rất mất thời gian khi tìm báo giá PDF lưu lộn xộn.
*   **Phát triển trên OmniChat (Cloud Media Library & Simulated Drop):**
    *   **Kho mồi nhử (Sales Kits Library):** OmniChat tích hợp sẵn một "Thư viện Ảnh/Tài liệu nội bộ". Cột bên phải (CRM Panel) sẽ liệt kê sẵn 10 File Báo giá, 20 Ảnh Sản phẩm Bán chạy.
    *   **Kỹ thuật Simulated Drop:** Khi nhân sự click 1 chạm vào Bảng báo giá trên OmniChat, ứng dụng (Main Process) sẽ biến file đó thành đối tượng Nhị phân (Blob/File Object) và **giả lập thao tác Kéo / Thả (Drag & Drop Event)** thả thẳng vào khung nhập liệu của Zalo Webview. Tài liệu được bốc đi trong 1 Click Mù (Zero-search click).

---

## 9. QUẢN TRỊ RỦI RO & HIỆU SUẤT (RISKS & MITIGATIONS)

### 9.1 Quá tải tài nguyên hệ thống (Memory Bloat)
*   **Rủi ro:** Electron duy trì nhiều tiến trình Webview tương đương việc mở nhiều tab Chrome nặng.
*   **Giải pháp:** Áp dụng kiến trúc **Webview Pool** phân tầng (Mục 2.2): tối đa 2 ACTIVE, 2 WARM, còn lại COLD. Kết hợp thuật toán throttling khi Webview không tương tác > 15 phút. Khuyến nghị cấu hình RAM thiết bị tối thiểu 8 GB (lý tưởng 16 GB).

### 9.2 Lỗi cấu trúc thẻ (CSS/DOM Change Update)
*   **Rủi ro:** Zalo Web thường xuyên làm mới giao diện hoặc mã hóa class (obfuscation), dẫn đến việc bộ trích xuất dữ liệu không lấy được văn bản chat.
*   **Giải pháp:** Áp dụng **Multi-Strategy Selector Engine** (Mục 2.3) với chuỗi fallback 4 cấp. Remote rules trên CDN + Structural pattern matching + Health check tự động mỗi 6 giờ.

### 9.3 Rủi ro Tài khoản bị Zalo giới hạn
*   **Rủi ro:** Zalo phát hiện multi-account trên cùng thiết bị → cảnh báo hoặc khóa tài khoản.
*   **Giải pháp:** Áp dụng toàn bộ hệ thống **Chiến Lược Bảo Vệ Tài Khoản** (Mục 5): Fingerprint Isolation + Human Behavior Simulation + Rate Limiting + Staggered Login.

### 9.4 Gửi nhầm tin nhắn tự động (Race Condition)
*   **Rủi ro:** Auto-reply hoặc scheduled message gửi vào Webview mà nhân viên đang thao tác → xung đột nội dung.
*   **Giải pháp:** Mọi thao tác tự động phải đi qua **Headless Action Queue** (Mục 5.3) với cơ chế CHECK → LOCK → EXECUTE → VERIFY → UNLOCK.

### 9.5 Mất dữ liệu khi ứng dụng crash
*   **Rủi ro:** Mất tags, ghi chú khách hàng, lịch sử tin nhắn khi ứng dụng crash hoặc máy tính tắt đột ngột.
*   **Giải pháp:** Backup tự động mỗi 24 giờ (Mục 4.4) + Write-ahead logging + Export/Import thủ công.

---

## 10. KIỂM THỬ (TESTING STRATEGY)

### 10.1 Unit Testing
*   **Đối tượng:** Content Script (DOM selector engine), Fingerprint injection, Rate limiter, Regex extraction (SĐT, Email).
*   **Công cụ:** Vitest (tích hợp sẵn với Vite).
*   **Coverage mục tiêu:** ≥ 80% cho logic module.

### 10.2 Integration Testing
*   **Đối tượng:** IPC communication (Main ↔ Renderer ↔ Webview), Dexie.js CRUD operations, Headless Action Queue flow.
*   **Công cụ:** Playwright + Electron Testing Utilities.

### 10.3 Manual Testing Checklist (mỗi Release)
*   [ ] Đăng nhập 2 account bằng QR → thành công, session ổn định > 1 giờ
*   [ ] Gửi/nhận tin nhắn thủ công trên cả 2 account
*   [ ] Tag khách hàng → lọc theo tag → kết quả chính xác
*   [ ] Quick Reply `/` → hiển thị menu → gửi thành công
*   [ ] Auto-reply trigger bằng từ khóa → delay tự nhiên → gửi đúng nội dung
*   [ ] Scheduled message → đúng giờ → không xung đột thao tác thủ công
*   [ ] Group de-duplication → chỉ hiện 1 lần → Send-As switcher hoạt động
*   [ ] App chạy liên tục 8 giờ → RAM ổn định, không memory leak

---

## 11. TRIỂN KHAI & CẬP NHẬT (DEPLOYMENT)

### 11.1 Đóng gói & Phân phối
*   **Builder:** electron-builder (Windows: NSIS installer).
*   **Code Signing:** Ký số executable bằng certificate doanh nghiệp để tránh SmartScreen warning.
*   **Phân phối nội bộ:** File `.exe` installer chia sẻ qua mạng LAN / Google Drive nội bộ.

### 11.2 Cập nhật Ứng dụng
*   **Auto-Update:** Sử dụng `electron-updater` kiểm tra phiên bản mới khi khởi động.
*   **Update Server:** File release host trên GitHub Releases (private repo) hoặc internal server.
*   **Rollback:** Giữ lại bản cài đặt trước đó. Nếu bản mới lỗi → người dùng có thể quay lại bản cũ từ Settings.
*   **Versioning:** Semantic Versioning (MAJOR.MINOR.PATCH).

---

## 12. LỘ TRÌNH PHÁT TRIỂN (ROADMAP)

### Phase 1: Foundation — MVP (4-6 tuần)

| Tuần | Công việc | Deliverable |
|---|---|---|
| 1-2 | Electron + Vite scaffolding, Webview Partition setup (2 accounts), IPC architecture | Chạy được 2 Zalo song song |
| 3-4 | Content Script injection, MutationObserver, Multi-strategy selector engine v1 | Trích xuất tin nhắn thành công |
| 5-6 | Layout 4 cột cơ bản, Account switcher, Unified Inbox (basic), Dexie.js integration | Giao diện chạy được, hiển thị tin nhắn |

### Phase 2: CRM & Productivity (4-6 tuần)

| Tuần | Công việc | Deliverable |
|---|---|---|
| 7-8 | Tagging system + Quick Reply (`/` command) + Fuzzy Search | Quản lý khách hàng cơ bản |
| 9-10 | Mini-CRM Panel + Regex SĐT extraction + Customer Notes | Panel thông tin khách bên phải |
| 11-12 | Group De-duplication + Send-As Switcher | Xử lý edge case nhóm chat |

### Phase 3: Automation & Protection (4-6 tuần)

| Tuần | Công việc | Deliverable |
|---|---|---|
| 13-14 | **Fingerprint Profile Manager** + Preload Script injection | Mỗi Webview có fingerprint riêng |
| 15-16 | **Human Behavior Engine** + Auto-Reply + Rate Limiter | Auto-reply an toàn |
| 17-18 | **Headless Action Queue** + Scheduled Messaging + Delivery Verification | Lên lịch nhắn tin |

### Phase 4: Media & Polish (3-4 tuần)

| Tuần | Công việc | Deliverable |
|---|---|---|
| 19-20 | Media Library + Simulated Drop + Sales Kit management | Gửi file 1-Click |
| 21-22 | Webview Pool optimization (ACTIVE/WARM/COLD) + Session Guardian + Dashboard thống kê | Hiệu suất tối ưu |

### Phase 5: Production Hardening (2-3 tuần)

| Tuần | Công việc | Deliverable |
|---|---|---|
| 23-24 | AES-256 encryption + Backup/Recovery + Crash handling | Bảo mật dữ liệu |
| 25 | electron-builder packaging + Auto-update + Code signing + Testing toàn diện | Bản release nội bộ v1.0 |

**Tổng ước tính:** 17-25 tuần (4-6 tháng) cho 1 developer full-time.  
**Yêu cầu hệ thống tối thiểu:** Windows 10+, RAM 8 GB (khuyến nghị 16 GB), SSD 256 GB.
