# Đồng bộ toàn app (15/10)

Chủ dự án: "có đề xuất gì cải thiện cho toàn bộ app không, có chỗ nào lặp lại không cần thiết gợi ý bỏ, và các
tính năng đồng bộ trong toàn app" → "làm đi".

## Đã làm
- **Apple Health chỉ ở Cài đặt** (chủ dự án: "chỉ để apple health trong cài đặt các tab khác gỡ"):
  `HealthSyncCard` trong `SettingsView` (`healthAvailable` / `healthSync`); bỏ khỏi cuối Hôm nay và Trợ lý, bỏ nút
  "Đồng bộ" ở thẻ Nhịp tim của Trợ lý. Hôm nay / Trợ lý đọc lại số khi nhận `.healthSynced`. Trong Cài đặt là MỘT hàng gọn (`HealthSyncCard(compact: true)`: icon vuông đỏ · "Apple Health" · "Đồng bộ"; mô tả ở chân mục — chủ dự án: "thẻ apple health làm gọn lại").
- **Phần cơ thể một chỗ**: Số đo · Ảnh tiến trình · Hiệu chỉnh mục tiêu chỉ ở Tập luyện → Cơ thể; bỏ khỏi công cụ
  Trợ lý (Trợ lý giữ Tổng kết tuần, Vận động, Sinh trắc học, Giấc ngủ, Coach nhớ gì).
- **Số theo ngôn ngữ**: `Units.display(_:locale:)` cho số hiển thị (ACWR "3,3", gram macro, thông báo ngủ vượt);
  ô nhập vẫn dùng `Units.text` kiểu JS. Cộng đồng đã dùng `CommunityCard.decimal`.

## Quy ước (giữ khi làm màn mới)
- Công tắc 2–3 trang ở đầu tab (Hôm nay/Kế hoạch ăn, Buổi tập/Cơ thể, Đang theo dõi/Khám phá) và ô trong form
  (Giao diện, Ai thấy được): segmented hệ thống. Bộ lọc nội dung (loại bài, Đã lưu, Tìm kiếm): viên chữ
  (`ChipPicker`).
- Tiêu đề lớn trong nội dung, nút tròn bên phải; thanh điều hướng ẩn + `statusBarScrim`.
- Hành động chính: viên đen đặc; phụ: viên viền mảnh.

## Chưa làm (cần chủ dự án chọn / việc lớn)
- Nút "+" ghi nhanh trong tab bar.
- Gộp hai hồ sơ (Cài đặt ↔ hồ sơ cộng đồng); vai trò Hôm nay (làm) vs Trợ lý (hiểu); gộp "Hữu ích" vào "Thịnh hành".
- Một thành phần điểm sẵn sàng dùng chung cho Hôm nay và Trợ lý; gom các kiểu thẻ (`todayCard`, `DSCard`,
  `NewsCardSurface`, `AssistantSurface`).
