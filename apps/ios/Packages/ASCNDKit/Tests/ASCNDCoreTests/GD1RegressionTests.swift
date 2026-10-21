@testable import ASCNDCore
import ASCNDTestSupport
import Foundation
import Testing

/// Hồi quy GĐ1 (#527, chỉ thị 21/10 14:26): mất mạng / lỗi / gửi lại không sinh
/// bản ghi trùng hay lời nhắc trùng; dời / nghỉ chỉ thử ở máy.
@MainActor
struct GD1RegressionTests {
  static let wed = LocalDate("2026-10-21")!
  static let chest = WorkoutTemplate(id: "t-chest", name: "Chest day", exercises: [
    TemplateExercise(exerciseName: "Bench Press", sets: 3, reps: 8, weightKg: 60)
  ])
  static let base = TemplateSnapshot(
    routine: [RoutineDay(dayOfWeek: 2, isRest: false, templateId: "t-chest")], templates: [chest],
    overridesSupported: true, fetchedAt: EpochMillis(1))

  static func editor() -> (PlanEditor, InMemoryWorkoutStore, () -> TemplateSnapshot) {
    let store = InMemoryWorkoutStore()
    var current = base
    let editor = PlanEditor(userId: "u", store: store, current: { current }, onEnqueued: { current = current.applying($0) })
    return (editor, store, { current })
  }

  /// R1: hàng đợi nhận lại CÙNG lệnh (app chết giữa lượt, ghi lại) → không thêm hàng.
  @Test func reEnqueueingTheSameEntriesAddsNothing() async throws {
    let (editor, store, _) = Self.editor()
    try await editor.postpone(date: Self.wed, to: Self.wed.adding(days: 1))
    let first = try await store.pending(userId: "u")
    try await store.enqueue(first)
    #expect(try await store.pending(userId: "u").count == 2)
  }

  /// R2: áp lại lệnh server đã nhận (đọc lại + lệnh còn chờ) không đổi gì.
  @Test func reApplyingIsIdempotent() async throws {
    let (editor, store, current) = Self.editor()
    try await editor.postpone(date: Self.wed, to: Self.wed.adding(days: 1))
    let pending = try await store.pending(userId: "u")
    let once = current()
    #expect(once.applying(pending) == once)
    #expect(once.applying(pending).applying(pending).overrides.count == 2)
  }

  /// R3: bấm hai lần (mạng chậm) → lần hai bị từ chối, không có lệnh thứ hai.
  @Test func doubleTapNeverWritesTwice() async throws {
    let (editor, store, _) = Self.editor()
    try await editor.postpone(date: Self.wed, to: Self.wed.adding(days: 1))
    await #expect(throws: PlanEditor.Refusal.nothingToMove) {
      try await editor.postpone(date: Self.wed, to: Self.wed.adding(days: 1))
    }
    await #expect(throws: PlanEditor.Refusal.nothingToMove) { try await editor.makeRest(date: Self.wed) }
    #expect(try await store.pending(userId: "u").count == 2)
    let (rest, restStore, _) = Self.editor()
    try await rest.makeRest(date: Self.wed)
    await #expect(throws: PlanEditor.Refusal.nothingToMove) { try await rest.makeRest(date: Self.wed) }
    #expect(try await restStore.pending(userId: "u").count == 1)
  }

  /// R4: offline — server chưa có hàng, lệnh còn chờ áp lên; server có rồi (đọc
  /// lại sau khi gửi) — cùng một lịch, không hai buổi.
  @Test func offlineThenSyncedShowsTheSamePlan() async throws {
    let (editor, store, _) = Self.editor()
    let thu = Self.wed.adding(days: 1)
    try await editor.postpone(date: Self.wed, to: thu)
    let pending = try await store.pending(userId: "u")
    let offline = Self.base.applying(pending)
    let synced = TemplateSnapshot(
      routine: Self.base.routine, templates: Self.base.templates,
      overrides: pending.compactMap { DayOverride(row: $0.payload) }, overridesSupported: true, fetchedAt: EpochMillis(2))
    for s in [offline, synced, synced.applying(pending)] {
      #expect(s.plan(for: Self.wed, today: Self.wed).status == .rest)
      #expect(s.plan(for: thu, today: Self.wed).template?.id == "t-chest")
      #expect(s.overrides.count == 2)
    }
  }

  /// R5: lên lịch nhắc lại nhiều lần (mở app, đổi lịch) → cùng kế hoạch, mỗi ngày
  /// tối đa MỘT lời nhắc buổi tập. (Bộ lên lịch thật còn xoá hết trước khi thêm.)
  @Test func remindersAreStableAndOnePerDay() {
    var cal = Calendar(identifier: .gregorian)
    cal.timeZone = TimeZone(identifier: "UTC")!
    let now = ISO8601DateFormatter().date(from: "2026-10-21T08:00:00Z")!
    var ctx = ReminderContext.today(
      Self.wed, trained: [], routine: Self.base.routine, waterTotalMl: nil, waterTargetMl: nil, supplements: nil,
      library: Self.base)
    ctx.missedDays = 4
    ctx.koaWorkoutCopy = ReminderCopyTable.koaWorkout(.vi)
    let a = ReminderPlan.plan(ReminderPrefs.defaults, ctx, now: now, calendar: cal)
    let b = ReminderPlan.plan(ReminderPrefs.defaults, ctx, now: now, calendar: cal)
    #expect(a == b)
    let koa = a.filter { $0.key == .koaTraining }
    let days = koa.map { cal.startOfDay(for: $0.at) }
    #expect(Set(days).count == days.count, "mỗi ngày tối đa một lời nhắc tập")
    #expect(Set(a.map(\.token)).count == a.count, "không có hai lời nhắc trùng khoá")
  }

  /// R6: lỗi khi đọc phục hồi → không có tín hiệu, không gợi ý tập nhẹ (không đoán).
  @Test func recoveryReadFailureGivesNoSuggestion() async {
    let r = await DailyLog.recovery(
      userId: "u", date: Self.wed, store: Failing(), now: EpochMillis(1_800_000_000_000), in: TimeZone(identifier: "UTC")!)
    #expect(r == nil)
    let input = DailyPlan.input(
      date: Self.wed, library: Self.base, active: nil, doneToday: [], daysOff: 0, recovery: r, proteinLeftG: nil)
    let result = DailyPlan.decide(input)
    #expect(result.reason == .planned && !result.alternatives.contains(.lighter))
  }

  /// R7: chưa đọc được kế hoạch (mất mạng, chưa có cache) → không đoán, không nút.
  @Test func unreadPlanNeverGuesses() {
    let r = DailyPlan.decide(DailyPlan.input(
      date: Self.wed, library: nil, active: nil, doneToday: [], daysOff: nil, recovery: nil, proteinLeftG: nil))
    #expect(r.action == .loading && r.alternatives.isEmpty)
  }

  struct Failing: RowStore {
    func select(_ q: RowQuery) async throws(RowStoreError) -> [JSONValue] { throw RowStoreError(code: nil, message: "offline") }
    func insert(_ table: String, _ row: [String: JSONValue]) async throws(RowStoreError) {
      throw RowStoreError(code: nil, message: "offline")
    }
    func update(_ table: String, _ row: [String: JSONValue], where filters: [RowQuery.Filter]) async throws(RowStoreError) -> Int {
      throw RowStoreError(code: nil, message: "offline")
    }
  }
}
