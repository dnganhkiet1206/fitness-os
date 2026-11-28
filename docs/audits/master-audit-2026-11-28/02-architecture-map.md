# Report 2 — Verified Architecture Map

ASCND Master Technical Audit — 2026-11-28 (read-only investigation, mission assigned by Kiệt 2026-11-28 ~00:27 CST).
Evidence base: native/ios-rewrite @ 5e673df3 (merge PR #1013, 2026-11-24 17:28 UTC). Repo: github.com/dnganhkiet1206/fitness-os (PUBLIC). Default branch `main` is NOT the source of truth.
Nothing was modified to produce this report. No branches, PRs, issues, docs, or production resources were changed.
Confidence vocabulary: CONFIRMED (direct evidence at tip) / STRONGLY SUSPECTED / POTENTIAL RISK / UNVERIFIED (needs Xcode, simulator, device, or Supabase dashboard — not available on the audit VM).

Source: working/w2-architecture.md (worker W2, verified against tip). W2 wrote in Vietnamese; kept as-is.

## Tóm tắt điều hành (10 điểm)

1. **StoreKit client ĐÃ TỒN TẠI** — đảo ngược MAP_DATA cũ (ghi ABSENT). `StoreKitClient.swift` (107 dòng, StoreKit 2, actor) + `PurchaseCoordinator` (Core, 144 dòng, test được trên Linux) + `PaywallView` + `PurchaseController`, nối qua `AppServices` (l.145–147, 1773–1836, 1954). Nhưng **đường mua vẫn cụt**: product ID trong `Backend.xcconfig` còn TRỐNG, và probe 2026-11-28 cho `verify-purchase`/`store-webhook`/`admin-art` vẫn **404** (chưa deploy), `ai-coach` 401 (đã deploy). Paywall chỉ hiện trạng thái "chưa mở bán".
2. **Admin/moderation ĐÃ VÀO app iOS** — đảo ngược MAP_DATA ("iOS không có admin"). 10 file mới `Features/Community/` (`ModerationDashboardView`, `AdminArtView`, `AdminUsersView`, `ModerationReportsView`, …) + `SupabaseModeration.swift` (backend) + `makeModeration`/`makeAdmin`/`makeMyReports` trong `AppServices`. Nút khiên chỉ hiện khi `moderation.role?.isStaff == true` (`CommunityView.swift:289`). Nhưng upload art qua `admin-art` vẫn cụt vì edge 404.
3. **Choke point `AppServices.swift` còn đúng — và lớn hơn.** 2.084 dòng (was 1.819), **68 factory `make*`** (was ~60), là file duy nhất (cùng `UITestMode`) import `ASCNDBackend`/`ASCNDStore`. Mọi View lấy dữ liệu qua đây hoặc `@Environment`.
4. **3D viewer vẫn DEBUG-only, chưa approved.** `ExerciseDemo3D*.swift` toàn file `#if DEBUG`, header ghi "UNVERIFIED — NOT APPROVED FOR PRODUCTION". MỚI: app nay ĐỌC `tempo.json` (`ExerciseDemo3D.swift:148`) và có `ExerciseDemoTempo.swift` — khoảng trống "app không đọc tempo.json" đã đóng một phần.
5. **Motion Kit nay CÓ CI.** Workflow mới `.github/workflows/motion-kit.yml` (8 workflow, was 7) — đảo ngược MAP gap "không CI cho Motion Kit". Nhưng **default branch vẫn là `main`** (xác minh qua `gh api`, 2026-11-28) nên scheduled CI vẫn chưa bao giờ chạy.
6. **HealthKit vẫn CHỈ ĐỌC.** `shareTypes` rỗng (`HealthKitSource.swift:31`), không có `save`/`deleteObjects` nào trong code native. Read types: steps, active energy, exercise time, RHR, HRV, SpO2, respiratory rate, sleep, workout, bodyMass, water.
7. **Không APNs, không Realtime — không đổi.** Grep `realtime`/`registerForRemoteNotifications` trong `apps/ios/ASCND` + Packages = 0 hit. Thông báo community = BGAppRefresh poll + local notification.
8. **Keychain: không có code Keychain trực tiếp.** Chỉ supabase-swift (`KeychainLocalStorage`) giữ session; 0 hit `SecItem*`/`kSecClass` trong toàn `apps/ios`.
9. **RN vẫn còn nguyên và vẫn chứa logic miền trùng lặp** (`native/src/lib/readiness-engine.ts`, `session-load.ts`, `koa-*.ts`, `daily-log-service.ts`, …). Chỉ 1 commit chạm `native/src` kể từ tip bản đồ (`native/src/integrations/supabase/types.ts`) — RN đóng băng về thực chất, nhưng code trùng vẫn nằm đó. Không khuyến nghị xoá trong phase này (theo task).
10. **Quy mô tại tip:** toàn repo 4.077 file (was 3.917); `apps/ios` 923 file Swift / 193.518 dòng (was 832 / 174.719); migrations **101** (was 94); i18n 3.521 key (was 3.341); test Swift trong Packages 306 file.


## §1. Verified directory map — `native/ios-rewrite` @ `5e673df3`

### 1.1 Tổng quan cây repo (cấp 1)

| Thư mục | Vai trò | Ghi chú tại tip |
|---|---|---|
| `apps/ios/` | App iOS chính (target ASCND + Widgets + Watch + tests) | 923 Swift / 193.518 dòng; xem §1.2 |
| `apps/site/` | Trang hỗ trợ tĩnh (privacy/terms/help/reset/delete) | Không đổi; hosting vẫn UNVERIFIED |
| `native/` | React Native — **BỊ BỎ 17/11/2026**, giữ trong repo | 478 file TS/TSX; xem §4 |
| `artifacts/exercise-visual-system/` | Motion Kit (Blender/3D, build-time) | Xem inventory 05; nay có CI riêng |
| `supabase/` | Backend duy nhất: 101 migrations, 12 edge functions, tests | Xem §1.5 |
| `spec/` | Contract + golden vectors + tokens.json | Không đổi đáng kể |
| `docs/` | Tài liệu quản trị (WORKFLOW, CONSTRAINTS_AND_DEFERRED, ADR) | Không đổi đáng kể |
| `.github/workflows/` | CI — **8 workflow** (mới: `motion-kit.yml`) | Xem §3.9 |
| `.claude/`, `.agents/`, `marketing/` | Skills + marketing video | Ngoài scope W2 |

### 1.2 App target `apps/ios/ASCND/` (37 file `App/` + 16 thư mục `Features/`)

| Thư mục | Files / Lines | Mục đích + quan hệ |
|---|---|---|
| `ASCND/App/` | 37 / 10.116 | Entry + shell: `ASCNDApp.swift` (@main), `RootGate.swift` (gating), `AppServices.swift` (container duy nhất), `ProductionTabs.swift`, `RootTabView.swift`, `DeepLinkScreen.swift`, `HealthKitSource.swift`, `WatchPhoneBridge.swift`, `WidgetRefresher.swift`, `Telemetry.swift`, `AppLockController.swift`, `NotificationReminderScheduler.swift`, `Store/` (mới: `StoreKitClient.swift` + `PurchaseController.swift`), `UITest/` (fake backend), `*LabView` (DEBUG). Mọi View khác đều phụ thuộc vào đây qua `@Environment(AppServices.self)`. |
| `Features/Today/` | 18 / 5.646 | Tab Today: `TodayScreen` (container ↔ `TodayController`) → `TodayView` (presentational), `TodayDayBlock`/`KoaBar`, `TodayPlanHero`/`TodayWeekStrip`, `TodayCoachSection` (SmartNudges), `TodayExtras`. Đọc `TodayController` (`flow.today`), `AppServices`, `WorkoutFlow`, `ProfileBook`, `NutritionBooks`. |
| `Features/Workout/` + `Builder/` | 15+4 / 5.691+~1.4k | Tab Workouts: `WorkoutsHomeView`, `WorkoutView` (live session, 1.866 dòng), `WorkoutHistoryView`, `SessionDetailView`, `ManualLogView`, `WorkoutFocusViews`, `RestCard`, `EffortScale` (RPE), `SyncStrip`; Builder: `TemplateList/FormView`, `WeekPlanView`, `WorkoutBuilderView`. Đọc `WorkoutFlow` + `AppServices`. |
| `Features/Nutrition/` | 20 / 7.415 | Tab Nutrition: `NutritionTab` (typed `*Route`), `DiaryView`, `LogMealView`, `WaterView`, `SupplementsView`, `FoodListView`, `ScanFoodView` (camera → `scan-food`), `ScanBarcodeView` (OpenFoodFacts), `MealPlansView`, `PlanWizardView`, `GroceryView`, `NutritionInsightsView`, `MealSuggestCard`. Books do `AppServices.makeNutrition*` dựng. |
| `Features/Assistant/` | 6 / 2.802 | Tab Progress (tên raw `"assistant"`): `AssistantTab` (`NavigationStack` qua `AssistantRoute`: chat, weekly, steps, training, biometrics, sleep, goals, measure, photos, memory, trends, tools, awards, community, group), `CoachChatView` (1.514 dòng), `CoachMemoryView`, `MetricPanelView`. Dựng ~14 Book qua factory. |
| `Features/Progress/` | 4 / 1.649 | `ProgressHero` (6 nhóm trạng thái), `ProgressResults`, `KoaJourneyView`, `KoaMonthView`. |
| `Features/Readiness/` | 8 / 2.794 | `ReadinessCardView`, `ReadinessGauge`, `ActivityRingsView`, `BiometricsView`, `TrainingCardView`, `WeeklyReviewView`, `HealthSyncCard`. Presentational — logic ở `ASCNDCore/Readiness`. |
| `Features/Body/` | 12 / 3.347 | `LogWeightView`, `LogMeasurementView`, `LogSleepView`, `LogBiometricsView`, `WeightTrendCard`, `MeasurementsView`, `StepsView`, `SleepInsightsView`, `SmartGoalsView`, `ProgressPhotosView` (AI body-check). Ghi qua `makeWeightLogger`/`makeSleepLogger`/… |
| `Features/Community/` | **25 / 10.496** (was 15 / 7.813) | Feed/post/comments/profile/search/challenges/inbox/DM/saved/share/privacy + **MỚI 10 file moderation/admin** (`ModerationDashboardView`, `ModerationReportsView`, `ModerationAppealsView`, `ModerationTargetView`, `ModerationReasonSheet`, `AdminArtView`, `AdminAuditView`, `AdminUserView`, `AdminUsersView`, `MyReportsView`). Entry: từ Progress (`AssistantRoute.community`) hoặc deep link; nút moderation chỉ khi `role?.isStaff`. |
| `Features/Mascot/` | 32 / 9.631 (was 29 / 8.921) | Koa Room/Shop/Awards: `MascotRoomView` (lớn nhất), `KoaFigureView` (vector renderer), `ShopView`, `StudioLayers`, `KoaDirectorDriver`, `KoaPeekHost`, `CelebrationOverlay`, `AwardsView`, `ChallengesView`; mới `KoaHapticPlayer.swift`, `KoaShowStage.swift`, `StudioWeather.swift`. |
| `Features/Onboarding/` | 5 / 1.582 | `OnboardingGateView`, `OnboardingFlowView` (đa bước), `LegalSheet`, `StarterPlan`, `TrainingCueLabels`. Ghi cuối: upsert `profiles` (`SupabaseProfile.swift:43`, `onConflict: "user_id"`). |
| `Features/Exercises/` | 15 / 4.939 (was 11 / 3.663) | Library + guide: `ExercisesView`, `ExerciseGuideView`, `ExerciseCard` (favorite toggle → `syncExerciseFavorites`), `ExerciseInsightView`; 3D: `ExerciseDemo3D*.swift` + mới `ExerciseDemoMistakes.swift`, `ExerciseDemoTempo.swift`, `MuscleMaterial.swift`, `MuscleSurface.metal` — **toàn bộ `#if DEBUG`**. |
| `Features/TellKoa/` | 2 / 2.226 | `TellKoaSheet` (voice/text log) + `VoiceDictation` (speech-to-text state machine). Gọi `ai-log-parse` khi online, fallback parser luật khi offline. |
| `Features/Settings/` | 4 / 1.136 (was 3 / 908) | `ChangePasswordView`, `DataExportView`, `EditProfileView` + **mới `PaywallView.swift`** (228 dòng). `SettingsView.swift` (top-level, 530 dòng) là màn Settings chính. |
| `Features/Notifications/` | 2 / ~158 | `AppNotices`, `CommunityAlerts` (BG refresh + local notification). |
| `Features/Reminders/` | 2 / 437 | `RemindersView`, `KoaReminderContext`. |
| `ASCND/Design/` | 9 / 933 | App-local shared UI: `BodyTrendChart`, `ChartGoalKey`, `ConfirmAlert`, `GlassComposer`, `Intelligence*` (AI badge/orb), `MediumSheet`, `MessageBubble`, `WeekDayStrip`. (Gap census GAP-11: trước đây không có node riêng — nay ghi nhận.) |
| `ASCND/Resources/` | — | `Localizable.xcstrings` (3.521 key, en/es/vi), `InfoPlist.xcstrings`, `ExerciseDemos/` (USDZ + textures + posters + mp4), `Sounds/` (Koa WAVs), 4 JSON nội dung (`award-text`, `challenge-text`, `legal-content`, `readiness-copy`). |
| `ASCND/SettingsView.swift` | 1 / ~530 | Màn Settings: theme/ngôn ngữ/app-lock/Health/reminders/export/đổi mật khẩu/xoá tài khoản + **Plan row + paywall** (`SettingsView.swift:194–199`, chỉ khi `account != nil` và `makePurchase()` non-nil). |

### 1.3 Widgets / Live Activity / Watch

| Target | Files / Lines | Mục đích + quan hệ |
|---|---|---|
| `ASCNDWidgets/` | 6 / 1.431 | `ASCNDWidgetsBundle` (Koa, MealQuick, TodayWorkout, StreakReadiness, RestLiveActivity); đọc App Group `group.com.ascnd.fitnessos` qua `WidgetDataStore`; intent `AddWater`/`LogUsualMeal`/`UndoMeal` chạy trong tiến trình app qua `KoaIntentRouter`. |
| `ASCNDWatch/` | 3 / 347 | Mirror buổi tập: `WatchWorkoutModel` (WCSession, đọc snapshot JSON từ `receivedApplicationContext`, gửi lệnh `sendMessage`/`transferUserInfo`) + `WatchWorkoutView`. Không tự đọc Supabase/HealthKit. `WKRunsIndependentlyOfCompanionApp: true`. |
| `Packages/ASCNDKit/Sources/ASCNDLiveActivity/` | 2 / ~225 | `RestActivity` (attributes + `AdjustRest`/`SetRestPaused` intents) + `KoaWidgetIntents`. Link vào CẢ app lẫn extension. |

### 1.4 Packages (SwiftPM) — `apps/ios/Packages/`

| Package / Target | Files | Vai trò + quan hệ |
|---|---|---|
| `ASCNDKit` → `ASCNDCore` | 245+ source (xem §1.4.1) | Logic thuần, chỉ import Foundation. Không SwiftUI/UIKit/network/lib ngoài. Build/test được trên Linux. Chứa toàn bộ engine + `*Book` + protocol `Source`/`Cache`/`RowStore`. |
| `ASCNDKit` → `ASCNDDesignSystem` | 13 | Token + component: `DSColor` (40 màu, sinh từ `spec/design/tokens.json`), `DSTypography`, `DSSpacing`, `DSButton`, `DSCard`, `DSAsyncState` (loading/error/offline), `DSMotion` (tôn trọng Reduce Motion). Dep: `ASCNDCore`. |
| `ASCNDKit` → `ASCNDLiveActivity` | 2 | Xem §1.3. Dep: `ASCNDCore`. |
| `ASCNDKit` → `ASCNDTestSupport` | 5 | Test-only: golden vectors, fixed clock. (Gap census GAP-06: trước đây không có node — nay ghi nhận.) |
| `ASCNDBackend` | 36 source (+10 test) | **Chỗ duy nhất nói với Supabase** (quy tắc #224). `supabase-swift 2.55.3`. 36 file `Supabase*`: auth, RowStore, RemoteWriter, EdgeCaller, Coach, Community, DM, mascot, meals, water, sleep, weight, profile, grocery, supplements, awards, photos, tier, popularity, guides, exercises, account deleter, stall recovery, **`SupabaseModeration.swift` (mới)**, `Backend`/`BackendConfig`, Google native sign-in, `SharedWorkoutSessions`. Dep: `ASCNDCore`. |
| `ASCNDStore` | 16 source (+9 test) | SQLite trên máy (GRDB 7.x): `Database` (migrator v1–v5), `OutboxStore`, `GRDBWorkoutStore`, 10 `GRDB*Cache`, `AccountLifecycle`. Chỉ lưu/tải, logic ở Core. Dep: `ASCNDCore`. |
| Tests | 306 file Swift trong `Packages/` (ASCNDKit Tests 280) + `ASCNDTests/` 19 file + `ASCNDUITests/` 2 file | CoreTests (golden vectors), BackendTests, StoreTests, Koa snapshot, a11y audit (`KoaAccessibilityAuditTests`, `KoaA11yBaseline`). |

#### 1.4.1 `ASCNDCore` theo subdir (số file Swift tại tip)

AI 23 · Auth 5 · Body 12 · Community 26 · Health 4 · Koa 54 · Mascot 13 · Nutrition 15 · Profile 9 · Progress 1 · Readiness 11 · Reminders 11 · Sync 7 · Today 7 · Widgets 4 · Workout 48 · **Purchase 4 (mới)** · Privacy 2 · Platform 1 · root 7 (`AverageWindow`, `DeepLink`, `EpochMillis`, `JSONValue`, `LocalDate`, `NumberInput`, `WallClock`). Tổng ~245 file source (khớp MAP).

- `Purchase/` (mới): `PurchaseCoordinator.swift` (144), `PurchaseStore.swift` (134), `PurchaseTier.swift` (22), `StoreProductConfig.swift` (49). Logic thuần trên protocol — test được trên Linux, không import StoreKit (chỉ `StoreKitClient` ở app target import StoreKit).
- `Koa/` 54 file (was 50): Mood + Companion + Director + Gains, 3 lớp. Koa KHÔNG có AI/LLM.
- `Community/` 26 file (was 23): Feed/Post/Comments/Actions/Profile/User/Search/Saved/Inbox/Challenges/Share/Try/Privacy + DM + **Moderation/Admin** (`CommunityModerationAdmin.swift`).
- `Sync/` 7 file: `Outbox`, `SyncWorker`, `StateWriter`, `RetryPolicy`, `NetworkFailure`, `NetStatus`, `InternetReachability`.

### 1.5 Backend — Supabase (tóm tắt; chi tiết thuộc W-backend, chỉ ghi số liệu đã đếm)

- Migrations: **101** file (was 94; mới nhất `20261124120000_dedupe_indexes_pin_search_path.sql`). Grep `CREATE TABLE public.*` đếm được **65 tên distinct** (MAP ghi 68 — chênh 3, xem §6.3; chưa kết luận xoá bảng).
- Postgres functions: **105 tên distinct** `CREATE [OR REPLACE] FUNCTION public.*` (MAP ghi 95 — tăng, gồm moderation/Koa mới; chưa phân loại hết).
- Edge functions: **12** thư mục + `_shared` (không đổi số lượng): 8 AI (`ai-coach`, `ai-coach-memory`, `ai-log-parse`, `ai-meal-suggest`, `ai-smart-nudges`, `ai-weekly-review`, `body-check`, `scan-food`) + 4 khác (`verify-purchase`, `store-webhook`, `delete-account`, `admin-art`).
- Storage: 3 bucket (`progress-photos` PRIVATE, `exercise-media` public, `community-art` public, chỉ admin ghi).
- RLS/trigger/policy: chưa đếm lại trong W2 (thuộc W-backend); MAP ghi 137 policy / 52 trigger tại tip cũ.

### 1.6 Config / build / CI

- `project.yml` (XcodeGen, source of truth; `.xcodeproj` không commit): Swift 6.0, iOS 18.0+, portrait-only, 1 scene, team `Z54JL44R9Z`, automatic signing, version 0.1.0. Targets: ASCND, ASCNDWidgets, ASCNDWatch, ASCNDTests, ASCNDUITests. Schemes: `ASCND` (test arg `-uiTestFakeBackend`), `ASCNDA11y`, `ASCNDWatch`.
- `Config/Backend.xcconfig`: chỗ DUY NHẤT ghi Supabase project (host `guqmbqtgxqleuwajvwvg.supabase.co` + publishable key — public, RLS bảo vệ). Sentry/PostHog keys TRỐNG (tắt). **`ASCND_PRODUCT_ID_PLUS` / `ASCND_PRODUCT_ID_MAX` TRỐNG** → chưa mở bán. Include `Backend.local.xcconfig` (không commit) để đè.
- Info.plist keys từ xcconfig: `ASCNDSupabaseURL/Key`, `ASCNDSentryDSN`, `ASCNDPostHogKey/Host`, `ASCNDSignInWithApple=NO` (mặc định, `project.yml:144`), `ASCNDSignInWithGoogle=YES`, `ASCNDProductIDPlus/Max`.
- External deps: Sentry 8.36+ (`from: 8.36.0`), PostHog 3.13+ (`from: 3.13.0`), SnapshotTesting 1.19.7 exact (tests only), supabase-swift 2.55.3 (via Backend), GRDB.swift 7.x (via Store).
- Entitlements (`ASCND.entitlements`): App Group `group.com.ascnd.fitnessos` + HealthKit + HealthKit background delivery. URL scheme `ascnd`. Background modes: `fetch` + BG task `com.ascnd.fitnessos.community-refresh`. `NSSupportsLiveActivities: true`.
- CI: **8 workflow** (was 7): `ios.yml`, `quality-gate.yml`, `sql-community.yml`, `ios-e2e.yml`, `ios-a11y.yml`, `ios-analysis.yml`, `system-check.yml`, **`motion-kit.yml` (mới)**. `motion-kit.yml`: 2 job (`checks` không cần Blender; `validate` cần Blender 5.2.0 headless), chạy trên push/PR chạm kit, bench press KHÔNG qua job validate (3 FAIL đã biết). **Default branch vẫn `main`** (xác minh `gh api repos/dnganhkiet1206/fitness-os -q .default_branch`, 2026-11-28) → scheduled CI vẫn chưa bao giờ chạy (MAP Item 4 chưa sửa).
- `.swiftlint.yml`: chỉ rule tìm lỗi (no style): `force_cast`, `force_try`, `duplicate_imports`, … CI chạy trên file đổi, non-blocking.
- Maestro: 13 flow (fake backend, không mạng). `tools/`: 177 file audit/generation (`.mjs`/`.sh`).

## §2. Architecture map

### 2.1 Sơ đồ tương tác (text)

```
iPhone (SwiftUI) ──▶ ASCNDApp (@main)
                        │ init 1 lần: AppServices + RestTimerController + Telemetry
                        │ onOpenURL ascnd:// → SessionStore.open() → DeepLinkInbox
                        ▼
                  RootGate ──▶ .loading → DSLoadingView
                             ──▶ .signedOut → AuthView (email/Apple-gated/Google)
                             ──▶ .signedIn → OnboardingGate → SignedInScope → RootTabView (.id(userId))
                                                              │  dựng 1 lần/phiên: WorkoutFlow,
                                                              │  ProfileBook, NutritionBooks,
                                                              │  ReminderTodayBook; Watch bridge;
                                                              │  midnight/foreground refresh
                                                              ▼
                                    4 tabs: Today | Workouts | Nutrition | Progress(Assistant/Coach)
                                    + QuickLogBar + TellKoaHost + CelebrationHost + KoaPeekHost
                        │
                        ▼
                  AppServices (2.084 dòng, @MainActor, @Observable)  ◀── CHOKE POINT DUY NHẤT
                        │  68 factory make*Book/make*Logger/makePurchase*
                        │  SessionStore · SyncWorker · HealthSyncCoordinator
                        │  WidgetRefresher · ReminderCenter · probeAI · reconcilePurchases
                        ├──────▶ ASCNDCore (pure, Foundation-only) ──▶ *Book/*Controller/*Engine
                        │              │  protocol Source/Cache/RowStore (inversion)
                        ├──────▶ ASCNDBackend ──▶ Supabase (auth/rows/edge/RPC/Storage)
                        ├──────▶ ASCNDStore (GRDB) ──▶ ascnd.sqlite (1 file: outbox + workout_day + read_cache + state_intents)
                        ├──────▶ StoreKitClient (actor, StoreKit 2) ──▶ App Store ──▶ verify-purchase (edge, 404)
                        ├──────▶ HealthKitSource (read-only) ──▶ HealthKit
                        ├──────▶ WatchPhoneBridge (WCSession JSON) ──▶ Watch (mirror)
                        ├──────▶ WidgetRefresher ──▶ App Group ──▶ Widgets + Live Activity
                        ├──────▶ ReminderCenter + CommunityAlerts ──▶ UNUserNotificationCenter (local) + BGAppRefresh
                        └──────▶ Telemetry (Sentry + PostHog, qua TelemetryScrubber; tắt khi key rỗng)

Đồng bộ dữ liệu (offline-first):
  View/Book ─▶ Outbox (GRDB, commit trước khi báo đã lưu) ─▶ SyncWorker (1 làn tuần tự, at-least-once,
  upsert idempotent, SessionRevisionMerge đọc lại server rồi chỉ áp delta của máy này)
  ─▶ SupabaseRemoteWriter ─▶ workout_sessions / meal_entries / weight / sleep / water / biometrics
  Community ghi CHỈ khi online (không qua outbox). Sign-out PARK outbox (AUD-06 b); workout_day PARK
  theo owner (#919); ngày đỗ của chủ khác quá 14 ngày bị dọn khi mở app (#933).

AI (không gọi LLM trực tiếp từ app):
  CoachChat / SmartNudges / SpokenLog / MealSuggest / ScanFood / BodyCheck / WeeklyReview
  ─▶ EdgeCaller ─▶ Supabase Edge Functions ─▶ _shared/callAI() ─▶ LLM provider (env)
  Cổng: AppServices.probeAI() dò từng function (POST anon key, 401 = có, 404 = chưa deploy,
  timeout 8s × 3 lần, cách 2s); mỗi lối vào chỉ nhìn cờ của function nó gọi (AIFunctionAvailability).
  ai-log-parse không bị chặn bao giờ; body-check không dò (lỗi mang trong kết quả).
```

### 2.2 Ranh giới module (đã xác minh bằng grep import)

| Ranh giới | Trạng thái |
|---|---|
| Chỉ `AppServices` (+ `UITestMode`) import `ASCNDBackend`/`ASCNDStore` trực tiếp | CONFIRMED — `grep import ASCNDBackend\|ASCNDStore` trong `ASCND/` chỉ trúng `AppServices.swift` (+ UITest). App target còn lại chỉ import `ASCNDCore`/`ASCNDDesignSystem`/`ASCNDLiveActivity`. |
| `ASCNDCore` pure | CONFIRMED — 0 import `ASCNDBackend`/`ASCNDStore`/SwiftUI/UIKit trong `Packages/ASCNDKit/Sources/ASCNDCore`; chỉ Foundation. Build được trên Linux (CI `core-linux`). |
| `ASCNDBackend` là chỗ duy nhất chạm Supabase (#224) | CONFIRMED theo cấu trúc (36 file `Supabase*`); không tìm thấy client Supabase ngoài package này. |
| `ASCNDStore` chỉ lưu/tải | CONFIRMED theo code (`Database`/`OutboxStore`/`GRDB*Cache`); logic ở Core. |
| StoreKit chỉ qua `StoreKitClient` | CONFIRMED — `import StoreKit` chỉ 1 hit trong toàn `apps/ios`: `ASCND/App/Store/StoreKitClient.swift:3`. `PurchaseCoordinator`/`PurchaseStore` (Core) chỉ nói qua protocol `PurchaseStoreClient`. |
| Keychain chỉ qua SDK | CONFIRMED — 0 hit `SecItem*`/`kSecClass`; session lưu Keychain qua supabase-swift `KeychainLocalStorage` (`Backend.swift:6–7` comment). |

### 2.3 Coupling / circular deps / duplicated logic / unclear ownership

1. **Choke point `AppServices` — còn đúng, và nặng hơn.** 2.084 dòng, 68 factory, giữ SessionStore, SyncWorker, HealthSyncCoordinator, WidgetRefresher, ReminderCenter, probeAI, reconcilePurchases, Koa reward/equipped/build state, `questObserverCache`, `habitHours`. POTENTIAL RISK: mọi thay đổi wiring đều chạm file này; file này là điểm merge-conflict tự nhiên của mọi agent. Chưa thấy tách nhỏ. Không có circular dep: AppServices → Backend/Store/Core một chiều; Core không import ngược.
2. **Không phát hiện circular dep giữa các package.** Dep graph: DesignSystem → Core; LiveActivity → Core; Backend → Core; Store → Core; App → tất cả. Không có cạnh ngược. (CONFIRMED bằng grep import.)
3. **Duplicated logic — RN ↔ native (frozen, không còn duy trì).** RN `native/src/lib/` vẫn chứa `readiness-engine.ts`, `session-load.ts`, `daily-log-service.ts`, `koa-decide.ts`, `koa-emotion.ts`, `koa-band.ts`, `mascot-*.ts`, `streak.ts`, `adaptive-tdee.ts`, … — cùng miền với `ASCNDCore/Readiness`, `Workout/SessionLoad`, `Koa/`, `Mascot/`. Đây là trùng lặp **lịch sử, đã đóng băng**, không phải trùng đang chạy song song (native là chuẩn từ 17/11). Không khuyến nghị xoá trong phase này. Xem §4.
4. **Duplicated logic trong native — không phát hiện trùng lớn.** Một điểm cần lưu ý: `ASCND/Design/` (9 file app-local) và `ASCNDDesignSystem` (13 file package) cùng là "design system" hai tầng — ranh giới là app-local chỉ dùng trong app, package dùng chung; không thấy component trùng tên trực tiếp, nhưng là 2 nơi chứa UI primitives (POTENTIAL RISK: drift).
5. **Ownership không rõ — 2 điểm:**
   - `ASCNDCore/Widgets/` (payload widget) vs `WidgetRefresher` (app) vs `WidgetSync`: 3 nơi chạm cùng payload App Group; writer duy nhất là `WidgetRefresher` (CONFIRMED theo MAP + code), nhưng reader/writer contract nằm rải.
   - Moderation: `CommunityModerationAdmin.swift` (Core) + `SupabaseModeration.swift` (Backend) + 10 View (app) — mới, chưa có tài liệu ownership; RPC `mod_*`/`admin_*` do server giữ.
6. **Inconsistencies đã thấy:**
   - `read_cache`/`outbox_dead` bị cắt (30 ngày/100 hàng, #927) nhưng **outbox đỗ lại vẫn chưa có cap** (MAP #933, chưa thấy sửa tại tip — STRONGLY SUSPECTED còn đúng).
   - `StoreProductConfig` (client) và `tierFor` (server, `_shared/apple.ts`) phải khớp tay qua env `PRODUCT_ID_PLUS`/`PRODUCT_ID_MAX`; không có kiểm khớp tự động (POTENTIAL RISK).
   - Bench USDZ trong bundle có thể vẫn cũ hơn kit (MAP ghi 5bb536e0 vs 45dc17a8 tại tip cũ) — W2 chưa re-hash tại tip mới (UNVERIFIED, xem §7).
   - `ASCNDCore` test golden DailyLog đã chuyển sang bất biến native-only (so sánh RN đã gỡ, #929) — nhất quán với chỉ thị 17/11.


## §3. Native iOS findings

### 3.1 Swift/SwiftUI structure — CONFIRMED

- 923 file Swift / 193.518 dòng trong `apps/ios`; app target `ASCND/` ~200+ file; 408 `struct … : View` (MAP đếm tại tip cũ; chưa đếm lại — số này có thể đã tăng theo 25 file Community mới).
- State patterns: `@Environment(AppServices.self)` + `@Environment(WorkoutFlow/ProfileBook/NutritionBooks)` (do `SignedInScope` inject) hoặc `*Book`/`*Controller` qua init param từ factory `AppServices.make*`. `*Book` types sống ở `ASCNDCore`.
- Swift 6.0, iOS 18.0+, portrait-only, single scene (`UIApplicationSupportsMultipleScenes: false`), `LOCALIZATION_PREFERS_STRING_CATALOGS: YES`.
- i18n: `Localizable.xcstrings` **3.521 key** (en/es/vi, source en); `String(localized:)` ~2.860 site tại tip cũ; shadow extension ở `ASCNDCore/Profile/LanguageOverride.swift` route qua `AppLanguage.shared.locale`; `Locale.app` format số/ngày theo ngôn ngữ trong app. Widget 68 key, Watch 21 key (chưa đếm lại).

### 3.2 App lifecycle — CONFIRMED (đọc code, chưa chạy)

- `ASCNDApp.swift`: `@main`, dựng `AppServices` + `RestTimerController` 1 lần, set language/theme/tint, `onOpenURL`, scene-phase handling, community background task, `ConnectionBanner` + `RootGate` trong `WindowGroup`.
- `ASCNDApp.start()` (qua `.task`): `session.start()` → `startTransactionObserving()` → `reconcilePurchases()` → prune ngày đỗ chủ khác quá 14 ngày → `sync.kick()` → `autoSyncHealth()` → `reminders.refreshPermission()` → `probeAI()` (`AppServices.swift:403–419`).
- `RootGate`: `.loading` → `.signedOut` → `AuthView` → `.signedIn` → `OnboardingGateView` → `SignedInScope` → `RootTabView` (`.id(userId)` rebuild theo tài khoản). DEBUG-only preview branches.
- `SignedInScope`: dựng `WorkoutFlow`, `ProfileBook`, `NutritionBooks`, `ReminderTodayBook` 1 lần/phiên; Watch bridge attach/detach; midnight/foreground refresh; session-end teardown.
- App Lock: Face/Touch ID, `AppLockWindow` riêng phủ trên mọi sheet (`AppLockController.swift`); relock ngay/1'/5'.
- Không có SwiftData/CoreData. Local = GRDB SQLite 1 file + Keychain (SDK) + UserDefaults + App Group.

### 3.3 Deep linking — CONFIRMED

- 1 scheme `ascnd`. `DeepLink.swift` (`ASCNDCore`, l.14–52): `Tab` (today, nutrition, workouts, community, assistant) + `Screen` (water, supplements, diary, logMeal, photoMeal, foods, nutritionInsights, mealPlans, mealPlan(id), logWeight, logMeasurement, logSleep, logBiometrics, history, logWorkout, reminders, templates, communityPost(id), communityUser(id), …). `SessionStore.open()` xử lý link auth trước (PKCE `code`/tokens, `?type=recovery`); còn lại → `DeepLinkInbox` (lấy 1 lần) → tab + sheet. `ascnd://admin/*` → nil (chỉ mở app, `DeepLink.swift:123` — "admin/*, koa-debug, route lạ: chỉ mở app"). **Lưu ý:** admin UI nay tồn tại trong app nhưng KHÔNG có deep link admin (xác nhận MAP vẫn đúng ở điểm này).

### 3.4 Permissions — CONFIRMED (code) / UNVERIFIED (runtime prompt)

- HealthKit: `requestAuthorization(toShare: shareTypes=[], read: readTypes)` (`HealthKitSource.swift:31,38`). Read: steps, activeEnergy, exerciseTime, RHR, HRV SDNN, SpO2, respiratoryRate, sleepAnalysis, workout, bodyMass, dietaryWater. **Share rỗng = không ghi ngược.**
- Khác: camera (ScanFood), microphone + speech (TellKoa), Face ID (app lock), motion (`CMPedometer` fallback khi HealthKit chưa nối), notifications (local). Usage descriptions trong `InfoPlist.xcstrings` (6 key).
- **Apple Sign-In bị tắt theo mặc định:** `ASCND_SIGN_IN_WITH_APPLE: "NO"` (`project.yml:144`); nút Apple chỉ hiện khi `AppleFeatureGates.signInWithApple(info:)` true (`AuthView.swift:79`). Google: `YES`. Đây là cấu hình build, không phải code thiếu.
- UNVERIFIED: thứ tự/timing xin quyền thực tế, hành vi khi user từ chối từng quyền, HealthKit background delivery thực tế.

### 3.5 StoreKit client (PR #920 merged 2026-11-20) — CONFIRMED (code) / UNVERIFIED (end-to-end)

- `StoreKitClient.swift` (107 dòng): actor duy nhất chạm App Store. `products(for:)` → `Product.products(for:)`; `purchase(productID:appAccountToken:)` với `appAccountToken = userId (UUID)`; chỉ `verified` mới giữ lại `pending[transactionID]`; `currentEntitlements()` có `AppStore.sync()` trước; `finish` CHỈ sau server xác minh; `observeTransactions` bỏ qua unverified KHÔNG finish; `reconcileUnfinished` (Devin #920) duyệt mọi unfinished transaction — gọi khi mở app/đổi phiên/có mạng/về foreground (`AppServices.reconcilePurchases()`, l.1801).
- `PurchaseCoordinator` (Core, 144 dòng): luồng bắt buộc StoreKit → `verify-purchase` → finish → đọc lại `current_tier()`. `isValidTransactionID` (≤64 ký tự), `appAccountToken` phải là UUID đúng userId. Product lạ (không trong config) bị loại khỏi danh sách bán.
- `PurchaseController` (app, 144 dòng): state `loading/unconfigured/ready/failed`, `buy`/`restore`, `EdgePurchaseVerifier` qua `EdgeCaller.call(.verifyPurchase, ["transactionId"])`; body không đọc được `tier` thì coi như xác minh hỏng.
- `PaywallView` (228 dòng): hiện tier hiện tại + products + restore + trạng thái `unconfigured` ("chưa mở bán"). Entry: `SettingsView.swift:194–199` (chỉ khi đã đăng nhập và `makePurchase()` non-nil). Mock design `apps/ios/docs/design/mocks/paywall.html`, "chờ Kiệt duyệt" (header `PaywallView.swift:6`).
- **CHƯA MỞ BÁN được (CONFIRMED):** (a) `ASCND_PRODUCT_ID_PLUS`/`MAX` trống trong `Backend.xcconfig` (commit) → `StoreProductConfig.isConfigured == false` → `loadProducts()` trả `.notConfigured`; (b) probe HTTP 2026-11-28 bằng publishable key: `verify-purchase` → **404**, `store-webhook` → **404**, `admin-art` → **404**, đối chứng `ai-coach` → **401** (đã deploy). Kết luận: client hoàn chỉnh, server chưa deploy 2/2 function mua hàng → **không giao dịch nào có thể hoàn tất**. Product ID thật chỉ tồn tại khi Kiệt tạo trong App Store Connect.
- Tier đọc qua `SupabaseTier.swift:14` (`rpc("current_tier")`, `entitlements` chỉ server ghi).
- Test: `PurchaseTests.swift` tồn tại (`Packages/ASCNDKit/Tests/ASCNDCoreTests/`). Chưa chạy (cần Linux toolchain/CI) — UNVERIFIED pass/fail tại tip.

### 3.6 Keychain / local storage / networking — CONFIRMED (code)

- Keychain: không code trực tiếp (0 hit `SecItem*`). Session qua supabase-swift, tự refresh. UI-test dùng kho trong bộ nhớ (`Backend.swift:49,67`).
- SQLite (GRDB): 1 file `ascnd.sqlite`, migrator v1-outbox, v2-workout-day, v3-read-cache, v4-workout-day-owner, v5-state-intents + v5-read-cache-updated-at (`Database.swift:48–76`). WAL + NORMAL (theo #927). `OutboxStore` + `GRDBWorkoutStore` + 10 cache + `AccountLifecycle` (purge theo userId chỉ khi xoá tài khoản; `clearAll()` đã gỡ, #919).
- UserDefaults: `AppPreferences` (theme, đơn vị, app lock, mascot, SmartNudges cache, reminder, key debug) + `DefaultsExerciseFavoriteStore` + `SmartNudgesDefaultsCache`. Ngôn ngữ theo iOS (per-app language).
- App Group `group.com.ascnd.fitnessos`: UserDefaults chung (payload widget: todayWorkout, streakReadiness, koa, meal, lang) + file PNG Koa render sẵn; app ghi qua `WidgetRefresher`, widget đọc; xoá khi sign-out (trừ lang).
- Networking: chỉ `ASCNDBackend` chạm Supabase (PostgREST + `functions.invoke` qua `EdgeCaller` + RPC). Ngoài Supabase: OpenFoodFacts GET client-side (`BarcodeLookup.swift`), probe kết nối HEAD `clients3.google.com/generate_204` + fallback probe Supabase. Không gọi LLM trực tiếp từ app.
- Background: BG task `com.ascnd.fitnessos.community-refresh` (poll `community_notifications` ≥30' → 1 local notification, `CommunityAlerts.swift:43`, `ASCNDApp.swift:171`); HealthKit background delivery mỗi giờ (`HKObserverQuery`); không có BG fetch dữ liệu tập.
- Error handling: `DSAsyncState` (loading/error/offline/submitting), `NetworkFailure`, `RetryPolicy` (outbox), `TelemetryScrubber` (Sentry `beforeSend` + `capture` qua allowlist, `Telemetry.swift:16–17,89–90`). Sync incident chỉ báo kind/reason/code, không payload/user.

### 3.7 Analytics / logging — CONFIRMED (code) / UNVERIFIED (dashboard)

- Sentry (crash/error) + PostHog (funnel onboarding → bữa đầu → buổi tập đầu). Chỉ chạy khi key trong `Backend.local.xcconfig` (không commit); key rỗng = tắt. CI ghi 3 secret repo vào `Backend.local.xcconfig` trên runner (#917). `TelemetryConfiguredTests` khoá hành vi. UI-test không gửi gì.
- UNVERIFIED: key thật có trong CI secrets không, dashboard Sentry/PostHog có nhận event không.

### 3.8 Accessibility — CONFIRMED (code) / UNVERIFIED (device)

- 454 hit `accessibilityLabel`/`accessibilityIdentifier` trong `ASCND/` (grep). `DSMotion` tôn trọng Reduce Motion; Dynamic Type (Koa bar co giãn, PR #922); VoiceOver: có thao tác đẩy đèn trần trong Koa room (#1004), `accessibilityAddTraits(.isHeader)` ở tiêu đề Community.
- Test: `ASCNDUITests/KoaAccessibilityAuditTests.swift` (`performAccessibilityAudit()`, scheme `ASCNDA11y`, workflow `ios-a11y.yml`) + `KoaA11yBaseline.swift`. Koa snapshot tests light/dark/largeType.
- UNVERIFIED: audit thật trên simulator/device, VoiceOver flow đầy đủ.

### 3.9 Build configs / signing / entitlements — CONFIRMED (file) / UNVERIFIED (build)

- XcodeGen `project.yml`; team `Z54JL44R9Z`, automatic signing; bundle `com.ascnd.fitnessos` (Release) / `.dev` (Debug); widgets/watch `.dev.widgets`/`.widgets`, `.dev.watchkitapp`/`.watchkitapp`. Marketing version 0.1.0.
- Entitlements: App Group + HealthKit + background delivery (app only). Widgets: App Group. Privacy manifest `PrivacyInfo.xcprivacy` (app + widgets) — nội dung chưa đọc sâu (UNVERIFIED chi tiết).
- Release post-build: `tools/set-build-number.sh`, `tools/sentry-upload-dsyms.sh` (Release only).
- **KHÔNG THỂ XÁC MINH trên VM:** build có xanh không, signing có hợp lệ không, Archive/StoreKit sandbox (#917 A3, #918 Xcode 27) — cần Mac/Xcode 27 + tài khoản developer.


## §6. Deltas vs bản đồ cũ (tip `5e92ee2b` → `5e673df3`, 427 file đổi, +33.336/−2.732 dòng)

### 6.1 Đã đổi (xác minh tại tip mới)

| # | Nội dung | Trạng thái |
|---|---|---|
| D1 | StoreKit client + paywall + Purchase (Core) | MỚI — MAP "ABSENT" đã sai thời. Client xong, server/config chưa xong (§3.5) |
| D2 | Moderation/admin UI trong app iOS (10 file + backend + 3 factory) | MỚI — MAP "iOS không có admin" đã sai thời |
| D3 | Workflow `motion-kit.yml` | MỚI — MAP gap "không CI cho Motion Kit" đã đóng một phần |
| D4 | App đọc `tempo.json` + `ExerciseDemoTempo` + DEMIC step 1 (thân trắng sứ, cơ phát sáng, phòng tối) | MỚI — MAP gap "app không đọc tempo.json" đã đóng; viewer vẫn DEBUG-only |
| D5 | Koa T57/T04/T20 xong (#1011, #1001–#1008 merged): Gains không kẹt 0, dòng tuần nhẹ, thẻ đầu tuần | MỚI — các gate audit Koa đã đóng một phần |
| D6 | Migrations 94 → 101; RPC 95 → 105 tên; i18n 3.341 → 3.521 key; Swift 832 → 923 file | TĂNG |
| D7 | `AppServices` 1.819 → 2.084 dòng, factory ~60 → 68 | TĂNG (choke point nặng hơn) |
| D8 | Community 15 → 25 file; Mascot 29 → 32; Exercises 11 → 15; Settings 3 → 4 file | TĂNG |
| D9 | Koa room: thời tiết/mùa, cửa sổ/đèn, bảng TUẦN NÀY (#1004–#1008) | MỚI |

### 6.2 Không đổi (xác minh lại)

- Không APNs, không Realtime, HealthKit chỉ đọc, Keychain chỉ qua SDK, không SwiftData/CoreData, Live Activity không dùng cầu Darwin, RN bị bỏ, parity RN↔native bị bỏ, default branch `main`, web app DEAD, admin deep link → nil, 3D viewer DEBUG-only + chưa approved, 8 bài 3D DRAFT.
- Edge deploy: `verify-purchase`/`store-webhook`/`admin-art` vẫn 404 (probe lại 2026-11-28); `ai-coach` vẫn 401.

### 6.3 Chênh số liệu cần W-backend / W-data đối chiếu (W2 không kết luận)

- Bảng: grep `CREATE TABLE public.*` tại tip cho **65 tên distinct**, MAP ghi 68. Chênh 3 có thể do cú pháp tạo bảng khác pattern grep (vd. `IF NOT EXISTS` đã bao, nhưng có thể có bảng tạo qua `CREATE TABLE` không kèm schema trong cùng file, hoặc partition). **Không kết luận đã xoá bảng.** Cần đếm lại bằng parser migration.
- RPC: 105 tên distinct vs MAP 95 — tăng là hợp lý (moderation/Koa mới), nhưng chưa phân loại hàm nào Swift gọi (MAP ghi 21; W2 chưa đếm lại).
- `struct … : View` 408 là số tại tip cũ; chưa đếm lại tại tip mới.

## §7. UNVERIFIED list — mọi thứ cần Xcode / simulator / thiết bị / dashboard

1. **Build & chạy:** app có build xanh bằng Xcode 27 không; `core-linux` CI có xanh tại tip không; Swift 6 concurrency có warning/error mới không.
2. **Runtime toàn bộ feature matrix:** mọi trạng thái IMPLEMENTED ở §5 đều là "code tồn tại + wiring tồn tại", chưa có bằng chứng chạy trên simulator/device. Đặc biệt: onboarding end-to-end, đăng nhập Apple/Google/email thật, live workout session + rest timer + Live Activity, HealthKit sync thật, Koa room/shop mua đồ thật, community post/DM thật, AI Coach chat thật.
3. **Mua hàng end-to-end:** cần (a) Kiệt tạo product Plus/Max trong App Store Connect, (b) điền ID vào xcconfig, (c) deploy `verify-purchase` + `store-webhook`, (d) test StoreKit sandbox. Hiện cả 3 đều thiếu.
4. **Deploy trạng thái 9 edge function còn lại:** chỉ probe lại 4 function ngày 28/11 (`ai-coach` 401; 3 function mua/admin 404). 8 function còn lại chưa probe lại tại tip.
5. **Version code đã deploy của edge function có khớp repo không; secrets/env edge đã đủ chưa** (kế thừa từ MAP, chưa xác minh).
6. **HealthKit thật:** xin quyền, background delivery mỗi giờ, `HealthHistoryWindow` iOS 27 (nhánh API thật chưa từng biên dịch — chờ Xcode 27), manual thắng HealthKit, pedometer fallback.
7. **Watch thật:** snapshot JSON qua `updateApplicationContext`, lệnh log set/nghỉ, dedupe id.
8. **Widget/Live Activity thật:** payload App Group, refresh khi sign-out, intent AddWater/LogUsualMeal chạy trong tiến trình app, Dynamic Island ±15s/pause.
9. **APNs:** đã xác minh không có code; nhưng cần xác minh dashboard/ASC không có cấu hình push nào khác (ngoài code).
10. **Thông báo community thật:** BGAppRefresh có chạy nền ≥30' không, local notification có bắn không.
11. **Telemetry thật:** Sentry/PostHog key có trong CI secrets không; dashboard có nhận event không.
12. **Bench USDZ bundle vs kit:** chưa re-hash SHA-256 tại tip (MAP ghi bundle cũ hơn kit tại tip cũ).
13. **Migrations đã chạy đủ trên Supabase production chưa** (chỉ đếm file trong repo; 101 file).
14. **Admin RN còn dùng không:** `native/src/app/admin/*` + `use-admin.ts` có còn entry nào không (sau khi admin đã vào native iOS).
15. **Gating theo tier:** có feature nào trong app bị khoá theo Plus/Max không (W2 không tìm thấy — cần rà soát).
16. **Privacy manifest (`PrivacyInfo.xcprivacy`) nội dung chi tiết; `PreviewGallery` nội dung; `DailyPlanSource`/`TodayMealPlan` chi tiết** — chưa đọc sâu.
17. **Test pass/fail tại tip:** 306 file test Packages + 19 file `ASCNDTests` + Maestro 13 flow — chưa chạy trên VM này (cần toolchain/CI).
