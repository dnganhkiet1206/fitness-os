@testable import ASCNDCore
import Foundation
import Testing

/// Thẻ tập luyện của Hôm nay (#527 N3). Golden: `training-card.ts` /
/// `training-week.ts` / `goal-training.ts` / `session-load.ts` @ fac9ac2 biên
/// dịch + biểu thức của `TrainingCard` chép nguyên văn (`gen-training.mjs`,
/// TZ Los Angeles — có 8/3 và 1/11/2026, hai ngày đổi giờ).
struct TrainingCardGoldenTests {
  static func golden() throws -> JSONValue {
    let url = try #require(
      Bundle.module.url(forResource: "training-card-golden", withExtension: "json", subdirectory: "Fixtures"))
    return try JSONDecoder().decode(JSONValue.self, from: Data(contentsOf: url))
  }

  static func array(_ v: JSONValue?) -> [JSONValue] {
    if case .array(let a)? = v { return a }
    return []
  }

  static let la = TimeZone(identifier: "America/Los_Angeles")!

  static func at(_ v: JSONValue?) throws -> EpochMillis {
    try #require(v?.stringValue.flatMap { EpochMillis(iso8601: $0) }, "\(String(describing: v))")
  }

  /// Số của golden: `null` là NaN (JSON không có NaN).
  static func num(_ v: JSONValue?) -> Double { v?.doubleValue ?? .nan }

  static func same(_ a: Double, _ b: JSONValue?) -> Bool {
    let e = num(b)
    return a == e || a.isNaN && e.isNaN
  }

  @Test func constantsMatchRN() throws {
    let g = try Self.golden()
    #expect(g["tz"]?.stringValue == "America/Los_Angeles")
    #expect(Double(TrainingCard.trendWeeks) == g["trendWeeks"]?.doubleValue)
    #expect(Double(TrainingCard.staleAfterDays) == g["staleAfterDays"]?.doubleValue)
    #expect(TrainingCard.acwrMax == g["acwrMax"]?.doubleValue)
  }

  @Test func averageWeekMatchesRN() throws {
    let cases = Self.array(try Self.golden()["averageWeek"])
    #expect(cases.count == 7)
    for c in cases {
      let out = TrainingCard.averageWeek(Self.num(c["v"]), days: Self.num(c["d"]))
      #expect(Self.same(out, c["out"]), "\(c)")
    }
  }

  @Test func acwrPercentMatchesRN() throws {
    let cases = Self.array(try Self.golden()["acwrPercent"])
    #expect(cases.count == 8)
    for c in cases {
      #expect(Self.same(TrainingCard.acwrPercent(Self.num(c["a"])), c["out"]), "\(c)")
    }
  }

  @Test func strengthTargetMatchesGoalTraining() throws {
    let cases = Self.array(try Self.golden()["goals"])
    #expect(cases.count == 10)
    for c in cases {
      let goal = c["goal"]?.stringValue.flatMap { $0 == "undefined" ? nil : $0 }
      #expect(Double(TrainingCard.strengthTarget(goal: goal)) == c["strengthDays"]?.doubleValue, "\(c)")
    }
  }

  @Test func daysSinceMatchesRN() throws {
    let cases = Self.array(try Self.golden()["daysSince"])
    #expect(cases.count == 8 * (7 * 4 + 1))
    for c in cases {
      let now = try Self.at(c["now"])
      #expect(Double(TrainingCard.daysSince(c["at"], now: now, in: Self.la)) == c["out"]?.doubleValue, "\(c)")
    }
  }

  @Test func cardMatchesRN() throws {
    let cases = Self.array(try Self.golden()["cards"])
    #expect(cases.count == 240)
    var empty = 0, stale = 0, judged = 0, flat = 0
    for c in cases {
      let i = c["input"]
      let now = try Self.at(i?["now"])
      let goal: TrainingCard.Goal =
        i?["profile"]?.stringValue == "unloaded" ? .unloaded : .loaded(i?["profile"]?["goal"]?.stringValue)
      let card = TrainingCard.card(
        acwr: i?["acwr"]?.doubleValue, latest: i?["latest"], rows: Self.array(i?["rows"]), goal: goal, now: now,
        in: Self.la)
      let o = try #require(c["out"])
      if o["empty"] == .bool(true) {
        #expect(card == nil, "\(i?["now"] as Any)")
        empty += 1
        continue
      }
      guard let card else {
        Issue.record("thẻ nil, RN có thẻ: \(c)")
        continue
      }
      let tag = "now \(i?["now"]?.stringValue ?? "")"
      #expect(card.judged == (o["judged"] == .bool(true)), "\(tag)")
      #expect(card.judged == (o["verdict"] == .bool(true)), "\(tag)")
      #expect(card.zone.rawValue == o["zone"]?.stringValue, "\(tag)")
      #expect(card.heavier == (o["comparison"]?["heavier"] == .bool(true)), "\(tag)")
      #expect(Double(card.percent) == o["comparison"]?["percent"]?.doubleValue, "\(tag)")
      #expect(Double(card.weekSessions) == o["weekSessions"]?.doubleValue, "\(tag)")
      #expect(Self.same(card.weekVolume, o["weekVolume"]), "\(tag) weekVolume \(card.weekVolume)")
      #expect(Self.same(card.habitVolume, o["habitVolume"]), "\(tag) habitVolume \(card.habitVolume)")
      #expect(Self.same(card.weekLoad, o["weekLoad"]), "\(tag) weekLoad \(card.weekLoad)")
      #expect(Self.same(card.habitLoad, o["habitLoad"]), "\(tag) habitLoad \(card.habitLoad)")
      #expect(card.hasPR == (o["hasPR"] == .bool(true)), "\(tag)")
      #expect(card.strengthTarget.map(Double.init) == o["strengthTarget"]?.doubleValue, "\(tag)")
      #expect(Double(card.strengthDone) == o["strengthDone"]?.doubleValue, "\(tag)")
      #expect(card.showStrength == (o["showStrength"] == .bool(true)), "\(tag)")
      #expect(card.latest.stale == (o["stale"] == .bool(true)), "\(tag)")
      #expect(Double(card.latest.age) == o["age"]?.doubleValue, "\(tag)")
      #expect(card.showTrend == (o["showTrend"] == .bool(true)), "\(tag)")
      let trend = Self.array(o["trend"])
      #expect(card.trend.count == trend.count, "\(tag)")
      for (k, w) in trend.enumerated() where k < card.trend.count {
        #expect(Self.same(card.trend[k].volume, w["volume"]), "\(tag) tuần \(k) volume")
        #expect(Double(card.trend[k].sessions) == w["sessions"]?.doubleValue, "\(tag) tuần \(k) sessions")
      }
      #expect(Self.same(card.trendMax, o["trendMax"]), "\(tag) trendMax")
      for (k, b) in Self.array(o["bars"]).enumerated() where k < card.trend.count {
        #expect(Self.same(card.barHeight(k), b["height"]), "\(tag) cột \(k)")
      }
      if o["habitLine"] == .null {
        #expect(card.habitLine == nil, "\(tag)")
      } else {
        #expect(card.habitLine.map { Self.same($0, o["habitLine"]) } == true, "\(tag)")
      }
      let l = o["latest"]
      #expect(card.latest.name == l?["name"]?.stringValue, "\(tag)")
      #expect(Double(card.latest.sets) == l?["sets"]?.doubleValue, "\(tag)")
      #expect(Self.same(card.latest.volume, l?["volume"]), "\(tag)")
      #expect(card.latest.rpe.map { Self.same($0, l?["rpe"]) } ?? (l?["rpe"] == .null), "\(tag)")
      if card.latest.stale { stale += 1 }
      if card.judged { judged += 1 }
      if !card.showTrend { flat += 1 }
    }
    // Golden phủ đủ các nhánh của thẻ.
    #expect(empty > 10 && stale > 10 && judged > 10 && flat > 5)
  }
}

/// Luật native-only của sổ (đọc hỏng, đổi phiên).
@MainActor
struct TrainingCardBookTests {
  final class Store: RowStore, @unchecked Sendable {
    var fail = false
    var rows: [JSONValue] = []
    func select(_ q: RowQuery) async throws(RowStoreError) -> [JSONValue] {
      if fail { throw RowStoreError(code: nil, message: "offline") }
      return q.limit == 1 ? Array(rows.prefix(1)) : rows
    }
    func insert(_ table: String, _ row: [String: JSONValue]) async throws(RowStoreError) {}
    func update(_ table: String, _ row: [String: JSONValue], where filters: [RowQuery.Filter]) async throws(RowStoreError)
      -> Int
    { 0 }
  }

  static let la = TimeZone(identifier: "America/Los_Angeles")!
  static let now = EpochMillis(iso8601: "2026-10-13T16:15:00.000Z")!

  static func session(_ iso: String, reps: Double = 10, volume: Double = 1000) -> JSONValue {
    .object([
      "id": .string(iso), "date_time": .string(iso), "template_name": .string("Push"), "session_rpe": .number(8),
      "volume_load": .number(volume), "pr_detected": .bool(false),
      "sets": .array([.object(["reps": .number(reps), "weight": .number(60)])]),
    ])
  }

  @Test func readsMatchTheRNQueries() {
    let q = TrainingCard.reads(userId: "u1", now: Self.now, in: Self.la)
    #expect(q.history.table == "workout_sessions")
    #expect(q.history.columns == "id, date_time, template_name, session_rpe, volume_load, pr_detected, sets")
    // 56 ngày lịch trước, cùng giờ đồng hồ: 2026-08-18 09:15 PDT.
    #expect(q.history.filters.contains(.gte("date_time", .string("2026-08-18T16:15:00.000Z"))))
    #expect(q.history.order == RowQuery.Order(column: "date_time", ascending: false))
    #expect(q.history.limit == nil)
    #expect(q.latest.limit == 1)
    #expect(q.latest.filters == [.eq("user_id", .string("u1"))])
  }

  @Test func noSessionYetIsAStateNotAnAbsence() async {
    let store = Store()
    let book = TrainingCardBook(userId: "u1", store: store, in: Self.la)
    await book.load(now: Self.now)
    #expect(book.phase == .ready(rows: [], latest: nil))
    #expect(book.card(acwr: 1.2, goal: .loaded(nil)) == nil)
  }

  @Test func failedFirstReadIsFailedButAFailedRefreshKeepsTheCard() async {
    let store = Store()
    store.fail = true
    let book = TrainingCardBook(userId: "u1", store: store, in: Self.la)
    await book.load(now: Self.now)
    #expect(book.phase == .failed)
    store.fail = false
    store.rows = [Self.session("2026-10-12T19:00:00.000Z")]
    await book.load(now: Self.now)
    #expect(book.card(acwr: nil, goal: .unloaded)?.weekSessions == 1)
    store.fail = true
    await book.load(now: Self.now)
    #expect(book.card(acwr: nil, goal: .unloaded)?.weekSessions == 1)
  }

  @Test func closedBookIgnoresALateAnswer() async {
    let store = Store()
    store.rows = [Self.session("2026-10-12T19:00:00.000Z")]
    let book = TrainingCardBook(userId: "u1", store: store, in: Self.la)
    book.close()
    await book.load(now: Self.now)
    #expect(book.phase == .loading)
  }

  /// "chưa đủ lịch sử" (ACWR nil / 0) không phải vùng "mất nền".
  @Test func noRatioIsNotAVerdict() {
    let rows = [Self.session("2026-10-12T19:00:00.000Z")]
    for acwr in [nil, 0.0] as [Double?] {
      let c = TrainingCard.card(acwr: acwr, latest: rows[0], rows: rows, goal: .loaded(nil), now: Self.now, in: Self.la)
      #expect(c?.judged == false)
    }
    let c = TrainingCard.card(acwr: 0.3, latest: rows[0], rows: rows, goal: .loaded(nil), now: Self.now, in: Self.la)
    #expect(c?.judged == true)
    #expect(c?.zone == .detraining)
  }
}
