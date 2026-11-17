@testable import ASCNDCore
import Foundation
import Testing

/// Bất biến native của `recompute` (`daily_logs`, #266) — KHÔNG so với RN.
/// Theo chỉ thị 17/11/2026, RN đã bỏ và parity RN↔native đã bỏ: kiểm
/// golden-vector cũ (`everyCaseMatchesRN`, so từng truy vấn và từng cột với
/// đầu ra RN) được thay bằng các bất biến suy từ mã native, trên bảng tự
/// dựng trong file này — không đọc fixture golden nào:
/// - đúng tập truy vấn: token đọc một mình trước, rồi đúng 12 nguồn, mỗi
///   nguồn một lần; thứ tự 12 nguồn không cố định vì đọc song song;
/// - đúng một lệnh ghi, đúng loại (insert khi chưa có hàng, update có điều
///   kiện theo token khi đã có), số cộng từ các nguồn;
/// - đọc lỗi thì không ghi gì; hồ sơ thiếu vẫn ghi.
/// Tên struct giữ nguyên vì `HealthSyncTests` dùng chung `TableStore`.
struct DailyLogGoldenTests {
  /// Bảng giả trong bộ nhớ: thực thi `RowQuery` trên bảng tự dựng (cột thời
  /// điểm so theo thời điểm, không theo chuỗi).
  final class TableStore: RowStore, @unchecked Sendable {
    var tables: [String: [JSONValue]]
    var fail: Set<String>
    var reads: [RowQuery] = []
    var writes: [(kind: String, row: [String: JSONValue], filters: [RowQuery.Filter])] = []
    /// `readSources` đọc 12 nguồn SONG SONG trên cùng một kho: mọi chạm vào
    /// `tables` / `reads` / `writes` đều qua khoá này — không thì 12 chuyến
    /// cùng ghi sẽ làm hỏng bộ nhớ (CI #929 vỡ SIGSEGV/SIGABRT ở `select`).
    private let lock = NSLock()

    init(tables: [String: [JSONValue]], fail: Set<String> = []) {
      self.tables = tables
      self.fail = fail
    }

    static func cmp(_ a: JSONValue?, _ b: JSONValue?) -> Int {
      let sa = DailyLog.jsString(a), sb = DailyLog.jsString(b)
      if sa.contains("T"), sb.contains("T"), let ta = EpochMillis(iso8601: sa), let tb = EpochMillis(iso8601: sb) {
        return ta.millis < tb.millis ? -1 : ta.millis > tb.millis ? 1 : 0
      }
      return sa < sb ? -1 : sa > sb ? 1 : 0
    }

    static func matches(_ r: JSONValue, _ filters: [RowQuery.Filter]) -> Bool {
      filters.allSatisfy {
        switch $0 {
        case .eq(let c, let v): DailyLog.jsString(r[c]) == DailyLog.jsString(v)
        case .gte(let c, let v): cmp(r[c], v) >= 0
        case .lt(let c, let v): cmp(r[c], v) < 0
        case .lte(let c, let v): cmp(r[c], v) <= 0
        case .or: true  // `recomputeDailyLog` không dùng `or`
        }
      }
    }

    /// Đồng bộ bảng từ kho ngoài (`HealthSyncTests.Store`): gán dưới khoá để
    /// không đua với ảnh chụp trong `select`.
    func syncTables(_ t: [String: [JSONValue]]) {
      lock.withLock { tables = t }
    }

    func select(_ q: RowQuery) async throws(RowStoreError) -> [JSONValue] {
      // Ghi truy vấn + chụp bảng dưới MỘT lần khoá: 12 chuyến song song của
      // `readSources` không được chen nhau giữa chừng. Lọc/sắp xếp chạy trên
      // ảnh chụp, ngoài khoá — vẫn song song.
      let snapshot: (rows: [JSONValue], failed: Bool) = lock.withLock {
        reads.append(q)
        return (tables[q.table] ?? [], fail.contains(q.table))
      }
      if snapshot.failed { throw RowStoreError(code: nil, message: "boom") }
      var out = snapshot.rows.filter { Self.matches($0, q.filters) }
      if let o = q.order {
        // Ổn định như `Array.prototype.sort`.
        out = out.enumerated().sorted {
          let c = Self.cmp($0.element[o.column], $1.element[o.column]) * (o.ascending ? 1 : -1)
          return c != 0 ? c < 0 : $0.offset < $1.offset
        }.map(\.element)
      }
      if let l = q.limit { out = Array(out.prefix(l)) }
      if q.mode == .single && out.count != 1 { throw RowStoreError(code: "PGRST116", message: "no rows") }
      return q.mode == .many ? out : Array(out.prefix(1))
    }

    func insert(_ table: String, _ row: [String: JSONValue]) async throws(RowStoreError) {
      lock.withLock {
        writes.append(("insert", row, []))
        tables[table, default: []].append(.object(row))
      }
    }

    func update(_ table: String, _ row: [String: JSONValue], where filters: [RowQuery.Filter]) async throws(RowStoreError) -> Int {
      return lock.withLock {
        writes.append(("update", row, filters))
        var n = 0
        for (i, r) in (tables[table] ?? []).enumerated() where Self.matches(r, filters) {
          guard case .object(var o) = r else { continue }
          for (k, v) in row { o[k] = v }
          tables[table]![i] = .object(o)
          n += 1
        }
        return n
      }
    }
  }

  static let utc = TimeZone(identifier: "UTC")!
  static let now = EpochMillis(iso8601: "2026-10-05T10:00:00.000Z")!
  static let today = LocalDate("2026-10-05")!

  /// Bảng nhỏ tự dựng: một bữa 100 kcal, một buổi 500 volume, một giấc ngủ,
  /// một hồ sơ, 250 ml nước — đủ để `recompute` ghi một hàng có số kiểm được.
  static func tables(existing: JSONValue? = nil) -> [String: [JSONValue]] {
    var t: [String: [JSONValue]] = [
      "meal_entries": [
        .object([
          "user_id": .string("u1"), "date_time": .string("2026-10-05T08:00:00.000Z"),
          "total_kcal": .number(100), "total_protein_g": .number(10), "total_carbs_g": .number(20),
          "total_fat_g": .number(5), "total_fiber_g": .number(2),
        ]),
      ],
      "workout_sessions": [
        .object([
          "user_id": .string("u1"), "date_time": .string("2026-10-05T09:00:00.000Z"),
          "volume_load": .number(500), "session_rpe": .number(7), "sets": .array([]),
        ]),
      ],
      "sleep_logs": [
        .object([
          "user_id": .string("u1"), "bedtime": .string("2026-10-04T22:00:00.000Z"),
          "waketime": .string("2026-10-05T06:00:00.000Z"), "quality": .number(4),
          "light_min": .number(200), "deep_min": .number(100), "rem_min": .number(100),
          "asleep_min": .number(400),
        ]),
      ],
      "profiles": [
        .object(["user_id": .string("u1"), "sleep_target_hours": .number(8)]),
      ],
      "water_logs": [
        .object([
          "user_id": .string("u1"), "date": .string("2026-10-05"), "amount_ml": .number(250),
        ]),
      ],
    ]
    if let existing { t["daily_logs"] = [existing] }
    return t
  }

  /// Chưa có hàng: token đọc một mình trước, 12 nguồn bay song song (thứ tự
  /// ghi nhận không cố định — so TẬP truy vấn, không so danh sách), rồi đúng
  /// một lệnh insert mang số cộng từ các nguồn.
  @Test func recomputeIssuesEveryReadOnceAndInsertsOneRow() async throws {
    let store = TableStore(tables: Self.tables())
    try await DailyLog.recompute(userId: "u1", date: Self.today, store: store, now: Self.now, in: Self.utc)
    let reads = DailyLog.queries(userId: "u1", date: Self.today, in: Self.utc)
    #expect(store.reads.first == reads.existing)
    #expect(store.reads.count == 13)
    #expect(Set(store.reads) == Set([reads.existing] + reads.sources))
    #expect(store.writes.count == 1)
    #expect(store.writes.first?.kind == "insert")
    let row = store.writes.first?.row
    #expect(row?["user_id"] == .string("u1"))
    #expect(row?["date"] == .string("2026-10-05"))
    #expect(row?["kcal"] == .number(100))
    #expect(row?["water_ml"] == .number(250))
    #expect(row?["workout_count"] == .number(1))
    #expect(row?["volume_load"] == .number(500))
  }

  /// Đã có hàng: đúng một lệnh update, điều kiện là token đã đọc trước.
  @Test func recomputeWithAnExistingRowUpdatesOnceWithTheReadToken() async throws {
    let existing = JSONValue.object([
      "id": .string("dl-1"), "updated_at": .string("t0"),
      "user_id": .string("u1"), "date": .string("2026-10-05"),
    ])
    let store = TableStore(tables: Self.tables(existing: existing))
    try await DailyLog.recompute(userId: "u1", date: Self.today, store: store, now: Self.now, in: Self.utc)
    let reads = DailyLog.queries(userId: "u1", date: Self.today, in: Self.utc)
    #expect(store.reads.count == 13)
    #expect(Set(store.reads) == Set([reads.existing] + reads.sources))
    #expect(store.writes.count == 1)
    #expect(store.writes.first?.kind == "update")
    let expectedFilters: [RowQuery.Filter] = [.eq("id", .string("dl-1")), .eq("updated_at", .string("t0"))]
    #expect(store.writes.first?.filters == expectedFilters)
    #expect(store.writes.first?.row["kcal"] == .number(100))
  }

  /// Một nguồn đọc lỗi: KHÔNG ghi gì — nhưng cả 12 nguồn vẫn bay hết (chờ
  /// hết rồi mới xét lỗi, AUD-50), mỗi nguồn đúng một lần.
  @Test func failedSourceWritesNothingButStillIssuesEveryRead() async {
    let store = TableStore(tables: Self.tables(), fail: ["sleep_logs"])
    var threw = false
    do {
      try await DailyLog.recompute(userId: "u1", date: Self.today, store: store, now: Self.now, in: Self.utc)
    } catch {
      threw = true
    }
    #expect(threw)
    #expect(store.writes.isEmpty)
    let reads = DailyLog.queries(userId: "u1", date: Self.today, in: Self.utc)
    #expect(store.reads.count == 13)
    #expect(Set(store.reads) == Set([reads.existing] + reads.sources))
  }

  /// Hồ sơ thiếu không phải lỗi: vẫn ghi một hàng.
  @Test func missingProfileStillInserts() async throws {
    var t = Self.tables()
    t["profiles"] = []
    let store = TableStore(tables: t)
    try await DailyLog.recompute(userId: "u1", date: Self.today, store: store, now: Self.now, in: Self.utc)
    #expect(store.writes.count == 1)
    #expect(store.writes.first?.kind == "insert")
  }
}
