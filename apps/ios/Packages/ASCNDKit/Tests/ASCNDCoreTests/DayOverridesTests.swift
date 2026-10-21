@testable import ASCNDCore
import ASCNDTestSupport
import Foundation
import Testing

/// Đổi lịch theo ngày (#527 GĐ1, điều kiện 03): dời buổi, đổi thành nghỉ, không
/// chồng buổi, mẫu gốc giữ nguyên, thống kê đọc cùng lịch đã áp.
@MainActor
struct DayOverridesTests {
  /// 2026-10-21 là thứ Tư (routineIndex 2).
  static let wed = LocalDate("2026-10-21")!
  static let chest = WorkoutTemplate(id: "t-chest", name: "Chest day", exercises: [
    TemplateExercise(exerciseName: "Bench Press", sets: 3, reps: 8, weightKg: 60)
  ])
  static let back = WorkoutTemplate(id: "t-back", name: "Back day", exercises: [
    TemplateExercise(exerciseName: "Barbell Row", sets: 3, reps: 8, weightKg: 50)
  ])
  /// T2 back, T4 chest, T6 back; T7 + CN nghỉ; T3, T5 trống.
  static func snapshot(_ overrides: [DayOverride] = []) -> TemplateSnapshot {
    TemplateSnapshot(
      routine: [
        RoutineDay(dayOfWeek: 0, isRest: false, templateId: "t-back"),
        RoutineDay(dayOfWeek: 2, isRest: false, templateId: "t-chest"),
        RoutineDay(dayOfWeek: 4, isRest: false, templateId: "t-back"),
        RoutineDay(dayOfWeek: 5, isRest: true, templateId: nil),
        RoutineDay(dayOfWeek: 6, isRest: true, templateId: nil),
      ], templates: [chest, back], overrides: overrides, fetchedAt: EpochMillis(1))
  }

  @Test func overrideWinsForItsDayOnly() {
    let thu = Self.wed.adding(days: 1)
    let s = Self.snapshot([
      DayOverride(date: Self.wed, templateId: nil, isRest: true, movedTo: thu),
      DayOverride(date: thu, templateId: "t-chest", isRest: false, movedFrom: Self.wed),
    ])
    #expect(s.plan(for: Self.wed, today: Self.wed).status == .rest)
    #expect(s.plan(for: thu, today: Self.wed).template?.id == "t-chest")
    // tuần sau, cùng thứ Tư: lịch mẫu nguyên vẹn
    #expect(s.plan(for: Self.wed.adding(days: 7), today: Self.wed).template?.id == "t-chest")
    #expect(s.routine == Self.snapshot().routine, "lịch mẫu không đổi")
  }

  @Test func overrideToADeletedTemplateIsUnplanned() {
    let s = Self.snapshot([DayOverride(date: Self.wed, templateId: "gone", isRest: false)])
    #expect(s.plan(for: Self.wed, today: Self.wed).status == .unplanned)
  }

  /// Ưu tiên ngày trống gần nhất; không bao giờ chọn ngày đã có buổi.
  @Test func postponeTargetIsTheNearestFreeDay() {
    #expect(Reschedule.target(from: Self.wed, in: Self.snapshot()) == Self.wed.adding(days: 1), "T5 trống")
    // T5 đã có buổi → ngày trống kế tiếp trong 6 ngày là T3 tuần sau (ngày trống thắng ngày nghỉ)
    let thuBusy = Self.snapshot([DayOverride(date: Self.wed.adding(days: 1), templateId: "t-back", isRest: false)])
    #expect(Reschedule.target(from: Self.wed, in: thuBusy) == Self.wed.adding(days: 6), "T3 tuần sau là ngày trống kế")
    // không còn ngày trống nào → dùng ngày nghỉ gần nhất
    let full = Self.snapshot((1...6).compactMap { o in
      let d = Self.wed.adding(days: o)
      return [3, 5].contains(o) ? nil : DayOverride(date: d, templateId: "t-back", isRest: false)
    })
    #expect(Reschedule.target(from: Self.wed, in: full) == Self.wed.adding(days: 3), "T7 nghỉ")
  }

  @Test func rowRoundTrips() {
    let o = DayOverride(date: Self.wed, templateId: "T-Chest", isRest: false, movedFrom: Self.wed.adding(days: -1))
    #expect(DayOverride(row: o.row(userId: "u")) == o)
    #expect(o.templateId == "t-chest")
  }

  /// Cache cũ (trước GĐ1) không có `overrides` vẫn đọc được.
  @Test func oldCacheDecodes() throws {
    let old = #"{"routine":[],"templates":[],"fetchedAt":1}"#
    let s = try JSONDecoder().decode(TemplateSnapshot.self, from: Data(old.utf8))
    #expect(s.overrides.isEmpty)
  }

  // MARK: - PlanEditor

  static func editor(_ snap: TemplateSnapshot) -> (PlanEditor, InMemoryWorkoutStore, () -> TemplateSnapshot) {
    let store = InMemoryWorkoutStore()
    var current = snap
    let editor = PlanEditor(
      userId: "u", store: store, current: { current },
      onEnqueued: { entries in current = current.applying(entries) })
    return (editor, store, { current })
  }

  @Test func postponeWritesBothDaysInOneCommit() async throws {
    let (editor, store, current) = Self.editor(Self.snapshot())
    let thu = Self.wed.adding(days: 1)
    try await editor.postpone(date: Self.wed, to: thu)
    let pending = try await store.pending(userId: "u")
    #expect(pending.count == 2 && pending.allSatisfy { $0.kind == PlanEdit.dayOverrideKind })
    let s = current()
    #expect(s.plan(for: Self.wed, today: Self.wed).status == .rest)
    #expect(s.override(on: Self.wed)?.movedTo == thu, "quyết định được ghi lại, không xoá")
    #expect(s.plan(for: thu, today: Self.wed).template?.id == "t-chest")
    #expect(s.override(on: thu)?.movedFrom == Self.wed)
    #expect(s.templates == Self.snapshot().templates && s.routine == Self.snapshot().routine, "mẫu gốc nguyên vẹn")
  }

  @Test func postponeRefusesToStackTwoSessions() async throws {
    let (editor, store, _) = Self.editor(Self.snapshot())
    await #expect(throws: PlanEditor.Refusal.conflict) {
      try await editor.postpone(date: Self.wed, to: Self.wed.adding(days: 2))  // T6 đã có buổi
    }
    await #expect(throws: PlanEditor.Refusal.nothingToMove) {
      try await editor.postpone(date: Self.wed.adding(days: 1), to: Self.wed.adding(days: 6))  // T5 trống
    }
    #expect(try await store.pending(userId: "u").isEmpty, "từ chối thì không ghi gì")
  }

  @Test func makeRestKeepsTheTemplateAndOnlyThatDay() async throws {
    let (editor, _, current) = Self.editor(Self.snapshot())
    try await editor.makeRest(date: Self.wed)
    let s = current()
    #expect(s.plan(for: Self.wed, today: Self.wed).status == .rest)
    #expect(s.plan(for: Self.wed.adding(days: 7), today: Self.wed).template?.id == "t-chest")
    #expect(s.templates.contains { $0.id == "t-chest" })
    await #expect(throws: PlanEditor.Refusal.nothingToMove) { try await editor.makeRest(date: Self.wed) }
  }

  /// Xoá mẫu kéo theo các ngày trỏ vào nó (server: ON DELETE CASCADE).
  @Test func deletingATemplateDropsItsOverrides() async throws {
    let (editor, _, current) = Self.editor(Self.snapshot())
    try await editor.postpone(date: Self.wed, to: Self.wed.adding(days: 1))
    try await editor.delete(templateId: "t-chest")
    #expect(current().override(on: Self.wed.adding(days: 1)) == nil)
    #expect(current().override(on: Self.wed)?.isRest == true, "ngày đã chọn nghỉ vẫn nghỉ")
  }

  /// Thống kê đọc cùng lịch đã áp: Gains tính buổi dời là buổi trong lịch.
  @Test func gainsReadTheSameOverrides() async throws {
    let (editor, _, current) = Self.editor(Self.snapshot())
    let thu = Self.wed.adding(days: 1)
    try await editor.postpone(date: Self.wed, to: thu)
    let week = KoaGains.Week(current())
    #expect(week.isRest(Self.wed) && week.isPlanned(thu))
    let s = KoaGains.compute([KoaGains.Day(date: thu, personalRecord: false)], week: week, today: thu)
    #expect(s.points == KoaGains.plannedSession && s.missedDays == 0)
  }
}
