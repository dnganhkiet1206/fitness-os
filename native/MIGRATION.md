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

## Thứ tự port tiếp theo

1. Readiness ring đẹp bằng Reanimated/Skia (hiện là vòng tròn tĩnh).
2. Logging sheets (formsheet native của expo-router / `presentation:
   'formSheet'`).
3. Nutrition / Workouts / Progress (charts: victory-native XL / Skia).
4. HealthKit qua `@kingstinct/react-native-healthkit` hoặc module Expo.
5. Onboarding flow + màn đuôi dài (Legal, Awards, …) — hoặc tạm nhúng WebView.

## Chạy

```bash
cd native
npm install
npx expo start          # dev (cần máy Mac + simulator hoặc Expo Go)
npx expo export --platform ios   # kiểm tra bundle không cần Xcode
```

Lưu ý: `EXPO_PUBLIC_SUPABASE_KEY` đặt trong `.env` của `native/` (không
commit); giá trị lấy từ `VITE_SUPABASE_PUBLISHABLE_KEY` ở gốc repo.
