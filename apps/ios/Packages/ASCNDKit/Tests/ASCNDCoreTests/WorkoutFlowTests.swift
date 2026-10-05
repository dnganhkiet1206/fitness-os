import ASCNDCore
import ASCNDTestSupport
import Foundation
import Testing

private struct Down: Error {}

private actor Templates: TemplateSource, TemplateCache {
  var snapshot: TemplateSnapshot
  var cached: TemplateSnapshot?
  private(set) var fetches = 0
  private var down = false
  private var holding = false
  private var parked: [CheckedContinuation<Void, Never>] = []
  init(_ s: TemplateSnapshot) { snapshot = s }
  func set(_ s: TemplateSnapshot) { snapshot = s }
  func setDown(_ d: Bool) { down = d }
  func hold() { holding = true }
  var waiting: Int { parked.count }
  func release() {
    holding = false
    parked.forEach { $0.resume() }
    parked = []
  }
  func fetch(userId: String) async throws -> TemplateSnapshot {
    fetches += 1
    if holding { await withCheckedContinuation { parked.append($0) } }
    // Như URLSession: task bị huỷ thì truy vấn ném, không trả dữ liệu.
    try Task.checkCancellation()
    if down { throw URLError(.notConnectedToInternet) }
    return snapshot
  }
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

  /// Đọc ngày từ máy hỏng lúc mở: ra tiền cảnh lần sau thì đọc lại, cùng buổi.
  @Test func becameActiveRetriesAFailedLoad() async throws {
    let h = Harness()
    // Lần đọc đầu là của Today ("ngày đã chốt trên máy?"), lần hai của buổi.
    await h.store.failNextLoad(2)
    await h.flow.start()
    let s = try #require(h.flow.session)
    #expect(s.loadFailed)
    await h.flow.becameActive()
    #expect(h.flow.session === s)
    #expect(!s.loadFailed)
    #expect(s.phase == .idle)
  }

  // MARK: làm mới (#333) — luật của baseline: staleTime 1 phút, làm mới khi
  // ra tiền cảnh (`focusManager` ↔ `AppState`) và khi có mạng lại.

  /// Template sửa ở máy khác hiện ra khi quay lại app sau hơn một phút —
  /// không cần kéo làm mới. Trong vòng một phút: không bắn truy vấn.
  @Test func foregroundRefreshesOnlyWhenStale() async throws {
    let h = Harness()
    await h.flow.start()
    #expect(await h.templates.fetches == 1)
    await h.templates.set(snap(template(sets: 3)))

    h.clock.advance(30_000)
    await h.flow.becameActive()
    #expect(await h.templates.fetches == 1)
    #expect(try #require(h.flow.session).plan.rows.count == 2)

    h.clock.advance(31_000)
    await h.flow.becameActive()
    #expect(await h.templates.fetches == 2)
    #expect(try #require(h.flow.session).plan.rows.count == 3)
  }

  /// Lần làm mới hỏng thì dữ liệu vẫn "cũ": lần ra tiền cảnh kế tiếp thử lại
  /// ngay, không đợi thêm một phút.
  @Test func failedRefreshStaysStale() async {
    let h = Harness()
    await h.templates.setDown(true)
    await h.flow.start()
    #expect(h.flow.isStale)
    #expect(h.flow.today.failure == .offline)
    await h.templates.setDown(false)
    await h.flow.becameActive()
    #expect(await h.templates.fetches == 2)
    #expect(!h.flow.isStale)
    #expect(h.flow.session != nil)
  }

  @Test func reconnectRefreshesOnlyWhenStale() async {
    let h = Harness()
    await h.flow.start()
    await h.flow.reconnected()
    #expect(await h.templates.fetches == 1)
    h.clock.advance(60_000)
    await h.flow.reconnected()
    #expect(await h.templates.fetches == 2)
  }

  /// Kéo làm mới đúng lúc ra tiền cảnh: một lượt truy vấn, không phải hai.
  @Test func overlappingRefreshesShareOneFetch() async {
    let h = Harness()
    await h.flow.start()
    await h.templates.hold()
    async let a: Void = h.flow.refresh()
    async let b: Void = h.flow.refresh()
    while await h.templates.waiting == 0 { await Task.yield() }
    await h.templates.release()
    _ = await (a, b)
    #expect(await h.templates.fetches == 2)
  }

  /// Ra tiền cảnh trong lúc lượt tải đầu tiên còn đang bay (mở app): chờ
  /// chung lượt ấy, không bắn lượt thứ hai (`freshAt` lúc đó còn trống).
  @Test func foregroundDuringStartSharesTheFirstLoad() async {
    let h = Harness()
    await h.templates.hold()
    async let start: Void = h.flow.start()
    while await h.templates.waiting == 0 { await Task.yield() }
    async let active: Void = h.flow.becameActive()
    for _ in 0..<50 { await Task.yield() }
    await h.templates.release()
    _ = await (start, active)
    #expect(await h.templates.fetches == 1)
    #expect(h.flow.session != nil)
  }

  /// Template bị xoá trên server: ngày thành "chưa lên lịch", buổi chưa chạm
  /// biến mất; buổi đang tập dở thì ở lại.
  @Test func deletedTemplatePropagates() async throws {
    let h = Harness()
    await h.flow.start()
    let gone = TemplateSnapshot(
      routine: [RoutineDay(dayOfWeek: 0, isRest: false, templateId: "tpl")], templates: [], fetchedAt: EpochMillis(2))
    await h.templates.set(gone)
    await h.flow.refresh()
    #expect(h.flow.today.plan?.status == .unplanned)
    #expect(h.flow.session == nil)
    #expect(await h.templates.cached == gone, "cache theo server, mở offline không hồi sinh template đã xoá")
  }

  @Test func deletedTemplateKeepsAnActiveSession() async throws {
    let h = Harness()
    await h.flow.start()
    let s = try #require(h.flow.session)
    await s.toggle("0-0")
    await h.templates.set(TemplateSnapshot(routine: [], templates: [], fetchedAt: EpochMillis(2)))
    await h.flow.refresh()
    #expect(h.flow.session === s)
  }

  /// #335: phiên kết thúc khi lượt làm mới còn đang bay → lượt ấy bị huỷ,
  /// không ghi kế hoạch của người vừa rời đi vào cache; flow đã đóng không
  /// làm mới nữa.
  @Test func closeCancelsInFlightRefresh() async {
    let h = Harness()
    await h.flow.start()
    let before = await h.templates.cached
    await h.templates.set(snap(template(sets: 3)))
    await h.templates.hold()
    let refresh = Task { await h.flow.refresh() }
    while await h.templates.waiting == 0 { await Task.yield() }
    h.flow.close()
    await h.templates.release()
    await refresh.value
    #expect(await h.templates.cached == before)

    h.clock.advance(120_000)
    await h.flow.becameActive()
    await h.flow.reconnected()
    #expect(await h.templates.fetches == 2, "đã đóng thì không truy vấn nữa")
  }

  /// Phiên kết thúc khi lượt tải ĐẦU TIÊN còn bay: `close()` huỷ cả lượt ấy
  /// (nó chạy trong `refreshing`, không còn là con của `.task` của SwiftUI).
  @Test func closeCancelsTheFirstLoad() async {
    let h = Harness()
    await h.templates.hold()
    async let start: Void = h.flow.start()
    while await h.templates.waiting == 0 { await Task.yield() }
    h.flow.close()
    await h.templates.release()
    await start
    #expect(await h.templates.cached == nil, "không ghi kế hoạch của phiên đã đóng")
    #expect(h.flow.session == nil)
  }

  /// Đề xuất audit của C (#364): các lượt dựng màn chạy nối tiếp. Buổi thứ
  /// Hai đang tập dở trên đĩa, đang được đọc lên thì qua nửa đêm (ra tiền
  /// cảnh): lượt dựng thứ Ba phải chờ buổi thứ Hai đọc xong — thấy nó `.active`
  /// thì giữ, không coi `.loading` là "chưa chạm" mà thay mất.
  @Test func installsAreSerializedAcrossMidnight() async throws {
    var p = DayProgress()
    p.done = ["0-0": true]
    let key = DayProgressStore.key(date: monday, templateId: "tpl")
    let h = Harness(store: InMemoryWorkoutStore(days: [key: DayState(progress: p)]))
    h.clock.advance(35_970_000)  // 23:59:30 thứ Hai
    // Lần đọc đầu của khoá là của Today ("đã chốt trên máy?"), lần hai của buổi.
    await h.store.holdLoad(of: key, after: 1)
    async let start: Void = h.flow.start()
    while await h.store.heldLoads == 0 { await Task.yield() }
    h.clock.advance(40_000)  // 00:00:10 thứ Ba — dữ liệu chưa cũ, không làm mới
    async let active: Void = h.flow.becameActive()
    for _ in 0..<50 { await Task.yield() }
    await h.store.releaseLoad()
    _ = await (start, active)
    let s = try #require(h.flow.session)
    #expect(s.plan.date == monday, "buổi đang tập dở không bị thay")
    #expect(s.phase == .active)
  }

  @Test func finishWithoutSessionRefuses() async {
    let h = Harness(snap(rest: true))
    await h.flow.start()
    await #expect(throws: WorkoutSessionController.FinishRefusal.loading) { try await h.flow.finish() }
  }
}

// MARK: - đầu-cuối: màn tập → máy → outbox → sync → server (#332)

/// Các mảnh thật nối như trong app (`AppServices`): một store giữ cả ngày lẫn
/// outbox (như một tệp SQLite), `SyncWorker` thật, server giả có bảng
/// `workout_sessions`. "Kill app" = vứt flow + worker, giữ store và server.
@MainActor
private final class Pipeline {
  let clock = ManualClock(EpochMillis(mondayAt2pm))
  let store = InMemoryWorkoutStore()
  let server = FakeServer()
  let templates = Templates(snap(template(sets: 3)))
  let caches = Caches()
  private(set) var flow: WorkoutFlow!
  private(set) var worker: SyncWorker!

  init(online: Bool = true) { launch(online: online) }

  /// Mở app (lần đầu, hoặc sau khi bị kill).
  func launch(online: Bool) {
    let worker = SyncWorker(store: store, remote: server, clock: clock, online: online, signedInUser: "u1", sleep: clock.sleeper)
    self.worker = worker
    let today = TodayController(
      userId: "u1", repository: TodayRepository(source: templates, cache: templates), history: NoHistory(),
      workouts: store, clock: clock, timeZone: saigon)
    flow = WorkoutFlow(
      today: today, records: RecordBook(userId: "u1", history: NoHistory(), cache: caches),
      performance: PerformanceBook(userId: "u1", source: NoHistory(), cache: caches, clock: clock, timeZone: saigon),
      store: store, clock: clock, timeZone: saigon, onEnqueued: { _ in worker.kick() })
  }

  /// `AppServices.start()`: thử gửi hàng đợi ngay khi mở.
  func start() async {
    await flow.start()
    worker.kick()
    await worker.settle()
  }

  func sets(_ id: String) async -> Int? {
    if case .array(let a)? = await server.table[id]?["sets"] { return a.count }
    return nil
  }
}

@MainActor
struct WorkoutPipelineTests {
  /// Chốt lúc offline → app bị kill → mở lại có mạng: buổi lên server đúng
  /// MỘT lần, hàng đợi trống.
  @Test func offlineFinishSurvivesKillAndLandsOnce() async throws {
    let p = Pipeline(online: false)
    await p.start()
    let s = try #require(p.flow.session)
    await s.toggle("0-0")
    let summary = try await p.flow.finish()
    await p.worker.settle()
    #expect(await p.server.table.isEmpty)
    #expect(await p.store.outbox.map(\.id) == [summary.sessionId], "bền trên máy trước khi gửi")

    p.launch(online: true)
    await p.start()
    #expect(await p.server.table.keys.sorted() == [summary.sessionId])
    #expect(await p.store.outbox.isEmpty)
    #expect(p.flow.session?.loggedSessionId == summary.sessionId, "mở lại vẫn là buổi đã chốt")
  }

  /// Server đã ghi nhưng phản hồi mất (timeout): gửi lại không thành hàng
  /// thứ hai.
  @Test func lostResponseIsRetriedNotDuplicated() async throws {
    let p = Pipeline(online: false)
    await p.start()
    let s = try #require(p.flow.session)
    await s.toggle("0-0")
    let summary = try await p.flow.finish()
    await p.server.script(summary.sessionId, .lostResponse)
    p.worker.setOnline(true)
    await p.worker.settle()
    #expect(await p.server.attempts == [summary.sessionId, summary.sessionId])
    #expect(await p.server.table.count == 1)
    #expect(await p.store.outbox.isEmpty)
  }

  /// Chạm đúp "Chốt": một buổi, một hàng outbox, một hàng server.
  @Test func doubleTapFinishIsOneSession() async throws {
    let p = Pipeline()
    await p.start()
    let s = try #require(p.flow.session)
    await s.toggle("0-0")
    async let a = try? p.flow.finish()
    async let b = try? p.flow.finish()
    let ids = await [a, b].compactMap { $0?.sessionId }
    await p.worker.settle()
    #expect(Set(ids).count == 1)
    #expect(await p.server.table.count == 1)
  }

  /// #398: chốt có mạng → gỡ set cuối cùng lúc offline → kill → mở lại có
  /// mạng: hàng biến khỏi server; trong lúc chờ, hôm nay đã thôi "đã tập" và
  /// "lần trước" không còn trỏ vào buổi đã xoá.
  @Test func removingTheLastSetOfflineDeletesTheRowAfterKill() async throws {
    let p = Pipeline()
    await p.start()
    let s = try #require(p.flow.session)
    await s.toggle("0-0")
    let summary = try await p.flow.finish()
    await p.worker.settle()
    await p.flow.settled()
    #expect(await p.server.table.keys.sorted() == [summary.sessionId])
    #expect(p.flow.today.plan?.status == .done)
    #expect(p.flow.performance.last(for: "Bench") != nil)

    p.worker.setOnline(false)
    let removal = try await s.removeLoggedSet("0-0")
    #expect(removal.deletedSession)
    await p.flow.settled()
    #expect(p.flow.today.plan?.status == .todo, "local-first: thôi đã tập ngay")
    #expect(p.flow.performance.last(for: "Bench") == nil)

    p.launch(online: true)
    await p.start()
    #expect(await p.server.table.isEmpty)
    #expect(await p.store.outbox.isEmpty)
    #expect(p.flow.today.plan?.status == .todo)
  }

  /// Gỡ rồi hoàn tác trước khi có mạng: server nhận đủ ba lệnh theo thứ tự và
  /// kết thúc với hàng đầy đủ — không mất set.
  @Test func undoBeforeSyncKeepsTheSession() async throws {
    let p = Pipeline(online: false)
    await p.start()
    let s = try #require(p.flow.session)
    await s.toggle("0-0")
    await s.toggle("0-1")
    let summary = try await p.flow.finish()
    let removal = try await s.removeLoggedSet("0-1")
    try await s.undo(removal)
    p.worker.setOnline(true)
    await p.worker.settle()
    #expect(await p.server.attempts == [summary.sessionId, "\(summary.sessionId)@r1", "\(summary.sessionId)@r2"])
    #expect(await p.sets(summary.sessionId) == 2)
  }

  /// Chốt → nối thêm set lúc offline → kill → mở lại có mạng: hàng trên server
  /// có đủ mọi set, theo đúng thứ tự gửi (gốc trước, bản ghi lại sau).
  @Test func appendAfterKillReachesTheSameRow() async throws {
    let p = Pipeline(online: false)
    await p.start()
    let s = try #require(p.flow.session)
    await s.toggle("0-0")
    await s.toggle("0-1")
    let summary = try await p.flow.finish()
    await s.toggle("0-2")
    _ = try await p.flow.append()

    p.launch(online: true)
    await p.start()
    #expect(await p.server.table.keys.sorted() == [summary.sessionId])
    #expect(await p.sets(summary.sessionId) == 3)
    #expect(await p.server.attempts.first == summary.sessionId)
    #expect(await p.store.outbox.isEmpty)
  }
}
