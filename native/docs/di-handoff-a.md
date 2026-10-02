# Dynamic Island Handoff — Dự phòng giao cho A

**Ngày:** 02/10/2026 (đêm) | **Người soạn:** C | **Trạng thái:** Dự phòng — chỉ dùng nếu Kiệt quyết định giao DI cho A

## Tình trạng hiện tại
- Kiệt test: Island không hiện sau nhiều vòng fix. Đang tạm dừng, Kiệt test lại vào sáng 02/10.
- Bridge đã gọn: 7 params (activityState, exerciseName, setNumber, totalSets, totalSeconds, endTimestamp, languageCode).
- Swift tự tra chuỗi song ngữ qua `islandStrings()` — xem `native/docs/island-strings-sync.md`.

## Các commit liên quan (mới nhất trước)
| Commit | Nội dung |
|---|---|
| ef074c8 | Xóa startDate/startTimestamp chết, bridge còn 7 params |
| 625bf68 | Widget updateWidgetData bridge ([WIP]) |
| a633d22 | #193 testIDs (không liên quan DI) |
| 76819f2 | Bridge gọn: 1 param languageCode thay 3 chuỗi |
| 52edc55 | start() không throw khi end activity cũ lỗi |

## Cách test (Kiệt làm)
```bash
git pull --rebase
EXPO_FREE_TEST=1 npx expo prebuild --platform ios --clean
SENTRY_DISABLE_AUTO_UPLOAD=true npx expo run:ios  # --device nếu dùng iPhone thật
```
Tick 1 set → xem Island có hiện không. Gửi ảnh.

## Giả thuyết nguyên nhân (chưa xác nhận)
1. Bridge signature skew (đã giảm thiểu bằng cách gọn bridge)
2. Stale build (Kiệt đã 2 lần test build cũ — luôn check `git log --oneline -3`)
3. Lỗi Swift compile (cần Xcode để xác nhận — Linux không compile được)

## Files chính
- `native/modules/ascnd-native/ios/AscndNativeModule.swift` — bridge + RestActivityStore
- `native/modules/ascnd-native/ios/Shared/RestTimerAttributes.swift` — ContentState
- `native/modules/ascnd-native/ios/Widgets/RestTimerLiveActivity.swift` — UI
- `native/src/native/ios/ASCNDLiveActivity.ts` — TS facade
- `native/src/native/ios/rest-live-activity.ts` — manager (test 8/8)
- `native/docs/di-audit-20261002.md` — audit findings

## Lưu ý cho A
- ĐỪNG sửa UI khi chưa xác nhận Island hiện được (ưu tiên: hiện → timer chạy → polish).
- Mỗi lần đổi Swift: Kiệt phải rebuild --clean.
- Bridge constraint của Kiệt: gọn, không thêm param bừa.
