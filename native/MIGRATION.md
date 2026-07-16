# ASCND Native (Expo) — Partial Migration

Chiến lược: migrate **một phần** — phần lõi trải nghiệm chuyển sang React
Native/Expo để đạt cảm giác native thật (UITabBarController, Liquid Glass,
Reanimated 120Hz, SF Symbols); các màn phụ port dần sau. App Capacitor ở gốc
repo vẫn chạy bình thường trong lúc migrate.

## Đã có (scaffold này)

- Expo SDK 57 + expo-router, TypeScript, Reanimated 4, dark-first.
- `app.json`: ASCND, bundle id `com.ascnd.fitnessos` (trùng app Capacitor).
- **Tab bar native thật** (`expo-router/unstable-native-tabs`): 4 tab
  Today / Nutrition / Workouts / Progress, icon SF Symbols.
- **Liquid Glass thật** qua `expo-glass-effect` (`GlassCard` có fallback cho
  máy chưa hỗ trợ).
- Design tokens port từ `src/index.css` → `src/constants/ascnd.ts`.
- Logic dùng chung đã port nguyên vẹn vào `src/lib/`:
  `types.ts`, `fitness-calc.ts`, `readiness-engine.ts`, `i18n.ts`
  và `src/integrations/supabase/` (client dùng AsyncStorage).
- React Query provider ở root layout.

## Đã port thêm (đợt 2)

- ✅ Auth: `use-auth.tsx` (email/password + **Apple Sign-In** qua
  `expo-apple-authentication` với nonce SHA-256 + Supabase
  `signInWithIdToken`), màn `AuthScreen` native, gate ở root layout
  (splash giữ đến khi biết trạng thái đăng nhập).
- ✅ Data hooks: `useTodayData.ts` port nguyên vẹn (profile, daily log,
  sleep, workouts, biometrics, readiness trend, nudges).
- ✅ Today dashboard nối dữ liệu thật: greeting theo tên, readiness score
  + màu trạng thái, kcal/target, steps, sleep.

## Đã port thêm (đợt 3–4)

- ✅ Router tái cấu trúc: Stack gốc + nhóm `(tabs)`; **formSheet native**
  (detents, grabber hệ thống) cho `/log-meal` và `/log-workout`.
- ✅ Readiness ring động (SVG + Reanimated trên UI thread).
- ✅ Nutrition sống: kcal/target, macro, danh sách bữa, Log Meal ghi
  `meal_entries` + `recomputeDailyLog` (chung logic với web).
- ✅ Workouts sống: thống kê tuần, lịch sử buổi tập, Log Workout (RPE
  chips + volume) nuôi ngược vào readiness.
- ✅ Progress sống: chart cân nặng 30 ngày (SVG LineChart tự viết) +
  dải cột readiness 14 ngày theo màu trạng thái.

## Đã port thêm (đợt 5–8)

- ✅ **HealthKit**: steps/HR/HRV/SpO2/resp qua @kingstinct v14 (Nitro),
  ghi biometric_samples + daily_logs.steps như web; cần dev build.
- ✅ **Settings + Sign Out** (gear trên Today), profile summary.
- ✅ **Log Workout set-by-set**: volume tự tính, sets JSON tương thích web.
- ✅ **Food search** trong Log Meal (ilike food_items, tự điền macro).
- ✅ **Onboarding 4 bước** (BMR→TDEE→macro→sleep, gate ở root).
- ✅ **AI Coach**: chat streaming SSE qua expo/fetch, dùng chung edge
  function + bảng ai_conversations/ai_messages với web.

## Thứ tự port tiếp theo

1. Barcode scan trong Log Meal (expo-camera).
2. Song ngữ vi/en (i18n đã port, cần setting + nối UI).
3. Lịch sử hội thoại AI Coach.
4. Màn đuôi dài (Water, Sleep insights, Awards, Challenges, Legal…).
5. TestFlight: icon, splash, EAS build.

## Chạy

```bash
cd native
npm install
npx expo start          # dev (cần máy Mac + simulator hoặc Expo Go)
npx expo export --platform ios   # kiểm tra bundle không cần Xcode
```

Lưu ý: `EXPO_PUBLIC_SUPABASE_KEY` đặt trong `.env` của `native/` (không
commit); giá trị lấy từ `VITE_SUPABASE_PUBLISHABLE_KEY` ở gốc repo.
