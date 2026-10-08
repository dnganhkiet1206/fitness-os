@testable import ASCNDCore
import Foundation
import Testing

/// Màn sinh trắc học (#527) so với CHÍNH biểu thức của `app/biometrics.tsx`
/// @ fac9ac2 (`Fixtures/biometrics-golden.json`, `gen-biometrics.mjs`).
struct BiometricsGoldenTests {
  static func golden() throws -> JSONValue {
    let url = try #require(Bundle.module.url(forResource: "biometrics-golden", withExtension: "json", subdirectory: "Fixtures"))
    return try JSONDecoder().decode(JSONValue.self, from: Data(contentsOf: url))
  }

  static func array(_ v: JSONValue?) throws -> [JSONValue] {
    guard case .array(let a)? = v else { throw CocoaError(.fileReadCorruptFile) }
    return a
  }

  static func sample(_ v: JSONValue?, id: String = "s") -> Biometrics.Sample {
    func n(_ k: String) -> Double? { v?[k]?.doubleValue }
    return Biometrics.Sample(
      id: id, at: EpochMillis(0), hr: n("hr_bpm"), hrvRmssd: n("hrv_rmssd_ms"), hrvSdnn: n("hrv_sdnn_ms"),
      spo2: n("spo2_pct"), vo2max: n("vo2max_mlkgmin"), resp: n("resp_rate_rpm"), soreness: n("soreness_1_10"),
      illness: v?["illness_flag"] == .bool(true))
  }

  /// `statusOf` cho bảy thẻ, sát hai mép và hai mép 15%.
  @Test func statusMatchesRN() throws {
    let cases = try Self.array(Self.golden()["status"])
    #expect(cases.count == 7 * 39)
    for c in cases {
      let m = try #require(c["metric"]?.stringValue.flatMap(Biometrics.Metric.init(rawValue:)))
      let v = try #require(c["v"]?.doubleValue)
      #expect(Biometrics.status(v, m.range).rawValue == c["status"]?.stringValue, "\(m) \(v)")
    }
  }

  /// `Math.round(latest * 10) / 10` in như JS: nửa lên, số nguyên không có ".0".
  @Test func displayMatchesRN() throws {
    for c in try Self.array(Self.golden()["display"]) {
      let v = try #require(c["v"]?.doubleValue)
      #expect(Biometrics.display(v) == c["text"]?.stringValue, "\(v)")
    }
  }

  /// Chỉ thẻ HRV mà bạn thật có; chưa có gì thì RMSSD.
  @Test func hrvCardsMatchRN() throws {
    for c in try Self.array(Self.golden()["kinds"]) {
      let samples = try Self.array(c["rows"]).enumerated().map { Self.sample($1, id: "\($0)") }
      let ms = Biometrics.metrics(samples)
      #expect(ms.contains(.hrvSdnn) == (c["kinds"]?["sdnn"] == .bool(true)), "\(c["name"]?.stringValue ?? "") sdnn")
      #expect(ms.contains(.hrv) == (c["kinds"]?["rmssd"] == .bool(true)), "\(c["name"]?.stringValue ?? "") rmssd")
      #expect(ms.filter { $0 != .hrvSdnn && $0 != .hrv } == [.hr, .spo2, .vo2max, .resp, .soreness])
    }
  }

  /// `summarise`: các phần (số in như JS) đúng thứ tự; ráp với nhãn tiếng Anh
  /// của RN thì ra đúng chuỗi RN.
  @Test func summaryPartsMatchRN() throws {
    for c in try Self.array(Self.golden()["summary"]) {
      let s = Self.sample(c["sample"])
      let en = Biometrics.parts(s).map { p -> String in
        switch p {
        case .rhr(let v): "RHR \(v)"
        case .sdnn(let v): "SDNN \(v)ms"
        case .rmssd(let v): "RMSSD \(v)ms"
        case .spo2(let v): "SpO₂ \(v)%"
        case .resp(let v): "Resp \(v)"
        case .vo2max(let v): "VO₂max \(v)"
        }
      }
      let text = en.isEmpty ? "No values" : en.joined(separator: " · ")
      #expect(text == c["en"]?.stringValue)
    }
  }
}

struct BiometricsTests {
  static let hanoi = TimeZone(identifier: "Asia/Ho_Chi_Minh")!

  /// `date_time` UTC in ra giờ MÁY: 00:19Z ở Hà Nội là 07:19 cùng ngày; 18:30Z là sáng hôm sau.
  @Test func stampIsDeviceLocal() throws {
    let a = try #require(EpochMillis(iso8601: "2026-10-08T00:19:00+00:00"))
    #expect(Biometrics.stamp(a, in: Self.hanoi) == "2026-10-08 07:19")
    let b = try #require(EpochMillis(iso8601: "2026-10-07T18:30:00.123456+00:00"))
    #expect(Biometrics.stamp(b, in: Self.hanoi) == "2026-10-08 01:30")
    #expect(Biometrics.stamp(b, in: TimeZone(identifier: "UTC")!) == "2026-10-07 18:30")
  }

  /// 14 ngày LỊCH lùi lại, giữ giờ — kể cả qua ngày đổi giờ.
  @Test func sinceIsFourteenCalendarDays() throws {
    let ny = TimeZone(identifier: "America/New_York")!
    // 2026-11-10 09:00 EST; 14 ngày trước (2026-10-27) là EDT — vẫn 09:00 giờ địa phương.
    let now = try #require(EpochMillis(iso8601: "2026-11-10T14:00:00Z"))
    let since = Biometrics.since(now: now, in: ny)
    #expect(since == EpochMillis(iso8601: "2026-10-27T13:00:00Z"))
  }

  @Test func queryIsThisAccountOldestFirst() throws {
    let since = try #require(EpochMillis(iso8601: "2026-09-24T10:00:00Z"))
    let q = Biometrics.query(userId: "acct-A", since: since)
    #expect(q.table == "biometric_samples")
    #expect(q.filters.contains(.eq("user_id", .string("acct-A"))))
    #expect(q.filters.contains(.gte("date_time", .string(WorkoutSessionRecord.iso8601(since)))))
    #expect(q.order == RowQuery.Order(column: "date_time", ascending: true))
  }

  /// Hàng đọc từ PostgREST: số hoặc chuỗi số; hàng thiếu `id` / `date_time` bị bỏ.
  @Test func sampleReadsRows() {
    let s = Biometrics.Sample(
      row: .object([
        "id": .string("b1"), "date_time": .string("2026-10-08T00:19:00+00:00"), "source": .string("apple_health"),
        "hr_bpm": .number(58), "hrv_sdnn_ms": .string("52.5"), "hrv_rmssd_ms": .null, "illness_flag": .bool(true),
      ]))
    #expect(s?.hr == 58 && s?.hrvSdnn == 52.5 && s?.hrvRmssd == nil && s?.illness == true)
    #expect(Biometrics.Sample(row: .object(["date_time": .string("2026-10-08T00:19:00Z")])) == nil)
    #expect(Biometrics.Sample(row: .object(["id": .string("x"), "date_time": .string("hôm qua")])) == nil)
  }

  /// Xoá lần đo của hôm qua → dựng hôm qua VÀ hôm nay; của hôm nay → một lần.
  @Test func deleteRebuildsSampleDayAndToday() throws {
    let now = try #require(EpochMillis(iso8601: "2026-10-08T03:00:00Z"))  // 10:00 Hà Nội
    let yesterday = try #require(EpochMillis(iso8601: "2026-10-07T01:00:00Z"))
    #expect(
      Biometrics.rebuildDays(sampleAt: yesterday, now: now, in: Self.hanoi)
        == [LocalDate("2026-10-07")!, LocalDate("2026-10-08")!])
    let earlyToday = try #require(EpochMillis(iso8601: "2026-10-07T17:30:00Z"))  // 00:30 Hà Nội ngày 8
    #expect(Biometrics.rebuildDays(sampleAt: earlyToday, now: now, in: Self.hanoi) == [LocalDate("2026-10-08")!])
  }
}

/// `BiometricsBook`: đúng tài khoản, tải / trống / lỗi / có số, xoá + dựng lại.
@MainActor
struct BiometricsBookTests {
  final class FakeStore: RowStore, @unchecked Sendable {
    let lock = NSLock()
    var rows: [JSONValue] = []
    var error: RowStoreError?
    var queries: [RowQuery] = []
    var failRebuild = false
    var rebuildReads = 0

    func select(_ q: RowQuery) async throws(RowStoreError) -> [JSONValue] {
      lock.withLock { queries.append(q) }
      if q.table == "biometric_samples" {
        if let error { throw error }
        return rows
      }
      // Lượt dựng `daily_logs`: đọc nguồn — hỏng khi được bảo.
      lock.withLock { rebuildReads += 1 }
      if failRebuild { throw RowStoreError(code: nil, message: "offline") }
      return []
    }
    func insert(_ table: String, _ row: [String: JSONValue]) async throws(RowStoreError) {}
    func update(_ table: String, _ row: [String: JSONValue], where filters: [RowQuery.Filter]) async throws(RowStoreError) -> Int { 1 }
  }

  final class FakeRemover: BiometricsRemover, @unchecked Sendable {
    let lock = NSLock()
    var touched = 1
    var error: RowStoreError?
    var calls: [(String, String)] = []
    func deleteSample(id: String, userId: String) async throws(RowStoreError) -> Int {
      lock.withLock { calls.append((id, userId)) }
      if let error { throw error }
      return touched
    }
  }

  struct FixedClock: WallClock {
    let at: Date
    func now() -> Date { at }
  }

  static let now = EpochMillis(iso8601: "2026-10-08T03:00:00Z")!
  let clock = FixedClock(at: BiometricsBookTests.now.date)
  let tz = TimeZone(identifier: "Asia/Ho_Chi_Minh")!

  static func row(_ id: String, _ at: String, hr: Double = 60) -> JSONValue {
    .object(["id": .string(id), "date_time": .string(at), "hr_bpm": .number(hr)])
  }

  func book(_ s: FakeStore, _ r: FakeRemover = FakeRemover(), user: String = "acct-A") -> BiometricsBook {
    BiometricsBook(userId: user, store: s, remover: r, clock: clock, timeZone: tz)
  }

  @Test func readsOnlyThisAccountsFortnight() async {
    let s = FakeStore()
    let b = book(s)
    #expect(b.phase == .loading)
    await b.load()
    let q = s.queries[0]
    #expect(q.table == "biometric_samples")
    #expect(q.filters.contains(.eq("user_id", .string("acct-A"))))
    #expect(q.filters.contains(.gte("date_time", .string("2026-09-24T03:00:00.000Z"))))
  }

  @Test func noRowsIsEmptyAndRowsAreReadyNewestFirstInList() async {
    let s = FakeStore()
    let b = book(s)
    await b.load()
    #expect(b.phase == .empty)
    s.rows = [Self.row("a", "2026-10-06T01:00:00Z"), Self.row("b", "2026-10-07T01:00:00Z")]
    await b.load()
    guard case .ready(let samples) = b.phase else { Issue.record("not ready"); return }
    #expect(samples.map(\.id) == ["a", "b"])
    #expect(b.newestFirst.map(\.id) == ["b", "a"])
  }

  /// Lỗi khi chưa có số → lỗi (không phải "chưa ghi gì"); lỗi khi đã có số → giữ.
  @Test func failureIsNeverEmptyAndKeepsShownData() async {
    let s = FakeStore()
    s.error = RowStoreError(code: nil, message: "offline")
    let b = book(s)
    await b.load()
    #expect(b.phase == .failed(.unavailable))
    s.error = nil
    s.rows = [Self.row("a", "2026-10-07T01:00:00Z")]
    await b.load()
    s.error = RowStoreError(code: "500", message: "boom")
    await b.load()
    guard case .ready(let samples) = b.phase else { Issue.record("lost data"); return }
    #expect(samples.count == 1)
  }

  @Test func closedBookIgnoresLateResults() async {
    let s = FakeStore()
    s.rows = [Self.row("a", "2026-10-07T01:00:00Z")]
    let b = book(s)
    b.close()
    await b.load()
    #expect(b.phase == .loading)
    #expect(await b.delete(Biometrics.Sample(id: "a", at: Self.now)) == .failed)
  }

  /// Xoá: đúng hàng của đúng tài khoản, dựng lại ngày ấy + hôm nay, rồi đọc lại.
  @Test func deleteRemovesThisAccountsRowAndRebuildsBothDays() async {
    let s = FakeStore()
    let r = FakeRemover()
    s.rows = [Self.row("a", "2026-10-07T01:00:00Z")]
    let b = book(s, r)
    await b.load()
    let sample = b.newestFirst[0]
    s.rows = []
    #expect(await b.delete(sample) == .deleted)
    #expect(r.calls.count == 1 && r.calls[0] == ("a", "acct-A"))
    let rebuiltDays = Set(
      s.queries.filter { $0.table == "daily_logs" }.compactMap { q in
        q.filters.compactMap { f -> String? in
          if case .eq("date", let v) = f { return v.stringValue }
          return nil
        }.first
      })
    #expect(rebuiltDays == ["2026-10-07", "2026-10-08"])
    #expect(b.phase == .empty)
    #expect(!b.deleting)
  }

  @Test func nothingDeletedIsNamedAndSkipsRebuild() async {
    let s = FakeStore()
    let r = FakeRemover()
    r.touched = 0
    let b = book(s, r)
    #expect(await b.delete(Biometrics.Sample(id: "gone", at: Self.now)) == .nothingWritten)
    #expect(s.rebuildReads == 0)
  }

  @Test func failedDeleteLeavesEverything() async {
    let s = FakeStore()
    let r = FakeRemover()
    r.error = RowStoreError(code: nil, message: "offline")
    let b = book(s, r)
    #expect(await b.delete(Biometrics.Sample(id: "a", at: Self.now)) == .failed)
    #expect(s.rebuildReads == 0)
    #expect(s.queries.isEmpty)
  }

  /// Dựng lại hỏng → KHÔNG trông như đã xong; vẫn đọc lại vì hàng đã xoá thật.
  @Test func rebuildFailureIsNotSuccess() async {
    let s = FakeStore()
    s.failRebuild = true
    let b = book(s)
    #expect(await b.delete(Biometrics.Sample(id: "a", at: Self.now)) == .rebuildFailed)
    #expect(s.queries.last?.table == "biometric_samples")
  }
}
