# ASCND native — React Native iOS rebuild

Bản rebuild React Native (Expo) của app fitness ASCND, chạy trên iOS. Dev
web đã dừng — đây là nơi mọi phát triển đang diễn ra, trên nhánh
`claude/ios-fitness-rebuild-omgulr`.

## Chạy app

```bash
npm install
npx expo start
```

Bản native cần **development build** (không chạy đầy đủ trên Expo Go):
`npx expo run:ios --device` sau `npx expo prebuild --platform ios --clean`.
Xem checklist đầy đủ trong `docs/ios-rebuild-checklist.md` (Swift không
compile được trên Linux — Kiệt rebuild trên máy thật của mình).

## Cổng chất lượng (phải xanh trước khi push)

Chạy từ thư mục này (`native/`), không chạy từ gốc repo:

```bash
npx tsc --noEmit -p tsconfig.json
node tools/check.mjs   # 311 bước
```

## Cấu trúc

- `src/` — app (screens, components, hooks, lib). Convention: file
  kebab-case, i18n key namespaced theo người (`nPg…`/`nRc…`/`nCx…`)
- `src/native/ios/` — TS facade cho module native (`rest-live-activity.ts`…)
- `modules/ascnd-native/ios/` — Swift: Expo module `AscndNative` (ActivityKit
  rest timer display-only) + WidgetKit extension `ASCNDWidgets` (spike)
- `tools/` — các gate chất lượng, chạy qua `tools/check.mjs`
- `docs/` — tài liệu; bắt đầu ở `docs/AUDIT_STATE.md`
- `supabase/` — backend (migrations + tests)

## Team A · B · C

Phối hợp qua GitHub issue #6. Quy tắc: một issue một người, không sửa file
của người khác, không nới guard để xanh, commit tham chiếu issue.
