import { ipcRenderer } from 'electron'

console.log('OmniChat: V3 Webview Preload Script Injected!')

function parseConversationItem(el: HTMLElement) {
  const innerTexts = el.innerText.trim().split('\n').map(l => l.trim()).filter(l => l.length > 0)
  
  if (innerTexts.length < 2) return null

  // Bộ lọc rác chống quét banner Zalo PC
  const blackList = ['Khi đăng nhập Zalo Web', 'Tải Zalo PC', 'Đồng bộ tin nhắn', 'Phiên bản web']
  if (blackList.some(word => innerTexts[0].includes(word) || (innerTexts[1] && innerTexts[1].includes(word)))) {
    return null
  }

  const rawName = innerTexts[0]

  // ==== CHIẾN LƯỢC QUÉT BADGE ĐỎ (UNREAD) — V4 siết chặt chống false positive ====
  let unreadCount = 0;

  // Lớp 1: Quét qua class chứa đúng "unread" (chỉ từ này, bỏ badge/notify/Count quá rộng)
  const badgeTags = el.querySelectorAll('[class*="unread"]');
  for (const b of Array.from(badgeTags)) {
      const txt = (b.textContent || '').trim();
      if (/^\d+\+?$/.test(txt)) {
          unreadCount = parseInt(txt) || 0;
          break;
      }
  }

  // Lớp 2: Quét badge bằng visual — YÊU CẦU CẢ 3: nền đỏ + chữ trắng + kích thước nhỏ
  if (unreadCount === 0) {
      const allTextNodes = el.querySelectorAll('span, div');
      for (const b of Array.from(allTextNodes)) {
          const txt = (b.textContent || '').trim();
          if (/^\d+\+?$/.test(txt) && txt.length < 4 && b.childElementCount === 0) {
             const style = window.getComputedStyle(b);
             const rect = b.getBoundingClientRect();

             // Kiểm tra kích thước: badge unread luôn nhỏ (< 35px)
             if (rect.width > 35 || rect.height > 35 || rect.width < 8) continue;

             // Phân tích màu nền: phải là đỏ/cam cảnh báo
             const bg = style.backgroundColor || '';
             const bgMatch = bg.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
             if (!bgMatch) continue;
             const [, r, g, bVal] = bgMatch.map(Number);
             const isRedOrange = r > 180 && g < 100 && bVal < 100; // Đỏ thuần
             const isWarning = r > 200 && g > 100 && g < 180 && bVal < 80; // Cam cảnh báo

             // Phải có chữ trắng
             const isWhiteText = style.color === 'rgb(255, 255, 255)';

             if ((isRedOrange || isWarning) && isWhiteText) {
                 unreadCount = parseInt(txt);
                 break;
             }
          }
      }
  }

  let timeStr = ''
  let messageStr = ''

  // Regex nhận diện giờ
  const timeRegex = /^(\d{1,2}:\d{2}|\d{1,2}\/\d{1,2}|Hôm qua|Vài giây|\d+\s+(giây|phút|giờ|ngày|tuần|tháng|năm).*)$/i

  // Lớp 3 đã bị loại bỏ — quét số mồ côi gây false positive (99+ bug)

  for (let i = 1; i < innerTexts.length; i++) {
    const text = innerTexts[i]
    if (!timeStr && timeRegex.test(text)) {
      timeStr = text
    } else if (!/^\d+\+?$/.test(text)) { 
      if (text.length > messageStr.length) messageStr = text
    }
  }

  if (!messageStr && innerTexts.length >= 2) {
    messageStr = innerTexts[innerTexts.length - 1]
    if (messageStr === timeStr && innerTexts.length > 2) messageStr = innerTexts[innerTexts.length - 2]
  }

  const img = el.querySelector('img')
  const id = el.getAttribute('data-id') || el.id || `zalo_${rawName.substring(0,5)}`

  return {
    id: id,
    name: rawName,
    lastMessage: messageStr || '...',
    time: timeStr,
    avatar: img ? img.src : '',
    unread: unreadCount
  }
}

function scrapeConversations() {
  const convList: any[] = []
  const convNodes = new Set<HTMLElement>()

  // CHIẾN LƯỢC TÌM KIẾM NGƯỢC (Bottom-Up)
  const images = document.querySelectorAll('img')
  images.forEach(img => {
    let parent = img.parentElement
    let depth = 0
    while (parent && depth < 6) {
      const hasItemSignal = parent.id.includes('item') || parent.className.includes('item') || parent.getAttribute('data-id')
      const hasButtonRole = parent.getAttribute('role') === 'button'
      
      if (hasItemSignal || hasButtonRole) {
        if (parent.innerText.includes('\n')) {
          convNodes.add(parent)
          break
        }
      }
      parent = parent.parentElement
      depth++
    }
  })

  convNodes.forEach(node => {
    const data = parseConversationItem(node)
    if (data && data.name && data.time) {
      convList.push(data)
    }
  })
  
  if (convList.length > 0) {
    ipcRenderer.sendToHost('zalo-data', {
      type: 'conversations',
      data: convList.slice(0, 30)
    })
  }

  // ==== ĐẾM TỔNG TIN NHẮN CHƯA ĐỌC — V4 ưu tiên badge thực tế ====
  let globalUnread = 0;
  
  // Chiến lược 1 (ưu tiên): Tổng unread từ conversations đã scrape
  // → Chính xác nhất vì khớp với badge đỏ user nhìn thấy trên danh sách chat
  if (convList.length > 0) {
    globalUnread = convList.reduce((sum: number, c: any) => sum + (c.unread || 0), 0);
  }

  // Chiến lược 2 (fallback): Quét Title Bar — chỉ dùng khi không scrape được conversation nào
  // (VD: Zalo chưa load xong danh sách chat)
  if (globalUnread === 0 && convList.length === 0) {
    const titleText = document.title || '';
    const titleMatch = titleText.match(/\((\d+)\)/) || titleText.match(/\[(\d+)\]/);
    if (titleMatch) {
      globalUnread = parseInt(titleMatch[1]) || 0;
    }
  }

  // Báo tin về đất liền
  ipcRenderer.sendToHost('zalo-data', {
    type: 'global-unread',
    data: globalUnread
  });
}

// ==== TRÍCH XUẤT ẢNH ĐẠI DIỆN ZALO CỦA TÀI KHOẢN ====
let lastScrapedAvatar = '';

function scrapeAccountInfo() {
  let avatarUrl = '';
  let displayName = '';

  // Chiến lược 1: Ảnh avatar ở CUỐI navbar trái (vùng profile user Y > innerHeight - 120)
  const allImages = Array.from(document.querySelectorAll('img'));
  for (const img of allImages) {
    const r = img.getBoundingClientRect();
    // Avatar user ở góc dưới trái: X < 70, Y gần đáy, kích thước 30-50px
    if (r.left >= 0 && r.right < 75 
        && r.top > window.innerHeight - 120 
        && r.width >= 25 && r.width <= 60 
        && r.height >= 25 && r.height <= 60
        && (img as HTMLImageElement).src.startsWith('http')) {
      avatarUrl = (img as HTMLImageElement).src;
      break;
    }
  }

  // Chiến lược 2: Tìm ảnh nhỏ nhất ở cột trái (thường là avatar user)
  if (!avatarUrl) {
    const leftImages = allImages.filter(img => {
      const r = img.getBoundingClientRect();
      return r.left >= 0 && r.right < 75 && r.width >= 25 && r.width <= 60 
             && (img as HTMLImageElement).src.startsWith('http');
    });
    // Avatar user thường ở dưới cùng => lấy phần tử cuối
    if (leftImages.length > 0) {
      const lastImg = leftImages[leftImages.length - 1] as HTMLImageElement;
      avatarUrl = lastImg.src;
    }
  }

  // Chiến lược 3: Quét qua class chứa "avatar" hoặc "profile" ở vùng trái
  if (!avatarUrl) {
    const sel = 'img[class*="avatar"], img[class*="profile"], img[class*="user"]';
    const candidates = document.querySelectorAll(sel);
    for (const img of Array.from(candidates)) {
      const r = img.getBoundingClientRect();
      const src = (img as HTMLImageElement).src;
      if (r.left < 80 && r.width >= 20 && src.startsWith('http')) {
        avatarUrl = src;
        break;
      }
    }
  }

  // Tìm tên hiển thị gần avatar (tooltip hoặc title attribute)
  if (avatarUrl) {
    const avatarImg = allImages.find(img => (img as HTMLImageElement).src === avatarUrl);
    if (avatarImg) {
      displayName = avatarImg.getAttribute('alt') || avatarImg.getAttribute('title') || '';
      // Tìm trong parent
      if (!displayName) {
        const parent = avatarImg.closest('[title]');
        if (parent) displayName = parent.getAttribute('title') || '';
      }
    }
  }

  // Chỉ gửi khi có avatar MỚI (tránh spam IPC)
  if (avatarUrl && avatarUrl.startsWith('http') && avatarUrl !== lastScrapedAvatar) {
    lastScrapedAvatar = avatarUrl;
    ipcRenderer.sendToHost('zalo-data', {
      type: 'account-info',
      data: { avatar: avatarUrl, name: displayName }
    });
    console.log('OmniChat: Đã bắt được Avatar Zalo:', avatarUrl.substring(0, 60) + '...');
  }
}

// Hàm Trích xuất Dữ liệu Lõi (Inside Message Layout)
function scrapeMessages() {
  const msgList: any[] = [];
  
  const candidates = Array.from(document.querySelectorAll('div[data-id], div[class*="chat-message"], div[class*="message-bubble"]'))
  const rightPanelElements = candidates.filter(el => {
    const rect = el.getBoundingClientRect();
    return rect.left > 330 && rect.width > 0 && (el as HTMLElement).innerText.trim().length > 0;
  });

  const seenTexts = new Set<string>();
  let index = 0;
  
  for(let i = 0; i < rightPanelElements.length; i++) {
     const el = rightPanelElements[i] as HTMLElement;
     const htmlClass = el.className || '';
     const style = window.getComputedStyle(el);
     const isSender = htmlClass.includes('me') || htmlClass.includes('sender') || style.justifyContent === 'flex-end' || style.alignSelf === 'flex-end' || style.alignItems === 'flex-end';
     
     const spans = Array.from(el.querySelectorAll('span, p, div[class*="text"]'));
     let txt = '';
     if (spans.length > 0) {
        txt = spans.map(s => (s.textContent || '').trim()).sort((a,b) => b.length - a.length)[0];
     }
     
     if (!txt || txt.length === 0) {
        txt = (el.textContent || '').trim();
     }
     
     if (txt && txt.length > 0 && !seenTexts.has(txt)) {
        seenTexts.add(txt);
        msgList.push({
           id: `msg_${index++}`,
           text: txt,
           isSender: isSender,
           time: ''
        });
     }
  }

  // CHẾ ĐỘ CỨU HỘ (Sonic Scan)
  if (msgList.length === 0) {
      const allTextRight = Array.from(document.querySelectorAll('span, p, div')).filter(el => {
          const r = el.getBoundingClientRect();
          return r.left > 350 && el.childElementCount === 0 && (el.textContent || '').trim().length > 0;
      });
      const uniqueRaw = [...new Set(allTextRight.map(e => (e.textContent || '').trim()))].slice(-15);
      const finalRaw = uniqueRaw.filter(t => !t.includes('Chào mừng đến với Zalo') && !t.includes('Tải Zalo PC') && !t.includes('Trò chuyện'));
      
      finalRaw.forEach(txt => {
          msgList.push({ id: `msg_${index++}`, text: txt, isSender: index % 2 === 0, time: '' });
      });
  }

  ipcRenderer.sendToHost('zalo-data', {
     type: 'messages',
     data: msgList.slice(-40)
  })
}

// Hàm giả lập click
function simulateClick(el: HTMLElement) {
  el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
  el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }));
  el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
}

// Lắng nghe Lệnh Click Mở phòng chat
ipcRenderer.on('open-conversation', (_event, convId) => {
  console.log('OmniChat: Mở phòng chat ID:', convId);
  const target = document.querySelector(`[data-id="${convId}"], [id="${convId}"], [id*="${convId}"]`) as HTMLElement;
  
  if (target) {
    simulateClick(target);
    setTimeout(scrapeMessages, 600);
    setTimeout(scrapeMessages, 1500);
  } else {
    const allClickable = document.querySelectorAll('div[role="button"], div[class*="item"]');
    let found = false;
    for (const el of Array.from(allClickable)) {
        if ((el as HTMLElement).innerText.includes(convId)) {
            simulateClick(el as HTMLElement);
            setTimeout(scrapeMessages, 600);
            setTimeout(scrapeMessages, 1500);
            found = true;
            break;
        }
    }
    if (!found) setTimeout(scrapeMessages, 800);
  }
})

// ==== ENGINE CHÍNH: MutationObserver + Periodic Polling ====
let debounceTimer: any = null
const observer = new MutationObserver(() => {
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    scrapeConversations();
    scrapeMessages(); 
  }, 1000)
})

window.addEventListener('load', () => {
  observer.observe(document.body, { childList: true, subtree: true, characterData: true })
  
  // Lần đầu: chờ Zalo load xong SPA
  setTimeout(scrapeConversations, 2000)
  setTimeout(scrapeConversations, 5000) // Quét lại lần 2 phòng Zalo AJAX chậm
  setTimeout(scrapeAccountInfo, 4000)   // Chờ avatar render xong

  // POLLING ĐỊNH KỲ: đảm bảo badge + avatar luôn cập nhật 
  // (MutationObserver có thể bỏ sót khi webview ở background)
  setInterval(() => {
    scrapeConversations();  // Cập nhật unread count
  }, 5000) // Mỗi 5 giây

  setInterval(() => {
    scrapeAccountInfo();    // Cập nhật avatar (chỉ gửi IPC khi có thay đổi)
  }, 15000) // Mỗi 15 giây
})
