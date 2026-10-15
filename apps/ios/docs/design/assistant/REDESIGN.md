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
