# ASCND — Đưa bản native lên TestFlight

Điều kiện: tài khoản **Apple Developer Program** ($99/năm) và tài khoản
**Expo** (miễn phí, expo.dev). Mọi lệnh chạy trong thư mục `native/`.

## Một lần duy nhất

```bash
npm install -g eas-cli
eas login                 # đăng nhập tài khoản Expo
eas init                  # tạo projectId, tự ghi vào app.json — commit lại
```

## Build & đưa lên TestFlight

```bash
# 1. Build production trên máy chủ của Expo (không cần Xcode)
eas build --platform ios --profile production
#    → lần đầu EAS hỏi đăng nhập Apple ID và tự tạo certificate/profile.

# 2. Nộp bản build lên App Store Connect
eas submit --platform ios --latest
#    → sau 5–15 phút bản build xuất hiện trong TestFlight.
```

Trong App Store Connect → TestFlight: thêm Internal Testers (email Apple
ID của người test) — họ nhận lời mời cài qua app TestFlight.

## Build thử các loại khác

```bash
eas build -p ios --profile simulator   # file .app cho iOS Simulator
eas build -p ios --profile development # dev client cài lên máy thật
```

## Checklist trước khi submit lần đầu

- [ ] `eas init` đã chạy và projectId đã commit.
- [ ] Icon: `assets/images/icon.png` (đang dùng icon ASCND 1024×1024).
- [ ] Splash nền `#08080a` — khớp app dark-first.
- [ ] `ios.buildNumber` tăng mỗi lần submit (profile production đã bật
      `autoIncrement` nên EAS tự lo).
- [ ] Backend Supabase đang chạy (không bị pause).
- [ ] App Store Connect: điền App Privacy (app đọc HealthKit — khai báo
      Health & Fitness data, không tracking).

## Ghi chú

- HealthKit entitlement + mô tả quyền đã được config plugin tự chèn khi
  EAS prebuild — không cần đụng Xcode.
- Apple Sign-In hoạt động trong bản TestFlight (không chạy trong Expo Go).
- Đổi version hiển thị: sửa `version` trong `app.json`.
