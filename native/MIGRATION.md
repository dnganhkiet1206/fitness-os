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

## Thứ tự port tiếp theo

1. Auth (Apple Sign-In qua `expo-apple-authentication` + Supabase
   `signInWithIdToken`; key đọc từ `EXPO_PUBLIC_SUPABASE_KEY`).
2. Hooks dữ liệu (`useTodayData`, `useDashboardData`, …) — logic React Query
   giữ nguyên, chỉ bỏ phần DOM.
3. Dashboard Today thật (readiness ring bằng Reanimated/Skia).
4. Logging sheets (formsheet native của expo-router / `presentation:
   'formSheet'`).
5. Nutrition / Workouts / Progress (charts: victory-native XL / Skia).
6. HealthKit qua `@kingstinct/react-native-healthkit` hoặc module Expo.
7. Màn đuôi dài (Legal, Awards, …) — port sau cùng, hoặc tạm nhúng WebView.

## Chạy

```bash
cd native
npm install
npx expo start          # dev (cần máy Mac + simulator hoặc Expo Go)
npx expo export --platform ios   # kiểm tra bundle không cần Xcode
```

Lưu ý: `EXPO_PUBLIC_SUPABASE_KEY` đặt trong `.env` của `native/` (không
commit); giá trị lấy từ `VITE_SUPABASE_PUBLISHABLE_KEY` ở gốc repo.
