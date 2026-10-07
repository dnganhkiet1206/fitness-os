# SyncStatusBanner Integration Guide

## Vấn đề
#385 yêu cầu SyncStatusBanner được dùng bởi ít nhất 2 màn.
Hiện tại component chỉ tồn tại độc lập, chưa được adopt.

## Lý do chưa adopt trực tiếp
Các màn Today/Workout/Summary nằm trên branches khác nhau
(agent/c/today-binding, agent/c/workout-set-states, etc.)
chưa được merge vào base chung. Không thể thêm import trực tiếp.

## Cách tích hợp (khi các branches merge)

### 1. TodayScreen
```swift
// Trong TodayScreen.body, thêm ở đầu VStack:
if syncState != .synced {
  SyncStatusBanner(state: syncState) {
    await onSyncRetry()
  }
}
```

### 2. WorkoutView
```swift
// Trong WorkoutView.body, thêm phía trên content:
if syncState != .synced {
  SyncStatusBanner(state: syncState) {
    await onSyncRetry()
  }
}
```

### 3. SummaryView
```swift
// Tương tự, thêm vào đầu màn hình
```

## SyncState mapping
- `.synced` → ẩn banner
- `.offline` → hiện "Đang offline"
- `.queued(n)` → hiện "Đang chờ đồng bộ (n)"
- `.failed(msg)` → hiện lỗi + nút thử lại
- `.retrying` → hiện "Đang thử lại..."

## TODO
Khi các PR #345 (Today), #389 (Workout), #342 (Summary) merge,
tạo PR follow-up để thêm SyncStatusBanner vào 2+ màn.
