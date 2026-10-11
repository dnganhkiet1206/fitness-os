@testable import ASCNDCore
import Foundation
import Testing

/// Thẻ Dinh dưỡng hôm nay (#527). Golden: `macro-targets.ts` @ fac9ac2 biên dịch
/// + phép tính của `NutritionCard` / `MacroSwap` chép nguyên văn
/// (`gen-nutrition-card.mjs`).
struct NutritionTodayGoldenTests {
  static func golden() throws -> JSONValue {
    let url = try #require(Bundle.module.url(forResource: "nutrition-card-golden", withExtension: "json", subdirectory: "Fixtures"))
    return try JSONDecoder().decode(JSONValue.self, from: Data(contentsOf: url))
  }

  static func array(_ v: JSONValue?) -> [JSONValue] {
    if case .array(let a)? = v { return a }
    return []
  }

  /// Hồ sơ của ca (các cột số của `profiles`; `null` là chưa đặt).
  static func profile(_ v: JSONValue?) -> Profile? {
    guard case .object? = v else { return nil }
    var p = Profile(userId: "u1")
    p.tdeeTargetKcal = v?["tdee_target_kcal"]?.doubleValue
    p.macroProteinG = v?["macro_protein_g"]?.doubleValue
    p.macroCarbsG = v?["macro_carbs_g"]?.doubleValue
    p.macroFatG = v?["macro_fat_g"]?.doubleValue
    p.macroFiberG = v?["macro_fiber_g"]?.doubleValue
    return p
  }

  @Test func cardMatchesRN() throws {
    let g = try Self.golden()
    #expect(g["surplusAllowance"]?.doubleValue == NutritionToday.surplusAllowance)
    let days = Self.array(g["days"])
    #expect(days.count == 400)
    var bands = Set<String>()
    for d in days {
      let row: JSONValue? = d["row"] == .null ? nil : d["row"]
      let t = NutritionToday.totals(row)
      #expect(t.kcal == d["kcal"]?.doubleValue, "\(d)")
      let p = Self.profile(d["profile"])
      let target = NutritionToday.calorieTarget(p)
      #expect(target == d["calorieTarget"]?.doubleValue, "\(d)")

      let r = NutritionToday.ring(kcal: t.kcal, target: target)
      let gr = d["ring"]
      #expect(r.fill == gr?["calPct"]?.doubleValue, "\(d)")
      #expect(r.percentOfTarget == gr?["pctOfTarget"]?.doubleValue, "\(d)")
      #expect(r.overFill == gr?["overPct"]?.doubleValue, "\(d)")
      let band: NutritionToday.Band =
        gr?["overBudget"] == .bool(true) ? .over : gr?["inBand"] == .bool(true) ? .inBand : .under
      #expect(r.band == band, "\(d)")
      bands.insert("\(band)")
      let delta = gr?["delta"]?.doubleValue ?? .nan
      if gr?["onTarget"] == .bool(true) {
        #expect(r.line == .onTarget, "\(d)")
      } else if gr?["over"] == .bool(true) {
        #expect(r.line == .surplus(delta), "\(d)")
      } else {
        #expect(r.line == .remaining(-delta), "\(d)")
      }

      let tiles = NutritionToday.tiles(t, targets: NutritionToday.macroTargets(p))
      let want = Self.array(d["tiles"])
      #expect(tiles.count == want.count)
      for (tile, w) in zip(tiles, want) {
        #expect(tile.current == w["current"]?.doubleValue, "\(d)")
        #expect(tile.target == w["target"]?.doubleValue, "\(d)")
        #expect(tile.fill == w["pct"]?.doubleValue, "\(d)")
        #expect(tile.eaten == w["eatenNow"]?.doubleValue, "\(d)")
        #expect(tile.left == w["left"]?.doubleValue, "\(d)")
        #expect(tile.over == (w["over"] == .bool(true)), "\(d)")
        #expect("\(tile.word)" == w["leftWord"]?.stringValue, "\(d)")
        #expect(tile.leftText == w["leftNum"]?.stringValue, "\(d)")
        #expect(tile.overHard == (w["overHard"] == .bool(true)), "\(d)")
      }
    }
    #expect(bands.count == 3)
  }
}

/// Kho giả: trả `rows`, hoặc ném khi `fail`.
private final class TodayRows: RowStore, @unchecked Sendable {
  private let lock = NSLock()
  private var _rows: [JSONValue]
  private var _fail = false
  private var _queries: [RowQuery] = []
  init(_ rows: [JSONValue]) { _rows = rows }
  var queries: [RowQuery] { lock.withLock { _queries } }
  func set(rows: [JSONValue]? = nil, fail: Bool) {
    lock.withLock {
      if let rows { _rows = rows }
      _fail = fail
    }
  }
  func select(_ q: RowQuery) async throws(RowStoreError) -> [JSONValue] {
    let (rows, fail) = lock.withLock { () -> ([JSONValue], Bool) in
      _queries.append(q)
      return (_rows, _fail)
    }
    if fail { throw RowStoreError(code: "500", message: "boom") }
    return rows
  }
  func insert(_ table: String, _ row: [String: JSONValue]) async throws(RowStoreError) {}
  func update(_ table: String, _ row: [String: JSONValue], where filters: [RowQuery.Filter]) async throws(RowStoreError)
    -> Int
  { 0 }
  func upsert(_ table: String, _ rows: [[String: JSONValue]], onConflict: String) async throws(RowStoreError) {}
}

/// 2026-10-11 12:00 giờ Hà Nội.
private struct TodayClock: WallClock {
  func now() -> Date { Date(timeIntervalSince1970: 1_791_694_800) }
}

@MainActor
struct NutritionTodayBookTests {
  fileprivate static func book(_ rows: TodayRows) -> NutritionTodayBook {
    NutritionTodayBook(
      userId: "u1", store: rows, clock: TodayClock(), timeZone: TimeZone(identifier: "Asia/Ho_Chi_Minh")!)
  }

  /// Đang tải ≠ ngày chưa ăn; xong thì đúng số; hàng của đúng người, đúng ngày local.
  @Test func loadsTodayForThisUser() async {
    let rows = TodayRows([.object(["kcal": .number(1234.6), "protein_g": .string("80")])])
    let b = Self.book(rows)
    #expect(b.phase == .loading)
    await b.load()
    #expect(b.phase == .ready(NutritionToday.Totals(kcal: 1235, protein: 80, carbs: 0, fat: 0, fiber: 0)))
    let q = rows.queries.first
    #expect(q?.table == "daily_logs")
    #expect(q?.filters == [.eq("user_id", .string("u1")), .eq("date", .string("2026-10-11"))])
  }

  /// Chưa có hàng hôm nay: một ngày chưa ăn, không phải lỗi.
  @Test func noRowIsAnEmptyDay() async {
    let b = Self.book(TodayRows([]))
    await b.load()
    #expect(b.phase == .ready(.zero))
  }

  /// Đọc hỏng lần đầu: lỗi; hỏng khi đã có số: giữ số.
  @Test func failureNeverDrawsAZero() async {
    let rows = TodayRows([])
    rows.set(fail: true)
    let b = Self.book(rows)
    await b.load()
    guard case .failed = b.phase else {
      Issue.record("\(b.phase)")
      return
    }
    rows.set(rows: [.object(["kcal": .number(500)])], fail: false)
    await b.load()
    #expect(b.phase == .ready(NutritionToday.Totals(kcal: 500, protein: 0, carbs: 0, fat: 0, fiber: 0)))
    rows.set(fail: true)
    await b.load()
    #expect(b.phase == .ready(NutritionToday.Totals(kcal: 500, protein: 0, carbs: 0, fat: 0, fiber: 0)))
  }

  /// Đóng rồi thì lượt đọc về muộn không đổi gì.
  @Test func closedBookIgnoresLateReads() async {
    let b = Self.book(TodayRows([.object(["kcal": .number(900)])]))
    b.close()
    await b.load()
    #expect(b.phase == .loading)
  }
}
