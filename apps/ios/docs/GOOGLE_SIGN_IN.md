# Đăng nhập bằng Google — việc Kiệt cần bật

App có nút **Tiếp tục với Google** (23/10). **Đã bật xong 23/10:**
- Google Cloud project **ASCND** (`ascnd-512515`), màn đồng ý OAuth (External, chế độ
  *Testing*), OAuth client Web "ASCND Supabase"; test user: mkchanneldp@gmail.com.
- Supabase: Google provider bật (Kiệt dán Client ID / Secret), Redirect URLs `ascnd://**`.
- App: `ASCND_SIGN_IN_WITH_GOOGLE: "YES"`.
- **Kiểu native (cách A, Kiệt chọn 23/10):** OAuth client **iOS** "ASCND iOS (dev)" cho
  `com.ascnd.fitnessos.dev` và "ASCND iOS" cho `com.ascnd.fitnessos`; Client ID nằm ở
  `ASCND_GOOGLE_IOS_CLIENT_ID` trong `project.yml` (không phải bí mật) và đã thêm vào ô
  *Client IDs* của Supabase. App đi thẳng tới Google (PKCE) rồi `signInWithIdToken` —
  trang Google ghi "Tiếp tục tới ASCND", không hiện địa chỉ dự án Supabase, không có hộp
  hỏi của iOS (phiên riêng: mỗi lần đăng nhập Google phải chọn / gõ tài khoản).

**Còn lại:** app đang ở chế độ *Testing* của Google — chỉ test user (tối đa 100) đăng nhập
được. Mở cho mọi người = Google Auth Platform → Audience → *Publish app* (có thể cần Google
xét duyệt: trang chủ, chính sách quyền riêng tư, tên miền).

Các bước đã làm (để làm lại cho dự án khác):

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
