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

## 4. Duyệt tự động bằng thuật toán (không dùng AI — không tốn phí theo lượt)

Chủ dự án (15/10) hỏi bot có miễn phí không → chọn **thuật toán chấm điểm** chạy
trong Postgres / edge function sẵn có. AI chỉ cân nhắc sau này, và chỉ cho vùng giữa.

### 4.1 Chuẩn hoá chữ (mọi ngôn ngữ)
1. Nhận ngôn ngữ bài (xem §5): `vi`, `en`, `es` (khớp ba ngôn ngữ của app).
2. Viết thường, bỏ dấu (`unaccent` — đã dùng cho tìm kiếm), gộp khoảng trắng.
3. Bỏ ký tự lách: `0→o, 1→i, 3→e, 4→a, 5→s, @→a`, bỏ dấu chấm / gạch chen giữa chữ
   ("s.t.e.r.o.i.d" → "steroid").

### 4.2 Cổng cứng — sai một điều là từ chối ngay (lý do hiện cho người đăng)
| Mã | Điều kiện |
|---|---|
| `source_not_allowed` | tên miền không trong `community_article_sources` |
| `bad_link` | không `https`, link rút gọn, chuyển hướng sang tên miền khác |
| `affiliate` | tham số `aff=`, `ref=`, `tag=`, `coupon=`… |
| `duplicate` | trùng `canonical_url` trong 7 ngày (cùng khu vực) |
| `rate_limit` | > 3 bài báo / ngày / người |
| `banned_substance` | từ trong danh sách chất cấm (steroid, SARMs, clenbuterol, DNP…) ở bất kỳ ngôn ngữ nào |
| `language_unsupported` | không nhận được ngôn ngữ, hoặc ngôn ngữ ngoài danh sách khu vực cho phép |

### 4.3 Điểm rủi ro 0–100
Từ khoá đặt trong bảng `community_moderation_terms(term_folded, lang, category, weight, active)`
— **mỗi ngôn ngữ một bộ**, admin sửa được, không cần ra bản app mới. Ví dụ hạt giống:

| Nhóm | vi | en | es | Điểm |
|---|---|---|---|---|
| Bán hàng | mua ngay, giảm giá, mã ưu đãi | buy now, discount, promo code | compra ya, descuento, código | +40 |
| Hứa hẹn thần kỳ | thần tốc, cam kết, giảm 10kg | miracle, guaranteed, lose 10kg | milagro, garantizado | +30 |
| Khẳng định y tế | chữa, điều trị, khỏi bệnh | cure, treat, heal | cura, tratamiento | +15 |
| Giật gân | sốc, bất ngờ | shocking, you won't believe | impactante | +10 |

Tín hiệu không phụ thuộc ngôn ngữ:
- tiêu đề > 40% chữ in hoa hoặc có "!!!": +10;
- tiêu đề và mô tả trùng < 15% từ (Jaccard): +15;
- lời bình có số điện thoại / link / email: +40; lời bình < 3 từ: +10.

### 4.4 Điểm tin cậy (trừ / cộng)
- Nguồn hạng `trusted`: −20.
- Tài khoản > 30 ngày và có ≥ 1 bài đã duyệt: −10.
- Tỉ lệ bài bị từ chối / báo cáo cao (`community_report_trust`): +20.

### 4.5 Quyết định
- **≤ 20** và nguồn `trusted` → `approved`, hiện ngay (nhãn "Duyệt tự động").
- **≥ 70** → `rejected`, lý do = tín hiệu nặng nhất; người đăng có nút **khiếu nại** → hàng người duyệt.
- Còn lại → `pending`, vào hàng moderator **cùng khu vực / ngôn ngữ**.
- Cột `moderated_by`: `'rule' | 'human'`; mọi quyết định vào `moderation_audit_log` (actor = `system` cho luật).

### 4.6 Sau khi hiện, và tự chỉnh
- Báo cáo cộng theo độ tin cậy người báo cáo; vượt ngưỡng → tự ẩn, chờ người xem.
- Moderator kiểm ngẫu nhiên 10% bài tự duyệt.
- Nguồn ≥ 20 bài duyệt, 0 bị từ chối → **đề xuất** nâng `trusted` (admin xác nhận).
- Từ khoá hay gây từ chối nhầm (bị lật khi khiếu nại) → hạ điểm, báo admin.

### 4.7 Hạn chế
Không hiểu ngữ cảnh ("điều trị chấn thương" trong bài khoa học vẫn bị +15) → nhờ
vùng giữa + nguồn tin cậy. Ngưỡng cần chỉnh theo dữ liệu thật vài tuần đầu.

## 5. Đa ngôn ngữ

- Mỗi bài có `lang` (`vi|en|es`):
  - bài báo: lấy `<html lang>` / `og:locale` khi server tải xem trước; thiếu thì
    đoán bằng tỉ lệ từ dừng (stopwords) của từng ngôn ngữ trên tiêu đề + mô tả;
  - bài người dùng (buổi tập / tiến bộ / công thức): ngôn ngữ app của người đăng
    lúc đăng; lời bình đoán như trên, lệch thì lấy lời bình.
- Nguồn có `langs` (một trang báo tiếng Việt chỉ được duyệt cho `vi`).
- Moderator gắn với ngôn ngữ họ đọc được (`app_roles` thêm `langs`); hàng chờ chia theo ngôn ngữ.
- Tờ minh bạch, dải nguồn, lý do từ chối: đủ vi/en/es (`Localizable.xcstrings`).
- Người xem chọn "Ngôn ngữ bài viết" (mặc định = ngôn ngữ app; có thể bật thêm).

## 6. Khu vực — không trộn bài giữa các khu vực

### 6.1 Xác định khu vực (khuyến nghị: KHÔNG dựa chính vào IP)
IP sai khi dùng VPN / 4G chuyển vùng / đi du lịch, và là dữ liệu cá nhân nhạy cảm.
Thứ tự ưu tiên:
1. **Khu vực người dùng tự chọn** trong Cài đặt (`profiles.community_region`).
2. Mặc định khi chưa chọn: vùng của thiết bị (`Locale.current.region`) lúc đăng ký.
3. IP **chỉ** là dự phòng phía server, tra ra mã quốc gia rồi **bỏ IP, không lưu**.

Khu vực là nhóm quốc gia, ví dụ `VN`, `SEA`, `US`, `LATAM`, `EU` (bảng
`community_regions(code, countries[], langs[])`). Đổi khu vực tối đa 1 lần / 30 ngày
để chống lách.

### 6.2 Áp dụng
- Bài lưu `region` = khu vực người đăng lúc đăng (không đổi về sau).
- Feed "Khám phá", tìm kiếm, thử thách, gợi ý theo dõi: **chỉ** bài cùng `region`.
- "Đang theo dõi": vẫn thấy người mình theo dõi ở khu vực khác (mình chủ động chọn họ),
  có nhãn khu vực nhỏ. Nếu chủ dự án muốn tách tuyệt đối → tắt ngoại lệ này.
- Nguồn báo có `regions` — trang báo Việt chỉ duyệt cho `VN`.
- Lọc ở **RLS / RPC phía server**, không lọc ở app (app lọc thì lách được).

## 7. Xếp hạng feed theo điều người dùng quan tâm

### 7.1 Hồ sơ sở thích (tính trên server, chỉ từ dữ liệu trong app)
Vector chủ đề, mỗi chủ đề 0–1, cập nhật mỗi đêm + khi có tương tác:
- **Mục tiêu** (`profiles.goal`: giảm mỡ / tăng cơ / giữ dáng) → chủ đề tương ứng.
- **Tập gì**: nhóm cơ & bài trong 4 tuần gần nhất (`MuscleGroup`).
- **Ăn gì**: bữa có ghi → protein cao / ít carb / món Việt…
- **Tương tác**: thích +1, lưu +3, bình luận +2, mở bài báo +1, đọc > 10 giây +1,
  ẩn bài −5, "Không quan tâm" −8. Giảm dần, nửa đời 14 ngày.

Mỗi bài có chủ đề: bài buổi tập → nhóm cơ; công thức → nhãn dinh dưỡng; bài báo →
từ khoá chủ đề theo ngôn ngữ (bảng tương tự §4.3, nhóm `topic`).

### 7.2 Điểm xếp hạng (chỉ trên tập đã qua lọc khu vực + ngôn ngữ + duyệt)
```
điểm = 0.40 · khớp_sở_thích     (cosine vector người dùng · chủ đề bài)
     + 0.25 · độ_mới           (e^(−giờ/24))
     + 0.20 · xã_hội           (người mình theo dõi, bạn của bạn, đã tương tác với tác giả)
     + 0.15 · chất_lượng       (tương tác / lượt xem, chuẩn hoá; bài báo nguồn trusted +)
```
Rồi áp luật đa dạng:
- tối đa 2 bài liền nhau cùng tác giả hoặc cùng loại;
- tối đa 1 bài báo trong mỗi 4 bài (cộng đồng là chính, báo là phụ);
- 10% chỗ dành cho bài ngoài sở thích (khám phá), để feed không bị đóng khung.

Người mới (chưa đủ dữ liệu): dùng mục tiêu + bài nổi bật trong khu vực.

### 7.3 Minh bạch & quyền chọn
- "⋯ → Vì sao tôi thấy bài này?": "Vì bạn tập ngực tuần này", "Từ người bạn theo dõi"…
- "Không quan tâm chủ đề này".
- Công tắc **"Feed theo thời gian"** (không cá nhân hoá) trong Cài đặt — nên có cho
  minh bạch và cho thị trường EU (DSA yêu cầu lựa chọn không dựa trên hồ sơ).
- Dữ liệu sở thích không rời server, không bán / chia sẻ; xoá tài khoản là xoá theo.

## 8. Minh bạch trong app

### Tờ giải thích (hiện lần đầu đọc hoặc chia sẻ bài báo; mở lại từ "Vì sao?")

1. **Nguồn đã kiểm duyệt.** Chỉ các trang trong danh sách nguồn của ASCND mới được chia sẻ.
2. **Kiểm tra tự động + người thật.** Hệ thống chấm điểm mọi bài; bài chưa chắc chắn được người kiểm duyệt xem trước khi hiện.
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

## 9. Việc của từng bên

| Bên | Việc |
|---|---|
| Chủ dự án | Duyệt kế hoạch; chọn danh sách nguồn ban đầu; chọn moderator. |
| Agent server | Migration (mục 2 + `lang`, `region`, `moderated_by`, bảng từ khoá / khu vực), RPC + edge function xem trước (mục 3), thuật toán duyệt (mục 4), lọc khu vực ở RLS/RPC (mục 6), job sở thích + RPC feed xếp hạng (mục 7), test RLS. |
| Agent B (iOS) | Sau khi server lên: kind `article`, ô dán liên kết, thẻ + dải nguồn, tờ giải thích, nhãn "Đang chờ duyệt" / lý do từ chối + khiếu nại, chọn khu vực & ngôn ngữ bài viết trong Cài đặt, "Vì sao tôi thấy bài này", "Không quan tâm", công tắc feed theo thời gian, chuỗi vi/en/es. |

## 10. Câu hỏi còn mở

- Bài báo có hiện ở tab "Đang theo dõi" hay chỉ "Khám phá"?
- "Đang theo dõi" có được thấy người ở khu vực khác không (§6.2), hay tách tuyệt đối?
- Danh sách khu vực ban đầu (đề xuất: `VN`, `SEA`, `US`, `LATAM`, `EU`).
- Trọng số xếp hạng §7.2 — giữ đề xuất rồi chỉnh theo số liệu?
- Có cho người dùng đề xuất nguồn mới (vào hàng duyệt của admin) không?
- Ngôn ngữ: chỉ nguồn tiếng Việt / Anh, hay mở theo ngôn ngữ app?
