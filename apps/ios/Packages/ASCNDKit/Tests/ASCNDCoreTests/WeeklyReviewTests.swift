@testable import ASCNDCore
import Foundation
import Testing

/// Tổng kết tuần (#527) so với biểu thức NGUYÊN VĂN của `app/weekly-review.tsx`
/// + CHÍNH `nutrition-mean.ts` / `readiness-week.ts` / `training-card.ts` @ fac9ac2
/// (`Fixtures/weekly-golden.json`, `gen-weekly.mjs`, múi giờ Asia/Ho_Chi_Minh).
struct WeeklyReviewGoldenTests {
  static let tz = TimeZone(identifier: "Asia/Ho_Chi_Minh")!

  static func golden() throws -> JSONValue {
    let url = try #require(Bundle.module.url(forResource: "weekly-golden", withExtension: "json", subdirectory: "Fixtures"))
    return try JSONDecoder().decode(JSONValue.self, from: Data(contentsOf: url))
  }

  static func array(_ v: JSONValue?) -> [JSONValue] {
    if case .array(let a)? = v { return a }
    return []
  }

  static func summary(_ c: JSONValue) throws -> WeeklyReview.Summary {
    let i = try #require(c["input"])
    let input = WeeklyReview.Input(
      dailyLogs: array(i["dailyLogs"]), workouts: array(i["workouts"]), sleepLogs: array(i["sleepLogs"]),
      prevLogs: array(i["prevLogs"]), volumeHistory: array(i["volumeHistory"]),
      profile: i["profile"] == .null ? nil : i["profile"])
    let wsText = try #require(i["weekStartStr"]?.stringValue)
    let ws = try #require(LocalDate(wsText))
    return WeeklyReview.summarize(input, weekStart: ws, in: tz, copy: try ReadinessCardGoldenTests.copy())
  }

  static func close(_ a: Double, _ b: Double?) -> Bool { b.map { abs(a - $0) < 1e-9 } ?? false }

  @Test func numbersMatchRN() throws {
    let cases = Self.array(try Self.golden()["cases"])
    #expect(cases.count == 23)
    for c in cases {
      let name = c["name"]?.stringValue ?? "?"
      let s = try Self.summary(c)
      let o = try #require(c["out"])
      #expect(s.daysWithData == o["daysWithData"]?.doubleValue.map { Int($0) }, "\(name)")
      #expect(s.daysLogged == o["daysLogged"]?.doubleValue.map { Int($0) }, "\(name)")
      #expect(Self.close(s.avgKcal, o["avgKcal"]?.doubleValue), "\(name) kcal")
      #expect(Self.close(s.avgProtein, o["avgProtein"]?.doubleValue), "\(name) protein")
      #expect(s.proteinDays == o["proteinDays"]?.doubleValue.map { Int($0) }, "\(name)")
      #expect(Self.close(s.avgWaterMl, o["avgWaterMl"]?.doubleValue), "\(name) water")
      #expect(Self.close(s.avgSleepHours, o["avgSleepH"]?.doubleValue), "\(name) sleep")
      #expect(Self.close(s.totalVolume, o["totalVolume"]?.doubleValue), "\(name) volume")
      #expect(s.workoutCount == o["workoutCount"]?.doubleValue.map { Int($0) }, "\(name)")
      #expect(s.supplementAdherence == o["suppAdherence"]?.doubleValue.map { Int($0) }, "\(name) supp")
      #expect(s.readinessDays == o["readinessDays"]?.doubleValue.map { Int($0) }, "\(name)")
      #expect(Self.close(s.avgReadiness, o["avgReadiness"]?.doubleValue), "\(name) readiness")
      #expect(Self.close(s.prevAvgKcal, o["prevAvgKcal"]?.doubleValue), "\(name)")
      #expect(Self.close(s.prevAvgProtein, o["prevAvgProtein"]?.doubleValue), "\(name)")
      #expect(Self.close(s.prevTotalVolume, o["prevTotalVolume"]?.doubleValue), "\(name)")
      #expect(s.acwr == o["acwr"]?.doubleValue, "\(name) acwr")
    }
  }

  @Test func chartsMatchRN() throws {
    for c in Self.array(try Self.golden()["cases"]) {
      let name = c["name"]?.stringValue ?? "?"
      let s = try Self.summary(c)
      let days = Self.array(c["out"]?["chartData"])
      #expect(s.days.count == days.count)
      for (d, o) in zip(s.days, days) {
        #expect(d.date.description == o["date"]?.stringValue, "\(name)")
        #expect(Self.close(d.kcal, o["kcal"]?.doubleValue), "\(name) \(d.date) kcal")
        #expect(Self.close(d.protein, o["protein"]?.doubleValue), "\(name) \(d.date) protein")
        #expect(Self.close(d.sleepHours, o["sleep_h"]?.doubleValue), "\(name) \(d.date) sleep")
        #expect(Self.close(d.volume, o["volume"]?.doubleValue), "\(name) \(d.date) volume")
        #expect(Self.close(d.readiness, o["readiness"]?.doubleValue), "\(name) \(d.date) readiness")
      }
      let weeks = Self.array(c["out"]?["volumeWeekly"])
      #expect(s.volumeWeeks.map(\.weekStart.description) == weeks.map { $0["date"]?.stringValue ?? "" }, "\(name)")
      #expect(s.volumeWeeks.map(\.tonnes) == weeks.map { $0["value"]?.doubleValue ?? -1 }, "\(name)")
    }
  }

  @Test func cardsMatchRN() throws {
    for c in Self.array(try Self.golden()["cases"]) {
      let name = c["name"]?.stringValue ?? "?"
      let s = try Self.summary(c)
      let o = try #require(c["out"]?["cards"])
      func check(_ card: WeeklyReview.Card?, _ g: JSONValue?, sub: Bool = true, _ label: String) {
        #expect(card?.value == g?["value"]?.stringValue, "\(name) \(label)")
        if sub { #expect(card?.sub == g?["sub"]?.stringValue, "\(name) \(label) sub") }
        #expect(card?.delta == g?["d"]?.doubleValue.map { Int($0) }, "\(name) \(label) delta")
      }
      check(s.cards.kcal, o["kcal"], "kcal")
      check(s.cards.protein, o["protein"], "protein")
      check(s.cards.sleep, o["sleep"], "sleep")
      check(s.cards.volume, o["volume"], sub: false, "volume")
      #expect(s.cards.sessions == o["volume"]?["sessions"]?.doubleValue.map { Int($0) }, "\(name)")
      check(s.cards.readiness, o["readiness"], "readiness")
      check(s.cards.water, o["water"], "water")
      if o["supplements"] == .null {
        #expect(s.cards.supplements == nil, "\(name)")
      } else {
        check(s.cards.supplements, o["supplements"], "supplements")
      }
    }
  }

  /// Mọi lời khuyên NGOÀI ACWR giống RN từng chữ chèn; lời ACWR đứng đầu.
  @Test func recommendationsMatchRNBesideACWR() throws {
    for c in Self.array(try Self.golden()["cases"]) {
      let name = c["name"]?.stringValue ?? "?"
      let s = try Self.summary(c)
      let rest = s.recommendations.filter { !$0.id.hasPrefix("acwr") }
      let rn = Self.array(c["out"]?["recommendations"])
      #expect(rest.map(\.id) == rn.map { $0["id"]?.stringValue ?? "" }, "\(name)")
      #expect(rest.map(\.kind.rawValue) == rn.map { $0["kind"]?.stringValue ?? "" }, "\(name)")
      #expect(rest.map(\.args) == rn.map { Self.array($0["args"]).map { $0.stringValue ?? "" } }, "\(name)")
      if let first = s.recommendations.first, first.id.hasPrefix("acwr") {
        let acwr = try #require(s.acwr)
        #expect(first.args == [ReadinessEngine.jsString(acwr)], "\(name)")
      }
    }
  }

  /// Lời ACWR theo băng của `acwrZone`. Khác RN đúng bốn chỗ trong golden
  /// (đã chốt): 0.6 / 0.62 nay là "thấp" (RN im), 1.55 / 1.6 nay là "hơi cao"
  /// (RN "cao"). Mọi trường hợp khác giống RN.
  @Test func acwrAdviceFollowsTheZones() throws {
    let changed: [String: String?] = [
      "acwr-0.6": "acwrLow", "acwr-0.62": "acwrLow", "acwr-1.55": "acwrSlightlyHigh", "acwr-1.6": "acwrSlightlyHigh",
    ]
    for c in Self.array(try Self.golden()["cases"]) {
      let name = c["name"]?.stringValue ?? "?"
      let s = try Self.summary(c)
      let mine = s.recommendations.first { $0.id.hasPrefix("acwr") }
      let rn = c["out"]?["acwrRec"]
      if let expected = changed[name] {
        #expect(mine?.id == expected, "\(name)")
      } else {
        #expect(mine?.id == rn?["id"]?.stringValue, "\(name)")
        #expect(mine?.kind.rawValue == rn?["kind"]?.stringValue, "\(name)")
      }
    }
    #expect(WeeklyReview.acwrAdvice(0.7) == nil)
    #expect(WeeklyReview.acwrAdvice(1.3)?.id == "acwrOptimal")
    #expect(WeeklyReview.acwrAdvice(1.61)?.id == "acwrHigh")
  }

  @Test func toFixedRoundsTiesLikeJS() {
    #expect(JS.fixed(0.25, 1) == "0.3")
    #expect(JS.fixed(6.05, 1) == "6.0")  // 6.05 thật ra là 6.04999…
    #expect(JS.fixed(-0.0, 1) == "0.0")
    #expect(JS.fixed(2.5, 0) == "3")
    #expect(JS.fixed(Double.nan, 1) == "NaN")
  }
}

/// Đọc theo tuần: sáu nguồn, lùi / tiến, không quá tuần này, hỏng thì báo.
@MainActor
struct WeeklyReviewBookTests {
  /// Sáu lệnh đọc chạy song song — sổ ghi lệnh có khoá.
  final class Store: RowStore, @unchecked Sendable {
    let lock = NSLock()
    private var log: [RowQuery] = []
    var failTable: String?
    var queries: [RowQuery] { lock.withLock { log } }
    func select(_ q: RowQuery) async throws(RowStoreError) -> [JSONValue] {
      lock.withLock { log.append(q) }
      if q.table == failTable { throw RowStoreError(code: nil, message: "down") }
      if q.table == "daily_logs", q.columns == WeeklyReview.dailyColumns {
        return [.object(["date": .string("2026-10-06"), "kcal": .number(2000), "acwr": .number(1)])]
      }
      return []
    }
    func insert(_ table: String, _ row: [String: JSONValue]) async throws(RowStoreError) {}
    func update(_ table: String, _ row: [String: JSONValue], where filters: [RowQuery.Filter]) async throws(RowStoreError) -> Int { 0 }
    func upsert(_ table: String, _ rows: [[String: JSONValue]], onConflict: String) async throws(RowStoreError) {}
  }

  static let copy = ReadinessCard.Copy(reco: [:], factors: [:])
  static let tz = TimeZone(identifier: "Asia/Ho_Chi_Minh")!

  @Test func readsTheWeekAndSteps() async throws {
    let store = Store()
    let book = WeeklyReviewBook(
      userId: "u", today: LocalDate("2026-10-08")!, store: store, copy: Self.copy, in: Self.tz)
    #expect(book.weekStart.description == "2026-10-05")
    await book.load()
    guard case .ready(let s) = book.phase else { Issue.record("not ready"); return }
    #expect(s.daysWithData == 1)
    #expect(s.acwr == 1)
    #expect(store.queries.count == 6)
    #expect(!book.canGoForward)
    await book.step(1)  // không đi tới tương lai
    #expect(book.weekOffset == 0)
    #expect(store.queries.count == 6)
    await book.step(-1)
    #expect(book.weekStart.description == "2026-09-28")
    #expect(book.canGoForward)
    let daily = store.queries.last { $0.columns == WeeklyReview.dailyColumns }
    #expect(daily?.filters.contains(.gte("date", .string("2026-09-28"))) == true)
    #expect(daily?.filters.contains(.lt("date", .string("2026-10-05"))) == true)
  }

  @Test func oneFailedSourceFailsTheWeek() async {
    let store = Store()
    store.failTable = "sleep_logs"
    let book = WeeklyReviewBook(
      userId: "u", today: LocalDate("2026-10-08")!, store: store, copy: Self.copy, in: Self.tz)
    await book.load()
    #expect(book.phase == .failed)
  }

  @Test func closedBookIgnoresLateResults() async {
    let book = WeeklyReviewBook(
      userId: "u", today: LocalDate("2026-10-08")!, store: Store(), copy: Self.copy, in: Self.tz)
    book.close()
    await book.load()
    #expect(book.phase == .loading)
  }
}
