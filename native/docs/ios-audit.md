# Audit Phase 1 — Native iOS Architecture

Ngày: 01/10/2026 · Người audit: **C** · Theo brief "ASCND — Native iOS Architecture Migration"
(Kiệt, 30/09/2026).

**Nguyên tắc của vòng này: không sửa code.** Chỉ đọc và ghi nhận.

---

## 1. Hiện trạng kiến trúc (đọc được, không suy)

| Hạng mục | Hiện trạng |
|---|---|
| Khung app | Expo SDK 57, React Native, TypeScript. **Không có thư mục `ios/`** — dự án Expo managed, build qua EAS (`eas.json`, `TESTFLIGHT.md`). Mọi code Swift sau này phải đi qua **Expo config plugin** + EAS build, không có đường "mở Xcode sửa trực tiếp". |
| Bridge RN ↔ Swift | **Chưa tồn tại.** Không có `src/native/` (NativeHaptics.ts, NativeHealth.ts… trong brief đều chưa có). |
| Animation | `react-native-reanimated` 4.5.1, dùng ở **88 file**. Hệ token riêng ở `constants/motion.ts` (duration 180/200/240/320, spring theo cảm nhận). Gesture: `react-native-gesture-handler` 2.32.0. |
| Haptics | `expo-haptics` ~57, dùng ở **103 file** — đã là native (Core Haptics) dưới nắp capo. |
| Blur / kính | `expo-blur` ~57, dùng ở 6 file. `BlurView` là **thật** `UIVisualEffectView`. Đã có hệ kính riêng: `glass-surface.tsx` (ghi rõ chỉ 2 tầng `floating`/`elevated` được dùng blur thật vì mỗi `BlurView` lấy mẫu lại mỗi khung hình), `liquid-glass.tsx`. |
| HealthKit | `@kingstinct/react-native-healthkit` ^14.0.2, dùng ở **8 file** (assistant, Today, sleep-insights, smart-goals, weekly-review, log-sleep, health-source-card, onboarding-flow). Plugin đã cấu hình `NSHealthShareUsageDescription`, `background: false` (không background delivery). |
| Mascot (Koa) | Render bằng **SVG + Reanimated** (`MascotFigure`, viewBox 240×300). Không Rive, không Lottie (không có trong `package.json`). Logic mascot/game ở TypeScript. |
| Navigation | expo-router + `NativeTabs` (tab bar native). Modal presentation qua `presentation: 'modal'` của router. |
| Live Activities / WidgetKit | **Chưa có gì.** Grep `ActivityKit|WidgetKit|Live Activit` trong `src` = 0 kết quả. |
| Rest timer | `components/ascnd/rest-timer.tsx` — chạy bằng RN, chỉ sống khi app mở. |
| Workout | `app/(tabs)/workouts/` (index, library, plan) + `workout-set-sheet.tsx`. Bản thân `workouts/index.tsx` (452 dòng) **không** gọi trực tiếp `useAnimatedStyle/withSpring/withTiming` — animation nằm ở component con. |
| Community | RN thuần, đã xác minh trực quan sạch ở #189/#191. |
| Nutrition | RN thuần, business/product UI. |

---

## 2. Phát hiện quan trọng nhất của vòng audit

**Hầu hết những thứ brief đề xuất "native hóa bằng Swift" thì app đã native rồi
— qua wrapper.**

- Haptics → `expo-haptics` = Core Haptics thật. Viết lại `ASCNDHaptics` bằng
  Swift không mua được gì; cái còn thiếu chỉ là **một wrapper TypeScript thống
  nhất** (`Haptics.success()`…) gom 103 chỗ đang gọi rời rạc — việc của Phase 2,
  bằng TypeScript, không phải Swift.
- Blur/material → `expo-blur` = `UIVisualEffectView` thật. Team đã tự giới hạn
  số `BlurView` vì lý do hiệu năng (ghi trong `glass-surface.tsx`). Không có
  "fake blur bằng nhiều RN views" để phải thay.
- HealthKit → `@kingstinct/react-native-healthkit` đã là native Swift dưới nắp
  capo, đang dùng ở 8 màn. Viết lại HealthKit bằng Swift thủ công = **duplicate
  một native module đang chạy tốt**, vi phạm chính luật "không duplicate" của
  brief. Chỉ xem lại nếu cần **background delivery** (`background: false` hiện
  tại) — đó là cấu hình plugin, không phải rewrite.

**Kết luận này không phải ý kiến — nó đọc được từ `package.json` và grep.**

---

## 3. Bảng audit

| Component | Current | Native Needed? | Reason | Priority |
|---|---|---|---|---|
| Haptics layer | RN (expo-haptics, 103 file) | **No** | Đã là Core Haptics native; chỉ cần gom wrapper TS | Low |
| Blur / glass material | RN (expo-blur = UIVisualEffectView thật) | **No** | Đã native; team đã tự giới hạn perf | Low |
| HealthKit | RN (@kingstinct wrapper, 8 file) | **No** | Wrapper đã là Swift native; chỉ xem lại nếu cần background delivery | Low |
| Workout interaction (set sheet, swipe, RPE) | RN + Reanimated + Gesture Handler | **Maybe** | Chưa có bằng chứng drop frame; Reanimated chạy UI thread. Đo trên máy thật trước khi quyết | Medium |
| Rest timer → Live Activities | RN (`rest-timer.tsx`), chết khi app đóng | **Yes** | Không làm được bằng RN/Expo — bắt buộc ActivityKit native | High* |
| Widgets (streak, buổi tập hôm nay…) | Chưa có | **Yes** | Không làm được bằng RN — bắt buộc WidgetKit native | Medium* |
| Navigation transitions | expo-router + NativeTabs | **Maybe** | Tab bar đã native; chỉ native hóa transition cụ thể nào chứng minh được RN không làm tốt | Low |
| Mascot / reward (Koa) | RN (SVG + Reanimated) | **No** | Không Rive/Lottie để giữ; chưa có bằng chứng cần native — đúng như brief mục 10 đã dặn | Low |
| Community feed | RN | **No** | UI chuẩn, đã xác minh trực quan (#189/#191) | Low |
| Nutrition | RN | **No** | Business/product UI | Low |
| Custom Swift modules | **Không tồn tại** | Foundation | Chưa có `ios/`, chưa có `src/native/`. Mọi việc Swift đều cần config plugin + EAS trước | High (điều kiện tiên quyết) |

\* Live Activities và Widgets là **quyết định sản phẩm của Kiệt**, không phải
quyết định kỹ thuật — audit chỉ nói "muốn thì bắt buộc native", không nói
"phải làm".

---

## 4. Đề xuất thứ tự (sau khi Kiệt duyệt audit)

1. **Phase 2a — TypeScript trước, Swift sau:** gom `Haptics.*` wrapper TS
   (không Swift), rà soát token design cho native dùng chung sau này.
2. **Phase 2b — Native foundation:** quyết định đường đi Expo config plugin,
   dựng `src/native/ios/*.ts` + module Swift mẫu (chọn Haptics làm mẫu vì
   rủi ro thấp nhất), build thử qua EAS.
3. **Phase 3 — Workout:** đo frame rate thực tế trên iPhone 60Hz/120Hz
   trước; chỉ native hóa interaction nào đo được là giật.
4. **Phase 6 — Live Activities / Widgets:** chỉ khi Kiệt chốt cần.

## 5. Câu hỏi cần Kiệt trả lời trước Phase 2

1. Rest timer có cần **chạy ngoài màn hình khóa / Dynamic Island** không?
   → **Kiệt: CÓ** (01/10/2026). Live Activities thành yêu cầu sản phẩm, ưu tiên High.
2. Có muốn **widget Home Screen** nào không? (streak? buổi tập hôm nay?)
   → **Kiệt: CÓ** (01/10/2026). Cần Kiệt chọn widget cụ thể — xem đề xuất ở mục 6.
3. Workout hiện tại Kiệt có thấy **giật ở thao tác nào cụ thể** trên máy thật
   không?
   → **Kiệt: trả lời sau** (01/10/2026). Phase 3 đo đạc tạm chờ.

## 6. Đề xuất Live Activities + Widgets (chờ Kiệt chọn)

> **⚠️ ĐÃ BỊ THAY THẾ — đề xuất này KHÔNG còn là spec.**
> Kiệt đã phủ quyết hai điểm trong §7 (01/10/2026): **nút "Bỏ qua nghỉ"**
> (Live Activity làm display-only trước, chưa có nút nào) và **tên bài tập
> hiện tại** (Island hiện set TIẾP theo, không phải bài hiện tại). **§7 mới là
> quyết định cuối.** Giữ nguyên §6 dưới đây chỉ để tra lịch sử.

**Live Activity — Rest timer** (duy nhất, vì là thứ duy nhất có state "đang chạy"
cần nhìn khi app đóng):
- Lock Screen / Dynamic Island hiện: ~~tên bài tập hiện tại~~ (~~bị phủ quyết~~
  → set tiếp theo, quyết định của Kiệt), số set (vd "Set 3/5"),
  thời gian nghỉ còn lại, ~~nút "Bỏ qua nghỉ"~~ (~~bị phủ quyết~~ → display-only,
  không nút, quyết định của Kiệt).
- RN chỉ gửi state updates qua bridge → ActivityKit. Không duplicate logic đếm
  giờ sang Swift: Swift chỉ render + nhận push state.

**Widgets — đề xuất 2, làm 1 trước:**
- W1 "Buổi tập hôm nay": tên buổi + giờ dự kiến + streak. Thông tin hữu ích ngay
  từ Home Screen.
- W2 "Streak / readiness": số ngày streak + điểm sẵn sàng hôm nay.
- Không làm widget calories/cân nặng lẻ tẻ — chưa đủ lý do "useful information
  ngay từ Home Screen" cho MVP.

Thứ tự: Live Activity rest timer trước (gắn với workout = core), widget sau.
Cả hai đều cần Phase 2b (foundation config plugin + EAS) xong trước.

## 7. Quyết định của Kiệt cho #195 (01/10/2026)

- Live Activity rest timer đầu tiên: **CHỈ HIỂN THỊ (display-only)** — chưa làm
  nút "Bỏ qua nghỉ". Mục tiêu là validate ActivityKit lifecycle, đồng bộ state,
  giao tiếp RN → native và EAS build trước khi thêm state hai chiều.
- Widgets: **prototype CẢ HAI** (W1 "Buổi tập hôm nay" + W2 "Streak + Readiness"),
  dùng chung một data abstraction native, không pipeline riêng lẻ.
- Countdown: ưu tiên **`endDate` tuyệt đối** thay vì tick từng giây từ RN.

## 8. #195 đã chứng minh (spike hoàn tất 01/10/2026)

Chi tiết đầy đủ: `native/docs/native-spike-195.md`.

- **Module Swift `AscndNative`** qua Expo Modules API: haptics (chỉ để validate
  bridge — product haptics vẫn ở `src/lib/haptics.ts` #194) + ActivityKit
  start/update/end display-only. TS facade ở `src/native/ios/`
  (`ASCNDNative.ts`, `ASCNDHaptics.ts`, `ASCNDLiveActivity.ts`).
- **Config plugin `plugins/with-ascnd-widgets.js`**: tạo WidgetKit
  app-extension target `ASCNDWidgets` (`com.ascnd.fitnessos.widgets`) lúc
  prebuild — Swift sources, Embed App Extensions phase, target dependency,
  bundle ID, Info.plist (`com.apple.widgetkit-extension`) đều đúng trong
  `.pbxproj` sinh ra. Không commit thư mục `ios/`.
- **Hai khai báo native bắt buộc do plugin tự ghi lúc prebuild** (tìm ra khi
  đối chiếu docs Expo chính thức, đã verify trong config resolve + `ios/`
  sinh ra): `NSSupportsLiveActivities=true` trong Info.plist app chính
  (không có thì mọi `Activity.request` đều hỏng) và
  `extra.eas.build.experimental.ios.appExtensions` khai báo target
  `ASCNDWidgets` cho EAS sign/provision (không có thì cloud build không ký
  được extension).
- **Cả 2 widget + UI Live Activity** trong một WidgetBundle, đọc chung từ
  `WidgetData` abstraction; mock data ghi rõ SPIKE-ONLY.
- `npx tsc --noEmit` sạch; `node tools/check.mjs` 296/296 xanh (rerun thật
  ngày 01/10 — lần chạy đầu bắt 1 lỗi thật của spike: `playNativeHaptic`
  chưa có chỗ gọi, đã fix bằng exemption có lý do trong `tools/linked.mjs`
  theo đúng đường gate cho phép);
  `expo prebuild --platform ios` thành công;
  `expo-modules-autolinking resolve --platform ios` nhận pod `AscndNative`.
- **Chưa chứng minh** (cần máy macOS/EAS + credentials): biên dịch Swift,
  EAS build iOS, gọi RN → Swift lúc runtime, ActivityKit thật trên máy,
  widget render trên máy. Lệnh EAS đã soạn sẵn trong doc spike.

Quy tắc từ đây: không đi từ spike → implementation native lớn khi chưa có
EAS build xanh và Kiệt duyệt.
