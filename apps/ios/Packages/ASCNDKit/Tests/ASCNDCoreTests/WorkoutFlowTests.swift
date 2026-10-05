import ASCNDCore
import ASCNDTestSupport
import Foundation
import Testing

private struct Down: Error {}

private actor Templates: TemplateSource, TemplateCache {
  var snapshot: TemplateSnapshot
  var cached: TemplateSnapshot?
  init(_ s: TemplateSnapshot) { snapshot = s }
  func set(_ s: TemplateSnapshot) { snapshot = s }
  func fetch(userId: String) async throws -> TemplateSnapshot { snapshot }
  func load(userId: String) async throws -> TemplateSnapshot? { cached }
  func save(userId: String, _ snapshot: TemplateSnapshot) async throws { cached = snapshot }
}
private struct NoHistory: TrainingHistory, RecordHistory, PerformanceSource {
  func sessionTimes(userId: String, since: EpochMillis) async throws -> [EpochMillis] { [] }
  func recentSessionSets(userId: String, limit: Int) async throws -> [JSONValue] { [] }
  func sessions(userId: String, since: EpochMillis) async throws -> [SessionHistoryRow] { [] }
}
private actor Caches: RecordBookCache, PerformanceCache {
  var bests: PersonalRecords.Bests?
  var table: [String: LastPerformance]?
  func load(userId: String) async throws -> PersonalRecords.Bests? { bests }
  func save(userId: String, _ bests: PersonalRecords.Bests) async throws { self.bests = bests }
  func load(userId: String) async throws -> [String: LastPerformance]? { table }
  func save(userId: String, _ table: [String: LastPerformance]) async throws { self.table = table }
}

private let saigon = TimeZone(identifier: "Asia/Ho_Chi_Minh")!
/// 2026-10-05 (Thứ Hai) 14:00 Sài Gòn.
private let mondayAt2pm: Int64 = 1_791_183_600_000
private let monday = LocalDate("2026-10-05")!
private let tuesday = LocalDate("2026-10-06")!

private func template(_ id: String = "tpl", sets: Int = 2) -> WorkoutTemplate {
  WorkoutTemplate(id: id, name: "Push", exercises: [TemplateExercise(exerciseName: "Bench", sets: sets, reps: 8, weightKg: 60)])
}
/// Thứ Hai và Thứ Ba cùng tập `tpl`; `rest` = Thứ Hai nghỉ.
private func snap(_ tpl: WorkoutTemplate = template(), rest: Bool = false) -> TemplateSnapshot {
  TemplateSnapshot(
    routine: [
      RoutineDay(dayOfWeek: 0, isRest: rest, templateId: tpl.id),
      RoutineDay(dayOfWeek: 1, isRest: false, templateId: tpl.id),
    ],
    templates: [tpl], fetchedAt: EpochMillis(1))
}

@MainActor
private final class Harness {
  let clock = ManualClock(EpochMillis(mondayAt2pm))
  let store: InMemoryWorkoutStore
  let templates: Templates
  let caches = Caches()
  var rests: [(RestEvent, RestTarget?)] = []
  var enqueued: [OutboxEntry] = []
  private(set) var flow: WorkoutFlow!

  init(_ s: TemplateSnapshot = snap(), store: InMemoryWorkoutStore = InMemoryWorkoutStore()) {
    self.store = store
    templates = Templates(s)
    flow = make()
  }

  /// Một flow mới trên cùng máy (cùng store, cache) — như mở app lần nữa.
  func make() -> WorkoutFlow {
    let today = TodayController(
      userId: "u1", repository: TodayRepository(source: templates, cache: templates), history: NoHistory(),
      workouts: store, clock: clock, timeZone: saigon)
    return WorkoutFlow(
      today: today, records: RecordBook(userId: "u1", history: NoHistory(), cache: caches),
      performance: PerformanceBook(userId: "u1", source: NoHistory(), cache: caches, clock: clock, timeZone: saigon),
      store: store, clock: clock, timeZone: saigon,
      onRest: { [unowned self] in rests.append(($0, $1)) },
      onEnqueued: { [unowned self] in enqueued.append($0) })
  }
}

@MainActor
struct WorkoutFlowTests {
  @Test func startOpensTodaysSession() async throws {
    let h = Harness()
    await h.flow.start()
    let s = try #require(h.flow.session)
    #expect(s.plan.date == monday)
    #expect(s.plan.templateId == "tpl")
    #expect(s.plan.rows.map(\.key) == ["0-0", "0-1"])
    #expect(s.phase == .idle)
  }

  @Test func restDayHasNoSession() async {
    let h = Harness(snap(rest: true))
    await h.flow.start()
    #expect(h.flow.session == nil)
    #expect(h.flow.today.plan?.status == .rest)
  }

  /// Kế hoạch tự do (Lab) chỉ cho ngày không có buổi; tắt thì màn tập biến mất.
  @Test func adHocOnlyWhenNoPlan() async throws {
    let h = Harness(snap(rest: true))
    await h.flow.start()
    await h.flow.setAdHoc { date in
      .init(date: date, templateId: nil, templateName: "Lab", rows: WorkoutPlanning.rows([
        TemplateExercise(exerciseName: "Row", sets: 1, reps: 10, weightKg: 40),
      ]))
    }
    #expect(try #require(h.flow.session).plan.templateId == nil)
    await h.flow.setAdHoc(nil)
    #expect(h.flow.session == nil)
  }

  /// Tick → quãng nghỉ nhận set KẾ TIẾP, đã dịch sang `RestTarget` (RT-12).
  @Test func tickStartsRestForNextSet() async throws {
    let h = Harness()
    await h.flow.start()
    await try #require(h.flow.session).toggle("0-0")
    let (event, target) = try #require(h.rests.last)
    #expect(event == .start(seconds: WorkoutPlanning.defaultRest))
    #expect(target == RestTarget(exerciseName: "Bench", setNumber: 2, totalSets: 2))
  }

  /// Chốt: hàng outbox bền → app được báo (kick sync); ngày thành `done` ngay;
  /// buổi vào cả bảng kỷ lục lẫn "lần trước" — không đợi mạng.
  @Test func finishFeedsTodayRecordsAndLastPerformance() async throws {
    let h = Harness()
    await h.flow.start()
    let s = try #require(h.flow.session)
    await s.toggle("0-0")
    await s.toggle("0-1")
    let summary = try await h.flow.finish()
    await h.flow.settled()

    #expect(h.enqueued.map(\.kind) == [WorkoutSessionRecord.outboxKind])
    #expect(h.enqueued.first?.id == summary.sessionId)
    #expect(h.flow.today.plan?.status == .done)
    #expect(h.flow.records.bests?[PersonalRecords.exerciseKey("Bench")] != nil)
    #expect(h.flow.performance.last(for: "bench")?.sessionId == summary.sessionId)
    // Đã lưu xuống cache: mở lại offline vẫn có.
    #expect(await h.caches.table?[PersonalRecords.exerciseKey("Bench")]?.sessionId == summary.sessionId)
  }

  /// Kế hoạch đổi trên server (template sửa ở máy khác) trong lúc đang tập:
  /// buổi đang tập dở KHÔNG bị thay — tiến độ không mất.
  @Test func refreshNeverReplacesAnActiveSession() async throws {
    let h = Harness()
    await h.flow.start()
    let s = try #require(h.flow.session)
    await s.toggle("0-0")
    await h.templates.set(snap(template(sets: 3)))
    await h.flow.refresh()
    #expect(h.flow.session === s)
    #expect(s.progress.done["0-0"] == true)
  }

  /// Chưa chạm gì thì kế hoạch mới thay ngay.
  @Test func refreshReplacesAnUntouchedSession() async throws {
    let h = Harness()
    await h.flow.start()
    await h.templates.set(snap(template(sets: 3)))
    await h.flow.refresh()
    #expect(try #require(h.flow.session).plan.rows.count == 3)
  }

  /// Qua nửa đêm: buổi đã chốt hôm qua nhường chỗ cho buổi hôm nay.
  @Test func finishedSessionYieldsToTomorrow() async throws {
    let h = Harness()
    await h.flow.start()
    let s = try #require(h.flow.session)
    await s.toggle("0-0")
    _ = try await h.flow.finish()
    await h.flow.becameActive()
    #expect(h.flow.session === s, "cùng ngày: còn là màn Summary")

    h.clock.advance(12 * 3_600_000)
    await h.flow.becameActive()
    let next = try #require(h.flow.session)
    #expect(next.plan.date == tuesday)
    #expect(next.phase == .idle)
  }

  /// Qua nửa đêm giữa buổi: buổi dở vẫn ở đó, chốt muộn ghi đúng ngày đã tập.
  @Test func activeSessionSurvivesMidnight() async throws {
    let h = Harness()
    await h.flow.start()
    let s = try #require(h.flow.session)
    await s.toggle("0-0")
    h.clock.advance(12 * 3_600_000)
    await h.flow.becameActive()
    #expect(h.flow.session === s)
    #expect(h.flow.today.today == tuesday)
    _ = try await h.flow.finish()
    #expect(s.plan.date == monday)
  }

  /// Ngày đã chốt bởi một màn khác trên máy này: không có hàng outbox mới
  /// nào, nhưng hôm nay vẫn phải thành `done`.
  @Test func alreadyLoggedElsewhereOnDeviceMarksTrained() async throws {
    let h = Harness()
    await h.flow.start()
    await try #require(h.flow.session).toggle("0-0")

    let other = h.make()
    await other.start()
    await try #require(other.session).toggle("0-1")
    _ = try await other.finish()

    #expect(h.flow.today.plan?.status == .todo)
    await #expect(throws: WorkoutSessionController.FinishRefusal.self) { try await h.flow.finish() }
    #expect(h.flow.today.plan?.status == .done)
    #expect(h.enqueued.count == 1, "chỉ buổi của màn kia")
  }

  @Test func finishWithoutSessionRefuses() async {
    let h = Harness(snap(rest: true))
    await h.flow.start()
    await #expect(throws: WorkoutSessionController.FinishRefusal.loading) { try await h.flow.finish() }
  }
}
