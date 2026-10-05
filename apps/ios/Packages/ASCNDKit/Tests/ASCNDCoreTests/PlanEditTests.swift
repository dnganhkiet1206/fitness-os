import ASCNDCore
import ASCNDTestSupport
import Foundation
import Testing

/// Ghi kế hoạch (#401) — contract D-26 (`spec/vectors/template-write.json`).

/// `TemplateSource` đọc thẳng các bảng của `FakeServer` — làm mới là thấy đúng
/// thứ server đã nhận, không hơn.
private actor ServerPlan: TemplateSource, TemplateCache {
  let server: FakeServer
  var cached: TemplateSnapshot?
  private var down = false
  private var holding = false
  private var parked: [CheckedContinuation<Void, Never>] = []
  init(_ server: FakeServer) { self.server = server }
  func setDown(_ d: Bool) { down = d }
  func hold() { holding = true }
  var waiting: Int { parked.count }
  func release() {
    holding = false
    parked.forEach { $0.resume() }
    parked = []
  }
  func fetch(userId: String) async throws -> TemplateSnapshot {
    if holding { await withCheckedContinuation { parked.append($0) } }
    if down { throw URLError(.notConnectedToInternet) }
    let routine = await server.routine.values.compactMap { row -> RoutineDay? in
      guard let d = row["day_of_week"]?.intValue else { return nil }
      return RoutineDay(
        dayOfWeek: d, isRest: row["is_rest"]?.boolValue ?? false, isDeload: row["is_deload"]?.boolValue ?? false,
        templateId: row["template_id"]?.stringValue)
    }.sorted { $0.dayOfWeek < $1.dayOfWeek }
    let templates = await server.templates.values.map {
      WorkoutTemplate(
        id: $0["id"]?.stringValue ?? "", name: $0["name"]?.stringValue ?? "", exercisesJSON: $0["exercises"],
        type: $0["type"]?.stringValue, createdAt: EpochMillis(1))
    }
    return TemplateSnapshot(routine: routine, templates: templates, fetchedAt: EpochMillis(2))
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
  func load(userId: String) async throws -> PersonalRecords.Bests? { nil }
  func save(userId: String, _ bests: PersonalRecords.Bests) async throws {}
  func load(userId: String) async throws -> [String: LastPerformance]? { nil }
  func save(userId: String, _ table: [String: LastPerformance]) async throws {}
}

private let saigon = TimeZone(identifier: "Asia/Ho_Chi_Minh")!
/// 2026-10-05 (Thứ Hai = ngày 0) 14:00 Sài Gòn.
private let mondayAt2pm: Int64 = 1_791_183_600_000

private let bench = TemplateExercise(exerciseId: "ex-bench", exerciseName: "Bench Press", sets: 3, reps: 8, weightKg: 82.5)
private let squat = TemplateExercise(exerciseName: "Squat", sets: 2, reps: 5, weightKg: 100, rpe: 8, restSeconds: 180)

@MainActor
private final class Harness {
  let clock = ManualClock(EpochMillis(mondayAt2pm))
  let store = InMemoryWorkoutStore()
  let server = FakeServer()
  let plan: ServerPlan
  private(set) var flow: WorkoutFlow!
  var enqueued: [OutboxEntry] = []

  init() {
    plan = ServerPlan(server)
    flow = make()
  }

  /// Một flow mới trên cùng máy (cùng outbox, cùng cache) — như mở app lần nữa.
  func make() -> WorkoutFlow {
    let today = TodayController(
      userId: "u1", repository: TodayRepository(source: plan, cache: plan, edits: store), history: NoHistory(),
      workouts: store, clock: clock, timeZone: saigon)
    return WorkoutFlow(
      today: today, records: RecordBook(userId: "u1", history: NoHistory(), cache: Caches()),
      performance: PerformanceBook(userId: "u1", source: NoHistory(), cache: Caches(), clock: clock, timeZone: saigon),
      store: store, planStore: store, clock: clock, timeZone: saigon,
      onEnqueued: { [unowned self] in enqueued.append($0) })
  }

  func reopen() { flow = make() }

  var editor: PlanEditor { flow.plan! }

  /// Gửi hết hàng đợi lên server giả.
  func sync() async -> SyncWorker {
    let w = SyncWorker(store: store, remote: server, clock: clock, signedInUser: "u1", sleep: clock.sleeper)
    w.kick()
    await w.settle()
    return w
  }

  /// Server có sẵn template `id` gán cho Thứ Hai.
  func seed(_ id: String = "tpl-old", exercises: [TemplateExercise] = [squat]) async throws {
    try await editor.create(id: id, name: "Legs", exercises: exercises, scheduleOn: 0)
    _ = await sync()
    await flow.refresh()
  }
}

@MainActor
struct PlanEditTests {
  /// TW-1a: hàng tạo template — đủ `user_id`, tên đã cắt, `type` thiếu → custom,
  /// `exercises` theo hình của builder; đọc lại ra đúng bài.
  @Test func createPayloadMatchesBaseline() async throws {
    let h = Harness()
    await h.flow.start()
    try await h.editor.create(id: "TPL-A", name: "  Push Day ", type: " ", exercises: [bench, squat])
    let e = try #require(await h.store.outbox.first)
    #expect(e.kind == PlanEdit.templateKind)
    #expect(e.id == "tpl-a", "id do máy sinh, chữ thường như uuid của Postgres")
    #expect(e.payload["id"]?.stringValue == "tpl-a")
    #expect(e.payload["user_id"]?.stringValue == "u1")
    #expect(e.payload["name"]?.stringValue == "Push Day")
    #expect(e.payload["type"]?.stringValue == "custom")
    guard case .array(let list)? = e.payload["exercises"], list.count == 2 else {
      Issue.record("exercises không phải mảng hai bài")
      return
    }
    #expect(list[0]["exerciseId"]?.stringValue == "ex-bench")
    #expect(list[0]["weight"]?.doubleValue == 82.5)
    #expect(list[1]["exerciseId"] == nil, "không có id thì bỏ trường")
    #expect(list.map(TemplateExercise.init(json:)) == [bench, squat], "đọc lại bằng chính bộ đọc của màn tập")
  }

  /// TW-5a: bấm Lưu ba lần với cùng id → một hàng outbox, một template, cả
  /// trên máy lẫn trên server.
  @Test func createIsIdempotentById() async throws {
    let h = Harness()
    await h.flow.start()
    let id = h.editor.newTemplateId()
    for _ in 0..<3 { try await h.editor.create(id: id, name: "Push", exercises: [bench]) }
    #expect(await h.store.outbox.count == 1)
    #expect(h.flow.today.library?.templates.filter { $0.id == id }.count == 1)
    _ = await h.sync()
    #expect(await h.server.templates.count == 1)
  }

  /// TW-5b + TW-6b: builder mở từ Plan — tạo và gán ngày là một giao dịch, tạo
  /// đứng trước; Today thấy buổi mới NGAY, chưa cần mạng.
  @Test func createAndScheduleShowsTodayAtOnceAndSendsInOrder() async throws {
    let h = Harness()
    await h.flow.start()
    #expect(h.flow.today.plan?.status == .unplanned)
    try await h.editor.create(id: "tpl-a", name: "Push", exercises: [bench], scheduleOn: 0)
    #expect(await h.store.outbox.map(\.kind) == [PlanEdit.templateKind, PlanEdit.routineDayKind])
    #expect(h.flow.today.plan?.status == .todo)
    #expect(h.flow.today.plan?.template?.id == "tpl-a")
    #expect(h.flow.session?.plan.templateId == "tpl-a", "màn tập dựng ngay cho buổi mới")
    let day = try #require(await h.store.outbox.last)
    #expect(day.payload == .object([
      "user_id": .string("u1"), "day_of_week": .number(0), "template_id": .string("tpl-a"),
      "is_rest": .bool(false), "is_deload": .bool(false),
    ]))
    let w = await h.sync()
    #expect(w.deadCount == 0, "gán sau tạo: khoá ngoại thoả")
    #expect(await h.server.routine[0]?["template_id"]?.stringValue == "tpl-a")
  }

  /// TW-2a/2b: gán lại cùng ngày ghi đè — một hàng mỗi ngày; deload giữ nguyên.
  @Test func reassignOverwritesTheDayAndKeepsDeload() async throws {
    let h = Harness()
    try await h.seed()
    try await h.editor.setDeload(day: 0, true)
    try await h.editor.create(id: "tpl-b", name: "Push", exercises: [bench])
    try await h.editor.assign(day: 0, templateId: "tpl-b")
    #expect(h.flow.today.plan?.template?.id == "tpl-b")
    #expect(h.flow.today.plan?.isDeload == true)
    _ = await h.sync()
    #expect(await h.server.routine.count == 1)
    #expect(await h.server.routine[0]?["template_id"]?.stringValue == "tpl-b")
    #expect(await h.server.routine[0]?["is_deload"]?.boolValue == true)
  }

  /// TW-2c: bỏ template khỏi ngày = ngày nghỉ (`is_rest: !templateId`), hàng
  /// ngày vẫn còn.
  @Test func clearingADayMakesItRest() async throws {
    let h = Harness()
    try await h.seed()
    try await h.editor.assign(day: 0, templateId: nil)
    #expect(h.flow.today.plan?.status == .rest)
    #expect(h.flow.session == nil)
    _ = await h.sync()
    #expect(await h.server.routine[0]?["template_id"] == .null)
    #expect(await h.server.routine[0]?["is_rest"]?.boolValue == true)
  }

  /// Deload trên ngày chưa có hàng: ngày nghỉ, như `toggleDeload` của baseline.
  @Test func deloadOnAnEmptyDayIsARestDay() async throws {
    let h = Harness()
    await h.flow.start()
    try await h.editor.setDeload(day: 3, true)
    let row = try #require(h.flow.today.library?.day(3))
    #expect(row.isRest && row.isDeload && row.templateId == nil)
  }

  /// TW-3a + cascade: xoá template → nó và các ngày trỏ vào nó biến mất ngay
  /// (ngày thành chưa lên lịch); server làm đúng như thế.
  @Test func deleteCascadesToItsDays() async throws {
    let h = Harness()
    try await h.seed()
    try await h.editor.delete(templateId: "tpl-old")
    let e = try #require(await h.store.outbox.last)
    #expect(e.kind == PlanEdit.templateDeleteKind && e.id.hasPrefix("tpl-old@del-"))
    #expect(h.flow.today.library?.templates.isEmpty == true)
    #expect(h.flow.today.plan?.status == .unplanned)
    _ = await h.sync()
    await h.flow.refresh()
    let (templates, routine) = (await h.server.templates, await h.server.routine)
    #expect(templates.isEmpty && routine.isEmpty)
    #expect(h.flow.today.plan?.status == .unplanned)
  }

  /// Làm mới khi lệnh chưa gửi: bản server chưa có nó, nhưng màn không quay
  /// về kế hoạch cũ. Gửi xong rồi làm mới: vẫn đúng, giờ từ server.
  @Test func refreshKeepsUnsentEdits() async throws {
    let h = Harness()
    try await h.seed()
    try await h.editor.create(id: "tpl-b", name: "Push", exercises: [bench], scheduleOn: 0)
    await h.flow.refresh()
    #expect(h.flow.today.plan?.template?.id == "tpl-b", "server chưa có — lệnh trong outbox vẫn áp")
    await h.plan.setDown(true)
    await h.flow.refresh()
    #expect(h.flow.today.plan?.template?.id == "tpl-b", "offline: giữ nguyên")
    await h.plan.setDown(false)
    _ = await h.sync()
    await h.flow.refresh()
    #expect(h.flow.today.plan?.template?.id == "tpl-b")
    #expect(await h.store.outbox.isEmpty)
  }

  /// Sửa trong lúc lượt làm mới đang bay: lượt ấy đọc outbox TRƯỚC lệnh mới
  /// và server trả bản chưa có nó — kết quả của nó không được xoá lệnh mới.
  @Test func editDuringRefreshSurvivesIt() async throws {
    let h = Harness()
    try await h.seed()
    await h.plan.hold()
    let refresh = Task { await h.flow.refresh() }
    while await h.plan.waiting == 0 { await Task.yield() }
    try await h.editor.create(id: "tpl-b", name: "Push", exercises: [bench], scheduleOn: 0)
    await h.plan.release()
    await refresh.value
    #expect(h.flow.today.plan?.template?.id == "tpl-b")
  }

  /// Mở lại app khi lệnh còn trong outbox: cache chỉ có bản server, kế hoạch
  /// vẫn có sửa đổi — kể cả khi server không trả lời.
  @Test func reopeningShowsUnsentEdits() async throws {
    let h = Harness()
    try await h.seed()
    try await h.editor.create(id: "tpl-b", name: "Push", exercises: [bench], scheduleOn: 0)
    await h.plan.setDown(true)
    h.reopen()
    await h.flow.start()
    #expect(h.flow.today.plan?.template?.id == "tpl-b")
    #expect(h.flow.today.library?.templates.count == 2)
  }

  /// Chưa từng đọc được kế hoạch (offline từ lần mở đầu) mà vẫn tạo được buổi.
  @Test func editsWorkWithoutAnyServerSnapshot() async throws {
    let h = Harness()
    await h.plan.setDown(true)
    await h.flow.start()
    #expect(h.flow.today.plan == nil)
    try await h.editor.create(id: "tpl-a", name: "Push", exercises: [bench], scheduleOn: 0)
    #expect(h.flow.today.plan?.status == .todo)
  }

  /// TW-6a: đổi kế hoạch của hôm nay không đụng buổi đang tập dở.
  @Test func activeSessionIsNotReplaced() async throws {
    let h = Harness()
    try await h.seed()
    let session = try #require(h.flow.session)
    _ = await session.toggle("0-0")
    try await h.editor.create(id: "tpl-b", name: "Push", exercises: [bench], scheduleOn: 0)
    #expect(h.flow.today.plan?.template?.id == "tpl-b")
    #expect(h.flow.session === session)
    #expect(session.plan.templateId == "tpl-old")
  }

  /// RN BUG (xem `templateDetached`): xoá template giữa buổi rồi chốt — buổi
  /// không trỏ vào hàng đã mất, server nhận, không vào `dead`.
  @Test func deletedTemplateDetachesTheOpenSession() async throws {
    let h = Harness()
    try await h.seed()
    let session = try #require(h.flow.session)
    _ = await session.toggle("0-0")
    try await h.editor.delete(templateId: "tpl-old")
    #expect(h.flow.session === session, "buổi đang tập vẫn mở")
    #expect(session.templateDetached)
    _ = try await h.flow.finish()
    let row = try #require(await h.store.outbox.last(where: { $0.kind == WorkoutSessionRecord.outboxKind }))
    #expect(row.payload["template_id"] == .null)
    let w = await h.sync()
    #expect(w.deadCount == 0)
    #expect(await h.server.table[row.id] != nil)
  }

  /// Đối chứng cho test trên: chính server giả từ chối buổi trỏ vào template
  /// đã xoá — đó là thứ đã xảy ra ở baseline.
  @Test func serverRejectsASessionPointingAtADeletedTemplate() async throws {
    let h = Harness()
    try await h.seed()
    try await h.editor.delete(templateId: "tpl-old")
    _ = await h.sync()
    let stale = OutboxEntry(
      id: "s-stale", userId: "u1", kind: WorkoutSessionRecord.outboxKind,
      payload: .object(["id": .string("s-stale"), "template_id": .string("tpl-old")]), createdAt: EpochMillis(0))
    await #expect(throws: WriteFailure.server(code: "23503")) { try await h.server.send(stale) }
  }

  /// Buổi của template KHÁC không bị tách.
  @Test func deletingAnotherTemplateLeavesTheSessionAlone() async throws {
    let h = Harness()
    try await h.seed()
    try await h.editor.create(id: "tpl-b", name: "Push", exercises: [bench])
    let session = try #require(h.flow.session)
    _ = await session.toggle("0-0")
    try await h.editor.delete(templateId: "tpl-b")
    #expect(!session.templateDetached)
  }

  @Test func refusals() async throws {
    let h = Harness()
    try await h.seed()
    await #expect(throws: PlanEditor.Refusal.emptyName) {
      try await h.editor.create(id: "x", name: "   ", exercises: [bench])
    }
    await #expect(throws: PlanEditor.Refusal.noExercises) {
      try await h.editor.create(id: "x", name: "Push", exercises: [])
    }
    await #expect(throws: PlanEditor.Refusal.invalidDay) {
      try await h.editor.create(id: "x", name: "Push", exercises: [bench], scheduleOn: 7)
    }
    await #expect(throws: PlanEditor.Refusal.invalidDay) { try await h.editor.assign(day: -1, templateId: nil) }
    await #expect(throws: PlanEditor.Refusal.unknownTemplate) { try await h.editor.assign(day: 1, templateId: "nope") }
    await #expect(throws: PlanEditor.Refusal.unknownTemplate) { try await h.editor.delete(templateId: "nope") }
    try await h.editor.delete(templateId: "tpl-old")
    // Gán vào template vừa xoá: server sẽ từ chối (FK) và lệnh vào `dead`.
    await #expect(throws: PlanEditor.Refusal.unknownTemplate) {
      try await h.editor.assign(day: 1, templateId: "tpl-old")
    }
    #expect(await h.store.outbox.count == 1, "lệnh bị từ chối không ghi gì")
  }

  /// Ghi máy hỏng: báo lỗi, kế hoạch không đổi.
  @Test func storageFailureChangesNothing() async throws {
    let h = Harness()
    await h.flow.start()
    await h.store.failNext()
    await #expect(throws: PlanEditor.Refusal.self) {
      try await h.editor.create(id: "tpl-a", name: "Push", exercises: [bench], scheduleOn: 0)
    }
    #expect(h.flow.today.plan?.status == .unplanned)
    #expect(h.enqueued.isEmpty)
  }

  /// Mỗi hàng vừa bền đều tới vòng sync (app gọi `sync.kick()`).
  @Test func everyEntryReachesSync() async throws {
    let h = Harness()
    await h.flow.start()
    try await h.editor.create(id: "tpl-a", name: "Push", exercises: [bench], scheduleOn: 2)
    #expect(h.enqueued.map(\.kind) == [PlanEdit.templateKind, PlanEdit.routineDayKind])
  }

  /// Áp lại lệnh server đã nhận không đổi gì.
  @Test func applyingIsIdempotent() async throws {
    let h = Harness()
    await h.flow.start()
    try await h.editor.create(id: "tpl-a", name: "Push", exercises: [bench], scheduleOn: 0)
    try await h.editor.delete(templateId: "tpl-a")
    let entries = await h.store.outbox
    let base = TemplateSnapshot(routine: [], templates: [], fetchedAt: EpochMillis(0))
    let once = base.applying(entries)
    #expect(once.applying(entries) == once)
    #expect(once.templates.isEmpty && once.routine.isEmpty)
  }

  @Test func listIsNewestFirstWithUnsyncedOnTop() {
    let t = { (id: String, at: Int64?) in
      WorkoutTemplate(id: id, name: id, exercises: [], createdAt: at.map(EpochMillis.init))
    }
    let sorted = [t("a", 1), t("b", 3), t("new", nil), t("c", 2)].sorted(by: WorkoutTemplate.newestFirst)
    #expect(sorted.map(\.id) == ["new", "b", "c", "a"])
  }

  /// Cache cũ (trước #401) không có `type` / `createdAt` vẫn đọc được.
  @Test func oldCacheStillDecodes() throws {
    let json = #"{"id":"t","name":"Push","exercises":[]}"#
    let t = try JSONDecoder().decode(WorkoutTemplate.self, from: Data(json.utf8))
    #expect(t.type == nil && t.createdAt == nil)
  }
}

/// Bản sao template (#430): "Thử workout" — hành động sao chép duy nhất của RN
/// (`workoutFromPost`) — và các bất biến chống trùng id / ghi đè.
@MainActor
struct TemplateCopyTests {
  private let lines = [
    SharedWorkoutLine(exerciseId: "ex-bench", exerciseName: "Bench Press", library: true, sets: 4, reps: 6),
    SharedWorkoutLine(exerciseId: "ex-mine", exerciseName: "My Curl", library: false, sets: 3, reps: 12),
    SharedWorkoutLine(exerciseId: nil, exerciseName: "Typed Row", library: true, sets: 3, reps: 10),
    SharedWorkoutLine(exerciseId: "ex-dip", exerciseName: "Dips", library: true, sets: 0, reps: -2),
  ]

  /// `workoutFromPost`: chỉ bài thư viện có id, tạ về 0, sets/reps ≥ 1, đếm bài bỏ.
  @Test func sharedWorkoutKeepsStructureNotLoad() {
    let d = TemplateCopy.fromShared(title: nil, lines: lines, fallbackName: "Buổi tập")
    #expect(d.name == "Buổi tập" && d.skipped == 2)
    #expect(d.exercises.map(\.exerciseId) == ["ex-bench", "ex-dip"])
    #expect(d.exercises.allSatisfy { $0.weightKg == 0 })
    #expect(d.exercises[1].sets == 1 && d.exercises[1].reps == 1)
    #expect(TemplateCopy.fromShared(title: "Push A", lines: [], fallbackName: "x").name == "Push A")
  }

  /// Thử: template MỚI loại `community`, không gán ngày; bấm lại cùng id là
  /// idempotent — kể cả sau khi đã lên server và làm mới.
  @Test func tryCreatesACommunityTemplateIdempotently() async throws {
    let h = Harness()
    await h.flow.start()
    let (t, skipped) = try await h.editor.copyShared(id: "TRY-1", title: "Push A", lines: lines, fallbackName: "x")
    #expect(t.id == "try-1" && t.type == "community" && skipped == 2)
    _ = try await h.editor.copyShared(id: "try-1", title: "Push A", lines: lines, fallbackName: "x")
    #expect(await h.store.outbox.count == 1)
    #expect(await h.store.outbox.allSatisfy { $0.kind == PlanEdit.templateKind }, "không gán ngày")
    _ = await h.sync()
    await h.flow.refresh()
    _ = try await h.editor.copyShared(id: "try-1", title: "Push A", lines: lines, fallbackName: "x")
    #expect(await h.server.templates.count == 1)
    await #expect(throws: PlanEditor.Refusal.noExercises) {
      _ = try await h.editor.copyShared(id: "try-2", title: nil, lines: [lines[1]], fallbackName: "x")
    }
  }

  /// Bất biến chống trùng (âm): id đã là của template KHÁC nội dung → từ chối.
  /// Trước #430 lệnh "tạo" trả về template CŨ, hàng mới bị server bỏ trùng và
  /// gán ngày trỏ vào template cũ — người dùng tưởng có template mới.
  @Test func reusingAnIdForDifferentContentIsRefused() async throws {
    let h = Harness()
    try await h.seed("tpl-old", exercises: [squat])
    let before = await h.server.attempts.count
    await #expect(throws: PlanEditor.Refusal.idInUse) {
      _ = try await h.editor.create(id: "tpl-old", name: "Legs", exercises: [bench], scheduleOn: 1)
    }
    await #expect(throws: PlanEditor.Refusal.idInUse) {
      _ = try await h.editor.create(id: "TPL-OLD", name: "Other", exercises: [squat])
    }
    #expect(await h.store.outbox.isEmpty, "không có hàng nào vào hàng đợi")
    #expect(await h.server.attempts.count == before)
    // Cùng nội dung (gửi lại sau khi đã lên server) vẫn được.
    _ = try await h.editor.create(id: "tpl-old", name: "Legs", exercises: [squat])
    // Kể cả khi đọc lại làm tròn: 61.234 kg lên server là 61.23 — vẫn là cùng
    // một template, không phải "id của template khác".
    let odd = TemplateExercise(exerciseName: "Row", sets: 3, reps: 8, weightKg: 61.234)
    _ = try await h.editor.create(id: "tpl-row", name: "Row", exercises: [odd])
    _ = await h.sync()
    await h.flow.refresh()
    _ = try await h.editor.create(id: "tpl-row", name: "Row", exercises: [odd])
  }

  /// Bản sao độc lập với nguồn: xoá nguồn không chạm bản sao; gán lại ngày
  /// sang bản sao không đổi buổi đang tập dở (TW-6a).
  @Test func copyIsIndependentAndActiveSessionIsIsolated() async throws {
    let h = Harness()
    try await h.seed("tpl-old", exercises: [squat, bench])
    let session = try #require(h.flow.session)
    #expect(session.plan.templateId == "tpl-old")
    await session.toggle("0-0")
    let source = try #require(h.flow.today.library?.templates.first { $0.id == "tpl-old" })
    let copy = try await h.editor.create(id: "tpl-copy", name: "Legs (2)", exercises: source.exercises)
    try await h.editor.assign(day: 0, templateId: "tpl-copy")
    await h.flow.settled()
    #expect(h.flow.session === session, "buổi đang tập dở giữ nguyên")
    #expect(session.plan.templateId == "tpl-old" && session.progress.done["0-0"] == true)
    try await h.editor.delete(templateId: "tpl-old")
    await h.flow.settled()
    let lib = try #require(h.flow.today.library)
    #expect(lib.templates.map(\.id) == ["tpl-copy"])
    #expect(lib.templates.first?.exercises == copy.exercises)
    #expect(lib.routine.first { $0.dayOfWeek == 0 }?.templateId == "tpl-copy", "ngày không bị cascade theo nguồn")
    _ = await h.sync()
    let server = await h.server.templates
    #expect(server["tpl-copy"] != nil && server["tpl-old"] == nil)
  }
}
