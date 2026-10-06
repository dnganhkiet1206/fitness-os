# ASCND — Product Contract

Hợp đồng sản phẩm ngắn gọn cho Native iOS Rewrite (issue #222, ADR-0001/0002).

## Sản phẩm

ASCND là app fitness cá nhân: lập kế hoạch buổi tập theo tuần, ghi nhận set
tập (kg × reps × RPE), nghỉ giữa set có đồng hồ đếm ngược, theo dõi tiến trình.

## Nguyên tắc bất biến

1. **Dữ liệu của user không bao giờ mất.** Mọi mutation có đường offline
   (outbox), lỗi thì báo, không im lặng.
2. **Warm-up không tính vào volume.** Set đánh dấu warm-up chỉ để khởi động.
3. **Nghỉ là khoảng thời gian.** Chỉ một quyết định chủ động (Bỏ qua / hết
   giờ) mới kết thúc quãng nghỉ — không có cử chỉ vô tình nào được phép.
4. **Đồng hồ nghỉ chạy bằng thời gian tuyệt đối.** Native suy ra đếm ngược từ
   endDate; JS không tick qua bridge mỗi giây.
5. **Một buổi tập = một sự thật.** Volume, PR, RPE suy ra từ set đã ghi, không
   nhập tay.

## Phạm vi spec

- `behavior/`: hành vi từng màn/flows (nguồn chân lý cho test).
- `vectors/`: golden vectors `{rule, input, expected}` — D có quyền BLOCK PR
  iOS nếu vector fail.
- `api/`, `design/`, `analytics/`: owner điền sau (xem README từng thư mục).

## Ngôn ngữ

vi / en / es. Không hard-code text UI; plural theo `{n} {n:set|sets}`.
