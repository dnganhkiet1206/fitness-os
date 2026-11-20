@testable import ASCNDCore
import ASCNDTestSupport
import Foundation
import Testing

/// Đường ghi của `recomputeDailyLog` (#266): ghi có điều kiện theo token đọc
/// TRƯỚC, bị chen thì làm lại, hết lượt thì chỉ chấp nhận khi hàng đang lưu đã
/// đúng số. Và ngày nào được dựng lại sau mỗi lệnh buổi tập (WH-3a).
struct DailyLogRebuildTests {
  static let utc = TimeZone(identifier: "UTC")!
  static let now = EpochMillis(iso8601: "2026-10-05T10:00:00.000Z")!
  static let today = LocalDate("2026-10-05")!

  /// Bảng `daily_logs` có kịch bản: mọi nguồn khác rỗng.
  final class Scripted: RowStore, @unchecked Sendable {
    var row: JSONValue?
    /// Mỗi lần `update` / `insert`: kịch bản kế tiếp (nil = làm thật).
    var updateScript: [Int] = []
    var insertErrors: [RowStoreError] = []
    var failTable: String?
    var stored: JSONValue?
    var updates = 0, inserts = 0
    /// Mọi select đã chạy — ghi dưới khoá vì `readSources` đọc song song.
    private let queriesLock = NSLock()
    private var recorded: [RowQuery] = []
    var queries: [RowQuery] { queriesLock.withLock { recorded } }

    func select(_ q: RowQuery) async throws(RowStoreError) -> [JSONValue] {
      queriesLock.withLock { recorded.append(q) }
      if q.table == failTable { throw RowStoreError(code: nil, message: "boom") }
      if q.table == "daily_logs" {
        if q.columns == "id, updated_at" { return row.map { [$0] } ?? [] }
        return stored.map { [$0] } ?? []
      }
      if q.mode == .single { throw RowStoreError(code: "PGRST116", message: "no rows") }
      return []
    }

    func insert(_ table: String, _ r: [String: JSONValue]) async throws(RowStoreError) {
      inserts += 1
      if !insertErrors.isEmpty {
        let e = insertErrors.removeFirst()
        // Máy khác vừa chèn hàng của cùng ngày.
        row = .object(["id": .string("dl-1"), "updated_at": .string("t1")])
        throw e
      }
      stored = .object(r)
    }

    func update(_ table: String, _ r: [String: JSONValue], where filters: [RowQuery.Filter]) async throws(RowStoreError) -> Int {
      updates += 1
      if !updateScript.isEmpty { return updateScript.removeFirst() }
      stored = .object(r)
      return 1
    }
  }

  func run(_ s: Scripted) async -> DailyLogRebuildError? {
    do {
      try await DailyLog.recompute(userId: "u1", date: Self.today, store: s, now: Self.now, in: Self.utc)
      return nil
    } catch {
      return error
    }
  }

  @Test func noRowInserts() async {
    let s = Scripted()
    #expect(await run(s) == nil)
    #expect(s.inserts == 1 && s.updates == 0)
    #expect(s.stored?["date"] == .string("2026-10-05"))
  }

  /// Bị chen giữa đọc token và ghi → làm lại từ đầu, lần sau thắng.
  @Test func lostRaceRetries() async {
    let s = Scripted()
    s.row = .object(["id": .string("dl-1"), "updated_at": .string("t0")])
    s.updateScript = [0]
    #expect(await run(s) == nil)
    #expect(s.updates == 2)
  }

  /// Hai máy cùng chèn hàng đầu tiên của ngày: 23505 → đọc lại, thành update.
  @Test func duplicateInsertBecomesUpdate() async {
    let s = Scripted()
    s.insertErrors = [RowStoreError(code: "23505", message: "dup")]
    #expect(await run(s) == nil)
    #expect(s.inserts == 1 && s.updates == 1)
  }

  @Test func otherInsertErrorThrows() async {
    let s = Scripted()
    s.insertErrors = [RowStoreError(code: "42501", message: "rls")]
    #expect(await run(s) != nil)
  }

  /// Hết 3 lượt: hàng đang lưu đã mang đúng số ta tính → chấp nhận; khác → lỗi.
  @Test func exhaustedAcceptsOnlyAMatchingRow() async throws {
    let s = Scripted()
    s.row = .object(["id": .string("dl-1"), "updated_at": .string("t0")])
    s.updateScript = [0, 0, 0]
    let mine = DailyLog.row(
      userId: "u1", date: Self.today,
      sources: .init(
        meals: [], workouts: [], sleeps: [], supplements: [], intakes: [], bio: [], profile: nil, bioHistory: [],
        load7d: [], load28d: [], sleeps7d: [], water: []),
      now: Self.now, in: Self.utc)
    s.stored = .object(mine)
    #expect(await run(s) == nil)
    #expect(s.updates == 3)

    let t = Scripted()
    t.row = s.row
    t.updateScript = [0, 0, 0]
    var other = mine
    other["kcal"] = .number(1200)
    t.stored = .object(other)
    #expect(await run(t) != nil)
  }

  /// Một nguồn đọc lỗi: KHÔNG ghi gì (hàng cũ ở yên).
  @Test func failedReadWritesNothing() async {
    let s = Scripted()
    s.failTable = "biometric_samples"
    #expect(await run(s) != nil)
    #expect(s.inserts == 0 && s.updates == 0)
  }

  /// Hồ sơ thiếu không phải lỗi: mục tiêu ngủ mặc định 8 giờ.
  @Test func missingProfileIsNotAFailure() async {
    let s = Scripted()
    #expect(await run(s) == nil)
    #expect(s.inserts == 1)
  }

  // MARK: - Ngày dựng lại

  func entry(_ kind: String, _ payload: [String: JSONValue]) -> OutboxEntry {
    OutboxEntry(id: "x", userId: "u1", kind: kind, payload: .object(payload), createdAt: Self.now)
  }

  @Test func deleteOfAPastSessionRebuildsThatDayAndToday() {
    let e = entry(WorkoutSessionRecord.deleteKind, ["id": .string("s1"), "date_time": .string("2026-10-03T18:00:00.000Z")])
    #expect(DailyLog.rebuildDays(after: e, today: Self.today, in: Self.utc) == [LocalDate("2026-10-03")!, Self.today])
  }

  @Test func todaysSessionRebuildsOnlyToday() {
    let e = entry(WorkoutSessionRecord.outboxKind, ["id": .string("s1"), "date_time": .string("2026-10-05T08:00:00.000Z")])
    #expect(DailyLog.rebuildDays(after: e, today: Self.today, in: Self.utc) == [Self.today])
  }

  /// Ngày là ngày ĐỊA PHƯƠNG: 18:00Z ngày 3 là ngày 4 ở Sài Gòn.
  @Test func dayFollowsTheLocalCalendar() {
    let e = entry(WorkoutSessionRecord.revisionKind, ["id": .string("s1"), "date_time": .string("2026-10-03T18:00:00.000Z")])
    let saigon = TimeZone(identifier: "Asia/Ho_Chi_Minh")!
    #expect(DailyLog.rebuildDays(after: e, today: Self.today, in: saigon) == [LocalDate("2026-10-04")!, Self.today])
  }

  @Test func oldDeleteWithoutDateRebuildsToday() {
    let e = entry(WorkoutSessionRecord.deleteKind, ["id": .string("s1")])
    #expect(DailyLog.rebuildDays(after: e, today: Self.today, in: Self.utc) == [Self.today])
  }

  /// Audit 25/10: một lần uống dựng lại ĐÚNG ngày của nó (ngày chọn lúc chạm),
  /// để `daily_logs.water_ml` khớp sổ Nước — kể cả lần uống của hôm qua gửi muộn.
  @Test func waterRebuildsTheDayItWasDrunk() {
    let e = Water.entry(
      id: "w1", userId: "u", amountMl: 250, date: LocalDate("2026-10-03")!,
      at: EpochMillis(iso8601: "2026-10-03T22:00:00Z")!, createdAt: EpochMillis(iso8601: "2026-10-03T22:00:00Z")!)
    #expect(DailyLog.rebuildDays(after: e, today: Self.today, in: Self.utc) == [LocalDate("2026-10-03")!])
  }

  @Test func planEditsDoNotTouchDailyLogs() {
    let e = entry(PlanEdit.templateKind, ["id": .string("t1")])
    #expect(DailyLog.rebuildDays(after: e, today: Self.today, in: Self.utc).isEmpty)
  }

  /// Lỗi dựng lại không ném ra writer — chỉ trả về để chẩn đoán.
  @Test func rebuildAfterWriteSwallowsFailures() async {
    let s = Scripted()
    s.failTable = "meal_entries"
    let e = entry(WorkoutSessionRecord.deleteKind, ["id": .string("s1"), "date_time": .string("2026-10-03T18:00:00.000Z")])
    let failures = await DailyLog.rebuildAfterWrite(e, store: s, clock: FixedWallClock(iso8601: "2026-10-05T10:00:00Z"), in: Self.utc)
    #expect(failures.count == 2)
  }

  // MARK: - Gom lượt (AUD-50)

  /// 20 entry chạm 2 ngày phân biệt → đúng 2 lượt dựng: mỗi ngày 1 select
  /// token + 12 select nguồn + 1 insert. Entry không về buổi tập / bữa / ngủ
  /// (kế hoạch) không dựng thêm ngày nào.
  @Test func rebuildAfterWritesCoalescesDistinctDays() async {
    let s = Scripted()
    var entries: [OutboxEntry] = []
    for i in 0..<10 {
      entries.append(entry(
        WorkoutSessionRecord.outboxKind,
        ["id": .string("past-\(i)"), "date_time": .string("2026-10-03T18:00:00.000Z")]))
    }
    for i in 0..<10 {
      entries.append(entry(
        WorkoutSessionRecord.outboxKind,
        ["id": .string("today-\(i)"), "date_time": .string("2026-10-05T08:00:00.000Z")]))
    }
    entries.append(entry(PlanEdit.templateKind, ["id": .string("t1")]))
    let failures = await DailyLog.rebuildAfterWrites(
      entries, store: s, clock: FixedWallClock(iso8601: "2026-10-05T10:00:00Z"), in: Self.utc)
    #expect(failures.isEmpty)
    #expect(s.inserts == 2)
    #expect(s.queries.count == 26)
    #expect(s.queries.filter { $0.columns != "id, updated_at" }.count == 24)
  }

  /// 12 nguồn cùng bay: mọi select chồng lên nhau trong lúc chờ.
  @Test func readSourcesReadsAllTwelveConcurrently() async {
    let store = ConcurrentStore()
    let reads = DailyLog.queries(userId: "u1", date: Self.today, in: Self.utc)
    let sources = try? await DailyLog.readSources(reads, store)
    #expect(sources != nil)
    #expect(sources?.profile == nil)
    #expect(await store.maxInFlight == 12)
  }

  /// Hai nguồn cùng hỏng thì lỗi ném ra là lỗi của nguồn ĐỨNG TRƯỚC theo thứ
  /// tự cố định — đúng lỗi bản tuần tự cũ ném.
  @Test func readSourcesThrowsTheFirstFailureInFixedOrder() async {
    let store = KeyedFailingStore()
    let reads = DailyLog.queries(userId: "u1", date: Self.today, in: Self.utc)
    store.failures = [
      reads.meals: RowStoreError(code: nil, message: "meals boom"),
      reads.water: RowStoreError(code: nil, message: "water boom"),
    ]
    var thrown: RowStoreError?
    do {
      _ = try await DailyLog.readSources(reads, store)
    } catch {
      thrown = error
    }
    #expect(thrown?.message == "meals boom")
  }

  /// Hồ sơ hỏng vẫn là "không có hồ sơ", không phải lỗi dựng lại.
  @Test func readSourcesTreatsProfileFailureAsMissingProfile() async {
    let store = KeyedFailingStore()
    let reads = DailyLog.queries(userId: "u1", date: Self.today, in: Self.utc)
    store.failures = [reads.profile: RowStoreError(code: nil, message: "profile boom")]
    let sources = try? await DailyLog.readSources(reads, store)
    #expect(sources != nil)
    #expect(sources?.profile == nil)
  }

  /// Đọc song song cho cùng kết quả như đọc tuần tự: mỗi nguồn trả một hàng
  /// đánh dấu riêng, nên lắp nhầm thứ tự là lộ ngay. Kèm theo: mỗi truy vấn
  /// trong `Reads.sources` được gửi đúng MỘT lần — không thiếu, không thừa.
  @Test func readSourcesMatchesSequentialReads() async throws {
    let reads = DailyLog.queries(userId: "u1", date: Self.today, in: Self.utc)
    #expect(Set(reads.sources).count == 12)
    var rows: [RowQuery: [JSONValue]] = [:]
    for (i, q) in reads.sources.enumerated() {
      rows[q] = [.object(["source": .number(Double(i))])]
    }
    let store = MarkedStore(rows: rows)
    let concurrent = try await DailyLog.readSources(reads, store)
    let issued = await store.queries
    #expect(issued.count == 12)
    #expect(Set(issued) == Set(reads.sources))
    // Mỗi hàng đánh dấu về đúng trường của nó.
    func marker(_ i: Int) -> [JSONValue] { [.object(["source": .number(Double(i))])] }
    let fields: (DailyLog.Sources) -> [[JSONValue]] = {
      [$0.meals, $0.workouts, $0.sleeps, $0.supplements, $0.intakes, $0.bio, $0.bioHistory,
       $0.load7d, $0.load28d, $0.sleeps7d, $0.water]
    }
    let expectedFields = [
      marker(0), marker(1), marker(2), marker(3), marker(4), marker(5),
      marker(7), marker(8), marker(9), marker(10), marker(11),
    ]
    #expect(fields(concurrent) == expectedFields)
    #expect(concurrent.profile == marker(6).first)
    // Tham chiếu tuần tự: gửi từng nguồn theo đúng thứ tự `Reads.sources`,
    // lắp theo cùng thứ tự — kết quả phải giống hệt bản song song.
    var values: [[JSONValue]] = []
    for q in reads.sources {
      values.append(try await store.select(q))
    }
    let sequential = DailyLog.Sources(
      meals: values[0], workouts: values[1], sleeps: values[2], supplements: values[3], intakes: values[4],
      bio: values[5], profile: values[6].first, bioHistory: values[7], load7d: values[8], load28d: values[9],
      sleeps7d: values[10], water: values[11])
    #expect(fields(concurrent) == fields(sequential))
    #expect(concurrent.profile == sequential.profile)
  }

  /// Hai nguồn cùng hỏng: lỗi ném ra vẫn là lỗi của nguồn đứng trước — và
  /// cả 12 nguồn đều đã bay (chờ hết rồi mới xét lỗi, AUD-50), mỗi nguồn
  /// đúng một lần. Bản tuần tự cũ dừng ở nguồn hỏng đầu tiên; bản song
  /// song không thu hồi được chuyến đã bay, nên khi lỗi mà số truy vấn
  /// nhiều hơn trước là đúng ý đồ, không phải hồi quy.
  @Test func readSourcesOnFailureThrowsFirstErrorAndIssuesEverySource() async {
    let reads = DailyLog.queries(userId: "u1", date: Self.today, in: Self.utc)
    let store = MarkedStore(rows: [:], failures: [
      reads.sleeps: RowStoreError(code: nil, message: "sleeps boom"),
      reads.water: RowStoreError(code: nil, message: "water boom"),
    ])
    var thrown: RowStoreError?
    do {
      _ = try await DailyLog.readSources(reads, store)
    } catch {
      thrown = error
    }
    #expect(thrown?.message == "sleeps boom")
    let issued = await store.queries
    #expect(issued.count == 12)
    #expect(Set(issued) == Set(reads.sources))
  }
}

/// Kho đếm số select đang bay cùng lúc: mỗi select giữ một nhịp rồi mới trả,
/// nên đọc song song thì cả 12 chuyến chồng lên nhau.
private actor ConcurrentStore: RowStore {
  var maxInFlight = 0
  private var inFlight = 0

  func select(_ q: RowQuery) async throws(RowStoreError) -> [JSONValue] {
    inFlight += 1
    maxInFlight = max(maxInFlight, inFlight)
    defer { inFlight -= 1 }
    try? await Task.sleep(nanoseconds: 10_000_000)
    if q.mode == .single { throw RowStoreError(code: "PGRST116", message: "no rows") }
    return []
  }

  func insert(_ table: String, _ row: [String: JSONValue]) async throws(RowStoreError) {}
  func update(_ table: String, _ row: [String: JSONValue], where filters: [RowQuery.Filter]) async throws(RowStoreError) -> Int { 0 }
}

/// Kho hỏng theo đúng truy vấn, để kiểm thứ tự lỗi.
private final class KeyedFailingStore: RowStore, @unchecked Sendable {
  var failures: [RowQuery: RowStoreError] = [:]

  func select(_ q: RowQuery) async throws(RowStoreError) -> [JSONValue] {
    if let e = failures[q] { throw e }
    if q.mode == .single { throw RowStoreError(code: "PGRST116", message: "no rows") }
    return []
  }

  func insert(_ table: String, _ row: [String: JSONValue]) async throws(RowStoreError) {}
  func update(_ table: String, _ row: [String: JSONValue], where filters: [RowQuery.Filter]) async throws(RowStoreError) -> Int { 0 }
}

/// Kho trả mỗi truy vấn hàng đã định sẵn (kèm lỗi theo truy vấn, nếu có),
/// ghi lại mọi truy vấn đã nhận — để kiểm đọc song song lắp đúng nguồn và
/// gửi mỗi nguồn đúng một lần. Actor nên đọc song song an toàn.
private actor MarkedStore: RowStore {
  private let rows: [RowQuery: [JSONValue]]
  private let failures: [RowQuery: RowStoreError]
  private(set) var queries: [RowQuery] = []

  init(rows: [RowQuery: [JSONValue]], failures: [RowQuery: RowStoreError] = [:]) {
    self.rows = rows
    self.failures = failures
  }

  func select(_ q: RowQuery) async throws(RowStoreError) -> [JSONValue] {
    queries.append(q)
    if let e = failures[q] { throw e }
    return rows[q] ?? []
  }

  func insert(_ table: String, _ row: [String: JSONValue]) async throws(RowStoreError) {}
  func update(_ table: String, _ row: [String: JSONValue], where filters: [RowQuery.Filter]) async throws(RowStoreError) -> Int { 0 }
}
