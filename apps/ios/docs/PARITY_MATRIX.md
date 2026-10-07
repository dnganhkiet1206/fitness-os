# Parity matrix RN → Native iOS (sống)

Chủ: B (#523). Chi tiết từng hành vi (nguồn RN, dòng): [PORTING_INVENTORY.md](PORTING_INVENTORY.md) (A18).
Trang này là bảng theo **mảng** và theo **route**. Mỗi ô có evidence kiểm được (PR đã merge, test, tệp). Không ô nào điền theo cảm giác.

- **Base đối chiếu:** `native/ios-rewrite` @ `82a89b05` (07/10/2026).
- **RN:** `native/src/app/**` có **75 route**. RN tiếp tục là bản Android; iOS là native. Hai bản dùng chung backend và dữ liệu.

## Thang trạng thái

| Ký hiệu | Nghĩa |
|---|---|
| ✅ DONE | Hành vi tương đương RN, **có test**, đã vào `native/ios-rewrite`. Cột Evidence chỉ ra PR, test hoặc vector |
| 🟡 PARTIAL | Có lõi; còn hành vi RN cụ thể chưa có (ghi ở cột Còn thiếu) |
| 🔵 IN QUEUE | Code đã có trong PR đang chờ merge, chưa vào base. Chưa tính là DONE |
| 🔴 TODO | Chưa có gì trong native |
| ⚪ DECISION | Chờ quyết định sản phẩm (Kiệt); không làm khi chưa có quyết định |

"Có màn compile được" **không** phải DONE (directive §2, §19).

## 1. Theo mảng

| Mảng | RN | Native | Parity | Tests | Trạng thái | Evidence / còn thiếu |
|---|---|---|---|---|---|---|
| Đăng nhập email / Apple / quên MK | ✅ | ✅ | 🟡 | 🟡 | 🟡 PARTIAL | `SessionStore`+`SupabaseAuthAPI` (#245), `AuthView` (#297). Nonce Apple theo từng lượt (P1, batch 1, `AppleSignInNoncesTests`). Kiểm tra form #350 (batch 3; **cải tiến** so với RN: RN chỉ đòi khác rỗng). Thiếu: capability Apple trong `project.yml` (A/Kiệt) |
| Gate phiên, đổi tài khoản | ✅ | ✅ | ✅ | ✅ | ✅ DONE | #293, #397, #338; `AccountIsolationTests`, D-22 #390 |
| Đổi mật khẩu | ✅ | 🟡 | ✅ | ✅ | 🟡 PARTIAL | A29 #441 (batch 5): `PasswordChangeController`, luật RN (≥6 đơn vị UTF-16, so từng đơn vị như JS), lỗi có tên. Chưa có màn production |
| Onboarding | ✅ | 🟡 | 🟡 | ✅ | 🟡 PARTIAL | A30 #442 (batch 5): trạng thái, luật bước, nháp bền, `FitnessCalc` (golden `plan-golden.json` sinh từ RN). Chưa có màn production |
| Hôm nay (5 trạng thái, kế hoạch) | ✅ | ✅ | 🟡 | ✅ | 🟡 PARTIAL | `TodayController` (#290), `TodayScreen` (#345), vectors TC (#380). `todayCta` / `sessionTicks` / `mergeProgress` port vào Core (`TodayRules`, batch 5, runner TodayVectorTests). Thiếu: TodayView chưa dùng `cta`; widget Hôm nay (mục 3) |
| Màn tập trong ngày | ✅ | ✅ | 🟡 | ✅ | 🟡 PARTIAL | #263/#268/#287/#389; vectors WS (#286), append (#347), remove-set (#412). Tạ lẻ `plannedLoad` + lỗi chốt chữ RN (batch 1, golden node). VoiceOver từng control #288 + #291, focus/flush ô nhập #318 (batch 3). Ô nhập đọc `controller.progress` (không seed một lần), khoá khi controller không cho sửa (`canEditMatchesWhatTheSettersAccept`). Sau khi chốt (batch 4): bỏ tích → hỏi lại chữ RN → gỡ + hoàn tác 8 s; "Ghi thêm vào buổi hôm nay"; rung + VoiceOver khi xong. Đa thiết bị (batch 6): buổi ghi ở máy khác được NHẬN — hàng chứng minh đã tích với số thật, gỡ / nối thêm vào buổi ấy như RN (`AdoptRemoteSessionTests`, hai máy qua server giả). Chưa thử trên hai máy thật. Thiếu: RestCard / SyncStrip chưa nối controller; `WorkoutView` chưa được gắn vào tab production |
| Gỡ set đã chốt + hoàn tác 8 s | ✅ | ✅ | ✅ | ✅ | ✅ DONE | A19 #415; vectors RS (#412); `WorkoutSessionControllerTests` RS-3..6. RS-1/2 chưa có test bám ID |
| Bài thêm ngoài kế hoạch | ✅ | ✅ | ✅ | ✅ | ✅ DONE | Dữ liệu A20 #416, UI #411, vectors AH #413 (batch 1). Chưa thử trên máy thật |
| Kỷ lục cá nhân | ✅ | ✅ | ✅ | ✅ | ✅ DONE | A11 #298; vectors PR (#344, runner gọi logic RN) |
| "Lần trước" mỗi bài | ✅ | ✅ | ✅ | ✅ | ✅ DONE | A13 #349 + A23 #434 (bodyweight) |
| Lịch sử buổi + xoá | ✅ | 🟡 | 🟡 | ✅ | 🟡 PARTIAL | Dữ liệu A21 #433, vectors WH (#414). UI #375 (B port lại theo `sessions.tsx`, batch 3): nhóm tháng + % so tháng trước (`HistoryMonths`, golden node TZ Sài Gòn/UTC), lỗi ≠ rỗng, xoá vuốt + nút + hỏi lại. **Chưa port:** WH-3a (dựng lại `daily_log` sau xoá — câu hỏi lại vì thế bỏ vế "điểm sẵn sàng sẽ được tính lại"), kcal mỗi buổi, đơn vị lb, nút "Ghi buổi tập" ở trạng thái rỗng. Chỉ vào được từ Lab (tab Tập luyện production chưa có) |
| Ghi buổi bằng tay | ✅ | 🟡 | ✅ | ✅ | 🟡 PARTIAL | A24 #436 (batch 5): `ManualLogController` — RPE 6…10 mặc định 7, cận `lift_kg` 0…600 / `set_reps` 1…500, `validSets`, nháp bền, gợi ý kế hoạch (đã đối chiếu `log-workout.tsx`). Chỉ có trong Lab |
| Template + gán ngày (ghi) | ✅ | 🟡 | 🟡 | ✅ | 🟡 PARTIAL | A22 #435 (batch 1); builder UI #410 còn dùng mock — chưa nối `PlanEditor` |
| Thư viện bài tập / hướng dẫn / insight | ✅ | 🟡 | 🟡 | ✅ | 🟡 PARTIAL | A25 #437 insight (golden sinh bằng mã RN), A26 #438 thư viện, A27 #439 ghi thư viện qua outbox, A28 #440 hướng dẫn (golden) — batch 5. Read model + Lab; chưa có màn production |
| Hồ sơ | ✅ | 🟡 | 🟡 | ✅ | 🟡 PARTIAL | A31 #443 (batch 5): model đọc/ghi, form sửa, đơn vị. Ghi `update eq user_id` các cột form — last-write-wins **giống RN** `edit-profile.tsx:275`, cần mạng như RN. Vỏ `SettingsView` #394 |
| Cài đặt app / nhắc nhở / chi tiết buổi | ✅ | ⚪ | — | — | ⚪ DECISION | A32 #444 / A33 #445 / A34 #446: ranh giới quyết định; 11 PR xếp chồng phía trên chờ theo |
| Quãng nghỉ + Live Activity | ✅ | ✅ | 🟡 | ✅ | 🟡 PARTIAL | `RestTimerController` + `ASCNDLiveActivity`; #378 (batch 2: intent khi app bị kill; `Activity.request` bị từ chối không còn tính là đã hiện — `refusedStartIsNotRecordedAsShown`). **Tạm dừng (#235, Kiệt chốt ở #523)**: `RestTimer.pausedLeft` + `RestEvent.pause/resume`, ngữ nghĩa RN `day-plan.tsx` (đóng băng `ceil(remaining)` kể cả giây "xong", thời gian trôi không hết giờ, ±15 chỉnh số đóng băng, tiếp tục `max(1, …)`), golden **RT-17a–l** chạy trên bản chép RN (`run.mjs`, neo từng dòng ở `divergence-check.mjs`) và trên `RestTimer.reduce` (`WorkoutVectorTests`); controller: `pauseFreezesAppAndIsland`, `repeatedPauseStaysPaused`, `pausedRestSurvivesKill`, `stateWithoutPauseFieldDecodes`. Nút ở CẢ thẻ trong app lẫn Island (RN 02/10 chỉ có trên Island, gỡ 03/10 vì app không có — nay cả hai cùng có). `active`/`ready` của RN chỉ có trong `DIGallery` (mock), sản phẩm chỉ gửi `resting` — không phải năng lực người dùng. Island ghi set kế tiếp là "Set x/y" (RN thêm chữ "Hiệp tiếp theo"). Hiện gì khi `isStale` là câu hỏi mở (#378). Chưa chạy trên iPhone thật |
| Đồng bộ / outbox | ✅ | 🟡 | 🟡 | ✅ | 🟡 PARTIAL | ADR-0003, #264/#265/#267; property tests D-13 #357. **Chỉ cho luồng tập**: nước, bữa ăn, cân nặng… chưa có |
| Readiness / `daily_logs` | ✅ | 🔴 | — | — | ⚪ DECISION | #266 (khoá) |
| HealthKit (bước, năng lượng, ngủ) | ✅ (`use-health-sync.ts`, 25+ tệp dùng) | 🔴 | — | — | ⚪ DECISION | **Không có trong native** (chỉ có 1 dòng ghi chú trong PORTING_INVENTORY §6). Bảng mẫu của directive ghi DONE: **không đúng** |
| Dinh dưỡng | ✅ | 🔴 | — | — | 🔴 TODO | 13 route (mục 2) |
| Cộng đồng | ✅ | 🔴 | — | — | 🔴 TODO | 14 route |
| Trợ lý / coach AI | ✅ | 🔴 | — | — | 🔴 TODO | 3 route |
| Theo dõi cơ thể | ✅ | 🔴 | — | — | 🔴 TODO | 11 route |
| Kinh tế / gamification (huy chương, cửa hàng, Koa) | ✅ | 🔴 | — | — | 🔴 TODO | 5 route; luật thưởng/streak/coin **không được đổi** |
| Quản trị (`admin/*`) | ✅ | 🔴 | — | — | ⚪ DECISION | 8 route; native v1 có kèm console quản trị? |
| Thông báo cục bộ (nhắc nhở) | ✅ (`expo-notifications`) | 🔴 | — | — | 🔴 TODO | 0 tệp `UNUserNotificationCenter` trong `apps/ios` |
| Widget màn hình chính | ✅ (`TodayWorkoutWidget`, `StreakReadinessWidget`) | 🔴 | — | — | 🔴 TODO | `apps/ios/ASCNDWidgets` chỉ có Live Activity. Nếu iOS chuyển hẳn sang native mà chưa port thì **mất 2 widget** |
| Deep link (`ascnd://`) | ✅ | 🔴 | — | — | 🔴 TODO | Chưa audit route nào nhận link |
| Localization en/vi/es | ✅ | ✅ | 🟡 | ✅ | 🟡 PARTIAL | `XcstringsTests` (#249) + `XcstringsUsageTests` (#345). Chữ cứng trong Lab là Debug-only (#340) |

## 2. Theo route RN (75)

| Route RN | Mảng | Native | Trạng thái |
|---|---|---|---|
| `_layout`, `(tabs)/_layout` | Khung, 5 tab | `RootGate`, `RootTabView` (#351) | ✅ DONE (khung); 4 tab ngoài Hôm nay còn là placeholder |
| `(tabs)/index` | Hôm nay | `TodayScreen` (#345) | 🟡 PARTIAL |
| `(tabs)/workouts/_layout`, `index`, `plan`, `library` | Tập luyện | Builder (#410, mock), `WorkoutView` | 🟡 / 🔵 (A22 #435, A26 #438) |
| `log-workout` | Ghi tay | — | 🔵 A24 #436 |
| `sessions` | Lịch sử | dữ liệu #433; UI #375 (batch 3) | 🟡 |
| `templates`, `workout-builder` | Template | #410 + #435 | 🔵 |
| `exercises`, `exercise-guide`, `exercise-insight` | Thư viện | — | 🔵 A26/A27/A28/A25 |
| `change-password` | Tài khoản | — | 🔵 A29 #441 |
| `edit-profile` | Hồ sơ | — | 🔵 A31 #443 |
| `settings` | Cài đặt | vỏ #394 | ⚪ A32 #444 (ranh giới) |
| `reminders` | Nhắc nhở | — | ⚪ A33 #445 (ranh giới) |
| `legal`, `media-viewer` | Khác | — | 🔴 TODO |
| `(tabs)/nutrition`, `diary`, `food-editor`, `food-list`, `grocery`, `log-meal`, `meal-plan`, `meal-plans`, `nutrition-insights`, `scan-barcode`, `scan-food`, `supplements`, `water` | Dinh dưỡng | — | 🔴 TODO (13) |
| `(tabs)/community`, `community-challenge`, `community-challenges`, `community-inbox`, `community-post`, `community-privacy`, `community-profile`, `community-saved`, `community-search`, `community-share`, `community-share-progress`, `community-share-recipe`, `community-user`, `challenges` | Cộng đồng | — | 🔴 TODO (14) |
| `(tabs)/assistant`, `ai-coach`, `coach-memory` | Trợ lý | — | 🔴 TODO (3) |
| `biometrics`, `log-biometrics`, `log-measurement`, `log-sleep`, `log-weight`, `measurements-trend`, `progress-photos`, `sleep-insights`, `steps`, `weekly-review`, `smart-goals` | Cơ thể | — | 🔴 TODO (11) |
| `awards`, `shop`, `mascot-room`, `koa-sheet`, `koa-debug` | Kinh tế / Koa | — | 🔴 TODO (5; `koa-debug` là công cụ dev) |
| `admin/_layout`, `appeals`, `audit`, `images`, `index`, `reports`, `target`, `user`, `users` | Quản trị | — | ⚪ DECISION (9 tệp, 8 màn) |

## 3. Năng lực iOS ngoài route

| Năng lực | RN (iOS) | Native | Ghi chú |
|---|---|---|---|
| Live Activity nghỉ | `native/modules/ascnd-native/ios/Widgets/RestTimerLiveActivity.swift` | `apps/ios/ASCNDWidgets/RestLiveActivity.swift` + `ASCNDLiveActivity` | Hai bản thuộc **hai app khác nhau** (RN-iOS và native), không phải bản trùng trong một app. Bản chuẩn cho iOS native: `apps/ios`. Khoảng hở xem mục 1 |
| App Intents (±15, tạm dừng) | `RestTimerIntents.swift` | `AdjustRestIntent`, `SetRestPausedIntent` (`RestActivity.swift`) | ✅ (±15); ✅ tạm dừng / tiếp tục (#235) — intent mang trạng thái ĐÍCH, chạm dồn không lật ngược |
| Widget Hôm nay / Streak | `TodayWorkoutWidget.swift`, `StreakReadinessWidget.swift` | không | 🔴 TODO |
| HealthKit | `use-health-sync.ts` | không | ⚪ DECISION |

## 4. Đa thiết bị (iPhone ↔ Android, cùng backend)

Theo dõi riêng ở #523 (audit read → modify → write). Đã có:
- chốt buổi idempotent theo id (`upsert ignoreDuplicates`);
- bản ghi lại theo `"<buổi>@…"`;
- `routine_days` upsert theo `(user_id, day_of_week)`;
- `isRow` chặn ghi cho tài khoản khác.

**Phát hiện P1 (B, 07/10): bản ghi lại buổi đè dữ liệu của thiết bị khác.**

- **Native:** nối thêm (#307) và gỡ set (#415) tạo `workout-revision`. Hàng outbox mang **cả hàng `workout_sessions`** dựng từ ảnh chụp *trên máy này lúc đưa vào hàng đợi* (`WorkoutSessionController.revise`). `SupabaseRemoteWriter` upsert **ghi đè** khi gửi. Gỡ set cuối tạo `workout-delete`, xoá cả hàng.
- **RN** (`useAppendToSession`, `use-fitness-data.ts:599`): đọc hàng server **ngay trước khi ghi**, rồi `update({ sets: [...old, ...added] })`; lớp `offline: now`, cần mạng.
- **Kịch bản mất dữ liệu:**
  1. iPhone chốt buổi.
  2. iPhone offline nối thêm hoặc gỡ một set.
  3. Android nối thêm set vào cùng buổi (đọc mới nhất, ghi).
  4. iPhone có mạng → upsert ảnh chụp cũ → **set của Android mất**. Trường hợp gỡ set cuối: **xoá cả buổi**.
- **Đã sửa (B, batch 2):** gộp **lúc gửi** (`SessionRevisionMerge`, ASCNDCore).
  - Hàng outbox mang thêm `base` = các set máy này đã ghi trước lần sửa (trường optional; hàng outbox cũ vẫn giải mã được và giữ cách ghi cũ).
  - `SupabaseRemoteWriter` đọc `sets, session_rpe, pr_detected` của hàng **ngay lúc gửi**, rồi `update` theo `id` + `user_id` như RN. Hết set thì `delete`.
  - Theo từng nội dung set (bỏ `setIndex`): máy này thêm → `max(server, local)`; máy này gỡ → `min(server, local)`; không đụng → giữ như server. `max`/`min` để **phát lại không nhân đôi**.
  - Hàng đã bị máy khác xoá → không dựng lại (RN: `confirmWrite` báo lỗi). Ngoại lệ: hoàn tác lần gỡ set cuối của chính máy này.
  - `volume_load` tính lại (bỏ khởi động); `session_rpe` không giảm; `pr_detected` không mất — như RN nối thêm.
  - **Đánh đổi đã biết:** hai máy cùng thêm hai set *giống hệt* (cùng bài, mức, reps, RPE) thì giữ một. Còn khe nhỏ giữa đọc và ghi, đúng bằng khe của RN.
  - **Bằng chứng:**
    - `SessionRevisionMergeTests` (8 test): thêm/thêm, gỡ/thêm, máy kia đã gỡ, phát lại idempotent, gỡ set cuối khi máy kia còn set, hàng mất, các trường hàng, khoá set.
    - `WorkoutPipelineTests`: `offlineAppendDoesNotOverwriteAnotherDevicesSet`, `offlineRemovalKeepsAnotherDevicesSet` (đầu-cuối qua outbox + SyncWorker; `FakeServer` gộp đúng như writer).
    - iOS CI trên batch 2 `f41f2572` (run 37552501155): core-linux **319 test pass**, gồm cả các test trên; app-macos xanh. Chưa thử trên máy thật (hai máy thật).

**Buổi ghi ở máy khác cho hôm nay (B, batch 6):**
- RN (`day-plan.tsx` `proven = sessionTicks(rows, sessions.sets)`): hàng được chứng minh hiện đã tích, không phải hàng mới; "Ghi thêm" nối vào `sessions[0].id`; bỏ tích thì gỡ khỏi buổi ấy.
- Native: `TrainingHistory.sessions` đọc buổi của hôm nay (`id, date_time, session_rpe, pr_detected, sets`); máy này chưa có buổi riêng thì `WorkoutSessionController.adoptRemote` NHẬN buổi mới nhất — hàng chứng minh lấy tạ / reps / RPE THẬT; buổi cũ hơn cùng ngày chứng minh hàng nào thì hàng ấy tích + khoá (`DayState.provenElsewhere`, giữ qua mở lại app). Gỡ / nối thêm đi qua bản ghi lại có `base` = set server → `SessionRevisionMerge`: set ngoài kế hoạch của máy kia ở nguyên, không set nào nhân đôi.
- Bằng chứng: `AdoptRemoteSessionTests` (nhận đúng số, ghi thêm giữ đủ set Android, gỡ đúng set, buổi cũ khoá qua reload), golden TC-4 (`sessionTicks`). Chưa thử trên hai máy thật.
- Giới hạn đã biết: ô tạ hiện kg — app chưa có lb (#523 matrix).

**Không phải hồi quy:** `routine_days` upsert đủ 4 trường theo trạng thái trên máy. RN cũng làm vậy (`week-plan.tsx:343`), cùng last-write-wins. Hồ sơ (A31 #443): last-write-wins các cột form, giống RN (`edit-profile.tsx:275`) — không phải hồi quy (đã kiểm ở batch 5; hàng đợi).
