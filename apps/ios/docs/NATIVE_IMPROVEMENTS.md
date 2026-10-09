# Native khác RN — sổ cải tiến và chỗ lệch có chủ đích

## Chính sách (Kiệt, 09/10/2026)

Khi port, agent **được phép nâng cấp / cải thiện** một tính năng nếu phần ấy ở
React Native **chưa hoàn thiện** (lỗi, thiếu trạng thái, chữ sai, hành vi dễ gây
hiểu nhầm). Điều kiện:

1. **Ghi vào sổ này** trong CÙNG commit / PR thay đổi hành vi — không ghi thì
   coi như chưa được phép. (Từ 09/10 mọi agent commit thẳng lên
   `native/ios-rewrite`, chỉ thị #527 6074127548: ghi cột PR là commit SHA.)
2. RN cũng là app **Android**: mỗi dòng phải nói RN/Android có nên làm theo
   không (cột *RN/Android*), để người làm RN biết việc cần backport.
3. Không đổi hợp đồng dữ liệu (schema, RPC, RLS, hình dạng hàng ghi) chỉ vì một
   cải tiến phía client; đổi dữ liệu vẫn cần chốt riêng.
4. Golden / test vẫn lấy từ RN cho phần GIỐNG RN; phần cải tiến có test riêng
   nói rõ nó khác RN ở đâu. Không sửa expected của golden cho xanh.

Chỗ native **thiếu** so với RN (chưa port) không ghi ở đây — xem
`PARITY_MATRIX.md`. Sổ này chỉ ghi chỗ native **làm khác / làm hơn**.

Mở rộng (Kiệt, 09/10, sau đó): mọi agent **được sửa và tối ưu** code so với RN,
miễn **giữ nguyên ý định** của app và chỉ làm app tốt hơn — vẫn ghi lại ở đây.

## Cột

- **Loại**: `cải tiến` (native làm hơn RN) · `sửa lỗi RN` (RN sai, native làm
  đúng) · `lệch nền tảng` (khác vì iOS / app chưa có hạ tầng, không phải hơn).
- **RN/Android**: `nên làm theo` · `không cần` · `chờ quyết`.

## Sổ

| Màn / phần | Native làm gì | RN làm gì | Loại | RN/Android | PR | Agent |
|---|---|---|---|---|---|---|
| Nước uống — lần đọc đầu hỏng | Nói "không đọc được" / offline; thẻ ở tab Dinh dưỡng ẩn | Màn `/water` hiện `0.00L`, 0% như thể chưa uống gì | sửa lỗi RN | nên làm theo (màn `/water`) | #568 | A |
| Nước uống — biểu đồ 7 ngày | Cộng cả lần uống còn trong hàng đợi offline | Biểu đồ tuần không có bản vá lạc quan; hôm nay trên biểu đồ lệch số tổng cho tới khi server trả lời | cải tiến | nên làm theo | #568 | A |
| Nước uống — tiêu đề thẻ ở tab Dinh dưỡng | Chuỗi dịch đủ en/vi/es ("Agua") | `lang === 'vi' ? 'Nước uống' : 'Water'` — bản es hiện "Water" | sửa lỗi RN | nên làm theo | #568 | A |
| Nước uống — kết quả ghi | Một dòng trong thẻ + VoiceOver đọc | `toast` | lệch nền tảng (native chưa có toast) | không cần | #568 | A |
| Thực phẩm bổ sung — bản lưu của hôm qua | Mở lại offline sang ngày mới: giữ danh sách, **bỏ dấu "đã uống"** | Cache React Query giữ `taken` của ngày cũ tới khi đọc lại | sửa lỗi RN | nên làm theo | #570 | A |
| Thực phẩm bổ sung — câu khi rỗng | Giữ nguyên chữ RN ("Thêm stack của bạn trên bản web") | Câu cũ dù màn đã có nút "+" | (chưa sửa — ghi để quyết) | chờ quyết: đổi chữ ở cả hai | #570 | A |
| Thực phẩm bổ sung — kết quả thêm / xoá | Hộp thoại + VoiceOver | `Alert` / `toast` | lệch nền tảng | không cần | #570 | A |
| `daily_logs.water_ml` | Như RN: ghi nước KHÔNG dựng lại ngày | Như native | (lỗ chung, ghi để quyết) | chờ quyết: dựng lại sau khi ghi nước ở cả hai | #568 | A |
| Quãng nghỉ — nút tạm dừng | Có ở CẢ thẻ trong app lẫn Dynamic Island | 02/10 chỉ có trên Island, gỡ 03/10 | cải tiến | chờ quyết | #523 | (xem PARITY_MATRIX) |
| Tổng kết tuần — lời khuyên ACWR | Theo đúng băng `acwrZone` (0.65 / 0.8 / 1.3 / 1.6) mà thẻ sẵn sàng Today tô màu (`WeeklyReview.acwrAdvice`); test ghim 4 ca lệch: 0.6, 0.62 → "thấp"; 1.55, 1.6 → "hơi cao" | `weekly-review.tsx:480-497`: ngưỡng riêng > 1.5 / > 1.3 / < 0.6 — 1.55 bảo "giảm 15–20%" khi Today tô vàng; 0.6–0.65 im lặng khi Today tô đỏ | sửa lỗi RN (Kiệt giao E chốt, #527) | nên làm theo | #569 | E |
| Tổng kết tuần — một nguồn đọc hỏng | Cả tuần báo lỗi, có thử lại; đọc lại hỏng khi đã có số của đúng tuần thì giữ số | Mỗi query riêng; phần hỏng rỗng → ô số / biểu đồ vẽ như 0 | sửa lỗi RN | nên làm theo | #569 | E |
| Tổng kết tuần — ô thực phẩm bổ sung | Ẩn ô khi tỉ lệ không hữu hạn | Ô hỏng (chuỗi không phải số) → `NaN%` | sửa lỗi RN | nên làm theo | #569 | E |
| Tổng kết tuần — câu khuyến nghị | Chuỗi dịch đủ vi / en / es (`wr.rec.*`) | `L(vi, en)` — bản es hiện tiếng Anh | sửa lỗi RN | nên làm theo | #569 | E |
| Tổng kết tuần — lỗi phân tích AI | Lỗi hiện trong thẻ, có thử lại; chữ theo `AI_FAILURE_KEY` | `Alert.alert` (`weekly-review.tsx:350`) | lệch nền tảng | không cần | #572 | E |
| Thử thách tuần — đo tiến độ khi đọc hỏng | Bỏ qua thử thách đó, không ghi; báo "chưa đo lại được" (`WeeklyChallengesBook.refreshProgress`) | `use-extras.ts:551-645`: lỗi đọc bị bỏ qua → `newValue` 0 → **ghi đè tiến độ thật thành 0** (mất dữ liệu) | sửa lỗi RN | nên làm theo (mất dữ liệu trên Android) | #566 | E |
| Thử thách tuần — gieo tuần | Chỉ gieo các thử thách còn thiếu; trùng (23505) coi là đã có; đọc hỏng thì không gieo | `useInitWeeklyChallenges` (`use-extras.ts:424-462`): tuần đã có ≥ 1 hàng thì không gieo gì — tuần gieo dở thiếu mãi; đếm hỏng (`count` rỗng) bị đọc là 0 → chèn lại cả bộ | sửa lỗi RN | nên làm theo | #566 | E |
| Huy chương — màn đọc hỏng | Màn lỗi có thử lại | Vẽ như chưa có huy chương nào | sửa lỗi RN | nên làm theo | #563 | E |
| Thẻ ăn mừng — Reduce Motion | Không pháo giấy, đĩa không xoay-nảy | `award-celebration.tsx`: pháo giấy + xoay-nảy luôn chạy | cải tiến (a11y) | nên làm theo (`useReducedMotion`) | #567 | E |
| Thẻ ăn mừng — VoiceOver / ngôn ngữ | Đọc "Huy chương mới! <tên>" khi hiện; kicker + nhãn hạng vi / en / es | Không đọc gì; kicker chỉ vi ("Huy Chương Mới!") còn lại tiếng Anh; nhãn hạng luôn tiếng Anh | cải tiến (a11y, i18n) | nên làm theo | #567 | E |
| Xu hướng sẵn sàng 7 ngày — chữ | Chuỗi dịch đủ vi / en / es (`rt.*`) | TB / Cao nhất / chú giải `lang === 'vi' ? … : …` — bản es hiện tiếng Anh | sửa lỗi RN | nên làm theo | #571 | E |
| Ghi cân nặng — giao diện | Thước + số to; không vẽ hình chiếc cân (`BodyScaleFigure`) và hai nhãn mép cửa sổ thước | Có hình cân sáng lên khi kéo + nhãn mép | lệch nền tảng (rút gọn trang trí, không đổi hành vi) | không cần | #576 | A |
| Ghi cân nặng — Apple Health | Chưa ghi ngược | `writeBodyMassToHealth` sau khi lưu | (thiếu — guardrail HealthKit, chờ owner) | không cần | #576 | A |

Thêm dòng mới ở cuối bảng; giữ dòng cũ — sổ là lịch sử, không phải danh sách việc.
