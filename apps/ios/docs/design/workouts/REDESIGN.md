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
- **Màn tập** là lớp toàn màn hình (`fullScreenCover`), nút thu nhỏ ở góc trái; tiến độ và đồng hồ nghỉ giữ nguyên. "Bắt đầu" ở tab Hôm nay mở thẳng lớp này.
- **Mẫu buổi tập (n)**: 3 mẫu mới nhất trong một thẻ danh sách + hàng "+ Tạo buổi tập"; "Xem tất cả".
- **Công cụ**: Thư viện & lịch sử (số buổi gần đây) → trang `LibraryHistoryView`; Tiến bộ từng bài.
- **Cơ thể**: thẻ Cân nặng + "Ghi cân nặng"; Số đo, Ảnh tiến trình, Hiệu chỉnh mục tiêu (màn đã có). Biểu đồ cân nặng của `BodyPanel`: lát sau.
- **Màu**: nhấn = `metricRose`, đúng màu ống Tập luyện ở Hôm nay (chủ dự án nhắc 14/10); Cơ thể = `metricPurple`.
- Bản Debug: công tắc App / Lab thu thành một nút nhỏ ở góc.

Ảnh: `apps/ios/docs/qa/workouts-2026-10-14/`.
