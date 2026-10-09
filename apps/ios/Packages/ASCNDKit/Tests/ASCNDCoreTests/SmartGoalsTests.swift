@testable import ASCNDCore
import Foundation
import Testing

/// Hiệu chỉnh mục tiêu = `smart-goals.tsx` + `adaptive-tdee.ts` @ fac9ac2
/// (`Fixtures/smart-goals-golden.json`, `gen-smart-goals.mjs` — chạy chính mã RN).
struct SmartGoalsGoldenTests {
  static func root() throws -> JSONValue {
    let url = try #require(
      Bundle.module.url(forResource: "smart-goals-golden", withExtension: "json", subdirectory: "Fixtures"))
    return try JSONDecoder().decode(JSONValue.self, from: Data(contentsOf: url))
  }

  static func array(_ v: JSONValue?) -> [JSONValue] {
    if case .array(let a)? = v { return a }
    return []
  }

  static func num(_ v: JSONValue?) -> Double? {
    if case .number(let n)? = v { return n }
    return nil
  }

  static func check(_ r: Result<AdaptiveTDEE.Estimate, AdaptiveTDEE.Refusal>, _ want: JSONValue?, _ ctx: String) {
    switch r {
    case .success(let e):
      #expect(want?["ok"] == .bool(true), "\(ctx)")
      #expect(Double(e.measured) == num(want?["measured"]), "\(ctx)")
      #expect(Double(e.meanIntake) == num(want?["meanIntake"]), "\(ctx)")
      #expect(e.kgPerWeek == num(want?["kgPerWeek"]), "\(ctx)")
      #expect(Double(e.loggedDays) == num(want?["loggedDays"]), "\(ctx)")
      #expect(Double(e.weighIns) == num(want?["weighIns"]), "\(ctx)")
    case .failure(let why):
      #expect(want?["ok"] == .bool(false), "\(ctx)")
      #expect(want?["reason"]?.stringValue == why.rawValue, "\(ctx)")
    }
  }

  @Test func everyScreenCaseMatchesRN() throws {
    let root = try Self.root()
    let cases = Self.array(root["cases"])
    #expect(cases.count == 260)
    var suggested = 0
    for c in cases {
      let today = try #require(LocalDate(c["today"]?.stringValue ?? ""))
      #expect(SmartGoals.weightQuery(userId: "u", today: today).filters.contains(.gte("date", c["weightFrom"]!)))
      #expect(SmartGoals.dailyQuery(userId: "u", today: today).filters.contains(.gte("date", c["dailyFrom"]!)))
      let profile = c["profile"] == .null ? nil : c["profile"]
      let daily = Self.array(c["daily"])
      let a = SmartGoals.analyse(weights: Self.array(c["weights"]), daily: daily, profile: profile, today: today)
      let want = c["analysis"]
      if let a {
        let w = try #require(want, "\(c)")
        #expect(a.weeks.map(\.label) == Self.array(w["weeks"]).compactMap(\.stringValue), "\(c)")
        for (g, v) in zip(a.weeks, Self.array(w["values"])) {
          #expect(abs(g.kg - (Self.num(v) ?? .nan)) < 1e-9, "\(c)")
        }
        #expect(abs(a.weeklyChange - (Self.num(w["weeklyChange"]) ?? .nan)) < 1e-9)
        #expect(a.onTrack == (w["onTrack"] == .bool(true)), "\(c)")
        #expect(a.targetMin == Self.num(w["targetMin"]))
        #expect(a.targetMax == Self.num(w["targetMax"]))
        #expect(a.goal == w["goal"]?.stringValue)
        #expect(Double(a.currentCal) == Self.num(w["currentCal"]), "\(c)")
        #expect(a.twoWeekDeviation == (w["twoWeekDeviation"] == .bool(true)), "\(c)")
        #expect(Double(a.calorieAdjustment) == Self.num(w["calorieAdjustment"]), "\(c)")
        #expect(a.fromMeasurement == (w["fromMeasurement"] == .bool(true)))
        #expect(Double(a.measuredDays) == Self.num(w["measuredDays"]))
        Self.check(a.estimate, w["measured"], "\(c)")
        let kg = [a.weeklyChange, a.targetMin, a.targetMax].map { SmartGoals.signed($0, unit: .kg) }
        let lbs = [a.weeklyChange, a.targetMin, a.targetMax].map { SmartGoals.signed($0, unit: .lbs) }
        #expect(kg == Self.array(w["text"]?["kg"]).compactMap(\.stringValue), "\(c)")
        #expect(lbs == Self.array(w["text"]?["lbs"]).compactMap(\.stringValue), "\(c)")
        if a.suggests { suggested += 1 }
      } else {
        #expect(want == .null, "\(c)")
      }
      let p = SmartGoals.protein(daily: daily, profile: profile)
      if let p {
        let w = try #require(c["protein"])
        #expect(p.target == Self.num(w["target"]), "\(c)")
        #expect(Double(p.perMeal) == Self.num(w["perMeal"]))
        #expect(Double(p.lowDays) == Self.num(w["lowDays"]), "\(c)")
        #expect(Double(p.totalDays) == Self.num(w["totalDays"]))
      } else {
        #expect(c["protein"] == .null, "\(c)")
      }
    }
    #expect(suggested > 20)
  }

  @Test func adaptiveRefusesAndMeasuresLikeRN() throws {
    let root = try Self.root()
    let cases = Self.array(root["adaptive"])
    #expect(cases.count == 13)
    for c in cases {
      let intake = Self.array(c["intake"]).map {
        AdaptiveTDEE.DayIntake(date: $0["date"]?.stringValue ?? "", kcal: Self.num($0["kcal"]) ?? .nan)
      }
      let weights = Self.array(c["weights"]).map {
        AdaptiveTDEE.WeighIn(date: $0["date"]?.stringValue ?? "", kg: Self.num($0["kg"]) ?? .nan)
      }
      Self.check(AdaptiveTDEE.estimate(intake: intake, weights: weights), c["result"], "\(c)")
    }
    for w in Self.array(root["worth"]) {
      let got = AdaptiveTDEE.worthMentioning(Self.num(w["measured"]) ?? .nan, Self.num(w["target"]) ?? .nan)
      #expect(got == (w["worth"] == .bool(true)))
    }
  }

  @Test func weekStartsOnMondayAndSundayClosesIt() {
    let sunday = LocalDate("2026-10-11")!
    #expect(SmartGoals.weekStart(sunday) == LocalDate("2026-10-05"))
    #expect(SmartGoals.weekStart(LocalDate("2026-10-05")!) == LocalDate("2026-10-05"))
    #expect(SmartGoals.weekStart(LocalDate("2026-10-10")!) == LocalDate("2026-10-05"))
    #expect(SmartGoals.weekStart(LocalDate("1970-01-01")!) == LocalDate("1969-12-29"))
  }

  @Test func infiniteNumbersAreRefusedNotCrashed() {
    let intake = (1...12).map { AdaptiveTDEE.DayIntake(date: "2026-09-\(10 + $0)", kcal: $0 == 1 ? .infinity : 2000) }
    let weights = ["01", "03", "05", "07", "09", "12"].map { AdaptiveTDEE.WeighIn(date: "2026-09-\($0)", kg: 80) }
    guard case .success(let e) = AdaptiveTDEE.estimate(intake: intake, weights: weights) else {
      Issue.record("11 ngày hữu hạn vẫn đủ")
      return
    }
    #expect(e.loggedDays == 11)
    #expect(e.measured == 2000)
  }
}

@MainActor
struct SmartGoalsBookTests {
  final class Rows: RowStore, @unchecked Sendable {
    var tables: [String: [JSONValue]] = [:]
    var fail = false
    func select(_ q: RowQuery) async throws(RowStoreError) -> [JSONValue] {
      if fail { throw RowStoreError(code: nil, message: "down") }
      return tables[q.table] ?? []
    }
    func insert(_ table: String, _ row: [String: JSONValue]) async throws(RowStoreError) {}
    func update(_ table: String, _ row: [String: JSONValue], where filters: [RowQuery.Filter]) async throws(RowStoreError)
      -> Int
    { 0 }
  }

  @Test func readsThreeTablesAndKeepsNumbersOnAFailedReload() async {
    let rows = Rows()
    let w = { (d: String, kg: Double) in JSONValue.object(["date": .string(d), "weight_kg": .number(kg)]) }
    rows.tables["weight_logs"] = [w("2026-09-22", 80), w("2026-09-29", 79.6), w("2026-10-06", 79.2)]
    rows.tables["daily_logs"] = [.object(["date": .string("2026-10-08"), "kcal": .number(2000), "protein_g": .number(90)])]
    rows.tables["profiles"] = [
      .object(["goal": .string("cut"), "sex": .string("female"), "macro_protein_g": .number(140), "units_weight": .string("lbs")])
    ]
    let book = SmartGoalsBook(userId: "u", today: LocalDate("2026-10-09")!, store: rows)
    await book.load()
    guard case .ready(let s) = book.phase else {
      Issue.record("\(book.phase)")
      return
    }
    #expect(s.goal == "cut")
    #expect(s.unit == .lbs)
    #expect(s.analysis?.weeks.map(\.label) == ["W2", "W3", "W4"])
    #expect(s.protein == SmartGoals.Protein(target: 140, perMeal: 35, lowDays: 1, totalDays: 1))
    rows.fail = true
    await book.load()
    #expect(book.phase == .ready(s))
  }

  @Test func firstReadFailingIsAnErrorNotNoData() async {
    let rows = Rows()
    rows.fail = true
    let book = SmartGoalsBook(userId: "u", today: LocalDate("2026-10-09")!, store: rows)
    await book.load()
    #expect(book.phase == .failed)
  }
}
