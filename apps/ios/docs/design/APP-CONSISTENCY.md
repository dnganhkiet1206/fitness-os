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
  - Logo v3 (16/10, chủ dự án chọn mock "A + Y", `docs/design/mocks/intelligence-logo-v3.html`): `IntelligenceMark`
    dùng LẠI ảnh logo ASCND của app (`BrandMark`, tô một màu `ink`; chữ A và Koa không vẽ lại) + đường nhịp tim làm
    gạch ngang hai chân chữ A, rãnh trong suốt 17 tách nét. AI đang làm việc (`IntelligenceOrb`): ký hiệu ĐỨNG YÊN +
    chữ "ASCND Intelligence" sáng lên lần lượt như sóng (1,6 s, mỗi chữ trễ 0,05 s); thay nhịp tim chạy cũ. Koa Coach
    bỏ dòng "Koa đang suy nghĩ…". `ink: .white` khi đè ảnh (quét món). Giảm chuyển động: chữ đứng yên.
  - Gói trả phí (16/10, chủ dự án): logo đầu trang Hôm nay KHÔNG đổi mặc định; thỉnh thoảng (2,5 s sau khi mở trang,
    tối đa một lần mỗi 3 giờ) chuyển mờ sang ký hiệu + chữ sóng "ASCND Intelligence" trong 4 s rồi về logo cũ — để người
    dùng gói trả phí nhận ra thay đổi nhẹ. Gói đọc từ `current_tier()` (plus / max; `entitlements` chỉ server ghi),
    Debug thử bằng `ASCND_FAKE_TIER=plus`. Giảm chuyển động: không đổi.
  - Koa Coach trống (16/10, chủ dự án): bỏ hết chữ — chỉ ký hiệu ASCND Intelligence lớn (132), mờ 14 %, đứng yên
    (chủ dự án: không hiệu ứng động ở đây); VoiceOver đọc lời chào. Câu hỏi mẫu là thẻ hai dòng (chủ đề đậm + câu sẽ gửi mờ) cuộn ngang ngay
    trên ô chat như ChatGPT, ẩn khi đã có tin hoặc ô chat thu gọn. Tin của người dùng trong Koa Coach: bong bóng
    iMessage màu xám trung tính `systemGray5` (`messageBubble(fill:)`; mực 7 % ra màu be, lẫn nền kem — chủ dự án: khó nhìn), chữ thường; nhắn tin giữa người vẫn xanh.
- **Lời Koa trên thẻ Hôm nay (16/10, chủ dự án chọn mock "A · Bong bóng iMessage"):** câu của Koa là bong bóng
  iMessage xám `systemGray5` có đuôi chỉ về Koa (`messageBubble(mine: false, fill:)`, chữ 15); nút việc kế tiếp tách
  ra ngoài, ngay dưới, viên nhỏ 34 (vùng chạm 44), "＋ Ghi một bữa · +10".
- **Nút hồ sơ trên trang Hôm nay (16/10, chủ dự án chọn mock "B · Giống chuông"):** `AccountAvatar` cùng vật liệu với
  chuông — kính mờ `.thinMaterial`, viền mực 12 % mảnh 0,75, chữ cái đầu màu mực; hai nút 44 thành một cặp.
- **Đổi giao diện sáng / tối (16/10, lỗi chủ dự án báo):** Cài đặt và Hồ sơ (sheet) không đổi theo khi chọn
  Sáng / Tối / Hệ thống. Theme giờ đặt bằng `overrideUserInterfaceStyle` của cửa sổ (`ASCNDApp.applyTheme`) thay cho
  `preferredColorScheme` ở gốc — mọi màn, sheet đang mở và alert đổi cùng lúc; "Hệ thống" = `.unspecified`.
- **Thông báo (16/10, chủ dự án duyệt mock):** một chuông cho cả app ở đầu trang Hôm nay, THAY viên chuỗi ngày (chuỗi vẫn
  ở phòng Koa; chuỗi sắp đứt thành tin nhắc việc). Chuông và nút hồ sơ ở tab Cộng đồng bỏ — tab chỉ còn nút tin nhắn;
  tin nhắn không vào Thông báo. Màn Thông báo (`CommunityInboxView` mở rộng): lọc Tất cả / Cộng đồng / Nhắc việc; "Cần
  làm" = `AppNotice` (chuỗi sắp đứt sau 18 giờ, xu chưa nhận — tính trên máy, tự hết khi xong, không cần "đã đọc") +
  thử thách cộng đồng chưa nhận; rồi tin cộng đồng. Dòng gọn (chủ dự án: "thanh thông báo to quá"): biểu tượng 34,
  chữ 15, giờ 12, dòng ~52, nhóm bo 18 không lề dọc thừa; lỗi tải tin cộng đồng là một dòng nhỏ có "Thử lại".
  Chấm đỏ trên chuông CHỈ khi có tin chưa đọc (chủ dự án): tin cộng đồng chưa đọc (server) hoặc tin nhắc việc /
  thử thách chưa xem — `NoticeSeen` lưu khoá (loại + giá trị + ngày) trên máy khi mở màn.
  Gửi thông báo (16/10, chủ dự án: "app chưa gửi thông báo"): trước đây mọi nhắc nhở tắt sẵn và quyền chỉ hỏi ở
  Cài đặt → Nhắc nhở, nên không ai nhận gì. Màn Thông báo có thẻ "Bật thông báo" (khi chưa có quyền): bật nhắc ghi bữa
  20:00 + ghi giấc ngủ 8:00 (tự bỏ qua ngày đã ghi; ai đã tự chọn nhắc thì giữ) và xin quyền; bị từ chối thì nút thành
  "Cài đặt". Tin cộng đồng khi app đóng: `CommunityAlerts` — làm mới nền iOS (`BGAppRefreshTask`, xin lại mỗi lần ra
  nền), đọc tin chưa đọc mới hơn mốc đã báo, hiện MỘT thông báo cục bộ (một tin nói rõ ai làm gì, nhiều tin thì đếm);
  lần đầu chỉ ghi mốc. Chưa phải push thật (cần APNs + bảng token phía server). Lượt đọc hộp thư hỏng thì tự thử lại
  một lần sau 1,5 giây (lượt đầu lúc mở app hay hỏng).
  - Ghi nhanh ẩn ở màn có ô nhập riêng ở đáy (Koa Coach, nhắn tin): `.hidesQuickLog()` đếm màn đang mở
    (`QuickLogVisibility`); iOS 26.1+ `tabViewBottomAccessory(isEnabled:)`, 26.0 giữ thanh, máy cũ ẩn nút "+". Màn
    tập và màn ghi bữa vốn là toàn màn hình / sheet nên đã che thanh.
  - Nút AI trong Ghi nhanh: ký hiệu tròn ở đầu phải dải (iOS 26) mở thẳng Koa Coach; bảng Ghi nhanh có hàng "Hỏi
    Koa Coach" (mọi máy). Chỉ hiện khi `aiDeployed == true`.
  - Server AI (Gemini, khoá miễn phí): `ASCND_AI_MODEL=gemini-flash-lite-latest`, `ASCND_AI_VISION_MODEL=
    gemini-flash-latest`, `ASCND_AI_REASONING_EFFORT=low` (3.x từ chối `none`); `_shared/ai.ts` thêm lượt `user` khi
    function chỉ gửi system (Gemini 400 "contents is not specified").
- **Koa Coach làm lại khung chat (16/10, chủ dự án):**
  - Câu trả lời kiểu ChatGPT: chữ trải ngang, không bong bóng, không avatar mỗi tin; một câu đậm trả lời thẳng, tối đa 3
    mục `###`, gạch đầu dòng mở bằng cụm in đậm, `---` vẽ thành đường kẻ mảnh; nút chép dưới câu trả lời.
  - Khối tổng quan ```` ```ascnd ```` (`CoachOverview`, ASCNDCore): model chọn 2–4 số THẬT, app vẽ bằng code — hình một
    màu, không mượn thẻ của app: thanh mảnh (giá trị / mục tiêu), cột nhỏ cho xu hướng nhiều ngày. Khối hỏng / đang stream
    dở không bao giờ lộ JSON; nhận cả rào ```` ```json ```` khi có `items` / `trend`.
  - Chữ nhả đều theo từng từ (`CoachReveal`, 70 ms/từ, đuổi kịp khi tụt xa) + vệt mờ ở đuôi; `**` dở được đóng tạm.
  - Tin nhắn kiểu iMessage (`MessageBubble.swift`, dùng chung với nhắn tin): xanh / xám, đuôi ở tin cuối cụm, tin gửi bay
    lên; AI đang trả lời = ba chấm nhấp nhô.
  - Ô chat Liquid Glass (`glassComposer`, kính iOS 26 / vật liệu mờ iOS 18–25) cho Koa Coach, nhắn tin, bình luận.
    Koa Coach: vuốt xuống thì thu thành viên giữa hai nút tab (như Apple Music), vuốt lên / chạm là bung; nút mũi tên về
    cuối chỉ hiện khi đã cuộn lên xa; nền mờ dần sau ô chat.
  - Lời nhắc y tế là dòng nhỏ mờ dưới ô chat (`coach.disclaimer`), không còn trong câu trả lời.
  - Server (`ai-coach`, `_shared/scope.ts`): luật trình bày nối cuối system prompt (model nhẹ theo chỉ dẫn cuối tốt hơn);
    luật 4 cho câu "không đáng trả lời" (vô nghĩa, thử, khiêu khích, làm thơ / đùa) → một câu ngắn kéo về chủ đề.
  - App dò lại AI 3 lần khi lỗi mạng lúc mở và mỗi lần về tiền cảnh (trước: mạng chưa sẵn → AI ẩn cả phiên).
- **Koa Coach — trả lời không cần AI + gọn đáy màn (16/10, chủ dự án):**
  - `CoachQuickReply` (ASCNDCore): lời chào, cảm ơn, "ok", gõ nhầm / tin thử, và tra MỘT số của hôm nay (calo, đạm,
    bước, giấc ngủ, sẵn sàng, "hôm nay tôi thế nào") trả lời ngay bằng kho câu mẫu vi/en/es điền số thật + khối tổng
    quan dựng bằng code. Không lặp: `Memory` nhớ mẫu vừa dùng (lưu `UserDefaults`), lần sau chọn mẫu khác. Bộ lọc cố ý
    hẹp: có "vì sao / nên / gợi ý / đủ chưa…", nhắc ngày khác hôm nay (hôm qua, tuần, trung bình), hai chỉ số trở lên,
    hay thiếu từ hỏi số → đi AI. Chưa có dữ liệu → câu "chưa có số", không đoán. Sự kiện `coach_quick_reply`.
  - Màn chat ẩn thanh tab (như ChatGPT / iMessage): viên thu gọn không còn đè thanh tab. Lời nhắc y tế ở cuối cuộc trò
    chuyện (trôi theo nội dung), không dính dưới ô chat.
  - Server: `callAI` thử lại 503 "high demand" hai lần (0,6 s / 1,2 s) trước khi báo lỗi; quá tải thật vẫn hiện lỗi.
- **Koa Coach — ghi từ lời kể + hỏi lại khi lệch số (16/10, chủ dự án):** `CoachLogPrompt` (ASCNDCore) nhận ra người
  dùng KỂ đã ngủ / tập / ăn / uống nước / cân (vi/en/es, có hay không dấu; câu hỏi và câu nói mục tiêu không tính) và
  so với hôm nay (`AssistantSignalBook.logged`: `daily_logs`, `meal_entries` theo bữa, `weight_logs`):
  - Chưa ghi → nút dưới câu trả lời: "Ghi 7 giờ ngủ" (mở màn ghi điền sẵn), "Ghi cân 60 kg", "Ghi buổi tập", "Ghi bữa
    này" (đúng bữa), "Ghi thêm 1.5 L nước" (một chạm lưu — phần còn thiếu). Ghi xong, đọc lại → nút tự ẩn.
  - Đã ghi mà khác (ngủ lệch > 15 phút, cân ≥ 0,3 kg, nước nói ít hơn) → gửi cả hai số cho `ai-coach` (`checks`); AI hỏi
    MỘT câu số nào đúng; nút "8 giờ (vừa nói)" / "7 giờ (đã ghi)" — hoặc gõ trả lời (đọc số). Chọn số mới → hộp thoại
    "Cập nhật nhật ký? App đang ghi 7 giờ. Đổi thành 8 giờ?" → màn ghi điền sẵn (ghi đè, không trùng). AI chép chỉ dẫn
    thay vì hỏi → app thay bằng câu hỏi dựng sẵn.
  - Khớp → không gì. Server: `today` trong context; "tối qua" chỉ là bản ghi của hôm nay; số người dùng nói thắng số cũ.
- **Cài đặt không lặp chữ**: mục Ngôn ngữ bỏ tiêu đề; dòng "Ngôn ngữ" có icon quả cầu như Nhắc nhở / Đổi mật khẩu.

## Quy ước (giữ khi làm màn mới)
- Công tắc 2–3 trang ở đầu tab (Hôm nay/Kế hoạch ăn, Buổi tập/Cơ thể, Đang theo dõi/Khám phá) và ô trong form
  (Giao diện, Ai thấy được): segmented hệ thống. Bộ lọc nội dung (loại bài, Đã lưu, Tìm kiếm): viên chữ
  (`ChipPicker`).
- Tiêu đề lớn trong nội dung, nút tròn bên phải; thanh điều hướng ẩn + `statusBarScrim`.
- Hành động chính: viên đen đặc; phụ: viên viền mảnh.

## Chưa làm (cần chủ dự án chọn / việc lớn)
