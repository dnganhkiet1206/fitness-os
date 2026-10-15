# Kế hoạch: chia sẻ bài báo về gym trong Cộng đồng

> Trạng thái: **ĐỀ XUẤT — chờ chủ dự án / agent phụ trách server duyệt.**
> Agent B (iOS) KHÔNG đổi schema/RPC/RLS, không `supabase db push`. Tài liệu này
> chỉ mô tả việc cần làm; phần app chỉ được làm sau khi phía server đã lên.

Yêu cầu của chủ dự án (15/10): Cộng đồng "cũng được phép là nơi để người dùng chia
sẻ các news bài báo về gym nhưng có sự kiểm soát nghiêm ngặt và app phải báo trước
với người dùng về thông tin minh bạch".

## 1. Nguyên tắc

1. **Mặc định là chặn.** Một bài báo chỉ hiện với người khác khi nguồn nằm trong
   danh sách cho phép **và** đã qua kiểm duyệt (hoặc nguồn được đánh dấu tin cậy).
2. **Server quyết định, client không.** Danh sách nguồn, việc tải xem trước
   (tiêu đề / ảnh / mô tả) và trạng thái duyệt đều nằm trên server. App không tự
   fetch trang web của bên thứ ba để dựng thẻ, nên không bị giả mạo xem trước.
3. **Minh bạch trước, không phải sau.** Lần đầu đọc hoặc chia sẻ, người dùng thấy
   một tờ giải thích. Thẻ bài báo nào cũng có dải nguồn cố định.
4. **Không phải lời khuyên y tế.** Câu này luôn hiện trên thẻ và trong tờ giải thích.

## 2. Dữ liệu (phía server — cần migration mới)

Theo nếp của `20260927130000_community_post_kinds.sql`: chỉ một migration được nới
CHECK của `community_posts.kind`.

| Thay đổi | Chi tiết |
|---|---|
| `community_posts.kind` | thêm `'article'` vào CHECK. |
| Payload `article` | `{ url, canonical_url, domain, title, summary, image_url, published_at, source_id }`. Do **server** ghi sau khi tải xem trước; client chỉ gửi `url` + lời bình. |
| `community_posts.review_state` | `'pending' \| 'approved' \| 'rejected'`, mặc định `'approved'` cho 3 loại cũ, `'pending'` cho `article`. |
| Bảng `community_article_sources` | `id, domain (unique, đã chuẩn hoá), name, tier ('trusted' \| 'review'), active, note, added_by, created_at`. Chỉ `moderator/admin` (`app_roles`) được ghi, qua RPC có ghi `moderation_audit_log`. |
| RLS đọc bài | `article` có `review_state <> 'approved'` chỉ tác giả và `moderator/admin` đọc được. |

## 3. Luồng đăng

1. Người dùng dán liên kết, viết lời bình (bắt buộc ≥ 1 câu, để bài luôn có góc nhìn
   riêng, không chỉ là spam link).
2. RPC `community_share_article(url, caption, visibility)`:
   - chuẩn hoá URL (bỏ tham số theo dõi `utm_*`, `fbclid`…, theo chuyển hướng tối đa 3 bước, chỉ `https`);
   - so tên miền với `community_article_sources` (khớp chính xác hoặc tên miền con);
     không có trong danh sách → **từ chối ngay** với lý do `source_not_allowed`;
   - edge function tải xem trước (giới hạn thời gian / kích thước, không chạy JS, lọc HTML);
   - áp giới hạn đăng hiện có (`community_posting_limits`) + riêng bài báo: tối đa 3 bài/ngày;
   - nguồn `trusted` → `approved`; nguồn `review` → `pending` và vào hàng duyệt.
3. Người đăng thấy bài của mình kèm nhãn "Đang chờ duyệt"; người khác chưa thấy.
4. Moderator duyệt / từ chối (lý do theo danh sách `community_hide_reasons`), ghi nhật ký.
   Báo cáo từ người dùng (`community_reports`) vẫn áp dụng cho bài đã duyệt.

## 4. Quy tắc kiểm duyệt (đề xuất ban đầu)

Từ chối khi:
- quảng cáo / tiếp thị liên kết, mã giảm giá, bán thực phẩm chức năng;
- khẳng định y tế không có nguồn (chữa bệnh, giảm cân thần tốc, thuốc / steroid);
- tiêu đề giật gân không khớp nội dung;
- nội dung trả phí mà người đọc không mở được;
- trùng một bài đã có trong 7 ngày (cùng `canonical_url`).

Danh sách nguồn khởi đầu do chủ dự án chọn (ví dụ: tạp chí khoa học thể thao, các
hiệp hội huấn luyện, báo lớn có chuyên mục sức khoẻ). Agent không tự chọn nguồn.

## 5. Minh bạch trong app

### Tờ giải thích (hiện lần đầu đọc hoặc chia sẻ bài báo; mở lại từ "Vì sao?")

1. **Nguồn đã kiểm duyệt.** Chỉ các trang trong danh sách nguồn của ASCND mới được chia sẻ.
2. **Người thật duyệt.** Bài từ nguồn chưa tin cậy phải được người kiểm duyệt xem trước khi hiện.
3. **Không phải lời khuyên y tế.** Hỏi bác sĩ / chuyên gia trước khi đổi chế độ tập hoặc ăn.
4. **Mở ra ngoài app.** Bấm vào thẻ sẽ mở trang gốc. ASCND không sở hữu nội dung đó.
5. **Bạn có thể báo cáo.** Thấy sai hoặc quảng cáo, dùng "⋯ → Báo cáo".

Nút: "Đã hiểu". Lưu đã xem theo từng người dùng (không cần server).

### Dải nguồn trên mọi thẻ bài báo

`🛡 Nguồn đã kiểm duyệt · tên-miền.com · Không phải lời khuyên y tế · Vì sao?`

### Thẻ (theo kiểu bài đăng 15/10)

Đầu thẻ như các bài khác → lời bình → khối liên kết sáng (ảnh 16:9 nếu có, tên
nguồn, tiêu đề 2 dòng, mô tả 2 dòng) → dải nguồn → hàng thích / bình luận / lưu / chia sẻ.
Mở bằng `SFSafariViewController` (đọc trong app, có thanh địa chỉ thật), không WebView tự dựng.

## 6. Việc của từng bên

| Bên | Việc |
|---|---|
| Chủ dự án | Duyệt kế hoạch; chọn danh sách nguồn ban đầu; chọn moderator. |
| Agent server | Migration (mục 2), RPC + edge function xem trước (mục 3), hàng duyệt cho moderator, test RLS. |
| Agent B (iOS) | Sau khi server lên: kind `article` trong `CommunityFeed`, ô dán liên kết trong composer, thẻ + dải nguồn, tờ giải thích, nhãn "Đang chờ duyệt", chuỗi vi/en/es. |

## 7. Câu hỏi còn mở

- Bài báo có hiện ở tab "Đang theo dõi" hay chỉ "Khám phá"?
- Có cho người dùng đề xuất nguồn mới (vào hàng duyệt của admin) không?
- Ngôn ngữ: chỉ nguồn tiếng Việt / Anh, hay mở theo ngôn ngữ app?
