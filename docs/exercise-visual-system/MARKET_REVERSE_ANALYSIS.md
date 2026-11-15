# Phân tích ngược: các app fitness đang làm phần minh hoạ bài tập ra sao, và bài toán mới cho Motion Kit

Ngày 14/11/2026. Kiệt giao: "phân tích ngược cách các ứng dụng fitness đang làm, đặc biệt để ý Apple Health và các app nổi tiếng đang viral gần đây, để đưa ra bài toán mới cho production".

Tài liệu này dựa trên bài báo, trang sản phẩm và một nghiên cứu (nguồn ở cuối). **Chưa mở trực tiếp app nào** (NOT RUN: chưa cài, chưa đăng ký dùng thử, chưa chụp màn hình). Nguồn tin về thứ hạng và lượt tải lấy từ bên thứ ba và mâu thuẫn nhau, nên chỉ dùng để thấy hướng, không dùng làm số liệu.

## 1. Họ đang làm gì

| Bên | Minh hoạ bài tập | Quy mô | Điều đáng học |
|---|---|---|---|
| **Apple Fitness+ "Gym Strength"** (beta 03/11/2026, iOS 27.3 / watchOS 27.3) | Video ngắn huấn luyện viên quay thật, **mở rộng xem được 3 góc** | 350+ bài, 30+ loại dụng cụ | Kế hoạch 4 tuần tự chỉnh theo số rep và mức tạ đã ghi. Máy đang bận thì đổi dụng cụ hoặc bài tương tự. Ghi rep/tạ trên đồng hồ. "Training Note" (Apple Intelligence) giải thích vì sao tăng mức |
| **Apple Watch: Workout Buddy** (watchOS 26) | Không có hình, chỉ là giọng nói động viên theo dữ liệu | Có cho Strength | Bật/tắt theo từng loại bài; cần iPhone 15 Pro trở lên |
| **Apple Health trong iOS 27** | — | — | Đổi giao diện. Có tin về "Readiness Score", nhưng các nguồn mâu thuẫn nên chưa khẳng định. Huấn luyện viên AI bị hoãn. API HealthKit đọc/ghi gần như không đổi. Từ 10/11: người dùng có thể chỉ cho app đọc một khoảng lịch sử gần đây (`getEarliestAuthorizedSampleDate`). Tin rò rỉ về lưu từng set (rep, tạ, dụng cụ, bên) **chưa xác nhận** |
| **Ladder** (đứng đầu doanh thu fitness đầu 2026, 4,9★) | Video demo + huấn luyện viên nói trong tai + **nhịp riêng cho từng động tác** | 17 đội huấn luyện, khối 6 tuần | Bán "đội" và chương trình, không bán thư viện. Demo phục vụ buổi tập đang chạy |
| **Fitbod** | Video huấn luyện viên quay chuyên nghiệp | ~1.600 bài, 80+ dụng cụ | **Bản đồ cơ hồi phục** (0–100% theo nhóm cơ) dùng chung với dữ liệu bài |
| **Hevy** | Hình minh hoạ / hoạt hình 2D | 400+ bài | Ghi chép nhanh và mạng xã hội; demo chỉ ở mức "đủ nhận ra bài" |
| **Muscle & Motion** | Hoạt hình 3D giải phẫu | 1.200–1.400 bài | Mã màu theo vai trò: **đỏ = cơ chính, hồng = cơ hiệp đồng, thêm màu cho cơ ổn định** |
| **FitCraft, Gym TrAIcker** (mới) | Avatar 3D, xoay mọi góc, phóng vào tay / gối / vai | 150+ bài | Lập luận chính: lỗi kỹ thuật nguy hiểm thường **không thấy từ góc quay video tiêu chuẩn** |
| **Peloton IQ** | Video demo + camera theo dõi chuyển động | — | Camera **đếm rep và sửa dáng** theo thời gian thực, nhưng chỉ chạy trên máy dòng "+" |
| App quét cơ thể (WW AI Body Scanner, MeThreeSixty…) | Avatar 3D dựng từ ảnh chụp | — | Bị chê là avatar làm mờ mất độ nét cơ. Người dùng muốn thấy **cơ của chính mình** thay đổi |

**Nghiên cứu đáng chú ý:** Riedl & Pauwels (Journal of Business Research, 2025) chặn ngẫu nhiên video demo trong một app fitness trên 4,5 triệu cặp người dùng × bài tập. Video **giúp người đã quen** mức khó của bài, nhưng **phản tác dụng với người mới**: video lộ ra yêu cầu của bài, khiến họ thấy bị đe doạ thay vì được thử thách. Bài báo không so sánh 3D với video.

## 2. Đọc ngược: các mẫu chung

1. **Thư viện 350–1.600 bài là mức tối thiểu.** Apple ra mắt với 350 bài, Fitbod có 1.600. Quay video tốn chi phí tăng theo số bài × số góc: Apple quay 3 góc cho mỗi bài. Bản 3D của ta cho **vô số góc từ một lần dựng**. Lợi thế này chỉ có giá trị khi tốc độ xuất xưởng đạt hàng trăm bài, mà hiện mới có 3.
2. **Demo phục vụ set đang tập, không phải trang thư viện.** Apple, Ladder và Peloton đều đặt demo ngay trong luồng ghi set: ngắn, lặp lại, đọc được bằng một cái liếc, trên cả đồng hồ.
3. **Đổi bài khi máy bận.** Gym Strength cho đổi dụng cụ hoặc bài tương đương. Muốn vậy, mỗi bài phải có **biến thể theo dụng cụ** mà vẫn giữ cùng một kiểu chuyển động. Bộ giải theo họ động tác của ta làm được việc này bằng cách đổi tham số.
4. **Cơ được chia vai trò, và bản đồ cơ được dùng lại.** Muscle & Motion chia ba vai trò cơ. Fitbod dùng bản đồ cơ cho trạng thái hồi phục. Ta đã có atlas 21 nhóm cơ và 70 phần cơ, trong khi app đang chỉ dùng 10 khoá hình cơ (`MuscleGroup`). Ta có thể dùng lại atlas này cho Gains và Today.
5. **Nhịp và giọng nói gắn với động tác** (Ladder, Workout Buddy). Template của ta đã có pha rep (hạ, dừng, lên) và thời gian chính xác, nhưng chưa xuất ra cho app dùng.
6. **Demo cần hợp với trình độ người tập** (Riedl & Pauwels). Người mới nên thấy bản dễ hơn và vài lời nhắc chính, không phải màn trình diễn bài nặng.
7. **Camera sẽ chấm dáng** (Peloton đã làm; tin về Apple chưa xác nhận). Cần một **quỹ đạo khớp chuẩn** của từng bài để so. Bộ kit đã có MediaPipe để đo và có chuyển động chuẩn, nên chỉ cần xuất ra đúng định dạng.
8. **Cái họ không làm được dễ dàng: cho xem lỗi sai.** Muốn quay cảnh sai thì diễn viên phải tập sai. Ở bản 3D, lỗi sai chỉ là một bộ tham số: gối sụp, lưng cong, khuỷu bè.

## 3. Bài toán mới cho production

Mỗi bài toán ghi kèm: lý do (bằng chứng ở mục 1–2), tiêu chí đạt, phần kit phải đổi và thứ tự ưu tiên. Mục nào cần Kiệt chọn thì có ghi rõ.

### P1. Tốc độ xuất xưởng: từ 3 bài lên 350 bài (ưu tiên 1)
- **Vì sao:** 350 bài là mức tối thiểu (Apple); mẫu 1.
- **Đạt khi:** mỗi bài mới tốn **≤ 30 phút công người** (viết `exercise.json` + soi tờ ảnh), phần còn lại `factory.py batch` tự chạy; 13 họ động tác đều có bộ giải; báo cáo tốc độ (phút/bài, tỉ lệ QA đạt lần đầu) sau mỗi lô.
- **Kit:** bộ giải cho 11 họ còn thiếu (hiện có `curl` và `squat`; `press_horizontal` vẫn là script riêng), sổ phủ bài (họ × dụng cụ × số bài), lô 20 bài đầu tiên theo tần suất xuất hiện trong lịch tập.

### P2. Biến thể theo dụng cụ và đổi bài (ưu tiên 1)
- **Vì sao:** Gym Strength cho đổi bài khi máy bận; 30+ loại dụng cụ; mẫu 3.
- **Đạt khi:** một `exercise.json` khai báo `variants` (tạ đòn / tạ đơn / cáp / máy / Smith…); mỗi biến thể qua QA riêng; xuất `alternatives.json` (bài tương đương có cùng kiểu chuyển động và cơ chính) để app gợi ý khi đổi bài.
- **Kit:** `config/equipment.json` hiện chỉ có 5 món, cần thêm tạ ấm, cáp, máy kéo xô, máy ép đùi, ghế dốc, dây treo… kèm kích thước có nguồn; mỗi bộ giải của họ nhận thông số dụng cụ.

### P3. Một lần dựng, nhiều định dạng (ưu tiên 1)
- **Vì sao:** demo nằm trong set, cả trên đồng hồ (mẫu 2).
- **Đạt khi:** mỗi bài xuất ra cùng lúc:
  - USDZ 3D (đã có);
  - vòng lặp ngắn HEVC 3 góc cho danh sách bài;
  - **vòng lặp hình bóng 2D cho Apple Watch** (≤ 150 KB, đọc được ở cỡ 40 mm);
  - poster và ảnh nhỏ.
  Có ngân sách dung lượng cho từng loại, và QA báo lỗi khi vượt.
- **Kit:** bước `export` của factory sinh tất cả từ cùng một hoạt cảnh. Target `ASCNDWatch` đã có trong app.

### P4. Ba vai trò cơ và bản đồ cơ dùng lại (ưu tiên 2)
- **Vì sao:** mẫu 4.
- **Đạt khi:** `exercise.json` có `target / synergist / stabilizer` (hiện là primary/secondary/stabilizing nhưng viewer chỉ tô hai nhóm); kit xuất **bản đồ cơ 2D trước/sau** (vùng SVG hoặc PNG theo 21 nhóm, lấy từ atlas) để app vẽ bản đồ cơ đã tập hoặc đã hồi phục. Màu lấy từ `brand.config.json`.
- **Cần Kiệt chọn:** có làm bản đồ cơ trong Gains/Today hay không (đây là thay đổi sản phẩm, phải dựng mock trước).

### P5. Dòng thời gian nhịp cho mỗi rep (ưu tiên 2)
- **Vì sao:** Ladder có nhịp riêng cho từng động tác; Workout Buddy nói theo dữ liệu; mẫu 5.
- **Đạt khi:** mỗi bài xuất `tempo.json` gồm các mốc pha của một rep (hạ / dừng / lên / khoá, đơn vị ms), điểm cần thở và mốc cho từng mẹo kỹ thuật. App dùng tệp này để rung nhịp, đếm rep theo hình và hiện lời nhắc đúng lúc. Kiểm thử: mốc trong tệp khớp với hoạt cảnh trong USDZ, sai lệch ≤ 1 khung hình.
- **Kit:** `motionlab` đã tính các pha bằng min-jerk; chỉ cần ghi ra tệp và thêm một cổng kiểm.

### P6. Demo theo trình độ: chuỗi dễ → khó (ưu tiên 2)
- **Vì sao:** Riedl & Pauwels 2025; mẫu 6.
- **Đạt khi:** mỗi bài có `regression` và `progression` (ví dụ goblet squat → back squat → front squat), dựng từ cùng bộ giải của họ; có chế độ "nhắc trước" (2–3 lời nhắc, tốc độ chậm) cho người mới.
- **Cần Kiệt chọn:** app có hiện bản dễ hơn cho người mới hay không, và căn cứ vào đâu để biết ai là người mới (lịch sử tập, mức tạ…). Việc này đụng đến luồng buổi tập.

### P7. Clip lỗi sai đặt cạnh clip đúng (ưu tiên 3, là điểm khác biệt)
- **Vì sao:** mẫu 8; video quay thật khó làm được.
- **Đạt khi:** mỗi lỗi trong `common_mistakes` có một bộ tham số lỗi (gối sụp vào trong, lưng tròn, khuỷu bè 90°…). QA **đảo chiều** cho clip lỗi: cổng tương ứng phải FAIL đúng chỗ, còn các cổng khác vẫn PASS. Nhờ đó lỗi nhìn thấy rõ và chỉ có đúng một lỗi.
- **Kit:** `technique` cho phép ghi đè theo từng lỗi; cổng giải phẫu nhận cờ "chờ FAIL".

### P8. Quỹ đạo khớp chuẩn cho camera chấm dáng sau này (ưu tiên 3, chỉ chuẩn bị dữ liệu)
- **Vì sao:** mẫu 7. App **không làm** tính năng camera lúc này.
- **Đạt khi:** mỗi bài xuất `keypoints.json` theo 33 mốc của MediaPipe Pose (3D + chiếu 2D ở 3 góc), kèm biên độ dao động cho phép theo từng pha. Kiểm thử: đo lại video render bằng `measure_video.py` thì sai số ≤ ngưỡng.
- **Kit:** dùng lại `measure_video.py` và `measure_animation.py`.

### P9. Giao tài sản khi số bài lên hàng trăm (ưu tiên 3, chỉ thiết kế)
- **Vì sao:** 350 bài × USDZ (mỗi bài vài MB) không thể đóng gói hết trong app.
- **Đạt khi:** có tài liệu thiết kế: đóng gói sẵn 20 bài đầu, các bài còn lại tải khi cần (On-Demand Resources, hoặc Storage + `exercise_media`), kèm số phiên bản và mã băm.
- **Cần Kiệt duyệt:** mọi thay đổi Storage hay dữ liệu thật (luật trong AGENTS.md). Phải chờ duyệt mới làm, không tự triển khai.

### P10. Đa dạng thân hình (hoãn, cần Kiệt quyết)
- Apple và Ladder dùng nhiều huấn luyện viên khác nhau. Spec hiện tại là **một** nhân vật chuẩn. Nhân vật nữ hoặc nhiều cỡ người là quyết định sản phẩm và là việc art. Ghi lại để bàn sau, không làm lúc này.

## 4. Những điều không chép

- **Quay người thật hoặc tạo video bằng AI.** Spec đã loại vì không chính xác về cơ sinh học và không thuộc sở hữu của ASCND.
- **Huấn luyện viên AI nói chuyện.** Apple còn hoãn tính năng này. PRODUCT_DECISION_V1 chọn Daily Plan theo luật.
- **Phong cách vân cơ toàn thân kiểu Lyfta.** Kiệt đã chốt ngày 13/11 chỉ tô cơ được tác động, trên nền đen.

## 4b. Tiến độ

- **P1 (14/11, bắt đầu):** sổ sản xuất `config/catalogue.json` đếm 43 bài trong chương trình tập của app (gym / tạ đơn ở nhà / không tạ) theo số set mỗi tuần; `pipeline/catalogue.py coverage` báo độ phủ và tốc độ; `new` dựng khung spec. Thêm 2 họ (`raise_lateral`, `hinge`) và 3 bài (hammer curl, side lateral raise, stiff-legged dumbbell deadlift); 6/43 bài; 19 % số set của chương trình (64/336) có bản 3D, 30 % thuộc họ đã có bộ giải. Thời gian máy ~0,6 phút/bài; phút người chưa ghi đủ để tính.
- **P5 (14/11, xong phía kit):** `tempo.json` cạnh USDZ, cổng `tempo_sync` (≤ 1 khung). App chưa dùng: rung nhịp / đếm rep theo hình cần mock cho Kiệt.

## 5. Thứ tự đề xuất

1. **Ngay bây giờ (trong kit, không đụng app):** P1 với lô 20 bài và bộ giải cho các họ còn thiếu; P5 xuất `tempo.json` (rẻ, dữ liệu đã có sẵn); P2 mở rộng `equipment.json`.
2. **Sau khi Kiệt xem mock:** P4 bản đồ cơ, P6 bản dễ cho người mới, P3 vòng lặp trên đồng hồ.
3. **Sau đó:** P7 clip lỗi sai, P8 quỹ đạo khớp chuẩn, P9 thiết kế giao tài sản.

## Nguồn

- 9to5Mac, 03/11/2026: Apple announces Fitness+ Gym Strength — https://9to5mac.com/2026/11/03/apple-announces-fitness-gym-strength-program-with-personalized-workout-plans/
- Apple Newsroom, watchOS 26 (Workout Buddy) — https://www.apple.com/au/newsroom/2025/06/watchos-26-delivers-more-personalized-ways-to-stay-active-and-connected/
- DC Rainmaker, watchOS 26 / Workout Buddy — https://www.dcrainmaker.com/2025/06/apple-watchos-26-announced-workout-buddy-and-more-explained.html
- Sahha, iOS 27 cho nhà phát triển sức khoẻ — https://sahha.ai/blog/ios-27-health-fitness-developers/ và https://sahha.ai/blog/wwdc-2026-apple-health-developers/
- AppleInsider, iOS 27.2 beta Health — https://appleinsider.com/articles/26/09/16/new-in-ios-272-beta-redesigned-health-app-siri-ai-localization-more
- TechRadar, tin rò rỉ lưu set trong watchOS 27 — https://techradar.com/health-fitness/smartwatches/im-sick-of-my-apple-watchs-workout-app-lacking-this-key-fitness-feature-but-a-new-apple-watch-ultra-4-rumor-suggests-it-could-finally-catch-up-with-apps-like-smartgym
- Apple Newsroom 01/2026, Fitness+ — https://www.apple.com/newsroom/2026/01/stay-active-in-the-new-year-with-apple-watch/
- Ladder: Bustle review https://www.bustle.com/wellness/ladder-app-review ; screensdesign https://screensdesign.com/showcase/ladder-strength-training-plans ; Statista https://www.statista.com/statistics/1239716/top-fitness-and-sport-apps-by-revenue/
- Fitbod exercise pages — https://fitbod.me/about-fitbod-exercises
- Hevy exercise library — https://help.hevyapp.com/hc/en-us/articles/35688251991575-Hevy-Exercise-Library-400-Exercises-and-Custom-Exercises
- Muscle & Motion color coding — https://www.muscleandmotion.com/docs/color-coding/
- FitCraft, 3D exercise demonstrations — https://getfitcraft.com/blog/3d-exercise-demonstrations
- Peloton IQ strength — https://www.onepeloton.com/blog/peloton-iq-strength-training-features
- Gainframe, body scanning apps — https://gainframe.app/blog/best-body-scanning-measurement-apps/
- Riedl & Pauwels 2025, Video moves you — https://www.networkscienceinstitute.org/publications/video-moves-you-randomized-field-experiment-shows-how-in-app-videos-increase-exercise
