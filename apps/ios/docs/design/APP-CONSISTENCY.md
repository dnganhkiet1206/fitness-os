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
- **Linh vật — thiết kế lại** (chủ dự án: "redesign toàn bộ, bản cũ chỉ là đối chiếu"; "phòng koa chỉ đc vẽ cho
  màn tối"): phòng Koa, Phòng thay đồ, Huy chương, Thử thách — nền giấy + `statusBarScrim`, tiêu đề lớn trong nội
  dung, `dsCard`, nút `DSPillButtonStyle` (`.dsPill` / `.dsPillSecondary`, mới trong ASCNDDesignSystem).
  - Căn phòng / phòng thay đồ có **bản ngày** (`StudioScene.Options.light`, `lightSkins`, `dayColors`, `daySky`;
    `ShopScene.tree(light:)`): đổi màu theo vai trò, hình khối giữ; ban ngày không có trăng. Sân khấu là thẻ bo 28
    (bỏ mép tan tràn ngang). Koa ở phòng thay đồ theo giao diện (bỏ `paper: false`).
  - Phòng Koa: Hôm nay → Hạng (cấp + hành trình một thẻ) → Chuỗi ngày (số ngày + thưởng chuỗi + bảo hiểm) →
    Nhiệm vụ (vòng rỗng / tô thay "—" / "…") → Khám phá thêm (ô Phòng thay đồ / Thử thách / Thành tích).
  - Huy chương: một thẻ đầu (vòng + % + "Đã đạt N / 29"); Thử thách: icon vòng tròn, thanh viên.
  - Vẽ lại nhân vật Koa: KHÔNG — mock 3 hướng bị chê "xấu hơn bản tui vẽ"; Koa giữ bản của chủ dự án.
  - Bản tối giữ y nguyên đèn treo + Koa có đèn; bản sáng tắt đèn (`Options.lamp`), Koa đúng màu bản vẽ
    (`KoaRender.Options.flat`, không dải sáng-tối / quầng / viền — golden của bản giấy không đổi), không sao ngoài
    cửa sổ, đồ vật tím → đất nung (`dayColors`). Cả hai bản có lớp chiều sâu (`Options.depth`: tường bên, góc phòng,
    chân tường, ván sàn hội tụ).
- **Giữ chân người dùng mới** (15/10, chủ dự án chọn "làm 2 và 3 trước"; chưa có analytics — bản native không có
  Sentry / sự kiện):
  - Onboarding bật lại màn **Sức khoẻ** (`healthAvailable: services.health.isAvailable`): "Kết nối Apple Health"
    xin quyền + đồng bộ lần đầu rồi đi tiếp; "Để sau" đi tiếp.
  - Hôm nay: thẻ **"Bắt đầu với ASCND"** (`TodayStartCard`) — Kết nối Apple Health · Ghi bữa đầu tiên · Ghi buổi tập
    đầu tiên, mỗi việc một chạm; tick theo HealthKit / tín hiệu hôm nay (nhớ bằng `@AppStorage` theo tài khoản);
    7 ngày kể từ lần đầu thấy trên máy, ẩn khi đủ ba hoặc bấm ẩn.
  - Ghi nhanh: mục **"Ăn lại"** — 3 bữa gần đây, một chạm ghi đúng các món + khẩu phần (`MealLogger.repeatMeal` +
    `save` qua hàng đợi), bảng tự đóng.
- **Trước TestFlight (15/10):**
  - Edge function AI: server trả 404 "Requested function was not found" cho MỌI function (`ai-coach`,
    `ai-weekly-review`, `ai-smart-nudges`, `ai-meal-suggest`, `ai-coach-memory`). `AppServices.probeAI` hỏi gateway một
    lần lúc mở app (không đăng nhập: 401 = có, 404 = chưa); chưa có → ẩn ô Hỏi coach, Insight, nút "Hỏi coach về số
    này", công cụ Tổng kết tuần + Coach nhớ gì, gợi ý bữa, nút chụp ảnh món. Server deploy xong → tự hiện, không cần
    bản mới. Tin nhắn: bản Release vốn đã ẩn (chỉ dữ liệu giả ở Debug).
  - Chữ trên tranh phòng Koa theo ngôn ngữ (`StudioScene.Options.lang`, `signText`): "THẮNG HÔM NAY / NGÀY MAI /
    MẠNH HƠN", "CHUỖI"; es: "GANA HOY / MAÑANA / MÁS FUERTE", "RACHA".
- **ASCND Intelligence + Koa Coach (15/10, chủ dự án):** mọi tính năng AI mang tên "ASCND Intelligence" (chuỗi
  `ai.brand`; lỗi AI, Phân tích tuần, gợi ý bữa, quét món). Ký hiệu chung `IntelligenceMark` (chủ dự án chọn mock E:
  chữ "A" khối đặc của logo, gạch ngang là đường nhịp tim, đầu Koa giữa hai chân; một màu = màu chữ, vẽ bằng Canvas) và `IntelligenceBadge` (ký hiệu + chữ) ở `ASCND/Design/Intelligence.swift` thay
  `sparkles` ở Insight, chat, gợi ý bữa, Phân tích tuần, quét món. "AI Coach" đổi thành **Koa Coach**
  (vi/en/es; giới thiệu "Mình là Koa, coach của bạn…"). Một ký hiệu mỗi chỗ: cạnh ký hiệu lớn chỉ ghi chữ
  (`IntelligenceBadge(mark: false)`); ô Hỏi coach không ký hiệu (thẻ Insight ngay trên đã có).
  - Ghi nhanh ẩn ở màn có ô nhập riêng ở đáy (Koa Coach, nhắn tin): `.hidesQuickLog()` đếm màn đang mở
    (`QuickLogVisibility`); iOS 26.1+ `tabViewBottomAccessory(isEnabled:)`, 26.0 giữ thanh, máy cũ ẩn nút "+". Màn
    tập và màn ghi bữa vốn là toàn màn hình / sheet nên đã che thanh.
  - Nút AI trong Ghi nhanh: ký hiệu tròn ở đầu phải dải (iOS 26) mở thẳng Koa Coach; bảng Ghi nhanh có hàng "Hỏi
    Koa Coach" (mọi máy). Chỉ hiện khi `aiDeployed == true`.
  - Server AI (Gemini, khoá miễn phí): `ASCND_AI_MODEL=gemini-flash-lite-latest`, `ASCND_AI_VISION_MODEL=
    gemini-flash-latest`, `ASCND_AI_REASONING_EFFORT=low` (3.x từ chối `none`); `_shared/ai.ts` thêm lượt `user` khi
    function chỉ gửi system (Gemini 400 "contents is not specified").
- **Cài đặt không lặp chữ**: mục Ngôn ngữ bỏ tiêu đề; dòng "Ngôn ngữ" có icon quả cầu như Nhắc nhở / Đổi mật khẩu.

## Quy ước (giữ khi làm màn mới)
- Công tắc 2–3 trang ở đầu tab (Hôm nay/Kế hoạch ăn, Buổi tập/Cơ thể, Đang theo dõi/Khám phá) và ô trong form
  (Giao diện, Ai thấy được): segmented hệ thống. Bộ lọc nội dung (loại bài, Đã lưu, Tìm kiếm): viên chữ
  (`ChipPicker`).
- Tiêu đề lớn trong nội dung, nút tròn bên phải; thanh điều hướng ẩn + `statusBarScrim`.
- Hành động chính: viên đen đặc; phụ: viên viền mảnh.

## Chưa làm (cần chủ dự án chọn / việc lớn)
