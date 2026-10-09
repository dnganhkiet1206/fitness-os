# Kiểm kê port RN → native (A18, #336)

Baseline: `fac9ac2` (`native/src/**`). Native: chuỗi nhánh A tới `agent/a/lifecycle` (#397).
Mỗi dòng có nguồn RN (file, dòng). Trạng thái chia bốn mức:

| Mức | Nghĩa |
|---|---|
| **ported** | đã có hành vi tương đương; có test |
| **partial** | có lõi; còn hành vi RN cụ thể chưa port, ghi ở cột "Còn thiếu" |
| **not ported** | chưa có gì |
| **decision** | chờ Kiệt quyết, hoặc ngoài phạm vi v1. Không làm khi chưa có quyết định |

Follow-up chỉ được tạo cho mục có nguồn RN cụ thể (#336). Các mục khác chỉ ghi nhận ở đây.

## 1. Tập luyện: màn tập trong ngày (`components/ascnd/day-plan.tsx`, 2844 dòng)

| Hành vi | Nguồn RN | Native | Mức | Còn thiếu |
|---|---|---|---|---|
| Kế hoạch tuần → hàng set | `day-plan.tsx:547` `expand`, `use-library.ts:349` | `TodayPlan.swift`, `TodayController` | ported | |
| Trạng thái ngày todo/done/missed/rest/unplanned | `week-strip.tsx:137` | `WorkoutPlanning.plan` | ported | |
| Tick / sửa tạ, rep, RPE, nghỉ; lưu điểm quay lại | `day-plan.tsx:801-975` | `WorkoutSessionController`, `GRDBWorkoutStore` | ported | |
| Đọc điểm quay lại hỏng | `day-plan.tsx:912` | `loadFailed` (#383) | ported (sửa lỗi RN) | |
| Quãng nghỉ + Island ±15 | `day-plan.tsx:253`, `RestTimerIntents.swift` | `RestTimerController`, `ASCNDLiveActivity` | ported | #235 chờ Kiệt |
| Chốt buổi → `workout_sessions`, offline | `use-fitness-data.ts:308` | `finish()` + outbox + `SyncWorker` | ported | |
| Kỷ lục cá nhân khi chốt | `personal-record.ts`, `use-fitness-data.ts:308` | `PersonalRecordBook.swift` (#298) | ported (sửa lỗi RN) | |
| Nối thêm set vào buổi đã chốt | `use-fitness-data.ts:599` | `append()` (#307) | ported (sửa lỗi RN) | |
| "Lần trước" mỗi bài | `exercise-performance.ts:202`, `day-plan.tsx:783` | `LastPerformance.swift` (#349) | partial | loại bài bodyweight + cân nặng ngày tập (`bodyweightOn`) |
| **Bỏ tick set ĐÃ CHỐT → gỡ set khỏi buổi + hoàn tác 8 s** | `day-plan.tsx:1173-1247`, `use-fitness-data.ts:716` (`useRemoveSetFromSession`), `:793` (`useRestoreSession`) | hàng đã chốt bị **khoá** (`editable`, A12) | **not ported** | follow-up A19 #398 |
| **Thêm bài ngoài kế hoạch trong buổi (`extra: AdHoc[]`)** | `day-plan.tsx:739`, `:896-906` (khôi phục), `:989-1000` (thêm/sửa/xoá) | `DayProgress` không có `extra` | **not ported** | follow-up A20 #399 |
| Mời chia sẻ lên Cộng đồng sau khi chốt | `day-plan.tsx:1569`, `use-workout-share-invite.ts:29` | không | decision | ranh giới Cộng đồng (mục 8) |

## 2. Lịch sử và quản lý buổi

| Hành vi | Nguồn RN | Native | Mức | Còn thiếu |
|---|---|---|---|---|
| "Đã tập" 14 ngày cho tuần | `useWorkoutSessions(14)` | `TrainingHistory` | ported | |
| **Danh sách buổi đã tập + xoá buổi** | `app/sessions.tsx` (266), `use-fitness-data.ts:210` `useDeleteWorkoutSession` | không | **not ported** | follow-up A21 #400 (dữ liệu). Trình bày: C-28 #367 |
| Ghi buổi bằng tay (sheet, điền sẵn từ kế hoạch, `template_id` null) | `app/log-workout.tsx` (1184), `:82-115`, `:998` | chỉ có kế hoạch mẫu trong Lab | not ported | sau A20: dùng chung đường ghi ad-hoc |
| Insight theo bài (biểu đồ, e1RM, xu hướng) | `app/exercise-insight.tsx` (570), `useExerciseInsights` | không | not ported | |

## 3. Template và kế hoạch tuần (ghi)

| Hành vi | Nguồn RN | Native | Mức | Còn thiếu |
|---|---|---|---|---|
| Đọc template + `routine_days` | `use-library.ts:349` | `SupabaseTemplateSource`, cache | ported | |
| Làm mới khi ra tiền cảnh / có mạng lại | `query-client.ts:74-87` | `WorkoutFlow.isStale` (#396) | ported | |
| **Tạo / xoá template, gán ngày trong tuần** | `app/templates.tsx` (175), `app/workout-builder.tsx` (1011), `useAddWorkoutTemplate`, `useDeleteWorkoutTemplate`, `useUpsertRoutineDay` (`use-library.ts:472`) | chỉ đọc | **not ported** | follow-up A22 #401 |
| Thư viện bài tập (thêm/xoá bài riêng) | `app/exercises.tsx` (434), `useAddExercise`, `useDeleteExercise` | không | not ported | sau A22 |
| Hướng dẫn bài tập | `app/exercise-guide.tsx` (1920) | không | not ported | nội dung tĩnh, không chặn luồng tập |

## 4. Xác thực và phiên

| Hành vi | Nguồn RN | Native | Mức | Còn thiếu |
|---|---|---|---|---|
| Đăng nhập / đăng ký email, Apple, quên mật khẩu | `components/ascnd/auth-screen.tsx`, `use-auth.tsx` | `SessionStore`, `SupabaseAuthAPI` (#224); màn C #297 | ported (lõi) | màn production: C #297 / #313 |
| Gate theo phiên, dọn khi đăng xuất / đổi tài khoản | `use-auth.tsx:53` `forgetPreviousAccount` | `RootGate`, `onSignedOut` (#293), #397 | ported (sửa lỗi RN) | |
| Hàng chờ gửi khi đăng xuất | `clearPersistedCache` | bỏ, như RN | decision | #241 |
| Đổi mật khẩu | `app/change-password.tsx` (157) | không | not ported | |
| Onboarding | `components/ascnd/onboarding-flow.tsx` | `OnboardingController` (#442), `OnboardingGateView` / `OnboardingFlowView` (#527 1.3) | ported (chờ merge) | màn Sức khoẻ (HealthKit 4.1), Koa (Phase 7) |

## 5. Hồ sơ và cài đặt

| Hành vi | Nguồn RN | Native | Mức |
|---|---|---|---|
| Sửa hồ sơ (đơn vị, cân nặng, mục tiêu) | `app/edit-profile.tsx` (889), `useProfile` | không | not ported. Vỏ trình bày: C-35 #387 |
| Cài đặt (ngôn ngữ, khoá app, vai trò, linh vật) | `app/settings.tsx` (1109), `useAppLock`, `useAppRole` | không | not ported |
| Nhắc nhở | `app/reminders.tsx` (306), `use-reminders.ts` | `ReminderCenter` (#445), `RemindersView` (#527 1.10) | ported (chờ merge) | lời mời theo giờ hay tập (`habitFor`), đồng bộ ngữ cảnh từ Hôm nay (`useReminderSync`) |

## 6. Readiness và HealthKit

| Hành vi | Nguồn RN | Native | Mức |
|---|---|---|---|
| Readiness / `daily_logs` | `hooks/use-today-data.ts`, `lib/adaptive-tdee.ts`, `use-biometrics.ts` | không | **decision**: #266 chờ Kiệt; chỉ forensic (D-15 #327) |
| Đồng bộ HealthKit (bước, năng lượng, ngủ) | `hooks/use-health-sync.ts`, `lib/health-sync-write.ts`, `lib/health-days.ts` | không | **decision**: chưa có hợp đồng sản phẩm cho bản native |

## 7. Điều hướng, offline, nền

| Hành vi | Nguồn RN | Native | Mức |
|---|---|---|---|
| 5 tab, thứ tự và biểu tượng | `components/app-tabs.tsx` | `RootTabView` | ported |
| Hàng ghi offline (lớp Ghi nhận) | `lib/offline-write.ts`, `offline-class.ts` | outbox + `SyncWorker` (ADR-0003). Hiện **chỉ** cho buổi tập | partial: nước, bữa ăn, cân nặng… theo từng slice |
| Làm mới khi ra tiền cảnh / có mạng lại | `query-client.ts:74-87` | `WorkoutFlow` (#396) | ported (luồng tập) |
| Live Activity khi app bị kill | `AscndNativeModule.swift` | #378 | ported (sửa lỗi RN) |

## 8. Ranh giới (ngoài phạm vi luồng tập)

Các mảng sau **not ported** và nằm ngoài phạm vi A cho tới khi #222 giao:
- Dinh dưỡng: `nutrition.tsx`, `log-meal`, `food-*`, `scan-*`, `meal-plan*`, `grocery`, `water`, `supplements`.
- Cộng đồng: `community*`, `challenges`, `awards`, `shop`, `mascot-room`.
- Trợ lý và coach: `assistant.tsx`, `coach-memory`. (`ai-coach` đã port — E #527 Phase 6, `CoachChatView`; xem PARITY_MATRIX.)
- Theo dõi cơ thể: `biometrics`, `log-*`, `measurements-trend`, `progress-photos`, `sleep-insights`, `steps`, `weekly-review`, `smart-goals`.

`admin/*` (8 màn) là **decision**: cần Kiệt quyết bản native v1 có kèm console quản trị hay không.

## Follow-up đã tạo

| # | Việc | Nguồn |
|---|---|---|
| A19 #398 | Bỏ tick set đã chốt → gỡ set khỏi buổi + hoàn tác | `day-plan.tsx:1173-1247`, `use-fitness-data.ts:716-810` |
| A20 #399 | Bài thêm ngoài kế hoạch trong buổi | `day-plan.tsx:739`, `:896-906`, `:989-1000` |
| A21 #400 | Lịch sử buổi + xoá buổi (dữ liệu) | `sessions.tsx`, `use-fitness-data.ts:210` |
| A22 #401 | Ghi template + gán ngày | `templates.tsx`, `workout-builder.tsx`, `use-library.ts:472` |
