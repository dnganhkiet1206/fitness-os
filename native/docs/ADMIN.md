# Vận hành Cộng đồng — vai trò, kiểm duyệt, nhật ký

Tài liệu cho người vận hành ASCND: cách có admin đầu tiên, ai làm được gì, và
quyền được kiểm ở đâu. Mã nguồn: `supabase/migrations/20261007130000_community_admin.sql`,
`supabase/functions/admin-art/`, và các màn `/admin/*` (chỉ trên web).

## Không có hệ thống đăng nhập thứ hai

Người kiểm duyệt và admin là **người dùng Supabase Auth bình thường**, đăng nhập
bằng đúng màn đăng nhập của app. Vai trò là một hàng trong `public.app_roles`:

| Vai trò | Có hàng trong `app_roles`? | Làm được |
|---|---|---|
| `user` | không | dùng app |
| `moderator` | `role = 'moderator'` | hàng đợi báo cáo, kháng nghị, ẩn / khôi phục / gỡ / bác báo cáo |
| `admin` | `role = 'admin'` | mọi việc của moderator, cộng: người dùng & vai trò, thư viện ảnh, nhật ký kiểm toán, hoàn tác một lần gỡ |

Không email nào được viết cứng trong code. Không có đường nào để một người tự
đăng ký làm admin.

## Admin đầu tiên

Chỉ quyền **server** làm được, và chỉ khi **chưa có admin nào**:

1. Người đó tạo tài khoản ASCND như mọi người (đăng ký trong app).
2. Người giữ quyền database chạy, ở SQL Editor của Supabase (vai `postgres`) hoặc
   bằng `psql`:

   ```sql
   SELECT public.bootstrap_first_admin('email-cua-nguoi-do@vi-du.com');
   ```

   Hoặc bằng khoá `service_role` (KHÔNG BAO GIỜ đưa khoá này vào app):

   ```bash
   curl -X POST "$SUPABASE_URL/rest/v1/rpc/bootstrap_first_admin" \
     -H "apikey: $SERVICE_ROLE_KEY" -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
     -H "Content-Type: application/json" -d '{"p_email":"email-cua-nguoi-do@vi-du.com"}'
   ```

`authenticated` và `anon` không có quyền gọi hàm này. Gọi lần hai khi đã có admin
thì bị từ chối (`42501`) — từ đó admin cấp vai trò cho người khác trong bảng
điều khiển (Users → đổi vai trò), qua `admin_set_role`. Lần khởi tạo được ghi
vào nhật ký kiểm toán với người làm là `system`.

## Quyền được kiểm ở đâu

**Ở database, không ở nút bấm.** Mọi việc của bảng điều khiển là một hàm
`SECURITY DEFINER` (`mod_*`, `admin_*`) tự hỏi vai trò của `auth.uid()` trước
khi làm gì. Màn `/admin` chỉ hỏi `my_app_role()` để biết nên hiện gì; ẩn một nút
không cho ai thêm quyền nào, và hiện một nút cũng không.

| Người gọi | Hàm của moderator (`mod_*`) | Hàm chỉ admin (`admin_*`) |
|---|---|---|
| không token / token sai chữ ký / hết hạn | 401 (PostgREST từ chối trước khi tới hàm) | 401 |
| anon key | 401 (`42501`, vai anon không có quyền EXECUTE) | 401 |
| người dùng thường | 403 (`42501`) | 403 |
| moderator | thành công | 403 (`42501`) |
| admin | thành công | thành công |

PostgREST đổi `42501` thành **401 cho vai `anon`** và **403 cho người đã đăng
nhập**.

Thêm vài luật mà không nút nào vượt qua được:

- Không ai tự đổi vai trò của chính mình; người kiểm duyệt không tự nâng mình lên
  admin được.
- Không bao giờ hạ được admin **cuối cùng** (khoá bảng vai trò, nên hai admin hạ
  nhau cùng lúc cũng không để lại không ai).
- **Gỡ** (remove) là quyết định cuối: nội dung vẫn ẩn, tác giả không kháng nghị
  được nữa, và chỉ admin hoàn tác. Gỡ bắt buộc phải có lý do.
- **Bác báo cáo** chỉ dùng cho nội dung vẫn đang hiện. Nội dung đang ẩn thì quyết
  định là khôi phục hoặc gỡ.
- Người dùng không đọc được `app_roles` của người khác, và không ai đọc thẳng
  được `moderation_audit_log` — chỉ qua `admin_audit` (admin).

## Nhật ký kiểm toán

`public.moderation_audit_log` chỉ thêm, không sửa, không xoá — trigger chặn
`UPDATE`, `DELETE` và `TRUNCATE` cho **mọi vai**, kể cả `service_role` và chủ
bảng. Xoá tài khoản của người kiểm duyệt không xoá dấu vết việc họ đã làm
(`actor_id` không có khoá ngoại).

Hành động được ghi: `HIDE_POST`, `RESTORE_POST`, `REMOVE_POST`, `HIDE_COMMENT`,
`RESTORE_COMMENT`, `REMOVE_COMMENT`, `DISMISS_REPORT`, `APPROVE_APPEAL`,
`REJECT_APPEAL`, `ADD_IMAGE`, `REMOVE_IMAGE`, `RESTORE_IMAGE`, `ROLE_CHANGE`.
Mỗi dòng có người làm, vai của họ lúc làm, đích, lý do và thời điểm.

## Báo cáo → tự ẩn → kháng nghị

- 3 người khác nhau báo cáo (đang mở) → nội dung tự ẩn. Báo cáo đã bị bác không
  còn tính — trước 03/10 chúng vẫn tính, nên một bài vừa khôi phục chỉ cần thêm
  MỘT báo cáo là ẩn lại.
- Tác giả kháng nghị được **một lần cho mỗi đợt ẩn**, kèm lời nhắn ≤ 500 ký tự.
  Bị từ chối thì đợt đó hết đường kháng nghị; được khôi phục rồi bị ẩn lại thì có
  một lần mới.
- Moderator / admin: chấp nhận (nội dung hiện lại, báo cáo đóng) hoặc từ chối
  (vẫn ẩn), hoặc gỡ hẳn.
- Từ 04/10 (#6): chỉ báo cáo của tài khoản **đủ điều kiện** (≥ 30 ngày tuổi VÀ
  có đóng góp trong 30 ngày) mới tính vào ngưỡng; màn kiểm duyệt gắn nhãn
  "Không tính" cho phần còn lại. Mỗi người tối đa 10 báo cáo / 24 giờ.

## Chống spam đăng bài

- Trần tự động: 10 bài và 30 bình luận mỗi 60 phút cho một người (đội kiểm
  duyệt không bị trần). Vượt trần thì app nói "đợi một lúc", không ghi gì.
- **Tạm khoá đăng** (moderator / admin, ở mục "Tài khoản tác giả" của màn một
  bài hay bình luận): 24 giờ hoặc 7 ngày (server nhận 1–720 giờ), **bắt buộc lý
  do**, luôn hỏi lại, ghi `RESTRICT_USER` / `UNRESTRICT_USER` vào nhật ký.
  Người bị khoá vẫn đọc, thích, theo dõi — chỉ không đăng bài hay bình luận —
  và app nói rõ đến bao giờ, vì sao. Hết hạn thì tự hết.
- Không khoá được chính mình hay người trong đội kiểm duyệt (đổi vai trò trước).

## Thư viện ảnh

Admin thêm ảnh qua Edge Function `admin-art` (tải tệp lên bucket `community-art`
bằng `service_role` **sau khi** kiểm vai trò bằng token của người gọi, rồi ghi
hàng bằng chính token ấy nên database kiểm lần nữa và ghi `ADD_IMAGE`). PNG,
JPEG hoặc WebP, ≤ 1 MiB, kiểu khai phải khớp byte đầu của tệp. Ảnh không bao giờ
bị xoá, chỉ **tắt**: bài cũ đã dùng nó vẫn phải vẽ được.

Deploy: `supabase functions deploy admin-art` (mục `verify_jwt = false` đã có
trong `config.toml` — function tự kiểm token).

## Bảng điều khiển

Mở `/admin` trên **bản web** của app, đăng nhập bằng tài khoản có vai trò. Bản
iOS không có lối vào: bảng điều khiển là công cụ bàn làm việc, không phải một
phần của app tập luyện. Người không có vai trò mở thẳng `/admin` chỉ thấy một
câu "không có quyền", và không một lời gọi dữ liệu quản trị nào được gửi đi.
