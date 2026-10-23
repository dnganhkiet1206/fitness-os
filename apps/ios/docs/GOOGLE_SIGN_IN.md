# Đăng nhập bằng Google — việc Kiệt cần bật

App đã có nút **Tiếp tục với Google** (23/10). Nút **ẩn** cho tới khi bật đủ 3 bước dưới.
Agent không tự làm vì cần tạo khoá OAuth và đổi cấu hình Auth của dự án production.

1. **Google Cloud Console** → APIs & Services → Credentials → *Create OAuth client ID*
   → loại **Web application**. Ở *Authorized redirect URIs* thêm:
   `https://guqmbqtgxqleuwajvwvg.supabase.co/auth/v1/callback`.
   Màn *OAuth consent screen*: tên app ASCND, email hỗ trợ.
2. **Supabase** → Authentication → Sign In / Providers → **Google**: bật, dán *Client ID*
   và *Client Secret* vừa tạo.
   Authentication → URL Configuration → *Redirect URLs*: thêm `ascnd://**`
   (cũng cần cho link xác nhận email và đặt lại mật khẩu).
3. **App**: trong `apps/ios/project.yml` đổi `ASCND_SIGN_IN_WITH_GOOGLE: "NO"` → `"YES"`,
   chạy `xcodegen generate`, build lại.

Luồng trong app: chạm nút → tấm web của hệ thống mở trang chọn tài khoản Google →
Supabase tạo / mở phiên → quay về app qua `ascnd:///` → vào onboarding (tài khoản mới)
hoặc vào app. Đóng tấm Google giữa chừng thì không báo lỗi.
