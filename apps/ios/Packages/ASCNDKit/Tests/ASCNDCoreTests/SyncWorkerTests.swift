import ASCNDCore
import ASCNDTestSupport
import Foundation
import Testing

private func entry(_ id: String, user: String = "u1") -> OutboxEntry {
  OutboxEntry(id: id, userId: user, kind: "workout", payload: .object(["id": .string(id)]), createdAt: EpochMillis(0))
}

@MainActor
private func worker(
  _ store: InMemoryOutboxStore, _ server: FakeServer, _ clock: ManualClock = ManualClock(),
  online: Bool = true, user: String? = "u1"
) -> SyncWorker {
  SyncWorker(store: store, remote: server, clock: clock, online: online, signedInUser: user, sleep: clock.sleeper)
}

@MainActor
private func run(_ w: SyncWorker) async {
  w.kick()
  await w.settle()
}

@MainActor
struct SyncWorkerTests {
  /// Gửi theo đúng thứ tự tạo, đĩa rỗng khi xong.
  @Test func drainsInOrder() async {
    let store = InMemoryOutboxStore([entry("a"), entry("b"), entry("c")])
    let server = FakeServer()
    let w = worker(store, server)
    await run(w)
    #expect(await server.attempts == ["a", "b", "c"])
    #expect(await store.pending.isEmpty)
    #expect(w.pendingCount == 0)
  }

  /// Offline: không gửi gì, không mất gì. Có mạng lại: gửi.
  @Test func offlineHoldsThenSendsWhenOnline() async {
    let store = InMemoryOutboxStore([entry("a")])
    let server = FakeServer()
    let w = worker(store, server, online: false)
    await run(w)
    #expect(await server.attempts.isEmpty)
    #expect(await store.pending.map(\.id) == ["a"])
    w.setOnline(true)
    await w.settle()
    #expect(await server.rows.keys.sorted() == ["a"])
    #expect(await store.pending.isEmpty)
  }

  /// Lỗi tạm: giữ đầu hàng, ngủ theo lịch (1 s, 2 s), gửi lại cùng id, thành.
  /// Hàng sau không vượt lên — một làn tuần tự.
  @Test func transientFailureBacksOffThenSucceeds() async {
    let store = InMemoryOutboxStore([entry("a"), entry("b")])
    let server = FakeServer()
    await server.script("a", .fail(.server(code: nil)), .fail(.server(code: "503")))
    let clock = ManualClock()
    let w = worker(store, server, clock)
    await run(w)
    #expect(await server.attempts == ["a", "a", "a", "b"])
    #expect(clock.slept == [1000, 2000])
    #expect(await store.pending.isEmpty)
    #expect(w.deadCount == 0)
  }

  /// Lỗi vĩnh viễn (CHECK constraint): sang `dead` ngay, nằm trên đĩa để còn
  /// báo, và KHÔNG chặn hàng sau.
  @Test func permanentFailureGoesDeadAndUnblocks() async {
    let store = InMemoryOutboxStore([entry("a"), entry("b")])
    let server = FakeServer()
    await server.script("a", .fail(.server(code: "23514")))
    let w = worker(store, server)
    await run(w)
    #expect(await server.attempts == ["a", "b"])
    #expect(await store.dead.map(\.entry.id) == ["a"])
    #expect(await store.dead.first?.reason == .refused)
    #expect(await store.pending.isEmpty)
  }

  /// Hết ngân sách lỗi tạm: `exhausted`, có trên đĩa.
  @Test func transientBudgetRunsOut() async {
    let store = InMemoryOutboxStore([entry("a")])
    let server = FakeServer()
    for _ in 0..<10 { await server.script("a", .fail(.server(code: nil))) }
    let w = worker(store, server)
    await run(w)
    #expect(await store.dead.first?.reason == .exhausted)
    #expect(await server.rows.isEmpty)
  }

  /// Timeout sau khi server ĐÃ ghi: worker gửi lại cùng id, server bỏ trùng —
  /// một hàng, không phải hai.
  @Test func lostResponseRetriesWithoutDuplicating() async {
    let store = InMemoryOutboxStore([entry("a")])
    let server = FakeServer()
    await server.script("a", .lostResponse)
    let w = worker(store, server)
    await run(w)
    #expect(await server.attempts == ["a", "a"])
    #expect(await server.rows.count == 1)
    #expect(await store.pending.isEmpty)
  }

  /// Màn tập chốt buổi trong lúc worker đang gửi: `kick` làm lượt đang chạy
  /// nạp lại, buổi mới đi luôn trong lượt ấy.
  @Test func pickUpWorkAppendedMidDrain() async {
    let store = InMemoryOutboxStore([entry("a")])
    let server = FakeServer()
    await server.script("a", .fail(.server(code: nil)))
    let clock = ManualClock()
    let w = worker(store, server, clock)
    w.kick()
    await store.append(entry("late"))
    w.kick()
    await w.settle()
    #expect(await server.rows.keys.sorted() == ["a", "late"])
    #expect(await store.pending.isEmpty)
  }

  /// Chốt buổi đúng lúc worker đang đọc đĩa: lượt ấy cầm bản chụp cũ (không
  /// có buổi mới) và thấy hàng rỗng. Nó phải nạp lại trước khi dừng — không
  /// thì buổi nằm chờ tới lần app ra tiền cảnh hay có mạng lại.
  @Test func kickDuringLoadIsNotLost() async {
    let store = InMemoryOutboxStore()
    let server = FakeServer()
    let w = worker(store, server)
    await store.holdLoads()
    w.kick()
    while await store.parked < 1 { await Task.yield() }
    await store.append(entry("late"))
    await store.release()
    w.kick()
    await w.settle()
    #expect(await server.rows.keys.sorted() == ["late"])
  }

  /// Bản ghi của tài khoản khác ở đầu hàng: không gửi, sang `dead`.
  @Test func otherAccountIsNeverSent() async {
    let store = InMemoryOutboxStore([entry("x", user: "someone-else"), entry("a")])
    let server = FakeServer()
    let w = worker(store, server)
    await run(w)
    #expect(await server.attempts == ["a"])
    #expect(await store.dead.map(\.reason) == [.wrongAccount])
  }

  @Test func notSignedInSendsNothing() async {
    let store = InMemoryOutboxStore([entry("a")])
    let server = FakeServer()
    let w = worker(store, server, user: nil)
    await run(w)
    #expect(await server.attempts.isEmpty)
    #expect(await store.pending.count == 1)
  }

  /// Ghi đĩa hỏng sau khi gửi thành: bộ nhớ vẫn đúng, worker không gửi lại
  /// trong lượt này, và lần ghi sau đưa đĩa về đúng.
  @Test func persistFailureDoesNotResendOrLose() async {
    let store = InMemoryOutboxStore([entry("a"), entry("b")])
    let server = FakeServer()
    await store.failNext()
    let w = worker(store, server)
    await run(w)
    #expect(await server.attempts == ["a", "b"])
    #expect(await store.pending.isEmpty, "lần ghi sau mang theo `a` đã xong")
    #expect(w.unsaved == nil)
  }

  /// Ghi đĩa hỏng sau lần gửi CUỐI: không có bước nào sau đó mang nó theo.
  /// Lượt kế (có hàng mới, có mạng lại) phải ghi lại — và không gửi lại `a`
  /// dù đĩa vẫn còn nó.
  @Test func failedFinalPersistIsRetriedNotResent() async {
    let store = InMemoryOutboxStore([entry("a")])
    let server = FakeServer()
    await store.failNext(2)  // ghi sau lần gửi, và lần ghi lại ở bước idle
    let w = worker(store, server)
    await run(w)
    #expect(w.unsaved != nil)
    #expect(await store.pending.map(\.id) == ["a"])
    await run(w)
    #expect(await server.attempts == ["a"])
    #expect(await store.pending.isEmpty)
    #expect(w.unsaved == nil)
  }

  /// App chết sau khi gửi thành nhưng trước khi ghi đĩa: lần mở sau gửi lại
  /// cùng id — ít nhất một lần, và server bỏ trùng nên vẫn một hàng.
  @Test func crashBeforePersistResendsSameId() async {
    let store = InMemoryOutboxStore([entry("a")])
    let server = FakeServer()
    await store.failNext(2)  // mọi lần ghi của lượt này hỏng = app chết trước khi ghi
    let first = worker(store, server)
    await run(first)
    #expect(await store.pending.map(\.id) == ["a"], "đĩa chưa kịp ghi")
    let reopened = worker(store, server)
    await run(reopened)
    #expect(await server.attempts == ["a", "a"])
    #expect(await server.rows.count == 1)
    #expect(await store.pending.isEmpty)
  }

  /// Đăng xuất bỏ hàng đợi như baseline (#241 chờ Kiệt), cả trên đĩa.
  @Test func signOutDropsQueue() async {
    let store = InMemoryOutboxStore([entry("a"), entry("b")])
    let server = FakeServer()
    let w = worker(store, server, online: false)
    await run(w)
    #expect(await w.signOut() == 2)
    #expect(await store.pending.isEmpty)
    #expect(w.pendingCount == 0)
  }
}

/// Đầu-cuối trong Core: màn tập chốt → outbox → worker → server.
@MainActor
struct WorkoutToServerTests {
  @Test func finishedWorkoutReachesServerOnce() async throws {
    let rows = [PlannedSet(key: "b1", exerciseId: "ex", exerciseName: "Bench", ordinal: 1, of: 1, weightKg: 60, reps: 8, plannedRest: 0)]
    let outbox = InMemoryOutboxStore()
    let server = FakeServer()
    let w = worker(outbox, server, online: false)
    let days = BridgingStore(outbox: outbox)
    let c = WorkoutSessionController(
      plan: .init(date: LocalDate("2026-10-05")!, templateId: "t", templateName: "Push", rows: rows),
      userId: "u1", store: days, clock: FixedWallClock(iso8601: "2026-10-05T10:00:00Z"),
      timeZone: TimeZone(identifier: "UTC")!, makeId: { "sess-1" }, onEnqueued: { _ in w.kick() })
    await c.load()
    await c.toggle("b1")
    _ = try await c.finish()
    await w.settle()
    #expect(await server.rows.isEmpty, "offline: đã lưu trên máy, chưa gửi")
    #expect(await outbox.pending.map(\.id) == ["sess-1"])

    w.setOnline(true)
    await w.settle()
    let row = await server.rows["sess-1"]?.payload
    #expect(row?["id"] == .string("sess-1"))
    #expect(row?["volume_load"] == .number(480))
    #expect(await outbox.pending.isEmpty)
  }
}

/// `WorkoutStore` mà `commitFinish` đẩy hàng vào cùng `InMemoryOutboxStore` mà
/// worker đọc — thứ mà một database chung làm ở bản GRDB (#264).
private actor BridgingStore: WorkoutStore {
  let outbox: InMemoryOutboxStore
  var days: [String: DayState] = [:]
  init(outbox: InMemoryOutboxStore) { self.outbox = outbox }
  func loadDay(_ key: String) async throws -> DayState? { days[key] }
  func saveDay(_ key: String, _ state: DayState) async throws { days[key] = state }
  func commitFinish(_ key: String, _ state: DayState, _ entry: OutboxEntry) async throws -> Bool {
    days[key] = state
    await outbox.append(entry)
    return true
  }
}
