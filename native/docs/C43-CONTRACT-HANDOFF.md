# C-43: History/Builder — Presentation Contract Handoff

**Issue:** #484 · **Agent:** C · **Reviewer:** D · **Ngày:** 05/10/2026

## 1. Nguồn đã verify (đọc code thật, không đoán)

| Bên | Branch | Commit | Giờ verify |
|---|---|---|---|
| A21 History (#433) | `agent/a/history` | `d05267d` | 05/10 06:18 CDT |
| A22 Template write (#435) | `agent/a/a22-template-write` | `9acd8cd` | 05/10 06:54 CDT |
| C-28 History UI (#375) | `agent/c/history-ui` | `2ebb682` | 05/10 06:06 CDT |
| C-37 Builder UI (#410) | `agent/c/workout-builder-ui` | `9e6aa43` | 05/10 17:08 CDT |

## 2. Kết luận tổng

- **C views sạch:** `WorkoutHistoryView` (C-28) chỉ import `ASCNDDesignSystem` + `SwiftUI`;
  5 file Builder (C-37) chỉ import `SwiftUI` (+ `UIKit` cho UIAccessibility).
  **Không chỗ nào import/chọc vào** `HistoryBook`, `PlanEditor`, `WorkoutStore`,
  `Supabase*`, `GRDB*`, `OutboxEntry`. Views chỉ dùng typed models + callbacks. ✅
- **Không implement data access** trong task này — đúng scope. Mọi adapter bên dưới
  thuộc về wiring layer (không phải view, không phải domain mới).

## 3. Contract History: C-28 ↔ A21

### 3.1 Field mapping

| C-28 `HistorySession` | A21 `HistoryEntry` | Adapter |
|---|---|---|
| `id: String` | `id: String` | trực tiếp |
| `date: Date` | `at: EpochMillis` | `e.at.date` (có sẵn) |
| `templateName: String` | `templateName: String` | trực tiếp |
| `volumeKg: Int` | `volumeKg: Int` | trực tiếp |
| `completedSets: Int` | `completedSets: Int` | trực tiếp |
| `exerciseCount: Int` | `exerciseCount: Int` | trực tiếp |
| `hasPR: Bool` | `prDetected: Bool` | đổi tên |
| — | `sessionRpe: Int` | C-28 không hiển thị RPE → chưa cần; giữ field cho detail sau này |

### 3.2 State mapping (`HistoryBook` → `HistoryState`)

`HistoryBook` (`@MainActor @Observable`): `entries`, `loaded`, `failure: RefreshFailure?`
(`.offline` / `.unavailable` — đã check `TodayController.swift:77`).

```swift
func historyState(of book: HistoryBook) -> HistoryState {
  if !book.loaded { return .loading }
  if let f = book.failure {
    let sessions = book.entries.map(HistorySession.init(entry:))
    switch f {
    case .offline:      return sessions.isEmpty ? .error(unavailableText) : .offline(sessions)
    case .unavailable:  return .error(unavailableText)
    }
  }
  if book.entries.isEmpty { return .empty }
  return .loaded(book.entries.map(HistorySession.init(entry:)))
}
// onRetry  → { await book.refresh() }
// onSelect → điều hướng detail (dùng chính HistoryEntry — đủ fields)
```

### 3.3 GAP — C-28 thiếu seam delete

View hiện tại **không có UI/callback xoá**. A21 có `HistoryBook.delete(_:) throws(DeleteRefusal)`
(`.notFound` / `.storage`), và yêu cầu "màn hỏi lại TRƯỚC".

**Follow-up cụ thể** (làm trên `agent/c/history-ui`, không phải branch này):
thêm `var onDelete: (HistorySession) -> Void` + swipe-to-delete (destructive) vào
`WorkoutHistoryView`; wiring: confirm dialog → `try await book.delete(id)`,
`.notFound` → bỏ qua (đã xoá), `.storage` → `.error`.

## 4. Contract Builder: C-37 ↔ A22

### 4.1 Field mapping

| C-37 | A22 | Adapter |
|---|---|---|
| `MockTemplate.id/name` | `WorkoutTemplate.id/name` | trực tiếp |
| `MockTemplateExercise.name` | `TemplateExercise.exerciseName` | đổi tên |
| `sets/reps: Int` | `sets/reps: Int` | trực tiếp |
| `weightKg: Double?` | `weightKg: Double` | `nil → 0` |
| — | `exerciseId: String?` | C form không edit → `nil` khi tạo mới |
| `TemplateExerciseProtocol.id` (Identifiable) | — (A không có id ổn định cho row) | ⚠️ **MISMATCH** — adapter: `exerciseId ?? UUID()` mới; cần A xác nhận identity của row khi edit/delete (note 4.3.4) |
| — | `rpe: Int`, `restSeconds: Int` | C form không edit → `WorkoutPlanning.defaultRpe` (7) / `defaultRest` (90) khi tạo mới; khi edit phải carry-through từ bản hiện tại (xem 4.3) |
| — | `WorkoutTemplate.type` | C không có → `PlanEdit.defaultType` (`"custom"`) |
| — | `WorkoutTemplate.createdAt` | do server/A quản, view không cần |
| `assignedWeekdays: Set<Int>` (**1=CN…7=T7**, kiểu `Calendar`) | `RoutineDay.dayOfWeek` (**0=Thứ Hai…6=Chủ Nhật**, kiểu `routineIndex`) | ⚠️ **MISMATCH thật** — adapter: `aDay = (cDay + 5) % 7` (kiểm: T2→0, CN→6, T7→5) |

### 4.2 Callback mapping

| C-37 callback | A22 API | Adapter |
|---|---|---|
| `onSaveTemplate` (create) | `PlanEditor.create(id:name:type:exercises:scheduleOn:)` | `id = editor.newTemplateId()` — **gọi 1 lần khi mở form**, giữ tới lúc lưu (chống double-tap tạo 2 template, TW-5a). `scheduleOn`: A chỉ nhận 1 ngày, C cho chọn nhiều ngày → **adapter: `create(..., scheduleOn: nil)` rồi `assign(day:)` từng ngày** (rõ ràng hơn là nhồi ngày đầu vào create) |
| `onDeleteTemplate(id)` | `PlanEditor.delete(templateId:)` | trực tiếp; `Refusal` → error state (`.unknownTemplate` → refresh list) |
| `WeekdayAssignmentView` chọn/bỏ ngày | `PlanEditor.assign(day:templateId:)` | chọn → `assign(day: aDay, templateId: id)`; bỏ chọn → `assign(day: aDay, templateId: nil)` (ngày nghỉ) |
| — (C-37 không có deload UI) | `PlanEditor.setDeload` | ngoài scope, không cần |

### 4.3 CẦN A XÁC NHẬN — không tự bịa

1. **Edit template: A22 không có update API.** `PlanEditor` chỉ có create/delete/assign/setDeload.
   Phương án `delete(id)` + `create(id: <cùng id>, ...)` KHÔNG an toàn:
   `TemplateSnapshot.applying()` với `templateKind` trùng id thì "giữ bản của server"
   → edit có thể mất trên snapshot local. **Chờ A quyết:** thêm `update` vào
   `PlanEditor`, hay định nghĩa lại semantics của create-trùng-id.
2. **Carry-through rpe/restSeconds/exerciseId khi edit:** `TemplateSnapshot.templates`
   có đầy đủ `exercises` — wiring có thể đọc bản hiện tại và giữ nguyên các trường
   C form không edit. Xác nhận với A đây là cách đúng (không phải đọc từ server).
3. **Thứ tự multi-day assign:** `create(scheduleOn: nil)` + N `assign()` — mỗi lệnh là
   một hàng outbox riêng; có đảm bảo thứ tự áp dụng không (làn tuần tự D-26 TW-5b
   nói "tạo luôn tới server trước gán")? Xác nhận với A/D.
4. **Row identity khi edit exercise:** C rows là `Identifiable` (`id`), A
   `TemplateExercise` không có id ổn định (chỉ `exerciseId?` optional). Khi edit
   một bài trong template đã lưu, wiring map row nào với phần tử nào của
   `exercises`? Đề xuất tạm: `exerciseId ?? UUID()` sinh ở wiring, nhưng cần A
   xác nhận không phá vỡ `applying()`/idempotency.

## 5. Wiring checklist (cho người nối)

- [ ] History: `HistorySession(entry:)` init + `historyState(of:)` (3.2)
- [ ] History: thêm `onDelete` vào C-28 (3.3) rồi nối `book.delete`
- [ ] Builder: adapter struct `WorkoutTemplateProtocol` ← `WorkoutTemplate` + `TemplateSnapshot.routine`
- [ ] Builder: `aDayOfWeek(_:)` (4.1) — có unit test trong fixture
- [ ] Builder: `newTemplateId()` 1 lần/form create (4.2)
- [ ] Builder: create(nil) + assign từng ngày (4.2)
- [ ] Chờ A trả lời 3 mục 4.3 trước khi nối edit flow

---
*Không claim iPhone-tested. Swift không compile trên Linux — mọi mapping đọc từ
code thật trên branch đã nêu.*
