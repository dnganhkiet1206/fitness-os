/**
 * Cờ khởi động Chromium chung cho mọi công cụ chạy trình duyệt (#188).
 *
 * Từ khoảng Chromium 142, Local Network Access chặn trang nạp tài nguyên từ
 * mạng cục bộ: trên máy của C (Chromium 152), `live.mjs --shots` dừng ở
 * `ERR_BLOCKED_BY_LOCAL_NETWORK_ACCESS_CHECKS` khi mở http://localhost:8731/
 * (#188; cách vượt tạm bằng proxy ở docs/chup-man-hinh-proxy.md). Mọi công cụ ở
 * đây CỐ Ý nạp app từ localhost — máy chủ tĩnh và Supabase giả chạy cạnh — nên
 * phép kiểm ấy không bảo vệ gì cho chúng, chỉ chặn.
 *
 * Chromium chưa có tính năng ấy (bản 141 ở môi trường chạy cổng) bỏ qua cờ.
 */
export const CHROMIUM_ARGS = ['--disable-features=LocalNetworkAccessChecks'];
