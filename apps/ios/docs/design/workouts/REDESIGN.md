# Tab Tập luyện — audit và thiết kế lại (14/10/2026)

Chủ dự án giao "audit màn tập luyện so với RN và redesign lại", duyệt mock 4
màn ngày 14/10. RN đối chiếu @ fac9ac2: `app/(tabs)/workouts/{index,library,plan}.tsx`,
`components/ascnd/today-training.tsx`, `components/ascnd/body-panel.tsx`.

## Audit (trước)

| # | Vấn đề | RN |
|---|---|---|
| 1 | Hễ hôm nay có buổi trong kế hoạch, cả tab là màn đang tập (`flow.session`) — không vào được mẫu buổi tập, thư viện, kế hoạch tuần, Cơ thể; chỉ còn nút Lịch sử | Trang gốc luôn là trang chính; thẻ hôm nay có nút "Bắt đầu" |
| 2 | Không có dải tuần | `WeekStrip` 7 ngày trên thẻ, chạm → kế hoạch |
| 3 | Thẻ hôm nay là một đoạn chữ chung | 4 trạng thái: chưa tập / đã xong / ngày nghỉ (gợi ý) / chưa có kế hoạch (chọn buổi) |
| 4 | Không có phân đoạn Cơ thể (màn cân nặng / số đo / ảnh nằm ở tab Trợ lý) | Buổi tập \| Cơ thể |
| 5 | Ba hàng công cụ | Hai hàng: Thư viện & lịch sử, Tiến bộ từng bài |
| 6 | Large title của thanh điều hướng, `DSCard` cũ | Đầu trang trong nội dung (như Hôm nay / Dinh dưỡng) |

## Thiết kế (sau)

- **Đầu trang trong nội dung**: "Tập luyện" + nút Lịch sử tròn; phân đoạn Buổi tập | Cơ thể.
- **Dải tuần** (`WorkoutHome.week`): Thứ Hai → Chủ nhật; đã tập = chấm đặc có dấu tick; có buổi = vòng; hôm nay vòng đậm; lỡ = vòng nét đứt; nghỉ = lá; chưa lên lịch = vòng mờ. Chạm → Kế hoạch tuần.
- **Thẻ hôm nay** (`WorkoutHome.hero`, luật gốc là `TodayRules.cta`):
  - có buổi → dòng nhỏ "HÔM NAY · THỨ TƯ", tên buổi, "bài · set · phút" (Menlo), danh sách bài "3 × 10", nút đen "Bắt đầu buổi tập";
  - **đang tập** (native) → viền màu Tập luyện, thanh "Đã xong x/y set", nút "Tiếp tục";
  - đã tập → "Xem buổi đã tập" + "Ghi thêm buổi phát sinh";
  - ngày nghỉ → trăng, 3 gợi ý (đi bộ, giãn cơ, vận động nhẹ), "Vẫn muốn tập" (kế hoạch) + "Ghi buổi tập";
  - chưa có kế hoạch → "Chọn buổi tập" + "Ghi buổi tập".
- **Bảng chọn buổi** `WorkoutPickerSheet` (`workout-picker-sheet.tsx`): Ngày nghỉ, Gợi ý (3 buổi dùng gần nhất), Buổi tập của bạn (bài · set · phút, dấu chọn), Tạo buổi tập mới; mở từ "Chọn buổi tập", "Vẫn muốn tập" và nút đổi ⇄ trên thẻ. RN chỉ rung (ghi là TODO, issue 221) — ở đây GHI THẬT qua `PlanEditor.assign`, nói rõ "áp dụng cho mọi Thứ X trong kế hoạch tuần".
- **Màn tập** là lớp toàn màn hình (`fullScreenCover`), nút thu nhỏ ở góc trái; tiến độ và đồng hồ nghỉ giữ nguyên. "Bắt đầu" ở tab Hôm nay mở thẳng lớp này.
- **Mẫu buổi tập (n)**: 3 mẫu mới nhất trong một thẻ danh sách + hàng "+ Tạo buổi tập"; "Xem tất cả".
- **Công cụ**: Thư viện & lịch sử (số buổi gần đây) → trang `LibraryHistoryView`; Tiến bộ từng bài.
- **Cơ thể**: thẻ Cân nặng `WeightTrendCard` (phần cân nặng của `BodyPanel`: số hiện tại Menlo + chênh lệch 90 ngày xanh khi đúng hướng mục tiêu, biểu đồ Tuần / Tháng / Năm / Tất cả, đường cân mục tiêu nét đứt lưu trên máy, thước BMI 4 vùng WHO, "Ghi cân nặng"); Số đo, Ảnh tiến trình, Hiệu chỉnh mục tiêu (màn đã có). **Cập nhật 14/10 (chủ dự án)**: màu cân nặng = `metricBlue` + `scalemass.fill` như hàng Cân nặng ở Hôm nay; hàng "Cân nặng mục tiêu" (còn x kg / đã đạt) mở `WeightGoalSheet` — CÁI CÂN vẽ tay (mặt cân, ô kính, mặt số cong quay theo lò xo, kim đỏ) + số Menlo hiệu ứng chữ số + thước kéo bước 0,1 (rung nhẹ mỗi vạch, chắc hơn mỗi đơn vị) + ±0,1 + câu Giảm / Tăng / Giữ, theo `weight-goal-dialog.tsx`; danh sách "Các lần cân" (5 mới nhất, xem tất cả, chênh lệch so với lần trước). Chưa có: kéo đọc số trên biểu đồ.
- **Màu**: nhấn = `metricRose`, đúng màu ống Tập luyện ở Hôm nay (chủ dự án nhắc 14/10); Cơ thể = `metricPurple`.
- Bản Debug: công tắc App / Lab thu thành một nút nhỏ ở góc.

Ảnh: `apps/ios/docs/qa/workouts-2026-10-14/`.

## Kế hoạch tuần (14/10, chủ dự án báo lỗi màn này)

Trước: tiêu đề "Plan" chưa dịch (vi / es), dải ngày kiểu cũ (ô đen, chấm màu không chú giải), link xanh hệ thống, nút Lab che màn. Sau: tiêu đề "Kế hoạch tuần"; một thẻ tuần (mũi tên tròn, "Tuần này" quay về), ô ngày Menlo, ngày chọn tô màu Tập luyện, cùng bộ dấu với dải tuần trang gốc + chú giải (Hoàn thành / Có buổi / Chưa tập / Nghỉ ngơi); thẻ ngày: trạng thái dạng nhãn, buổi tập, "Mở bảng tập" + "Đổi buổi" (dùng `WorkoutPickerSheet` cho mọi ngày), công tắc Deload; Gợi ý trong một thẻ. `DayPicker` cũ bỏ (deload chuyển vào thẻ ngày). Nút Lab của bản Debug dời xuống góc dưới phải.

## Ngày nghỉ (14/10, chủ dự án: "chưa được thiết kế đầy đủ")

`RestDayCard` dùng chung cho thẻ hôm nay và thẻ ngày của Kế hoạch tuần: minh hoạ trăng + sao trên quầng tím ("thở" chậm, đứng yên khi Giảm chuyển động), dòng ngày, "Ngày nghỉ" + câu dẫn, "Vận động nhẹ" — ba ô (đi bộ 20–30 phút, giãn cơ 10–15 phút, vận động nhẹ tuỳ chọn) có mẹo ngắn; hôm nay thêm "Phục hồi tốt hơn" (ngủ 7–9 tiếng, uống nước, đủ đạm — màu các ống ở Hôm nay); nút: hôm nay "Vẫn muốn tập" + "Ghi buổi tập", Kế hoạch tuần "Chọn buổi tập".


## Màn tập "từng set một" (14/10, chủ dự án duyệt mock v2)

Chủ dự án: màn bảng tập "chưa ưng — đẹp hơn, dễ dùng hơn". Mock v1 (bảng một dòng mỗi set) bị chê; mock v2 được duyệt ("nhìn bản này ok hơn nhiều").

- **Mặc định: một thẻ lớn cho SET KẾ TIẾP** (`WorkoutFocus.next` — set chưa xong đầu tiên, hay của bài vừa chạm): dòng "BÀI 1/2 · SET 2/3", tên bài + ⓘ (hướng dẫn), "Lần trước"; hai ô số lớn Menlo với nút − / + tròn (giữ để lặp, rung chọn mỗi bước): tạ ±2,5 kg / ±5 lb, reps ±1 (bài giữ "45s" ±5 giây) — chạm số vẫn gõ được; chip nghỉ + RPE; nút hồng "Xong set". Ô tạ trống mà có số để gợi ý: hàng "Như set trước · 15 kg" (set trước của chính bài hôm nay) hoặc "Như lần trước · 15 kg" (buổi gần nhất) — MỘT CHẠM mới điền, không điền ngầm (ô trống = bodyweight, ghi 0 kg); bấm ± từ ô trống lấy đúng mức gợi ý trước.
- **Đang nghỉ**: thẻ set nhường chỗ cho vòng đếm ngược xanh lớn (`RestTimer.ringFraction`, đỏ 5 giây cuối), −15s / tạm dừng / +15s, "Tiếp theo: Curl · Set 3/3 · 15 kg × 10", "Bỏ qua nghỉ"; dưới đó "Set vừa xong · Sửa" — Sửa bỏ tích set ấy (huỷ nghỉ) để thẻ quay về đúng set.
- **Đầu màn**: dòng ngày + "x/y set" + thanh chia đoạn theo bài (dài theo số set).
- **Các bài trong buổi** (khi ≥ 2 bài): số thứ tự / dấu xong, x/y; chạm để nhảy bài.
- **Hết set**: dấu tích lớn + "Xong hết các set" + nút hồng "Hoàn thành buổi tập". Còn set mà đã có set xong: nút viền "Kết thúc buổi · x/y set".
- **Menu ⋯**: "Xem dạng bảng" (dạng RN, nhớ trên máy) ↔ "Tập từng set"; Buổi tập đã ghi. Buổi ĐÃ ghi luôn ở dạng bảng (gỡ set / ghi thêm sống ở đó).
- **Ngày chưa tới** (mở từ Kế hoạch tuần): không còn ô nhập + nút xám "Chưa tới ngày này" — bản xem trước: ngày, tên, "bài · set · phút", mỗi bài một dòng "3 × 10 · 15 kg · nghỉ 90s", dải tím "Bắt đầu được vào Thứ Sáu", "Đổi buổi khác" (mở `WorkoutPickerSheet` cho đúng thứ ấy sau khi sheet đóng); nút ✕.
- Dạng bảng: dấu tích + nút Hoàn thành theo màu Tập luyện.
- Sửa kèm: "Bắt đầu buổi tập" ở Hôm nay chỉ đổi tab mà không mở màn tập (lớp toàn màn hình mở cùng nhịp đổi tab bị SwiftUI bỏ qua) — nay mở sau khi tab đã hiện.

Không đổi cách ghi: mọi thao tác vẫn là `setWeightText` / `setRepsText` / `setRest` / `setRpe` / `toggle` / `finish` của `WorkoutSessionController`. Core: `WorkoutFocus` (test `WorkoutFocusTests`).
