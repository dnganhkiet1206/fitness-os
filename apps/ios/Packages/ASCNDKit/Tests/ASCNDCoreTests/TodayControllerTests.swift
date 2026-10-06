import ASCNDCore
import ASCNDTestSupport
import Foundation
import Testing

struct ISO8601ParseTests {
  @Test(arguments: [
    ("2026-10-05T07:00:00+00:00", Int64(1_791_183_600_000)),
    ("2026-10-05T07:00:00Z", 1_791_183_600_000),
    ("2026-10-05T07:00:00.123Z", 1_791_183_600_123),
    ("2026-10-05T07:00:00.123456+00:00", 1_791_183_600_123),
    ("2026-10-05T07:00:00.5+00:00", 1_791_183_600_500),
    ("2026-10-05T14:00:00+07:00", 1_791_183_600_000),
    ("2026-10-05T03:00:00-04:00", 1_791_183_600_000),
    ("2026-10-05 07:00:00+00", 1_791_183_600_000),
    ("2026-10-05T07:00:00", 1_791_183_600_000),
  ])
  func parses(text: String, millis: Int64) {
    #expect(EpochMillis(iso8601: text) == EpochMillis(millis), "\(text)")
  }

  /// Khứ hồi với bộ ghi của chính app (`toISOString`).
  @Test func roundTripsWithWriter() {
    let t = EpochMillis(1_791_183_600_123)
    #expect(EpochMillis(iso8601: WorkoutSessionRecord.iso8601(t)) == t)
  }

  @Test(arguments: ["", "2026-10-05", "2026-13-05T07:00:00Z", "2026-10-05T25:00:00Z", "2026-10-05T07:00:00.Z", "2026-10-05T07:00:00+7", "garbage"])
  func rejects(text: String) {
    #expect(EpochMillis(iso8601: text) == nil, "\(text)")
  }
}

private actor Cache: TemplateCache {
  var store: [String: TemplateSnapshot] = [:]
  init(_ s: [String: TemplateSnapshot] = [:]) { store = s }
  func load(userId: String) async throws -> TemplateSnapshot? { store[userId] }
  func save(userId: String, _ snapshot: TemplateSnapshot) async throws { store[userId] = snapshot }
}
private struct Down: Error {}
private struct Source: TemplateSource {
  let result: Result<TemplateSnapshot, Down>
  func fetch(userId: String) async throws -> TemplateSnapshot { try result.get() }
}
private struct Throwing: TemplateSource {
  let error: any Error & Sendable
  init(_ error: any Error & Sendable) { self.error = error }
  func fetch(userId: String) async throws -> TemplateSnapshot { throw error }
}
private actor Flaky: TemplateSource {
  var down = true
  func heal() { down = false }
  func fetch(userId: String) async throws -> TemplateSnapshot {
    if down { throw URLError(.timedOut) }
    return snap()
  }
}
private struct History: TrainingHistory {
  let result: Result<[EpochMillis], Down>
  func sessionTimes(userId: String, since: EpochMillis) async throws -> [EpochMillis] { try result.get() }
}

private let saigon = TimeZone(identifier: "Asia/Ho_Chi_Minh")!
/// 2026-10-05 (Thứ Hai) 14:00 Sài Gòn.
private let monday2pm = ManualClock(EpochMillis(1_791_183_600_000))
private let push = WorkoutTemplate(id: "tpl", name: "Push", exercises: [
  TemplateExercise(exerciseName: "Bench", sets: 2, reps: 8, weightKg: 60),
])
private func snap(_ at: Int64 = 1, mondayRest: Bool = false) -> TemplateSnapshot {
  TemplateSnapshot(routine: [RoutineDay(dayOfWeek: 0, isRest: mondayRest, templateId: "tpl")], templates: [push], fetchedAt: EpochMillis(at))
}

@MainActor
private func controller(
  cache: Cache = Cache(), source: Result<TemplateSnapshot, Down> = .success(snap()),
  history: Result<[EpochMillis], Down> = .success([]), store: InMemoryWorkoutStore = InMemoryWorkoutStore(),
  clock: ManualClock = monday2pm
) -> TodayController {
  TodayController(
    userId: "u1", repository: TodayRepository(source: Source(result: source), cache: cache),
    history: History(result: history), workouts: store, clock: clock, timeZone: saigon)
}

@MainActor
struct TodayControllerTests {
  @Test func todayIsTheUsersLocalDay() {
    // 2026-10-04T23:30Z = 06:30 ngày 5 ở Sài Gòn.
    let c = controller(clock: ManualClock(EpochMillis(1_791_156_600_000)))
    #expect(c.today == LocalDate("2026-10-05"))
  }

  @Test func serverPlanTodo() async {
    let c = controller()
    await c.load()
    #expect(c.plan?.status == .todo)
    #expect(c.source == .server(EpochMillis(1)))
    #expect(c.makeSession()?.plan.rows.count == 2)
  }

  /// Offline: cache vẫn cho kế hoạch, và lỗi được nói ra.
  @Test func offlineUsesCache() async {
    let c = controller(cache: Cache(["u1": snap(7)]), source: .failure(Down()), history: .failure(Down()))
    await c.load()
    #expect(c.plan?.status == .todo)
    #expect(c.source == .cache(EpochMillis(7)))
    #expect(c.failure == .unavailable)
    #expect(c.failureDetail?.contains("plan") == true)
  }

  /// #334: màn hình chỉ thấy lỗi có kiểu. Mất mạng → `offline` (bật mạng là
  /// sửa được), dù chỉ một phần hỏng vì mạng.
  @Test func offlineIsTyped() async {
    let c = controller(cache: Cache(["u1": snap(7)]), history: .failure(Down()))
    await c.load()
    #expect(c.failure == .unavailable, "lịch sử hỏng không vì mạng")

    let off = TodayController(
      userId: "u1", repository: TodayRepository(source: Throwing(URLError(.notConnectedToInternet)), cache: Cache(["u1": snap(7)])),
      history: History(result: .failure(Down())), workouts: InMemoryWorkoutStore(), clock: monday2pm, timeZone: saigon)
    await off.load()
    #expect(off.failure == .offline)
    #expect(off.plan?.status == .todo, "vẫn tập được từ cache")
  }

  /// #333: cache theo người dùng — đổi tài khoản lúc offline không bao giờ
  /// thấy kế hoạch của người trước.
  @Test func cacheIsPerUser() async {
    let c = TodayController(
      userId: "u2", repository: TodayRepository(source: Throwing(URLError(.notConnectedToInternet)), cache: Cache(["u1": snap(7)])),
      history: History(result: .failure(Down())), workouts: InMemoryWorkoutStore(), clock: monday2pm, timeZone: saigon)
    await c.load()
    #expect(c.plan == nil)
    #expect(c.failure == .offline)
  }

  /// Làm mới thành công thì lỗi cũ biến mất.
  @Test func successClearsFailure() async {
    let source = Flaky()
    let c = TodayController(
      userId: "u1", repository: TodayRepository(source: source, cache: Cache()),
      history: History(result: .success([])), workouts: InMemoryWorkoutStore(), clock: monday2pm, timeZone: saigon)
    await c.load()
    #expect(c.failure == .offline)
    await source.heal()
    await c.refresh()
    #expect(c.failure == nil)
    #expect(c.failureDetail == nil)
  }

  @Test func nothingAnywhereIsNoPlan() async {
    let c = controller(source: .failure(Down()))
    await c.load()
    #expect(c.plan == nil)
    #expect(c.makeSession() == nil)
  }

  @Test func restDayHasNoSession() async {
    let c = controller(source: .success(snap(mondayRest: true)))
    await c.load()
    #expect(c.plan?.status == .rest)
    #expect(c.makeSession() == nil)
  }

  /// Server đã có buổi hôm nay (app RN, máy khác) → done, và màn tập không
  /// cho chốt buổi thứ hai (`logged` của baseline).
  @Test func serverSessionTodayLocksFinish() async throws {
    let c = controller(history: .success([EpochMillis(1_791_170_000_000)]))  // 10:13 Sài Gòn hôm nay
    await c.load()
    #expect(c.plan?.status == .done)
    let s = try #require(c.makeSession())
    await s.load()
    await s.toggle("0-0")
    #expect(s.loggedElsewhere)
    #expect(!s.canFinish)
    await #expect(throws: WorkoutSessionController.FinishRefusal.loggedElsewhere) { try await s.finish() }
  }

  /// Buổi lúc 23:30 UTC hôm trước là 06:30 hôm nay ở Sài Gòn: ngày theo múi
  /// người dùng, không theo UTC.
  @Test func historyDaysAreLocal() async {
    let c = controller(history: .success([EpochMillis(1_791_156_600_000)]))
    await c.load()
    #expect(c.trained.contains(LocalDate("2026-10-05")!))
  }

  /// Chốt trên máy này, offline: hôm nay là done dù server chưa biết.
  @Test func locallyFinishedDayIsDone() async throws {
    let store = InMemoryWorkoutStore()
    let c = controller(history: .failure(Down()), store: store)
    await c.load()
    let s = try #require(c.makeSession())
    await s.load()
    await s.toggle("0-0")
    _ = try await s.finish()
    await c.refresh()
    #expect(c.plan?.status == .done)
  }

  @Test func midnightRollsTheDay() async {
    let clock = ManualClock(EpochMillis(1_791_219_540_000))  // 23:59 Sài Gòn Thứ Hai
    let c = controller(clock: clock)
    await c.load()
    #expect(c.plan?.status == .todo)
    clock.advance(120_000)
    await c.clockTick()
    #expect(c.today == LocalDate("2026-10-06"))
    #expect(c.plan?.status == .unplanned, "Thứ Ba không có hàng routine")
  }
}
