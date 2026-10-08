@testable import ASCNDCore
import Foundation
import Testing

/// `daily_logs` (#266) so với CHÍNH `recomputeDailyLog` của RN @ fac9ac2:
/// `daily-log-golden.json` là đầu ra của mã RN biên dịch, chạy trên một
/// Supabase giả ở sáu múi giờ (`apps/ios/tools/daily-log-golden`). Swift chạy
/// CÙNG dữ liệu qua `DailyLog.recompute` và phải:
/// - hỏi đúng bảng, cột, cửa sổ thời gian, thứ tự, giới hạn RN đã hỏi;
/// - ghi đúng một hàng như RN (insert hay update có điều kiện), từng cột,
///   từng bit — không dung sai;
/// - đọc lỗi thì không ghi gì.
struct DailyLogGoldenTests {
  /// Bảng giả: thực thi `RowQuery` như stub của bộ sinh golden (cột thời điểm
  /// so theo thời điểm, không theo chuỗi).
  final class TableStore: RowStore, @unchecked Sendable {
    var tables: [String: [JSONValue]]
    var fail: Set<String>
    var reads: [RowQuery] = []
    var writes: [(kind: String, row: [String: JSONValue], filters: [RowQuery.Filter])] = []

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
        case .or: true  // `recomputeDailyLog` không dùng `or`
        }
      }
    }

    func select(_ q: RowQuery) async throws(RowStoreError) -> [JSONValue] {
      reads.append(q)
      if fail.contains(q.table) { throw RowStoreError(code: nil, message: "boom") }
      var out = (tables[q.table] ?? []).filter { Self.matches($0, q.filters) }
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
      writes.append(("insert", row, []))
      tables[table, default: []].append(.object(row))
    }

    func update(_ table: String, _ row: [String: JSONValue], where filters: [RowQuery.Filter]) async throws(RowStoreError) -> Int {
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

  static func filterJSON(_ f: RowQuery.Filter) -> JSONValue {
    switch f {
    case .eq(let c, let v): .object(["op": .string("eq"), "col": .string(c), "val": v])
    case .gte(let c, let v): .object(["op": .string("gte"), "col": .string(c), "val": v])
    case .lt(let c, let v): .object(["op": .string("lt"), "col": .string(c), "val": v])
    case .or(let f): .object(["op": .string("or"), "val": .string(f)])
    }
  }

  /// Truy vấn Swift dưới dạng RN ghi trong golden.
  static func readJSON(_ q: RowQuery) -> JSONValue {
    let mode: String =
      switch q.mode {
      case .many: "many"
      case .single: "single"
      case .maybeSingle: "maybe"
      }
    return .object([
      "table": .string(q.table), "columns": .string(q.columns), "filters": .array(q.filters.map(filterJSON)),
      "order": q.order.map { JSONValue.object(["col": .string($0.column), "asc": .bool($0.ascending)]) } ?? .null,
      "limit": q.limit.map { JSONValue.number(Double($0)) } ?? .null, "mode": .string(mode),
    ])
  }

  static func root() throws -> JSONValue {
    let url = try #require(Bundle.module.url(forResource: "daily-log-golden", withExtension: "json", subdirectory: "Fixtures"))
    return try JSONDecoder().decode(JSONValue.self, from: Data(contentsOf: url))
  }

  @Test func everyCaseMatchesRN() async throws {
    let root = try Self.root()
    let now = try #require(root["now"]?.stringValue.flatMap { EpochMillis(iso8601: $0) })
    let user = try #require(root["userId"]?.stringValue)
    guard case .object(let scenarios)? = root["scenarios"], case .array(let cases)? = root["cases"] else {
      Issue.record("golden hỏng")
      return
    }
    #expect(cases.count >= 400)
    var checked = 0
    for c in cases {
      let name = "\(c["scenario"]?.stringValue ?? "?") · \(c["tz"]?.stringValue ?? "?") · \(c["date"]?.stringValue ?? "?")"
      let tz = try #require(TimeZone(identifier: c["tz"]?.stringValue ?? ""), "\(name)")
      let date = try #require(LocalDate(c["date"]?.stringValue ?? ""))
      guard case .object(let t)? = scenarios[c["scenario"]?.stringValue ?? ""] else {
        Issue.record("\(name): thiếu bảng")
        continue
      }
      var tables: [String: [JSONValue]] = [:]
      for (k, v) in t {
        if case .array(let a) = v { tables[k] = a }
      }
      if let existing = c["existing"], existing != JSONValue.null { tables["daily_logs"] = [existing] }
      let fail: Set<String> = c["scenario"]?.stringValue == "read-fails" ? ["sleep_logs"] : []
      let store = TableStore(tables: tables, fail: fail)

      var threw = false
      do {
        try await DailyLog.recompute(userId: user, date: date, store: store, now: now, in: tz)
      } catch {
        threw = true
      }
      #expect(threw == (c["error"] != JSONValue.null), "\(name): lỗi")

      // Truy vấn: đúng RN. RN gửi 12 nguồn song song rồi mới xét lỗi; Swift
      // dừng ở nguồn hỏng đầu tiên — khi ấy so phần đầu.
      guard case .array(let rnReads)? = c["reads"] else { continue }
      let mine = store.reads.map(Self.readJSON)
      if threw {
        #expect(mine.count <= rnReads.count && Array(rnReads.prefix(mine.count)) == mine, "\(name): truy vấn")
      } else {
        #expect(mine == rnReads, "\(name): truy vấn")
      }

      guard case .array(let rnWrites)? = c["write"] else { continue }
      #expect(store.writes.count == rnWrites.count, "\(name): số lệnh ghi")
      for (w, rn) in zip(store.writes, rnWrites) {
        #expect(JSONValue.string(w.kind) == rn["kind"], "\(name): insert/update")
        #expect(JSONValue.object(w.row) == rn["row"], "\(name): hàng\n swift \(w.row)\n rn    \(rn["row"] ?? .null)")
        if w.kind == "update" {
          #expect(JSONValue.array(w.filters.map(Self.filterJSON)) == rn["filters"], "\(name): điều kiện update")
        }
      }
      checked += 1
    }
    #expect(checked == cases.count)
  }

  /// Golden phủ đủ các nhánh khuyến nghị tới được (`listen` không tới được:
  /// mọi điểm đều rơi vào xanh / vàng / đỏ) và cả hai đường ghi.
  @Test func goldenCoversEveryReachableBranch() throws {
    guard case .array(let cases)? = try Self.root()["cases"] else { return }
    var keys = Set<String>(), kinds = Set<String>()
    for c in cases {
      guard case .array(let w)? = c["write"], let first = w.first else { continue }
      kinds.insert(first["kind"]?.stringValue ?? "")
      keys.insert(first["row"]?["readiness_recommendation"]?.stringValue ?? "")
    }
    #expect(kinds == ["insert", "update"])
    #expect(
      keys.isSuperset(of: [
        "", "green_no_load", "green_optimal", "green_watch", "yellow_sleep", "yellow_reduce", "red_rest", "red_recover",
        "red_load_only",
      ]))
  }
}
