import ASCNDCore
import ASCNDTestSupport
import Foundation
import Testing

/// Lượt gửi gom (AUD-50 + R2-SYNC-04): 20 entry chạm 2 ngày phân biệt thì
/// SyncWorker báo xong lượt MỘT lần, và việc cuối lượt — code thật
/// (`rebuildAfterWrites`, `WidgetSync.payloads`), đúng như closure `afterDrain`
/// của AppServices — dựng lại đúng 2 ngày và đọc widget đúng 4 select.
/// Writer giả ở đây chỉ thay phần vận chuyển Supabase (như `FakeServer`);
/// việc cuối lượt không phải giả.
@MainActor
struct DrainCoalescingTests {
  static let utc = TimeZone(identifier: "UTC")!
  static let now = EpochMillis(iso8601: "2026-10-05T10:00:00.000Z")!

  @Test func twentyEntryDrainFlushesOnceWithTwoRebuildsAndFourWidgetReads() async {
    let store = DrainCountingStore()
    let writer = DrainFlushWriter(
      store: store, clock: FixedWallClock(iso8601: "2026-10-05T10:00:00Z"), now: Self.now, tz: Self.utc)
    var entries: [OutboxEntry] = []
    for i in 0..<10 {
      entries.append(session(id: "past-\(i)", at: "2026-10-03T18:00:00.000Z"))
    }
    for i in 0..<10 {
      entries.append(session(id: "today-\(i)", at: "2026-10-05T08:00:00.000Z"))
    }
    let outbox = InMemoryOutboxStore(entries)
    let clock = ManualClock()
    let worker = SyncWorker(
      store: outbox, remote: writer, clock: clock, online: true, signedInUser: "u1", sleep: clock.sleeper)
    worker.kick()
    await worker.settle()

    #expect(await writer.flushes == 1)
    #expect(await writer.sentCount == 20)
    // 2 ngày × (1 select token + 12 select nguồn) + 4 select widget.
    #expect(await store.selects.count == 30)
    #expect(await store.inserts == 2)
    // Widget đọc đúng 4 truy vấn của nó, kể cả bảng đóng băng.
    #expect(await store.selects.filter { $0.table == "streak_freezes" }.count == 1)
  }

  private func session(id: String, at dateTime: String) -> OutboxEntry {
    OutboxEntry(
      id: id, userId: "u1", kind: WorkoutSessionRecord.outboxKind,
      payload: .object(["id": .string(id), "date_time": .string(dateTime)]), createdAt: EpochMillis(0))
  }
}

/// Writer gom entry đã gửi và xả MỘT lần khi lượt xong — đúng hợp đồng
/// `SupabaseRemoteWriter` + `afterDrain` giữ, chỉ khác phần vận chuyển.
private actor DrainFlushWriter: RemoteWriter {
  private let store: DrainCountingStore
  private let clock: FixedWallClock
  private let now: EpochMillis
  private let tz: TimeZone
  private var entries: [OutboxEntry] = []
  private(set) var sentCount = 0
  private(set) var flushes = 0

  init(store: DrainCountingStore, clock: FixedWallClock, now: EpochMillis, tz: TimeZone) {
    self.store = store
    self.clock = clock
    self.now = now
    self.tz = tz
  }

  func send(_ entry: OutboxEntry) async throws(WriteFailure) {
    entries.append(entry)
    sentCount += 1
  }

  func drainCompleted() async {
    flushes += 1
    let sent = entries
    entries = []
    _ = await DailyLog.rebuildAfterWrites(sent, store: store, clock: clock, in: tz)
    _ = await WidgetSync.payloads(
      userId: "u1", store: store,
      copy: HomeWidgets.Copy(done: "done", restDay: "rest", noWorkout: "none", untitled: "Workout"),
      now: now, in: tz)
  }
}

/// Kho đếm: mọi truy vấn trả rỗng (chưa có dữ liệu), hồ sơ thiếu.
private actor DrainCountingStore: RowStore {
  private(set) var selects: [RowQuery] = []
  private(set) var inserts = 0

  func select(_ q: RowQuery) async throws(RowStoreError) -> [JSONValue] {
    selects.append(q)
    if q.mode == .single { throw RowStoreError(code: "PGRST116", message: "no rows") }
    return []
  }

  func insert(_ table: String, _ row: [String: JSONValue]) async throws(RowStoreError) { inserts += 1 }
  func update(_ table: String, _ row: [String: JSONValue], where filters: [RowQuery.Filter]) async throws(RowStoreError) -> Int { 0 }
}
