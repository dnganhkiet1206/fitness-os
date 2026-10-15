# Kế hoạch: nhắn tin giữa người dùng (từ trang cá nhân)

> Trạng thái: **ĐỀ XUẤT — chờ chủ dự án / agent server duyệt.** Agent B (iOS) không đổi
> schema/RPC/RLS. Yêu cầu (15/10): bấm tên người đăng → trang cá nhân, "thêm tuỳ chọn nhắn tin".

Hiện trạng: database chỉ có hội thoại với AI coach (`ai_conversations` / `ai_messages`), **chưa có
nhắn tin người – người**. App iOS chưa thêm nút "Nhắn tin" vì nút không làm được gì là nút giả.

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
