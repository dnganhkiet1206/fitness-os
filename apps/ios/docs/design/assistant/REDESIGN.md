# Trợ lý sức khoẻ — thiết kế lại (15/10)

Chủ dự án: "audit và sửa phần trợ lý sức khoẻ, đề xuất cải thiện redesign" → mock v1 bị chê "chưa đủ gọn
gàng tinh tế" → tìm hiểu Apple Health mới (Apple Newsroom 9/2026) → mock v2 duyệt.

## Audit (`b744e299`)
- Thanh điều hướng ẩn (tiêu đề nhỏ trùng và trôi đè thẻ khi cuộn) + che thanh trạng thái.
- "Insight hôm nay" ẩn khi `ai-smart-nudges` chưa deploy (trước là thẻ lỗi vĩnh viễn).
- Chip coach xuống dòng tự do (`FlowRows`), viên viền mảnh. Lưới công cụ cùng cao.

## v2 — học từ Apple Health mới
Nguyên tắc: tóm tắt trước, chi tiết khi chạm; điểm sẵn sàng có NHÃN CHỮ; so với mức thường của chính mình;
mỗi mảng một thẻ với một câu nhận xét; dữ liệu → nhận xét → gợi ý → hành động.

- Đầu trang: ngày + "Tóm tắt" + nút tròn mở coach.
- `SummaryCard`: vòng sẵn sàng thang 0–10 (`AssistantSummary.score10`, chỉ đổi hiển thị — điểm vẫn tính 0–100),
  nhãn Sẵn sàng tập / Giữ nhịp / Phục hồi (theo `status`), "Cao hơn / Đúng / Thấp hơn mức thường của bạn" (so
  trung bình các ngày trước, cần ≥ 3 ngày, lệch ≤ 8 điểm là bình thường); dưới vạch là các dòng `AssistantBrief`.
  Chạm → "Xu hướng 7 ngày" (bốn ô + bảng `MetricPanelView` cũ).
- "Insight hôm nay" (khi đã deploy), ô "Hỏi coach về hôm nay…" (+ "Tiếp tục: …").
- Điểm nổi bật: Xu hướng 7 ngày (câu + đường nhỏ), Giấc ngủ, Nhịp tim (khi có), Calo (+ đạm, thanh tiến độ).
- Dành cho bạn: hàng thẻ trượt ngang từ các công cụ; "Tất cả công cụ" → lưới đầy đủ.
- Apple Health giữ ở cuối trang.

## Cải thiện sau v2 (15/10, chủ dự án: "làm đi")
- Hôm nay chưa có điểm → thẻ Sẵn sàng hiện **điểm gần nhất** ("Điểm gần nhất · hôm qua",
  `AssistantSummary.latest`) thay cho "—"; nhãn chữ dùng cùng ngưỡng với Hôm nay (≥ 75 / ≥ 50); "go" đổi thành
  "Tập hết mình" (trùng chữ với tiêu đề "Sẵn sàng").
- Nút hành động: "Ghi giấc ngủ" trong thẻ Sẵn sàng (khi đêm qua chưa có), "Ghi bữa" trong thẻ Calo, "Đồng bộ"
  trong thẻ Nhịp tim (khi có Apple Health) — mở đúng màn ghi, xong đọc lại số.
- "Xu hướng 7 ngày" mở bằng thẻ sẵn sàng đầy đủ (HRV · RHR · ngủ · tải · ACWR, `ReadinessCardView` mở sẵn) của
  hôm nay hoặc ngày gần nhất có điểm — "vì sao điểm như vậy".
- Bỏ nút ✨ đầu trang (trùng ô Hỏi coach). Apple Health thu thành một dòng (`HealthSyncLine`).
- Điểm nổi bật xếp theo mức quan trọng (`AssistantSummary.order`): ngủ ngắn / nhịp tim cao lên trước, mảng
  chưa có dữ liệu xuống cuối.
- "Dành cho bạn" theo ngữ cảnh (`AssistantSummary.forYou`, có test): công cụ có lý do lên trước theo mức khẩn
  — chưa ngủ / ngủ < 7 giờ → Giấc ngủ; sẵn sàng Giữ nhịp / Phục hồi (hôm nay hoặc điểm gần nhất) → Sinh trắc
  học; sau 15h còn < 5.000 bước → Vận động; Chủ nhật / Thứ hai → Tổng kết tuần; ngày 1–3 → Mục tiêu, Ảnh, Số đo.
  Thẻ có lý do hiện câu lý do thay dòng mô tả chung; "Coach nhớ gì" luôn cuối.

- Gỡ `AssistantAura` (bốn quầng màu trôi; chủ dự án: "lớp aura phía sau làm xấu quá") → `TodayAmbient(accent: nil)` như các tab khác.
