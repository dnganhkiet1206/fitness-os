# Kế hoạch: nhắn tin giữa người dùng (từ trang cá nhân)

> Trạng thái (20/10): **chủ dự án duyệt "làm tin nhắn thật"**. Migration
> `supabase/migrations/20261020130000_direct_messages.sql` + `SupabaseDMSource` đã viết; **đã `supabase db push` lên production (20/10, chủ dự án nhờ)**. Nếu RPC hỏng → hộp thư không đọc được → nút ẩn (không màn lỗi).
> Đã thử trên PostgreSQL 16 dựng từ mọi migration, vai `authenticated` + RLS: 21/21 ca (xem PR).
> Chưa có: thông báo đẩy, realtime (đọc lại khi mở), báo cáo tin, gửi ảnh.

Hiện trạng: database chỉ có hội thoại với AI coach (`ai_conversations` / `ai_messages`), **chưa có
nhắn tin người – người**.

**iOS đã làm sẵn (15/10, chủ dự án duyệt mock)** — ẩn cho tới khi có server:
- Lõi `ASCNDCore/Community/DirectMessages.swift`: `DirectMessages` (Thread, Message, Body text / workout,
  Row có vạch ngày + "Đã xem" chỉ dưới tin cuối của mình đã đọc, split tin chờ, lọc bỏ dấu), giao thức
  `DMSource`, `DMInboxBook`, `DMThreadBook` (gửi, đánh dấu đã đọc, tin chờ → chính khi trả lời). Có test.
- Màn `CommunityMessagesView.swift`: Hộp thư (tiêu đề lớn, tìm, "Tin chờ", hàng có vòng hồng khi người ấy
  đang tập, chấm chưa đọc), Tin chờ, Hội thoại (bong bóng đen / trắng, buổi tập dạng bảng điểm, "+" gửi
  buổi tập gần nhất, nút gửi tròn). Lối vào: nút giấy bay ở đầu tab Cộng đồng (chấm khi có tin chưa đọc),
  nút tròn trên trang cá nhân người khác.
- `AppServices.makeDirectMessages()` trả `nil` → không lối vào nào hiện. Bản Debug thử với
  `SIMCTL_CHILD_ASCND_FAKE_DM=1` (`FakeDMSource`, dữ liệu mẫu trong bộ nhớ, ghi chú "Dữ liệu mẫu").
- Khi server xong: viết `SupabaseDMSource: DMSource` theo bảng dưới, cho `makeDirectMessages` trả nó.

## Server (cần migration)
- `dm_threads(id, a uuid, b uuid, created_at, last_message_at)` — `a < b`, unique (a, b).
- `dm_messages(id, thread_id, sender_id, body text ≤ 1000, created_at, read_at, hidden)`.
- RLS: chỉ hai người trong thread đọc / ghi; không ai sửa tin của người khác.
- RPC `dm_open(other)` — từ chối nếu một bên chặn bên kia (`community_mutes` / chặn), nếu `other`
  tắt nhận tin, hoặc nếu mình đang bị hạn chế (`community_restrictions`).
- Quyền riêng tư: "Ai được nhắn cho tôi" — mọi người / người tôi theo dõi / không ai (mặc định:
  người tôi theo dõi). Tin đầu từ người lạ vào "Tin chờ" (như Instagram).
- Giới hạn: 30 tin / phút / người, 20 thread mới / ngày. Báo cáo tin dùng lại `community_reports`.
- Thông báo đẩy + realtime (Supabase Realtime trên `dm_messages`).

## iOS (sau khi server lên)
- Trang cá nhân: nút "Nhắn tin" cạnh "Theo dõi" (ẩn khi không được phép).
- Hộp thư (từ nút chuông / tab riêng) + màn hội thoại: bong bóng tối giản, thanh viết giống màn
  bình luận bật lên (ô bo tròn + nút gửi tròn), "Đã xem", nhấn giữ → Báo cáo / Xoá phía mình.
- Chuỗi vi/en/es; thông báo đẩy kiểm trên thiết bị thật.

## Câu hỏi
- Mặc định "Ai được nhắn cho tôi"? Có cho gửi ảnh không (cần Storage + kiểm duyệt ảnh)?
