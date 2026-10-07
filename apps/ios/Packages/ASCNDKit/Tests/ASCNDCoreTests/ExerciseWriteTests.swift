import ASCNDCore
import ASCNDTestSupport
import Foundation
import Testing

/// Ghi thư viện bài tập (#421) — `useAddExercise` / `useDeleteExercise` @ fac9ac2.

/// Nguồn đọc thẳng bảng `exercises` của `FakeServer`: bài mẫu + bài của mình.
private actor ServerExercises: ExerciseSource, ExerciseCache {
  let server: FakeServer
  var cached: [String: [LibraryExercise]] = [:]
  var down = false
  init(_ server: FakeServer) { self.server = server }
  func setDown(_ d: Bool) { down = d }
  func exercises(userId: String) async throws -> [LibraryExercise] {
    if down { throw URLError(.notConnectedToInternet) }
    return await server.exercises.values.compactMap { r -> LibraryExercise? in
      let owner = r["user_id"]?.stringValue
      guard owner == nil || owner == userId, let id = r["id"]?.stringValue, let name = r["name"]?.stringValue else { return nil }
      return LibraryExercise(
        id: id, userId: owner, name: name, muscleGroup: r["muscle_group"]?.stringValue,
        equipment: r["equipment"]?.stringValue, kind: r["exercise_kind"]?.stringValue)
    }.sorted { $0.id < $1.id }
  }
  func load(userId: String) async throws -> [LibraryExercise]? { cached[userId] }
  func save(userId: String, _ list: [LibraryExercise]) async throws { cached[userId] = list }
}

@MainActor
private final class Harness {
  let clock = ManualClock(EpochMillis(1_791_183_600_000))
  let store = InMemoryWorkoutStore()
  let server = FakeServer()
  let source: ServerExercises
  var enqueued: [OutboxEntry] = []
  private(set) var library: ExerciseLibrary!

  init() async {
    source = ServerExercises(server)
    await server.seedExercise(.object([
      "id": .string("seed-bench"), "user_id": .null, "name": .string("Bench Press"), "muscle_group": .string("chest"),
    ]))
    library = make()
  }

  func make(user: String = "u1") -> ExerciseLibrary {
    ExerciseLibrary(
      userId: user, source: source, cache: source, store: store, clock: clock,
      onEnqueued: { [unowned self] in enqueued.append($0) })
  }

  func reopen() { library = make() }

  func sync(user: String = "u1") async -> SyncWorker {
    let w = SyncWorker(store: store, remote: server, clock: clock, signedInUser: user, sleep: clock.sleeper)
    w.kick()
    await w.settle()
    return w
  }
}

@MainActor
struct ExerciseWriteTests {
  /// Hàng thêm bài như baseline: tên cắt, nhóm cơ / thiết bị lưu KHOÁ, thiết
  /// bị trống thì bỏ trường, loại bài chỉ khi chọn.
  @Test func createPayload() async throws {
    let h = await Harness()
    await h.library.load()
    try await h.library.create(id: "EX-1", name: "  Cable Fly ", muscleGroup: "Ngực", equipment: " Cable ")
    try await h.library.create(id: "ex-2", name: "Plank", muscleGroup: "Bụng", kind: .timed)
    let rows = await h.store.outbox
    #expect(rows.map(\.kind) == [ExerciseEdit.createKind, ExerciseEdit.createKind])
    #expect(rows[0].id == "ex-1")
    #expect(rows[0].payload == .object([
      "id": .string("ex-1"), "user_id": .string("u1"), "name": .string("Cable Fly"),
      "muscle_group": .string("chest"), "equipment": .string("cable"),
    ]))
    #expect(rows[1].payload["equipment"] == nil, "trống thì bỏ — server để mặc định")
    #expect(rows[1].payload["exercise_kind"]?.stringValue == "timed")
    #expect(rows[0].payload["exercise_kind"] == nil, "không chọn thì không khẳng định")
  }

  /// Nhóm cơ / thiết bị không nhận ra: giữ nguyên chữ, không nhét vào khoá gần đúng.
  @Test func unknownLabelsAreKeptVerbatim() async throws {
    let h = await Harness()
    try await h.library.create(id: "x", name: "Wrist Roller", muscleGroup: "Cẳng tay", equipment: "Roller  bar")
    let p = try #require(await h.store.outbox.first).payload
    #expect(p["muscle_group"]?.stringValue == "Cẳng tay")
    #expect(p["equipment"]?.stringValue == "Roller  bar")
  }

  /// Thêm offline: có ngay trong thư viện (và trong gợi ý tên bài); mở lại app
  /// vẫn có; gửi xong là một hàng trên server; bấm lại cùng id là một bài.
  @Test func createWorksOfflineAndIsIdempotent() async throws {
    let h = await Harness()
    await h.source.setDown(true)
    await h.library.load()
    let id = h.library.newExerciseId()
    for _ in 0..<3 { try await h.library.create(id: id, name: "Cable Fly", muscleGroup: "chest") }
    #expect(await h.store.outbox.count == 1)
    #expect(h.library.exercises.filter { $0.id == id }.count == 1)
    #expect(ExerciseCatalog.suggestions(h.library.exercises, for: "fly").map(\.id) == [id])
    h.reopen()
    await h.library.load()
    #expect(h.library.exercise(id: id)?.name == "Cable Fly", "lệnh trong outbox vẫn áp sau khi mở lại")
    await h.source.setDown(false)
    let w = await h.sync()
    #expect(w.deadCount == 0)
    await h.library.refresh()
    #expect(h.library.exercises.filter { $0.id == id }.count == 1)
    #expect(await h.server.exercises[id]?["user_id"]?.stringValue == "u1")
  }

  /// Xoá bài của mình: biến mất ngay (offline), server xoá khi gửi.
  @Test func deleteOwnExercise() async throws {
    let h = await Harness()
    await h.library.load()
    try await h.library.create(id: "mine", name: "Cable Fly", muscleGroup: "chest")
    _ = await h.sync()
    await h.library.refresh()
    try await h.library.delete(id: "mine")
    #expect(h.library.exercise(id: "mine") == nil)
    let e = try #require(await h.store.outbox.last)
    #expect(e.kind == ExerciseEdit.deleteKind && e.id.hasPrefix("mine@del-"))
    _ = await h.sync()
    await h.library.refresh()
    #expect(h.library.exercise(id: "mine") == nil)
    #expect(await h.server.exercises["mine"] == nil)
  }

  /// Bài mẫu / bài không có: từ chối, không ghi gì.
  @Test func cannotDeleteBuiltInOrMissing() async throws {
    let h = await Harness()
    await h.library.load()
    await #expect(throws: ExerciseLibrary.Refusal.notOwn) { try await h.library.delete(id: "seed-bench") }
    await #expect(throws: ExerciseLibrary.Refusal.notFound) { try await h.library.delete(id: "nope") }
    await #expect(throws: ExerciseLibrary.Refusal.emptyName) {
      try await h.library.create(id: "x", name: "  ", muscleGroup: "chest")
    }
    #expect(await h.store.outbox.isEmpty)
    #expect(h.library.exercise(id: "seed-bench") != nil)
  }

  /// Lệnh xoá của người khác (bản ghi cũ, phát lại) không xoá được bài của ai:
  /// áp trên máy không đụng bài không phải của người ra lệnh; server cũng thế.
  @Test func wrongUserDeleteReplayIsHarmless() async throws {
    let h = await Harness()
    await h.library.load()
    try await h.library.create(id: "mine", name: "Cable Fly", muscleGroup: "chest")
    _ = await h.sync()
    let foreign = OutboxEntry(
      id: "mine@del-evil", userId: "u2", kind: ExerciseEdit.deleteKind,
      payload: .object(["id": .string("mine")]), createdAt: EpochMillis(0))
    let seedDelete = OutboxEntry(
      id: "seed-bench@del-x", userId: "u1", kind: ExerciseEdit.deleteKind,
      payload: .object(["id": .string("seed-bench")]), createdAt: EpochMillis(0))
    let applied = ExerciseCatalog.applying(h.library.exercises, [foreign, seedDelete])
    #expect(applied.map(\.id).sorted() == ["mine", "seed-bench"])
    try await h.server.send(foreign)
    try await h.server.send(seedDelete)
    let left = await h.server.exercises
    #expect(left["mine"] != nil && left["seed-bench"] != nil)
  }

  /// Xoá bài không xoá dây chuyền: template và buổi đang tập dở mang bài ấy
  /// giữ nguyên (chúng mang tên bài trong JSON của chúng, như baseline).
  @Test func deletingAnExerciseLeavesTemplatesAndSessionsAlone() async throws {
    let h = await Harness()
    await h.library.load()
    try await h.library.create(id: "mine", name: "Cable Fly", muscleGroup: "chest")
    let tpl = WorkoutTemplate(id: "t", name: "Push", exercises: [
      TemplateExercise(exerciseId: "mine", exerciseName: "Cable Fly", sets: 2, reps: 12, weightKg: 15),
    ])
    let session = WorkoutSessionController(
      plan: .init(date: LocalDate("2026-10-05")!, templateId: "t", templateName: "Push", rows: WorkoutPlanning.rows(tpl.exercises)),
      userId: "u1", store: h.store, clock: h.clock)
    await session.load()
    _ = await session.toggle("0-0")
    try await h.library.delete(id: "mine")
    #expect(session.plan.rows.map(\.exerciseId) == ["mine", "mine"])
    #expect(session.phase == .active)
    #expect(tpl.exercises.first?.exerciseId == "mine")
    #expect(await h.store.outbox.map(\.kind) == [ExerciseEdit.createKind, ExerciseEdit.deleteKind])
  }

  /// Thêm rồi xoá trước khi kịp gửi: không còn trên máy; server cuối cùng không có.
  @Test func createThenDeleteBeforeSync() async throws {
    let h = await Harness()
    await h.library.load()
    try await h.library.create(id: "tmp", name: "Oops", muscleGroup: "chest")
    try await h.library.delete(id: "tmp")
    #expect(h.library.exercise(id: "tmp") == nil)
    _ = await h.sync()
    #expect(await h.server.exercises["tmp"] == nil)
  }

  @Test func readOnlyLibraryRefusesWrites() async throws {
    let h = await Harness()
    let ro = ExerciseLibrary(userId: "u1", source: h.source, cache: h.source)
    await #expect(throws: ExerciseLibrary.Refusal.readOnly) {
      try await ro.create(id: "x", name: "A", muscleGroup: "chest")
    }
  }

  @Test func equipmentMatchesWholeWordsOnly() {
    #expect(Equipment.canonical(" DB ") == .dumbbell)
    #expect(Equipment.canonical("db row") == nil)
    #expect(Equipment.canonical("Body   Weight") == .bodyweight)
    #expect(Equipment.label("dumbbells", .vi) == "Tạ đơn")
    #expect(Equipment.label(" Roller ", .en) == "Roller")
  }
}
