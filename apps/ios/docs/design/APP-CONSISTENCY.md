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
- **Ghi nhanh trên thanh tab** (chủ dự án chọn "Thanh phụ trên tab bar"): iOS 26 `tabViewBottomAccessory`
  trong `RootTabView` (`QuickLogBar`): dải "+ Ghi nhanh · Bữa · Nước · Ngủ · Cân" trên mọi tab, thu gọn khi cuộn
  (`tabBarMinimizeBehavior(.onScrollDown)`). Chạm → bảng 5 ô (Bữa ăn, Nước, Giấc ngủ, Cân nặng, Buổi tập) → mở
  đúng màn ghi qua `DeepLinkScreen`. `Menu` trong thanh phụ không mở được bằng chạm nên dùng nút + bảng. Thẻ "Ngày
  nghỉ" của Hôm nay không còn "Ghi buổi tập / Ghi giấc ngủ" (`TodayView.hasQuickLog`); iOS 18–25 không có
  thanh phụ nên giữ nút.
- **Một trang Hồ sơ** (chủ dự án chọn "Một trang Hồ sơ"): avatar ở Hôm nay (`MyProfileSheet`) và nút hồ sơ của
  Cộng đồng mở CÙNG trang `CommunityUserView` của mình: thẻ công khai · Sửa hồ sơ · **Mục tiêu của bạn** (mục tiêu
  ngày / mục tiêu / trình độ → `EditProfileView`, nhãn "Chỉ mình bạn") · Tập luyện · bài. Bánh răng trên trang →
  `SettingsSheet`. Cài đặt bỏ thẻ hồ sơ, chỉ còn email. Chưa có hồ sơ cộng đồng: trang vẫn có mục tiêu + tập luyện
  và nút "Tạo hồ sơ cộng đồng". Còn lại: tên hiển thị cộng đồng và tên trong hồ sơ tập là hai trường riêng ở
  server (không đổi schema).
- **Hôm nay để làm, Trợ lý để hiểu** (chủ dự án chọn "Chia rõ"): "Xem thêm" của Hôm nay chỉ còn Thực phẩm bổ sung,
  Ba vòng, Phòng linh vật. Sinh trắc học, Giấc ngủ, Xu hướng sẵn sàng, Tổng kết tuần ở công cụ Trợ lý; thẻ Tập luyện
  (`TrainingCardView`, tải tuần / 8 tuần) chuyển sang Trợ lý (`AssistantRoute.training`, "Tải tập luyện"). Chạm
  dòng sẵn sàng ở Hôm nay → tab Trợ lý (`DeepLinkInbox.receive(.tab(.assistant))`).
- **Một điểm sẵn sàng cho cả app**: trước đây Hôm nay "Chưa có điểm sẵn sàng" (0–100) trong khi Trợ lý hiện
  "7" (thang 0–10, điểm hôm qua) — mà "Điểm nổi bật" lại ghi "52/100". Nay `AssistantSummary.shown` quyết định điểm
  nào hiện (hôm nay, không thì gần nhất + "Điểm gần nhất · hôm qua"), `ReadinessGauge` vẽ cùng một vòng 0–100, cùng
  nhãn Tập hết mình / Giữ nhịp / Phục hồi và cùng màu ở dòng sẵn sàng của Hôm nay và thẻ Tóm tắt của Trợ lý. Bỏ
  `score10`.
- **Một chỗ ghi ở Hôm nay** (chủ dự án chọn "Danh sách là chỗ ghi"): năm ống của Koa chỉ còn là thanh tiến độ
  thấp (60 pt), chạm không ghi; ghi ở "Ngày của bạn" (và "Ghi nhanh"). Bong bóng Koa giữ MỘT nút "việc kế tiếp".
- **Trợ lý không lặp nút ghi** (iOS 26, có "Ghi nhanh"): bỏ "Ghi giấc ngủ" ở thẻ Tóm tắt và "Ghi bữa" ở ô Calo;
  iOS 18–25 giữ (`TodayView.hasQuickLog`).
- **Số hiển thị theo ngôn ngữ (đợt 2)**: trung bình nước (`Water.averageLabel(_:_:locale:)` — cùng chữ số với golden
  RN, đổi dấu thập phân), cân nặng / chiều cao / nước của onboarding và Hôm nay (`OnboardingRuler.fixed1(_:locale:)`).
  Thẻ Tải tập luyện ghi rõ "Tải · 7 ngày qua" / "Tải thói quen · 4 tuần" (tải không có đơn vị — xem "?" của thẻ).
- **Một khối Thịnh hành** (chủ dự án chọn): Khám phá bỏ thẻ "Hữu ích tuần này"; "Thịnh hành" (thẻ lớn + danh sách
  đánh số) lấy tối đa 3 bài của `book.useful` (server: 7 ngày, xếp theo thử / lưu / bình luận, không gồm bài của
  mình); chưa có thì xếp 72 giờ trên các bài đã tải (`CommunityLayout.trending`) như cũ.
- **Một mặt thẻ cho cả app** (chủ dự án: "kính iOS 26 nhưng vẫn có fallback cho máy cũ"): `View.dsCard(radius:)` /
  `DSCardSurface` trong ASCNDDesignSystem — kính hệ thống iOS 26, material ở máy cũ, lót xám than khi tối, viền sáng
  mảnh, bóng mềm, Reduce Transparency → đặc. `todayCard`, `DSCard`, `AssistantSurface`, `NewsCardSurface` và 5 mặt
  trắng tự vẽ (hồ sơ, gợi ý theo dõi) đều đi qua nó. Bo góc chung `DS.Radius.xl` (24); 30 / 20 cũ về 24.
- **Ghi nhanh trên mọi máy** (chủ dự án: "làm nút + cho máy cũ luôn"): iOS 18–25 có nút "+" tròn nổi ở góc phải
  trên thanh tab, mở cùng bảng 5 ô (`QuickLogSheetHost`). Bỏ `TodayView.hasQuickLog`: nút ghi trùng ở thẻ Ngày nghỉ
  và Trợ lý ẩn trên mọi máy. Chưa chạy thử trên iOS 18–25 (máy chỉ có runtime iOS 26).
- **Một tên** (chủ dự án: "gộp tên luôn"; không đổi schema — hai cột cũ, ghi theo nhau): tên công khai của cộng đồng
  là tên chính. Lưu hồ sơ cộng đồng → `ProfileBook.saveName` ghi `profiles.name`; lưu "Thông tin cá nhân" → đã có
  hồ sơ cộng đồng thì `display_name` theo (giữ handle / tiểu sử / linh vật); mở hồ sơ của mình mà hai tên lệch →
  `profiles.name` theo tên cộng đồng (một lần).
- **Cài đặt không lặp chữ**: mục Ngôn ngữ bỏ tiêu đề; dòng "Ngôn ngữ" có icon quả cầu như Nhắc nhở / Đổi mật khẩu.

## Quy ước (giữ khi làm màn mới)
- Công tắc 2–3 trang ở đầu tab (Hôm nay/Kế hoạch ăn, Buổi tập/Cơ thể, Đang theo dõi/Khám phá) và ô trong form
  (Giao diện, Ai thấy được): segmented hệ thống. Bộ lọc nội dung (loại bài, Đã lưu, Tìm kiếm): viên chữ
  (`ChipPicker`).
- Tiêu đề lớn trong nội dung, nút tròn bên phải; thanh điều hướng ẩn + `statusBarScrim`.
- Hành động chính: viên đen đặc; phụ: viên viền mảnh.

## Chưa làm (cần chủ dự án chọn / việc lớn)
