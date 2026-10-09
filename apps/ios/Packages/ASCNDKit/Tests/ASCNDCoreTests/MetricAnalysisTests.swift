@testable import ASCNDCore
import Foundation
import Testing

/// Bảng chỉ số 7 ngày = CHÍNH `analyse` / `direction` của RN
/// (`Fixtures/metrics-golden.json`, `gen-metrics.mjs`, TZ Asia/Ho_Chi_Minh).
struct MetricAnalysisGoldenTests {
  static func golden() throws -> JSONValue {
    let url = try #require(Bundle.module.url(forResource: "metrics-golden", withExtension: "json", subdirectory: "Fixtures"))
    return try JSONDecoder().decode(JSONValue.self, from: Data(contentsOf: url))
  }

  static func array(_ v: JSONValue?) -> [JSONValue] {
    if case .array(let a)? = v { return a }
    return []
  }

  /// Lệch có chủ ý (xem đầu `MetricAnalysis.swift`): "1 days" → "1 day",
  /// "N giờ 60 phút" → giờ kế.
  static func fixed(_ text: String?) -> String? {
    guard var s = text else { return nil }
    s = s.replacingOccurrences(of: "have 1 days", with: "have 1 day")
    for h in 0..<24 {
      s = s.replacingOccurrences(of: "\(h) giờ 60 phút", with: "\(h + 1) giờ")
      s = s.replacingOccurrences(of: "\(h)h 60m", with: "\(h + 1)h")
    }
    return s
  }

  @Test func everyCaseMatchesRN() throws {
    let cases = Self.array(try Self.golden()["cases"])
    #expect(cases.count == 240)
    for c in cases {
      let kind = try #require(c["kind"]?.stringValue.flatMap(MetricAnalysis.Kind.init(rawValue:)))
      let todayText = try #require(c["today"]?.stringValue)
      let today = try #require(LocalDate(todayText))
      let points = Self.array(c["points"]).compactMap { p -> MetricAnalysis.Point? in
        guard let d = p["date"]?.stringValue.flatMap(LocalDate.init), case .number(let v)? = p["value"] else { return nil }
        return MetricAnalysis.Point(date: d, value: v)
      }
      var target = 0.0
      if case .number(let k)? = c["kcalTarget"] { target = k }
      let got = MetricAnalysis.analyse(kind: kind, points: points, today: today, kcalTarget: target)
      let want = try #require(c["analysis"])
      let label = "\(kind) \(todayText) \(points)"
      #expect(got.headline.vi == Self.fixed(want["headline"]?["vi"]?.stringValue), "\(label)")
      #expect(got.headline.en == Self.fixed(want["headline"]?["en"]?.stringValue), "\(label)")
      #expect(got.ask.vi == Self.fixed(want["ask"]?["vi"]?.stringValue), "\(label)")
      #expect(got.ask.en == Self.fixed(want["ask"]?["en"]?.stringValue), "\(label)")
      #expect(!got.ask.es.isEmpty && !got.headline.es.isEmpty)
      let stats = Self.array(want["stats"])
      #expect(got.stats.map(\.key) == stats.compactMap { $0["key"]?.stringValue }, "\(label)")
      for (g, w) in zip(got.stats, stats) {
        #expect(g.label.vi == w["label"]?["vi"]?.stringValue)
        #expect(g.label.en == w["label"]?["en"]?.stringValue)
        // RN ghi giá trị ô số bằng chữ vi cho mọi ngôn ngữ.
        #expect(g.value.vi == Self.fixed(w["value"]?.stringValue), "\(label)")
      }
      let bars = Self.array(want["bars"])
      #expect(got.bars.count == bars.count)
      for (g, w) in zip(got.bars, bars) {
        #expect(g.date.description == w["date"]?.stringValue)
        #expect(g.missing == (w["missing"] == .bool(true)))
        #expect(JSONValue.number(g.value) == w["value"])
        #expect(g.today == (w["today"] == .bool(true)))
        #expect(g.weekday.vi == w["weekday"]?["vi"]?.stringValue)
        #expect(g.weekday.en == w["weekday"]?["en"]?.stringValue)
      }
      if case .object? = want["baseline"] {
        #expect(got.baseline.map { JSONValue.number($0.value) } == want["baseline"]?["value"], "\(label)")
        #expect(got.baseline?.label.vi == want["baseline"]?["label"]?["vi"]?.stringValue)
        #expect(got.baseline?.label.en == want["baseline"]?["label"]?["en"]?.stringValue)
      } else {
        #expect(got.baseline == nil, "\(label)")
      }
    }
  }

  @Test func directionLikeRN() throws {
    let rows = Self.array(try Self.golden()["directions"])
    #expect(rows.count == 10)
    for r in rows {
      let values = Self.array(r["values"]).compactMap { v -> Double? in
        if case .number(let n) = v { return n }
        return nil
      }
      #expect(MetricAnalysis.direction(values)?.rawValue == r["direction"]?.stringValue, "\(values)")
    }
  }

  @Test func sleepMinutesCarryIntoTheHour() {
    #expect(MetricAnalysis.hhmm(479.6, .vi) == "8 giờ")
    #expect(MetricAnalysis.hhmm(479.6, .en) == "8h")
    #expect(MetricAnalysis.hhmm(425, .vi) == "7 giờ 5 phút")
  }
}

/// Truy vấn + gom điểm như các hook của RN.
@MainActor
struct MetricHistoryTests {
  static let tz = TimeZone(identifier: "Asia/Ho_Chi_Minh")!
  static let today = LocalDate("2026-10-09")!

  final class Rows: RowStore, @unchecked Sendable {
    let lock = NSLock()
    var rows: [JSONValue] = []
    var fail = false
    private var log: [RowQuery] = []
    var queries: [RowQuery] { lock.withLock { log } }
    func select(_ q: RowQuery) async throws(RowStoreError) -> [JSONValue] {
      let (rows, fail) = lock.withLock { () -> ([JSONValue], Bool) in
        log.append(q)
        return (self.rows, self.fail)
      }
      if fail { throw RowStoreError(code: nil, message: "down") }
      return rows
    }
    func insert(_ table: String, _ row: [String: JSONValue]) async throws(RowStoreError) {}
    func update(_ table: String, _ row: [String: JSONValue], where filters: [RowQuery.Filter]) async throws(RowStoreError)
      -> Int
    { 0 }
  }

  @Test func queriesLikeTheHooks() {
    let now = EpochMillis(Int64(1_791_500_000_000))
    let sleep = MetricHistory.query(.sleep, userId: "u", today: Self.today, now: now, in: Self.tz)
    #expect(sleep.table == "daily_logs")
    #expect(sleep.columns == "date, sleep_duration_min")
    #expect(sleep.filters.contains(.gte("date", .string("2026-10-02"))))
    #expect(sleep.filters.contains(.or("sleep_duration_min.not.is.null")))
    let hr = MetricHistory.query(.hr, userId: "u", today: Self.today, now: now, in: Self.tz)
    #expect(hr.table == "biometric_samples")
    #expect(hr.filters.contains(.gte("date_time", .string("2026-10-01T22:53:20.000Z"))))
  }

  @Test func restingHeartRateIsTheDaysLowestInTheDeviceZone() {
    let rows: [JSONValue] = [
      .object(["date_time": .string("2026-10-07T23:30:00Z"), "hr_bpm": .number(52)]),  // 06:30 ngày 8 ở VN
      .object(["date_time": .string("2026-10-08T05:00:00Z"), "hr_bpm": .number(95)]),
      .object(["date_time": .string("2026-10-08T06:00:00Z"), "hr_bpm": .null]),
      .object(["date_time": .string("2026-10-08T20:00:00Z"), "hr_bpm": .number(58)]),  // 03:00 ngày 9
    ]
    let p = MetricHistory.points(.hr, rows: rows, in: Self.tz)
    #expect(p == [MetricAnalysis.Point(date: LocalDate("2026-10-08")!, value: 52), .init(date: Self.today, value: 58)])
  }

  @Test func sleepAndKcalDropEmptyDays() {
    let rows: [JSONValue] = [
      .object(["date": .string("2026-10-07"), "kcal": .number(0)]),
      .object(["date": .string("2026-10-08"), "kcal": .string("2100")]),
    ]
    #expect(MetricHistory.points(.kcal, rows: rows, in: Self.tz).map(\.value) == [2100])
  }

  @Test func failureIsAStateNotAnEmptyWeek() async {
    let store = Rows()
    store.fail = true
    let book = MetricHistoryBook(userId: "u", today: Self.today, store: store, in: Self.tz)
    await book.load(kcalTarget: 2200)
    #expect(book.phase == .failed)
    store.fail = false
    store.rows = [.object(["date": .string("2026-10-09"), "readiness_score": .number(71)])]
    await book.select(.readiness, kcalTarget: 2200)  // thử lại cùng loại sau lỗi
    guard case .ready(let a) = book.phase else {
      Issue.record("chưa sẵn sàng")
      return
    }
    #expect(a.bars.last?.value == 71)
    await book.select(.sleep, kcalTarget: 2200)
    #expect(book.kind == .sleep)
    #expect(store.queries.last?.columns == "date, sleep_duration_min")
  }
}
