// ============================================================
// CẤU HÌNH — sửa URL / phiên bản tại đây
// ============================================================

// ============================================================
// APP VERSION — MỖI FILE HTML MỘT MÃ (gốc=v1, bản sao=v2, …)
// Chỉ bản được "Chốt" trong Cài đặt mới gửi Telegram (ghi Config B4)
// ============================================================
const APP_VERSION = 'v2';

const DEFAULT_CFG = {
  name: 'Bạn',
  gsUrl: '',
  tgToken: '',
  tgChatId: '',
  morning: 'Chào buổi sáng {name}! ☀️',
  afternoon: 'Buổi chiều vui vẻ {name}! 🌤️',
  evening: 'Chào buổi tối {name}! 🌙',
  goalName: '',
  goalAmount: 0,
  goalYear: new Date().getFullYear(),
  noti: { expense: false, task: false, savings: false },
  notiTimes: { expense: ['21:00'], task: ['08:00'], savings: ['09:00'] },
  moduleNoti: null
};

// ============================================================
// BACKEND — một Sheet + một link Web App (sửa URL chỉ ở đây)
// ============================================================
// Dán link Web App MỚI sau khi tạo Sheet + Deploy (chỉ sửa dòng dưới).
// Đổi code Apps Script: Deploy → Manage deployments → New version — GIỮ NGUYÊN link.
const GS_WEBAPP_URL = 'https://script.google.com/macros/s/AKfycbwEJzlQWXvOanGkWtsb-2crHMPI_NfwSEh4m9A1uL9vtGw03RLJl1tRfLb0gC_-8Bbf/exec';
