import ASCNDCore
import ASCNDTestSupport
import Foundation
import Testing

/// Ghi buổi thủ công (#418) — `app/log-workout.tsx` @ fac9ac2.

private let saigon = TimeZone(identifier: "Asia/Ho_Chi_Minh")!
/// 2026-10-05 (Thứ Hai) 14:00 Sài Gòn.
private let mondayAt2pm: Int64 = 1_791_183_600_000
private let monday = LocalDate("2026-10-05")!

private actor Plan: TemplateSource, TemplateCache {
  var snapshot: TemplateSnapshot
  init(_ s: TemplateSnapshot) { snapshot = s }
  func fetch(userId: String) async throws -> TemplateSnapshot { snapshot }
  func load(userId: String) async throws -> TemplateSnapshot? { nil }
  func save(userId: String, _ snapshot: TemplateSnapshot) async throws {}
}
private struct History: TrainingHistory, RecordHistory, PerformanceSource {
  var times: [EpochMillis] = []
  var sets: [JSONValue] = []
  func sessionTimes(userId: String, since: EpochMillis) async throws -> [EpochMillis] { times }
  func recentSessionSets(userId: String, limit: Int) async throws -> [JSONValue] { sets }
  func sessions(userId: String, since: EpochMillis) async throws -> [SessionHistoryRow] { [] }
}
private actor Caches: RecordBookCache, PerformanceCache {
  func load(userId: String) async throws -> PersonalRecords.Bests? { nil }
  func save(userId: String, _ bests: PersonalRecords.Bests) async throws {}
  func load(userId: String) async throws -> [String: LastPerformance]? { nil }
  func save(userId: String, _ table: [String: LastPerformance]) async throws {}
}

private let push = WorkoutTemplate(id: "tpl", name: "Push", exercises: [
  TemplateExercise(exerciseId: "ex-bench", exerciseName: "Bench", sets: 2, reps: 8, weightKg: 82.5, rpe: 8),
  TemplateExercise(exerciseName: "Dips", sets: 1, reps: 0, weightKg: 0, rpe: 9),
])
private func week(rest: Bool = false) -> TemplateSnapshot {
  TemplateSnapshot(routine: [RoutineDay(dayOfWeek: 0, isRest: rest, templateId: "tpl")], templates: [push], fetchedAt: EpochMillis(1))
}

@MainActor
private final class Harness {
  let clock = ManualClock(EpochMillis(mondayAt2pm))
  let store = InMemoryWorkoutStore()
  let plan: Plan
  let history: History
  var enqueued: [OutboxEntry] = []
  private(set) var flow: WorkoutFlow!

  init(_ s: TemplateSnapshot = week(), history: History = History()) {
    plan = Plan(s)
    self.history = history
    flow = make()
  }

  func make() -> WorkoutFlow {
    let today = TodayController(
      userId: "u1", repository: TodayRepository(source: plan, cache: plan), history: history, workouts: store,
      clock: clock, timeZone: saigon)
    return WorkoutFlow(
      today: today, records: RecordBook(userId: "u1", history: history, cache: Caches()),
      performance: PerformanceBook(userId: "u1", source: history, cache: Caches(), clock: clock, timeZone: saigon),
      store: store, clock: clock, timeZone: saigon,
      onEnqueued: { [unowned self] in enqueued.append($0) })
  }

  func reopen() { flow = make() }

  func open() async -> ManualLogController {
    let log = flow.makeManualLog()
    await log.load()
    return log
  }
}

/// Điền một hàng.
@MainActor
private func fill(_ log: ManualLogController, _ i: Int, _ name: String, _ kg: String, _ reps: String, warmup: Bool = false) async {
  while log.rows.count <= i { await log.addExercise() }
  let id = log.rows[i].id
  await log.setExerciseName(name, row: id)
  await log.setWeight(kg, row: id)
  await log.setReps(reps, row: id)
  if warmup != log.rows[i].warmup { await log.toggleWarmup(row: id) }
}

@MainActor
struct ManualLogTests {
  /// Hàng ghi lên: `template_id = null`, `session_rpe` = RPE đã chọn, mỗi set
  /// `rpe: null`, tên cắt / mặc định — cùng hình với hàng của màn tập.
  @Test func savesAManualSessionThroughTheOneWritePath() async throws {
    let h = Harness()
    await h.flow.start()
    let log = await h.open()
    await log.setName("  Evening pump ")
    await log.setRpe(9)
    await fill(log, 0, "Curl", "12.5", "12")
    await fill(log, 1, "", "", "")  // hàng trống: không ghi, không chặn
    let summary = try await log.save()
    #expect(summary.completedSets == 1)
    let e = try #require(await h.store.outbox.last)
    #expect(e.kind == WorkoutSessionRecord.outboxKind && e.id == summary.sessionId)
    #expect(e.payload["template_id"] == .null)
    #expect(e.payload["template_name"]?.stringValue == "Evening pump")
    #expect(e.payload["session_rpe"]?.doubleValue == 9)
    #expect(e.payload["volume_load"]?.doubleValue == 150)
    guard case .array(let sets)? = e.payload["sets"], sets.count == 1 else {
      Issue.record("sets")
      return
    }
    #expect(sets[0]["rpe"] == .null)
    #expect(sets[0]["weight"]?.doubleValue == 12.5 && sets[0]["reps"]?.doubleValue == 12)
    // Buổi đi đúng đường của buổi theo kế hoạch: Today "đã tập", hàng tới sync.
    await h.flow.settled()
    #expect(h.flow.today.trained.contains(monday))
    #expect(h.enqueued.map(\.id) == [e.id])
  }

  @Test func emptyNameIsWorkout() async throws {
    let h = Harness()
    let log = await h.open()
    await fill(log, 0, "Curl", "", "10")
    _ = try await log.save()
    #expect(await h.store.outbox.last?.payload["template_name"]?.stringValue == "Workout")
  }

  /// Bấm Lưu hai lần (chạm đôi, mạng chậm): một buổi. Lần hai trả lại đúng
  /// tổng kết cũ.
  @Test func doubleSaveIsOneSession() async throws {
    let h = Harness()
    let log = await h.open()
    await fill(log, 0, "Curl", "10", "10")
    async let a = log.save()
    async let b = log.save()
    let results = await [(try? a)?.sessionId, (try? b)?.sessionId]
    #expect(results.compactMap { $0 }.count >= 1)
    _ = try await log.save()
    #expect(await h.store.outbox.count == 1)
  }

  /// Ghi máy hỏng: báo lỗi, form còn nguyên, thử lại dùng CÙNG id.
  @Test func failedSaveRetriesWithTheSameId() async throws {
    let h = Harness()
    let log = await h.open()
    await fill(log, 0, "Curl", "10", "10")
    await h.store.failNext()
    await #expect(throws: ManualLogController.SaveRefusal.self) { try await log.save() }
    #expect(await h.store.outbox.isEmpty)
    #expect(log.loggedSessionId == nil && log.rows[0].reps == "10")
    let s = try await log.save()
    #expect(await h.store.outbox.map(\.id) == [s.sessionId])
  }

  /// App bị kill giữa lúc nhập: mở lại còn nguyên bản nháp.
  @Test func killAndReopenRestoresTheDraft() async throws {
    let h = Harness()
    let log = await h.open()
    await log.setName("Arms")
    await log.setRpe(8)
    await fill(log, 0, "Curl", "10", "12", warmup: true)
    await fill(log, 1, "Curl", "14", "8")
    h.reopen()
    let again = await h.open()
    #expect(again.name == "Arms" && again.rpe == 8)
    #expect(again.rows.map(\.reps) == ["12", "8"])
    #expect(again.rows[0].warmup && !again.rows[1].warmup)
    #expect(again.rows.map(\.id) == log.rows.map(\.id))
  }

  /// Đã ghi rồi mở lại: form MỚI (buổi thứ hai trong ngày là có thật), buổi
  /// cũ không bao giờ bị ghi đè hay ghi lại.
  @Test func reopenAfterSaveStartsANewSession() async throws {
    let h = Harness()
    let log = await h.open()
    await fill(log, 0, "Curl", "10", "10")
    let first = try await log.save()
    h.reopen()
    let next = await h.open()
    #expect(next.loggedSessionId == nil && next.rows.count == 1 && next.rows[0].reps.isEmpty)
    await fill(next, 0, "Row", "40", "10")
    let second = try await next.save()
    #expect(second.sessionId != first.sessionId)
    #expect(await h.store.outbox.count == 2)
  }

  @Test func startNewAfterSaveUsesTheNextSlot() async throws {
    let h = Harness()
    let log = await h.open()
    await fill(log, 0, "Curl", "10", "10")
    let first = try await log.save()
    await log.startNew()
    await fill(log, 0, "Row", "40", "10")
    let second = try await log.save()
    #expect(first.sessionId != second.sessionId)
    #expect(await h.store.outbox.count == 2)
  }

  /// Hai form cùng mở một ô (hai màn): ô đã ghi bị khoá ở tầng lưu.
  @Test func twoFormsOnOneSlotNeverMakeTwoSessions() async throws {
    let h = Harness()
    let a = await h.open()
    let b = await h.open()
    await fill(a, 0, "Curl", "10", "10")
    await fill(b, 0, "Curl", "10", "10")
    _ = try await a.save()
    await #expect(throws: ManualLogController.SaveRefusal.self) { try await b.save() }
    #expect(await h.store.outbox.count == 1)
  }

  /// Gợi ý kế hoạch: tên, mỗi set một hàng, tạ 0 / reps 0 → ô trống, RPE =
  /// đầu trên của `effortRange` (9), đổi đơn vị theo màn.
  @Test func planFillsTheForm() async throws {
    let h = Harness()
    await h.flow.start()
    let log = await h.open()
    #expect(log.planOffer?.id == "tpl")
    await log.usePlan(display: { $0 * 2 })
    #expect(log.name == "Push" && log.rpe == 9)
    #expect(log.rows.map(\.exerciseName) == ["Bench", "Bench", "Dips"])
    #expect(log.rows.map(\.weight) == ["165", "165", ""])
    #expect(log.rows.map(\.reps) == ["8", "8", ""])
    #expect(log.rows[0].exerciseId == "ex-bench")
    #expect(log.rows.allSatisfy { !$0.warmup })
    #expect(log.planOffer == nil, "đã dùng thì thôi gợi ý")
    #expect(log.setNumbers[log.rows[1].id] == 2 && log.setNumbers[log.rows[2].id] == 1)
  }

  /// Không gợi ý khi hôm nay nghỉ, hay hôm nay đã có buổi.
  @Test func noPlanOfferOnRestOrAfterTraining() async throws {
    let rest = Harness(week(rest: true))
    await rest.flow.start()
    #expect(await rest.open().planOffer == nil)

    let done = Harness(history: History(times: [EpochMillis(mondayAt2pm - 3_600_000)]))
    await done.flow.start()
    #expect(await done.open().planOffer == nil)
  }

  /// `addSet` chép bài + tạ, reps trống, không chép khởi động; `removeRow` giữ
  /// ít nhất một hàng.
  @Test func rowEditingFollowsBaseline() async throws {
    let h = Harness()
    let log = await h.open()
    await fill(log, 0, "Squat", "100", "5", warmup: true)
    await log.addSet()
    #expect(log.rows[1].exerciseName == "Squat" && log.rows[1].weight == "100")
    #expect(log.rows[1].reps.isEmpty && !log.rows[1].warmup)
    #expect(await log.removeRow(log.rows[1].id))
    #expect(!(await log.removeRow(log.rows[0].id)))
    #expect(log.rows.count == 1)
    await log.pickExercise(id: "ex-sq", name: "Back Squat", row: log.rows[0].id)
    #expect(log.rows[0].exerciseId == "ex-sq")
    await log.setExerciseName("Front Squat", row: log.rows[0].id)
    #expect(log.rows[0].exerciseId.isEmpty, "gõ tay bỏ bài đã chọn")
  }

  /// Cận chỉ áp cho hàng sẽ ghi; tạ so theo kg.
  @Test func boundsApplyToRowsThatWillBeWritten() async throws {
    let h = Harness()
    let log = await h.open()
    await fill(log, 0, "Bench", "700", "5")
    await fill(log, 1, "Bench", "900", "")  // chưa điền xong: không chặn
    #expect(log.errors()[log.rows[0].id] == [.weight])
    #expect(log.errors()[log.rows[1].id] == nil)
    #expect(!log.canSave())
    await #expect(throws: ManualLogController.SaveRefusal.outOfRange) { try await log.save() }
    await log.setWeight("300", row: log.rows[0].id)
    #expect(log.canSave())
    #expect(!log.canSave(toKg: { $0 * 2.5 }), "300 lb… × 2.5 = 750 kg: ngoài cận")
    await log.setReps("600", row: log.rows[0].id)
    #expect(log.errors()[log.rows[0].id] == [.reps])
    await log.setWeight("-5", row: log.rows[0].id)
    await log.setReps("5", row: log.rows[0].id)
    #expect(log.errors()[log.rows[0].id] == [.weight])
  }

  @Test func nothingToSave() async throws {
    let h = Harness()
    let log = await h.open()
    await fill(log, 0, "Curl", "10", "")
    await #expect(throws: ManualLogController.SaveRefusal.nothingDone) { try await log.save() }
  }

  /// RN BUG: set giữ ("45s") bị cận `set_reps` chặn — không bao giờ ghi được.
  @Test func holdSetsCanBeSaved() async throws {
    let h = Harness()
    let log = await h.open()
    await fill(log, 0, "Plank", "", "45s")
    #expect(log.errors().isEmpty && log.canSave())
    let s = try await log.save()
    #expect(s.holdSets == 1)
    let set = try #require(await h.store.outbox.last?.payload["sets"]).asArray?.first
    #expect(set?["durationSec"]?.doubleValue == 45)
    #expect(set?["reps"]?.doubleValue == 0)
  }

  /// RN BUG: đường offline bỏ cờ khởi động và thời gian giữ, volume tính cả
  /// set khởi động. Native: một đường, online hay offline như nhau.
  @Test func offlineKeepsHoldsAndWarmups() async throws {
    let h = Harness()
    let log = await h.open()  // không có server nào được hỏi lúc ghi
    await fill(log, 0, "Squat", "60", "10", warmup: true)
    await fill(log, 1, "Squat", "100", "5")
    await fill(log, 2, "Plank", "", "60s")
    _ = try await log.save()
    let e = try #require(await h.store.outbox.last)
    let sets = try #require(e.payload["sets"]?.asArray)
    #expect(sets[0]["warmup"]?.boolValue == true)
    #expect(sets[2]["durationSec"]?.doubleValue == 60)
    #expect(e.payload["volume_load"]?.doubleValue == 500, "khởi động không vào volume")
  }

  /// RN BUG: set khởi động nổ kỷ lục reps ở đường online.
  @Test func warmupNeverPostsARecord() async throws {
    let past: JSONValue = .array([.object(["exerciseName": .string("Squat"), "weight": .number(60), "reps": .number(5)])])
    let h = Harness(history: History(sets: [past]))
    await h.flow.start()
    let log = await h.open()
    await fill(log, 0, "Squat", "60", "12", warmup: true)
    let warm = try await log.save()
    #expect(!warm.prDetected)

    await log.startNew()
    await fill(log, 0, "Squat", "60", "12")
    let real = try await log.save()
    #expect(real.prDetected, "cùng set mà là set thật thì là kỷ lục")
  }

  /// Form khoá sau khi ghi.
  @Test func formLocksAfterSave() async throws {
    let h = Harness()
    let log = await h.open()
    await fill(log, 0, "Curl", "10", "10")
    let s = try await log.save()
    #expect(!(await log.setReps("11", row: log.rows[0].id)))
    #expect(!(await log.addSet()))
    #expect(try await log.save() == s)
  }
}

extension JSONValue {
  fileprivate var asArray: [JSONValue]? {
    if case .array(let a) = self { return a }
    return nil
  }
}
