# E2E UI test (Maestro) — app iOS native

Chạy trên bản **Debug** ở chế độ UI test: launch argument `-uiTestFakeBackend` làm app
dùng máy chủ Supabase giả trong app (`ASCND/App/UITest/`), phiên đăng nhập giả và dữ
liệu mẫu dựng lại mỗi lần mở. Không tài khoản, không mạng, không chạm Supabase. Giới
hạn: `docs/CONSTRAINTS_AND_DEFERRED.md` §4, mục "E2E Maestro".

| Flow | Kiểm |
|---|---|
| `01-launch-today` | mở app → Hôm nay, đã đăng nhập, buổi hôm nay |
| `02-water` | chip "+ 8 oz" → thẻ Nước và Insight đổi số |
| `03-meal` | ghi bữa 3 chạm (thẻ Bữa → "Ăn lại" → Lưu) → chọn bữa + OK |
| `04-sleep` | chip ghi nhanh giấc ngủ → thẻ Giấc ngủ đã ghi |
| `05-workout` | bắt đầu buổi → xong từng set → chốt → tổng kết → về Hôm nay |
| `06-progress` | sáu mảng chữ A ở Tiến bộ mở chi tiết, quay lại |
| `07-ask-koa` | thẻ "Hỏi Koa" mở Coach, quay lại về Hôm nay |
| `08-settings` | Nhắc nhở / Đổi mật khẩu / Pháp lý trong Cài đặt mở và quay lại |
| `09-koa-room` | chạm sàn sau bục thì Koa xuống sàn, chạm bục thì Koa về bục (`koa.stage.floor` / `koa.stage.stage`) |

Phần tử tìm theo `accessibilityIdentifier` (không đổi gì nhìn thấy): `koa.stage.*`, `today.*`,
`logMeal.*`, `workout.*`, `summary.*`, `progress.segment.<nhóm>`, `profile.settings`,
`settings.*`.

## Chạy trên máy

```sh
cd apps/ios
xcodegen generate
xcodebuild build -project ASCND.xcodeproj -scheme ASCND -configuration Debug \
  -destination 'id=<UDID simulator>' -derivedDataPath build/dd CODE_SIGNING_ALLOWED=NO
xcrun simctl install <UDID> build/dd/Build/Products/Debug-iphonesimulator/ASCND.app
maestro --device <UDID> test .maestro
```

Cài Maestro: `brew install mobile-dev-inc/tap/maestro` hoặc bộ cài chính thức
(`https://get.maestro.mobile.dev`). Thử tay chế độ test không cần Maestro:

```sh
xcrun simctl launch <UDID> com.ascnd.fitnessos.dev -uiTestFakeBackend -AppleLanguages "(en)"
```

## Trên GitHub

`.github/workflows/ios-e2e.yml` — hằng đêm trên `native/ios-rewrite`, bấm tay, và PR có
nhãn `e2e`. Artifact: ảnh từng bước, video, báo cáo JUnit, log debug của Maestro.
