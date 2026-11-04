@testable import ASCNDCore
import Foundation
import Testing

/// Khoá Face ID và tải dữ liệu (#527 mục 7, Kiệt duyệt 01/11).
struct PrivacyTests {
  /// Kho giả: mỗi bảng một danh sách hàng; đọc theo trang bằng `offset` / `limit`.
  final class Rows: RowStore, @unchecked Sendable {
    var tables: [String: [JSONValue]] = [:]
    var failOn: String?
    var queries: [RowQuery] = []

    func select(_ q: RowQuery) async throws(RowStoreError) -> [JSONValue] {
      queries.append(q)
      if q.table == failOn { throw RowStoreError(code: nil, message: "down") }
      var all = tables[q.table] ?? []
      if case .or(let cond)? = q.filters.first, cond.hasPrefix("meal_entry_id.in.(") {
        let ids = Set(cond.dropFirst("meal_entry_id.in.(".count).dropLast().split(separator: ",").map(String.init))
        all = all.filter { ids.contains($0["meal_entry_id"]?.stringValue ?? "") }
      }
      let from = min(q.offset ?? 0, all.count)
      return Array(all[from..<min(from + (q.limit ?? all.count), all.count)])
    }

    func insert(_ table: String, _ row: [String: JSONValue]) async throws(RowStoreError) {}
    func update(_ table: String, _ row: [String: JSONValue], where filters: [RowQuery.Filter]) async throws(RowStoreError)
      -> Int
    { 0 }
  }

  static func row(_ id: Int, _ extra: [String: JSONValue] = [:]) -> JSONValue {
    .object(["id": .string("r\(id)"), "user_id": .string("u")].merging(extra) { $1 })
  }

  @Test func relockTimes() {
    #expect(!AppLock.needsUnlock(away: 0.4, relock: .immediately))
    #expect(AppLock.needsUnlock(away: 2, relock: .immediately))
    #expect(!AppLock.needsUnlock(away: 59, relock: .oneMinute))
    #expect(AppLock.needsUnlock(away: 60, relock: .oneMinute))
    #expect(!AppLock.needsUnlock(away: 299, relock: .fiveMinutes))
    #expect(AppLock.needsUnlock(away: 300, relock: .fiveMinutes))
  }

  /// Đọc hết mọi trang (RN từng cắt ngầm ở 500) và món theo id bữa.
  @Test func readsEveryPageAndMealItems() async throws {
    let s = Rows()
    s.tables["meal_entries"] = (0..<2_345).map { Self.row($0) }
    s.tables["meal_entry_items"] = [
      .object(["id": .string("i1"), "meal_entry_id": .string("r0")]),
      .object(["id": .string("i2"), "meal_entry_id": .string("r2344")]),
      .object(["id": .string("i3"), "meal_entry_id": .string("someone-else")]),
    ]
    let b = try await DataExport.load(userId: "u", store: s)
    #expect(b.rows["meal_entries"]?.count == 2_345)
    #expect(b.rows["meal_entry_items"]?.count == 2)
    #expect(s.queries.filter { $0.table == "meal_entries" }.map(\.offset) == [0, 1_000, 2_000])
    #expect(s.queries.filter { $0.table == "workout_sessions" }.allSatisfy { $0.filters == [.eq("user_id", .string("u"))] })
    #expect(b.count(.meals) == 2_347)
  }

  /// Hỏng một bảng → ném lỗi, không bao giờ trả gói thiếu.
  @Test func failureIsNotAPartialExport() async {
    let s = Rows()
    s.tables["daily_logs"] = [Self.row(1)]
    s.failOn = "sleep_logs"
    await #expect(throws: RowStoreError.self) { _ = try await DataExport.load(userId: "u", store: s) }
  }

  /// CSV mở được bằng Excel: BOM, CRLF, bọc ngoặc khi cần, id / ngày lên đầu,
  /// số nguyên không có ".0", dữ liệu lồng thành JSON trong một ô.
  @Test func csvIsExcelFriendly() throws {
    let data = DataExport.csv([
      .object([
        "id": .string("a"), "notes": .string("Ức gà, cơm \"trắng\""), "kcal": .number(534), "kg": .number(18.4),
        "date": .string("2026-11-01"), "sets": .array([.object(["reps": .number(10)])]), "done": .bool(true),
        "gone": .null,
      ])
    ])
    #expect(Array(data.prefix(3)) == [0xEF, 0xBB, 0xBF])
    let text = try #require(String(data: data.dropFirst(3), encoding: .utf8))
    let lines = text.components(separatedBy: "\r\n")
    #expect(lines[0] == "id,date,done,gone,kcal,kg,notes,sets")
    #expect(lines[1] == #"a,2026-11-01,true,,534,18.4,"Ức gà, cơm ""trắng""","[{""reps"":10}]""#)
  }

  @Test func bundleHasReadmeJsonAndOneCsvPerTable() {
    let b = DataExport.Bundle(rows: ["weight_logs": [Self.row(1)]])
    let files = DataExport.files(b, exportedAt: Date(timeIntervalSince1970: 0), lang: "vi")
    let paths = files.map(\.path)
    #expect(paths.first == "README.txt")
    #expect(paths.contains("ascnd.json"))
    #expect(paths.contains("csv/can-nang.csv"))
    #expect(paths.contains("csv/mon-an.csv"))
    #expect(paths.filter { $0.hasPrefix("csv/") }.count == DataExport.tables.count + 1)
    #expect(Set(DataExport.tables.map(\.file)).count == DataExport.tables.count)
    #expect(DataExport.name(LocalDate("2026-11-01")!) == "ascnd-2026-11-01")
  }
}
