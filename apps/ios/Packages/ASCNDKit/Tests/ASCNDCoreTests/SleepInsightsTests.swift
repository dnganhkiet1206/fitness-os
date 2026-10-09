@testable import ASCNDCore
import Foundation
import Testing

/// Giấc ngủ = biểu thức của `sleep-insights.tsx` @ fac9ac2
/// (`Fixtures/sleep-golden.json`, `gen-sleep.mjs`). So với biến thể `fixed*`
/// (CHÍNH mã RN, nợ ngủ trên số đêm đã ghi); với đúng 7 đêm hai bản trùng nhau.
struct SleepInsightsGoldenTests {
  static func cases() throws -> [JSONValue] {
    let url = try #require(Bundle.module.url(forResource: "sleep-golden", withExtension: "json", subdirectory: "Fixtures"))
    let root = try JSONDecoder().decode(JSONValue.self, from: Data(contentsOf: url))
    guard case .array(let a) = root else { return [] }
    return a
  }

  static func array(_ v: JSONValue?) -> [JSONValue] {
    if case .array(let a)? = v { return a }
    return []
  }

  static func num(_ v: JSONValue?) -> Double? {
    if case .number(let n)? = v { return n }
    return nil
  }

  @Test func everyCaseMatchesRN() throws {
    let all = try Self.cases()
    #expect(all.count == 160)
    var sevenNightCases = 0
    for c in all {
      let logs = Self.array(c["logs"])
      let nights = logs.compactMap(SleepInsights.night)
      #expect(nights.count == logs.count)
      let target = SleepInsights.targetHours(c["profile"] == .null ? nil : c["profile"])
      let vi = try #require(c["fixedVi"])
      let en = try #require(c["fixedEn"])
      #expect(JSONValue.number(target) == vi["targetHours"], "\(c)")
      // Từng đêm: độ dài, tầng, chất lượng.
      for (g, w) in zip(nights, Self.array(vi["nights"])) {
        #expect(abs(g.totalH - (Self.num(w["total_h"]) ?? -1)) < 1e-9)
        #expect(abs(g.deepH - (Self.num(w["deep_h"]) ?? -1)) < 1e-9)
        #expect(g.stagesKnown == (w["stagesKnown"] == .bool(true)))
        #expect(g.quality == Self.num(w["quality"]))
      }
      #expect(nights.reversed().map { SleepInsights.duration($0.minutes) } == Self.array(vi["rows"]).compactMap(\.stringValue))
      #expect(abs(SleepInsights.maxH(nights, targetHours: target) - (Self.num(vi["maxH"]) ?? -1)) < 1e-9)
      guard let s = SleepInsights.stats(nights, targetHours: target) else {
        #expect(vi["stats"] == .null)
        #expect(Self.array(vi["insights"]).isEmpty)
        continue
      }
      #expect(abs(s.avgTotal - (Self.num(vi["stats"]?["avgTotal"]) ?? -1)) < 1e-9)
      #expect(abs(s.debt - (Self.num(vi["stats"]?["debt"]) ?? -1)) < 1e-9, "\(c)")
      let ins = SleepInsights.insights(s, targetHours: target)
      #expect(ins.map(\.vi) == Self.array(vi["insights"]).compactMap(\.stringValue), "\(c)")
      #expect(ins.map(\.en) == Self.array(en["insights"]).compactMap(\.stringValue), "\(c)")
      #expect(!ins.contains { $0.es.isEmpty })
      let cap = SleepInsights.caption(s, targetHours: target)
      #expect(cap.vi == vi["caption"]?.stringValue)
      #expect(cap.en == en["caption"]?.stringValue)
      let m = SleepInsights.metrics(s)
      #expect(m.quality == vi["metrics"]?["avgQuality"]?.stringValue)
      #expect(m.deep == vi["metrics"]?["avgDeep"]?.stringValue)
      #expect(m.debt == vi["metrics"]?["debt"]?.stringValue)
      if logs.count == 7 {
        sevenNightCases += 1
        #expect(c["vi"] == c["fixedVi"])  // 7 đêm: nợ ngủ như RN
      }
    }
    #expect(sevenNightCases > 0)
  }
}

/// Xoá một đêm → dựng lại ngày đó + hôm nay.
@MainActor
struct SleepInsightsBookTests {
  struct Clock: WallClock {
    let at: EpochMillis
    func now() -> Date { Date(timeIntervalSince1970: TimeInterval(at.millis) / 1000) }
  }

  final class Rows: RowStore, @unchecked Sendable {
    let lock = NSLock()
    var nights: [JSONValue] = []
    var failNights = false
    private var log: [String] = []
    var tables: [String] { lock.withLock { log } }
    func select(_ q: RowQuery) async throws(RowStoreError) -> [JSONValue] {
      let (nights, fail) = lock.withLock { () -> ([JSONValue], Bool) in
        log.append(q.table)
        return (self.nights, failNights)
      }
      if q.table == "sleep_logs" {
        if fail { throw RowStoreError(code: nil, message: "down") }
        return nights
      }
      if q.table == "profiles" { return [.object(["sleep_target_hours": .string("7.5")])] }
      return []
    }
    func insert(_ table: String, _ row: [String: JSONValue]) async throws(RowStoreError) {}
    func update(_ table: String, _ row: [String: JSONValue], where filters: [RowQuery.Filter]) async throws(RowStoreError)
      -> Int
    { 1 }
    func upsert(_ table: String, _ rows: [[String: JSONValue]], onConflict: String) async throws(RowStoreError) {}
  }

  final class Remover: SleepLogRemover, @unchecked Sendable {
    var touched = 1
    func deleteNight(id: String, userId: String) async throws(RowStoreError) -> Int { touched }
  }

  static let now = EpochMillis(Int64(1_791_500_000_000))  // 2026-10-08 22:53 UTC = 05:53 ngày 9 ở VN
  static let tz = TimeZone(identifier: "Asia/Ho_Chi_Minh")!

  @Test func failedReadIsNotAnEmptyHistory() async {
    let rows = Rows()
    rows.failNights = true
    let book = SleepInsightsBook(userId: "u", store: rows, remover: Remover(), clock: Clock(at: Self.now), timeZone: Self.tz)
    await book.load()
    #expect(book.phase == .failed)
  }

  @Test func targetFromProfileAndDeleteRebuilds() async {
    let rows = Rows()
    rows.nights = [
      .object([
        "id": .string("a"), "bedtime": .string("2026-10-06T15:00:00Z"), "waketime": .string("2026-10-06T23:00:00Z"),
        "deep_min": .number(0), "rem_min": .number(0), "light_min": .number(0),
      ])
    ]
    let remover = Remover()
    let book = SleepInsightsBook(userId: "u", store: rows, remover: remover, clock: Clock(at: Self.now), timeZone: Self.tz)
    await book.load()
    guard case .ready(let nights, let target) = book.phase else {
      Issue.record("chưa đọc được")
      return
    }
    #expect(target == 7.5)
    #expect(nights.first?.minutes == 480)
    #expect(nights.first?.stagesKnown == false)
    #expect(SleepInsights.rebuildDays(waketime: EpochMillis(Int64(1_791_327_600_000)), now: Self.now, in: Self.tz).count == 2)
    let outcome = await book.delete(nights[0])
    #expect(outcome == .deleted || outcome == .rebuildFailed)
    remover.touched = 0
    #expect(await book.delete(nights[0]) == .nothingWritten)
  }
}
