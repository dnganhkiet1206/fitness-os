# Island Strings Sync — BẮT BUỘC ĐỌC khi sửa chuỗi DI

## Vấn đề
Hàm `islandStrings(for:)` trong `native/modules/ascnd-native/ios/AscndNativeModule.swift`
**hardcode** chuỗi tiếng Việt/tiếng Anh:

```swift
case "vi":
  return ("Nghỉ", "Set {n}/{t}", "Tiếp theo")
default:
  return ("Rest", "Set {n}/{t}", "Up next")
```

Swift extension (Live Activity / widget) **không đọc được** i18n của React Native.
Vì vậy bridge chỉ truyền `languageCode` ('vi' | 'en'), Swift tự tra bảng.

## Quy tắc sync thủ công
Khi thêm/sửa/xóa key i18n liên quan đến Dynamic Island trong
`native/src/lib/native-strings.ts`, **phải** sửa tương ứng trong `islandStrings()`:

| `native/src/lib/native-strings.ts` key | Swift islandStrings |
|---|---|
| (chuỗi "Nghỉ"/"Rest") | `resting` |
| (chuỗi "Set {n}/{t}") | `setTemplate` |
| (chuỗi "Tiếp theo"/"Up next") | `next` |

## Tại sao không tự động?
- Widget extension chạy out-of-process, không share JS runtime.
- Không thể đọc file TS từ Swift.
- Giải pháp duy nhất: hardcode + sync thủ công (đây là pattern chuẩn của Apple cho Live Activity localization).

## Checklist khi đổi chuỗi DI
- [ ] Sửa `native/src/lib/native-strings.ts`
- [ ] Sửa `islandStrings()` trong `AscndNativeModule.swift`
- [ ] `npx tsc --noEmit` (TS)
- [ ] Kiệt rebuild `--clean` (Swift không compile được trên Linux)
