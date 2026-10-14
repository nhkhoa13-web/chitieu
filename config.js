/* ============================================================================
   CẤU HÌNH — điền 1 LẦN, sau này cập nhật code (script.js, index.html...) KHÔNG cần điền lại.
   Khi nhận file cập nhật mới, chỉ chép đè các file khác, GIỮ NGUYÊN file config.js này.

   - SHEET_SYNC_URL   : URL Web App của Apps Script (dạng https://script.google.com/macros/s/.../exec)
   - SHEET_SYNC_TOKEN : chuỗi bí mật, phải TRÙNG với SECRET_TOKEN trong Code.gs
   - GOOGLE_CLIENT_ID : Google OAuth Client ID (loại "Web application"), phải TRÙNG với GOOGLE_CLIENT_ID trong Code.gs
   - REMEMBER_DAYS    : số ngày ghi nhớ đăng nhập, phải TRÙNG với SESSION_TTL_DAYS trong Code.gs (hiện 15)

   Để trống SHEET_SYNC_URL -> app chạy cục bộ, không đồng bộ. Để trống GOOGLE_CLIENT_ID -> không yêu cầu đăng nhập Google.

   LƯU Ý nếu repo GitHub để CÔNG KHAI: file này sẽ ai cũng đọc được. Kẻ lạ vẫn không đăng nhập được (còn lớp Google +
   danh sách email), nhưng có thể gọi URL gây tốn hạn mức Apps Script. Muốn kín hơn hãy dùng repo riêng tư (private).
   ============================================================================ */
window.APP_CONFIG = {
  SHEET_SYNC_URL: "https://script.google.com/macros/s/AKfycbxCoDLzaz33EDqGHaP-1Q82_QLDwDzRNd7b_xV_Q47kxRG4wYIq1DBJweEEFPRXZ5dW/exec",
  SHEET_SYNC_TOKEN: "chitieu-2026-khoa2k",
  GOOGLE_CLIENT_ID: "720144060509-anhh4inbkjq5pnac30f6gi0op8mls7cl.apps.googleusercontent.com",
  REMEMBER_DAYS: 15
};
