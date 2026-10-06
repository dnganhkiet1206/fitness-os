import ASCNDCore
import Foundation
import Testing

private func d(_ s: String) -> LocalDate { LocalDate(s)! }
private func json(_ s: String) -> JSONValue { try! JSONDecoder().decode(JSONValue.self, from: Data(s.utf8)) }

/// `expand()` của baseline (`day-plan.tsx:547`).
struct TemplateExpandTests {
  @Test func eachExerciseBecomesItsSets() {
    let rows = WorkoutPlanning.rows([
      TemplateExercise(exerciseId: "bench", exerciseName: "Bench", sets: 3, reps: 8, weightKg: 60, rpe: 8, restSeconds: 120),
      TemplateExercise(exerciseName: "Plank", sets: 1, reps: 0, weightKg: 0),
    ])
    #expect(rows.map(\.key) == ["0-0", "0-1", "0-2", "1-0"])
    #expect(rows.map(\.ordinal) == [1, 2, 3, 1])
    #expect(rows.map(\.of) == [3, 3, 3, 1])
    #expect(rows[0].plannedRest == 120 && rows[0].plannedRpe == 8 && rows[0].exerciseId == "bench")
    #expect(rows[3].plannedRest == 90 && rows[3].plannedRpe == 7, "mặc định DEFAULT_REST / DEFAULT_RPE")
  }

  @Test func missingFieldsTakeDefaults() {
    let e = TemplateExercise(json: json("{}"))
    #expect(e.sets == 1 && e.reps == 0 && e.weightKg == 0 && e.rpe == 7 && e.restSeconds == 90)
    #expect(e.exerciseName == "" && e.exerciseId == nil)
  }

  /// `exerciseId || undefined`: chuỗi rỗng là "không biết", không phải một id.
  @Test func emptyExerciseIdIsNil() {
    #expect(TemplateExercise(json: json(#"{"exerciseId":""}"#)).exerciseId == nil)
  }

  /// `Math.round` rồi kẹp [1, 20].
  @Test(arguments: [(0.0, 1), (-4.0, 1), (2.5, 3), (2.4, 2), (21.0, 20), (4000.0, 20)])
  func setCountIsRoundedAndClamped(raw: Double, sets: Int) {
    #expect(TemplateExercise(json: .object(["sets": .number(raw)])).sets == sets)
  }

  /// Chuỗi số được ép như JS (`Math.round("3")` = 3).
  @Test func numericStringsCoerce() {
    let e = TemplateExercise(json: json(#"{"sets":"3","reps":"10","weight":"62.5"}"#))
    #expect(e.sets == 3 && e.reps == 10 && e.weightKg == 62.5)
  }

  /// RN BUG FOUND: `sets` không phải số → NaN → vòng chạy 0 lần → bài biến mất
  /// khỏi buổi tập, không lỗi nào. Native: coi như thiếu → 1 hiệp.
  @Test func unreadableSetCountKeepsTheExercise() {
    let t = WorkoutTemplate(id: "t", name: "T", exercisesJSON: json(#"[{"exerciseName":"Squat","sets":"ba"}]"#))
    #expect(WorkoutPlanning.rows(t.exercises).count == 1)
  }

  /// `Array.isArray(template.exercises)` sai → không có bài.
  @Test func nonArrayExercisesIsEmpty() {
    #expect(WorkoutTemplate(id: "t", name: "T", exercisesJSON: json(#"{"a":1}"#)).exercises.isEmpty)
    #expect(WorkoutTemplate(id: "t", name: "T", exercisesJSON: nil).exercises.isEmpty)
  }

  /// `Math.round` của JS làm tròn nửa LÊN, kể cả số âm.
  @Test func jsRoundSemantics() {
    #expect(TemplateExercise(json: .object(["reps": .number(-2.5)])).reps == -2)
    #expect(TemplateExercise(json: .object(["reps": .number(8.5)])).reps == 9)
  }
}

/// `routineIndex` + `dayStateOf` (`local-date.ts:188`, `week-strip.tsx:137`).
struct DayPlanTests {
  private let push = WorkoutTemplate(id: "tpl-push", name: "Push", exercises: [
    TemplateExercise(exerciseName: "Bench", sets: 2, reps: 8, weightKg: 60),
  ])
  /// 2026-10-05 là Thứ Hai.
  private let monday = d("2026-10-05")

  @Test func mondayIsZero() {
    #expect(WorkoutPlanning.routineIndex(d("2026-10-05")) == 0)
    #expect(WorkoutPlanning.routineIndex(d("2026-10-11")) == 6)
    #expect(WorkoutPlanning.routineIndex(d("1970-01-01")) == 3, "Thứ Năm")
    #expect(WorkoutPlanning.routineIndex(d("1969-12-29")) == 0, "trước epoch vẫn đúng")
  }

  @Test func assignedToday() {
    let p = WorkoutPlanning.plan(for: monday, today: monday,
      routine: [RoutineDay(dayOfWeek: 0, isRest: false, templateId: "tpl-push")], templates: [push])
    #expect(p.status == .todo)
    #expect(p.template?.id == "tpl-push")
    #expect(p.sessionPlan?.rows.count == 2)
    #expect(p.sessionPlan?.templateId == "tpl-push")
  }

  /// `is_rest` thắng `template_id`.
  @Test func restWinsOverTemplate() {
    let p = WorkoutPlanning.plan(for: monday, today: monday,
      routine: [RoutineDay(dayOfWeek: 0, isRest: true, templateId: "tpl-push")], templates: [push])
    #expect(p.status == .rest)
    #expect(p.sessionPlan == nil)
  }

  @Test func noRowIsUnplannedNotRest() {
    let p = WorkoutPlanning.plan(for: monday, today: monday, routine: [], templates: [push])
    #expect(p.status == .unplanned)
  }

  /// Template đã bị xoá: ngày trở thành chưa lên lịch, không phải buổi rỗng.
  @Test func deletedTemplateIsUnplanned() {
    let p = WorkoutPlanning.plan(for: monday, today: monday,
      routine: [RoutineDay(dayOfWeek: 0, isRest: false, templateId: "gone")], templates: [push])
    #expect(p.status == .unplanned)
    #expect(p.template == nil)
  }

  @Test func doneMissedTodo() {
    let routine = [RoutineDay(dayOfWeek: 0, isRest: false, templateId: "tpl-push")]
    let lastMonday = monday.adding(days: -7)
    #expect(WorkoutPlanning.plan(for: lastMonday, today: monday, routine: routine, templates: [push]).status == .missed)
    #expect(WorkoutPlanning.plan(for: lastMonday, today: monday, routine: routine, templates: [push],
                                 trained: [lastMonday]).status == .done)
    #expect(WorkoutPlanning.plan(for: monday.adding(days: 7), today: monday, routine: routine, templates: [push]).status == .todo)
  }

  @Test func deloadIsOnlyABadge() {
    let p = WorkoutPlanning.plan(for: monday, today: monday,
      routine: [RoutineDay(dayOfWeek: 0, isRest: false, isDeload: true, templateId: "tpl-push")], templates: [push])
    #expect(p.isDeload)
    #expect(p.sessionPlan?.rows.first?.weightKg == 60, "deload không đổi tạ ở baseline")
  }
}

/// Local-first: cache trả ngay; server hỏng thì cache cũ còn nguyên.
struct TodayRepositoryTests {
  actor Cache: TemplateCache {
    var store: [String: TemplateSnapshot] = [:]
    func load(userId: String) async throws -> TemplateSnapshot? { store[userId] }
    func save(userId: String, _ snapshot: TemplateSnapshot) async throws { store[userId] = snapshot }
  }
  struct Source: TemplateSource {
    let result: Result<TemplateSnapshot, any Error>
    func fetch(userId: String) async throws -> TemplateSnapshot { try result.get() }
  }
  struct Down: Error {}

  private let snap = TemplateSnapshot(routine: [RoutineDay(dayOfWeek: 0, isRest: true, templateId: nil)], templates: [], fetchedAt: EpochMillis(1))

  @Test func refreshFillsCachePerUser() async throws {
    let cache = Cache()
    let repo = TodayRepository(source: Source(result: .success(snap)), cache: cache)
    #expect(await repo.cached(userId: "u1") == nil)
    _ = try await repo.refresh(userId: "u1")
    #expect(await repo.cached(userId: "u1") == snap)
    #expect(await repo.cached(userId: "u2") == nil, "cache theo người dùng")
  }

  @Test func failedRefreshKeepsCache() async throws {
    let cache = Cache()
    try await cache.save(userId: "u1", snap)
    let repo = TodayRepository(source: Source(result: .failure(Down())), cache: cache)
    await #expect(throws: Down.self) { try await repo.refresh(userId: "u1") }
    #expect(await repo.cached(userId: "u1") == snap)
  }
}
