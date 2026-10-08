@testable import ASCNDCore
import Foundation
import Testing

/// Thẻ sẵn sàng (#527 Phase 4/9) so với CHÍNH `readiness-i18n.ts` /
/// `training-card.ts` / `readiness-gauge.tsx` @ fac9ac2
/// (`Fixtures/readiness-card-golden.json`, `gen-readiness.mjs`), với câu chữ
/// lấy từ `ASCND/Resources/readiness-copy.json` (chép máy từ RN).
struct ReadinessCardGoldenTests {
  static func json(_ url: URL) throws -> JSONValue {
    try JSONDecoder().decode(JSONValue.self, from: Data(contentsOf: url))
  }

  static func golden() throws -> JSONValue {
    try json(try #require(Bundle.module.url(forResource: "readiness-card-golden", withExtension: "json", subdirectory: "Fixtures")))
  }

  /// Câu chữ đi kèm app — đọc từ chính tệp app đóng gói.
  static func copy() throws -> ReadinessCard.Copy {
    let url = URL(fileURLWithPath: #filePath)
      .deletingLastPathComponent()  // ReadinessCardTests.swift
      .deletingLastPathComponent()  // ASCNDCoreTests
      .deletingLastPathComponent()  // Tests
      .deletingLastPathComponent()  // ASCNDKit
      .deletingLastPathComponent()  // Packages
      .appendingPathComponent("ASCND/Resources/readiness-copy.json")
    return try JSONDecoder().decode(ReadinessCard.Copy.self, from: Data(contentsOf: url))
  }

  static func array(_ v: JSONValue?) throws -> [JSONValue] {
    guard case .array(let a)? = v else { throw CocoaError(.fileReadCorruptFile) }
    return a
  }

  static let langs: [AppPreferences.Lang] = [.vi, .en, .es]

  /// Lời giải thích, điểm con, độ tin cậy, tín hiệu phục hồi — gồm văn xuôi cũ,
  /// chiều trùng, số rỗng, số âm / > 100, làm tròn nửa lên.
  @Test func explainSubscoresAndConfidenceMatchRN() throws {
    let copy = try Self.copy()
    let cases = try Self.array(Self.golden()["explain"])
    #expect(cases.count == 17)
    for c in cases {
      let token = c["token"]?.stringValue
      let label = token ?? "<null>"
      let subs = ReadinessCard.subscores(token, copy: copy)
      guard case .object(let want)? = c["subs"] else { throw CocoaError(.fileReadCorruptFile) }
      #expect(subs == want.mapValues { Int($0.doubleValue ?? .nan) }, "\(label): subs")
      #expect(Double(subs.count) == c["measured"]?.doubleValue, "\(label): measured")
      let conf = ReadinessCard.confidence(subscores: subs)
      #expect(conf?.level.rawValue == c["confidence"]?.stringValue, "\(label): confidence")
      #expect(ReadinessCard.hasRecoverySignal(token, copy: copy) == (c["recovery"] == .bool(true)), "\(label): recovery")
      for lang in Self.langs {
        #expect(
          ReadinessCard.explainText(token, lang: lang, copy: copy) == c["text"]?[lang.rawValue]?.stringValue,
          "\(label): explain \(lang)")
      }
    }
  }

  /// Lời khuyên theo khoá: chín khoá ở ba ngôn ngữ; trống → ""; khoá lạ giữ nguyên.
  @Test func recommendationTextMatchesRN() throws {
    let copy = try Self.copy()
    let cases = try Self.array(Self.golden()["reco"])
    #expect(cases.count == 12)
    for c in cases {
      let key = c["key"]?.stringValue
      for lang in Self.langs {
        #expect(
          ReadinessCard.recoText(key, lang: lang, copy: copy) == c["text"]?[lang.rawValue]?.stringValue,
          "\(key ?? "<null>") \(lang)")
      }
    }
  }

  @Test func tileTonesMatchRN() throws {
    for c in try Self.array(Self.golden()["tileColors"]) {
      let v = try #require(c["v"]?.doubleValue)
      // Điểm con lưu đã làm tròn; ô nhận số nguyên.
      if v == v.rounded() {
        #expect(ReadinessCard.tone(subscore: Int(v)).rawValue == c["color"]?.stringValue, "\(v)")
      }
    }
  }

  /// `acwrZone` + `loadComparison`, sát các mép 0.65 / 0.8 / 1.3 / 1.6.
  @Test func acwrZoneAndComparisonMatchRN() throws {
    let g = try Self.golden()
    let bands = try Self.array(g["bands"])
    #expect(bands.map { $0["key"]?.stringValue } == ReadinessCard.AcwrZone.allCases.map(\.rawValue))
    #expect(bands.map { $0["label"]?.stringValue } == ReadinessCard.AcwrZone.allCases.map(\.band))
    for c in try Self.array(g["acwr"]) {
      let a = try #require(c["acwr"]?.doubleValue)
      #expect(ReadinessCard.zone(a).rawValue == c["zone"]?.stringValue, "\(a)")
      let cmp = ReadinessCard.loadComparison(a)
      #expect(cmp.heavier == (c["comparison"]?["heavier"] == .bool(true)), "\(a) heavier")
      #expect(Double(cmp.percent) == c["comparison"]?["percent"]?.doubleValue, "\(a) percent")
    }
    for c in try Self.array(g["latest"]) {
      let rows = try Self.array(c["rows"])
      #expect(ReadinessCard.latestAcwr(rows) == c["latest"]?.doubleValue, "\(rows)")
    }
  }

  /// Năm ô theo thứ tự cố định; ô thiếu ở đúng chỗ và nói việc sẽ lấp nó;
  /// ACWR 0 là một tuần nghỉ thật, không phải "chưa ghi buổi tập".
  @Test func tilesKeepTheirPlaceAndSayWhatFillsThem() {
    let tiles = ReadinessCard.tiles(subscores: ["sleep": 82, "load": 35], acwr: 0)
    #expect(tiles.map(\.kind) == [.hrv, .rhr, .sleep, .load, .acwr])
    #expect(tiles[0].subscore == nil && tiles[0].need == .readings && tiles[0].tone == .muted)
    #expect(tiles[1].need == .readings)
    #expect(tiles[2].subscore == 82 && tiles[2].tone == .green)
    #expect(tiles[3].subscore == 35 && tiles[3].tone == .red)
    #expect(tiles[4].acwr == 0 && tiles[4].zone == .detraining && tiles[4].tone == .red && tiles[4].need == nil)
    let none = ReadinessCard.tiles(subscores: [:], acwr: nil)
    #expect(none.map(\.need) == [.readings, .readings, .night, .session, .session])
    #expect(ReadinessCard.confidence(subscores: [:]) == nil)
  }

  /// Một hàng `daily_logs`: điểm làm tròn, trạng thái mặc định vàng, ACWR giữ 0.
  @Test func dayReadsTheStoredRow() {
    let d = ReadinessCard.Day(
      row: .object([
        "readiness_score": .number(74.5), "readiness_status": .string("green"),
        "readiness_explain": .string("sleep:80|load:70"), "readiness_recommendation": .string("green_optimal"),
        "acwr": .string("1.12"),
      ]))
    #expect(d.score == 75)
    #expect(d.status == .green)
    #expect(d.acwr == 1.12)
    let blank = ReadinessCard.Day(row: .object(["readiness_score": .null, "readiness_status": .string("purple"), "acwr": .number(0)]))
    #expect(blank.score == nil)
    #expect(blank.status == .yellow)
    #expect(blank.acwr == 0)
    #expect(ReadinessCard.Day(row: nil).score == nil)
  }
}

/// `ReadinessBook`: đọc đúng tài khoản, tải / trống / lỗi / có số, đóng phiên.
@MainActor
struct ReadinessBookTests {
  final class FakeStore: RowStore, @unchecked Sendable {
    let lock = NSLock()
    var rows: [JSONValue] = []
    var error: RowStoreError?
    var queries: [RowQuery] = []

    func select(_ q: RowQuery) async throws(RowStoreError) -> [JSONValue] {
      lock.withLock { queries.append(q) }
      if let error { throw error }
      return rows
    }
    func insert(_ table: String, _ row: [String: JSONValue]) async throws(RowStoreError) {}
    func update(_ table: String, _ row: [String: JSONValue], where filters: [RowQuery.Filter]) async throws(RowStoreError) -> Int { 0 }
    func upsert(_ table: String, _ rows: [[String: JSONValue]], onConflict: String) async throws(RowStoreError) {}
  }

  let today = LocalDate("2026-10-08")!

  @Test func readsOnlyThisAccountsDay() async {
    let s = FakeStore()
    let book = ReadinessBook(userId: "acct-A", date: today, store: s)
    #expect(book.phase == .loading)
    await book.load()
    #expect(s.queries.count == 1)
    let q = s.queries[0]
    #expect(q.table == "daily_logs")
    #expect(q.filters.contains(.eq("user_id", .string("acct-A"))))
    #expect(q.filters.contains(.eq("date", .string("2026-10-08"))))
    #expect(q.mode == .maybeSingle)
  }

  @Test func noRowOrNoScoreIsEmptyNotZero() async {
    let s = FakeStore()
    let book = ReadinessBook(userId: "u", date: today, store: s)
    await book.load()
    #expect(book.phase == .empty)
    s.rows = [.object(["readiness_score": .null, "acwr": .number(1.1)])]
    await book.load()
    #expect(book.phase == .empty)
  }

  @Test func scoredDayIsReady() async {
    let s = FakeStore()
    s.rows = [.object(["readiness_score": .number(81), "readiness_status": .string("green")])]
    let book = ReadinessBook(userId: "u", date: today, store: s)
    await book.load()
    guard case .ready(let d) = book.phase else { Issue.record("not ready: \(book.phase)"); return }
    #expect(d.score == 81 && d.status == .green)
  }

  /// Lỗi khi chưa có số → báo lỗi; lỗi khi đã có số → giữ số cũ.
  @Test func failureWithoutDataIsAnErrorButKeepsShownData() async {
    let s = FakeStore()
    s.error = RowStoreError(code: nil, message: "offline")
    let book = ReadinessBook(userId: "u", date: today, store: s)
    await book.load()
    #expect(book.phase == .failed(.unavailable))
    s.error = nil
    s.rows = [.object(["readiness_score": .number(60), "readiness_status": .string("yellow")])]
    await book.load()
    s.error = RowStoreError(code: "500", message: "boom")
    await book.load()
    guard case .ready(let d) = book.phase else { Issue.record("lost data: \(book.phase)"); return }
    #expect(d.score == 60)
  }

  @Test func closedBookIgnoresLateResults() async {
    let s = FakeStore()
    s.rows = [.object(["readiness_score": .number(90)])]
    let book = ReadinessBook(userId: "u", date: today, store: s)
    book.close()
    await book.load()
    #expect(book.phase == .loading)
  }

  @Test func movingToANewDayReloads() async {
    let s = FakeStore()
    let book = ReadinessBook(userId: "u", date: today, store: s)
    await book.load()
    await book.move(to: today.adding(days: 1))
    #expect(s.queries.last?.filters.contains(.eq("date", .string("2026-10-09"))) == true)
    await book.move(to: today.adding(days: 1))
    #expect(s.queries.count == 2, "cùng ngày thì không đọc lại")
  }
}
