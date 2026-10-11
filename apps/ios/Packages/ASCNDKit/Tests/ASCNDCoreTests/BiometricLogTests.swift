@testable import ASCNDCore
import Foundation
import Testing

/// Nhập sinh trắc (#527, `log-biometrics`). Golden: `plausible.ts` /
/// `health-owned.ts` @ fac9ac2 biên dịch + khối của màn chép nguyên văn
/// (`gen-biometric-log.mjs`).
struct BiometricLogGoldenTests {
  static func golden() throws -> JSONValue {
    let url = try #require(Bundle.module.url(forResource: "biometric-log-golden", withExtension: "json", subdirectory: "Fixtures"))
    return try JSONDecoder().decode(JSONValue.self, from: Data(contentsOf: url))
  }

  static func array(_ v: JSONValue?) -> [JSONValue] {
    if case .array(let a)? = v { return a }
    return []
  }

  static func text(_ v: JSONValue?) -> String {
    if case .string(let s)? = v { return s }
    return ""
  }

  /// Khoá golden của từng ô.
  static let keys: [(BiometricLog.Field, String)] = [(.hr, "hr"), (.hrv, "hrv"), (.spo2, "spo2"), (.vo2, "vo2"), (.resp, "resp")]

  @Test func boundsAndOwnedMatchRN() throws {
    let g = try Self.golden()
    for (f, k) in Self.keys {
      #expect(f.bounds.lowerBound == g["BOUNDS"]?[k]?["min"]?.doubleValue, "\(k)")
      #expect(f.bounds.upperBound == g["BOUNDS"]?[k]?["max"]?.doubleValue, "\(k)")
    }
    #expect(Self.array(g["owned"]).map { Self.text($0) } == BiometricLog.healthOwned)
  }

  /// Lỗi từng ô, `hasAnyInput`, `canSave`, giá trị gửi đi.
  @Test func formsMatchRN() throws {
    let forms = Self.array(try Self.golden()["forms"])
    #expect(forms.count == 300)
    #expect(forms.contains { $0["hasAnyInput"] == .bool(false) })
    #expect(forms.contains { $0["canSave"] == .bool(true) })
    for c in forms {
      var texts: [BiometricLog.Field: String] = [:]
      for (f, k) in Self.keys { texts[f] = Self.text(c["texts"]?[k]) }
      let soreness = c["soreness"]?.doubleValue.map { Int($0) }
      let ill = c["ill"] == .bool(true)
      for (f, k) in Self.keys {
        #expect(BiometricLog.bad(f, texts[f] ?? "") == (c["errors"]?[k] != .null), "\(k) \(c)")
      }
      #expect(BiometricLog.hasAnyInput(texts, soreness: soreness, ill: ill) == (c["hasAnyInput"] == .bool(true)), "\(c)")
      #expect(BiometricLog.canSave(texts, soreness: soreness, ill: ill) == (c["canSave"] == .bool(true)), "\(c)")
      let row = BiometricLog.row(
        id: "x", userId: "u1", at: EpochMillis(Int64(0)), texts: texts, soreness: soreness, ill: ill)
      for f in BiometricLog.Field.allCases {
        let want = c["values"]?[f.rawValue]
        if want == .null {
          #expect(row[f.rawValue] == .null, "\(f) \(c)")
        } else {
          #expect(row[f.rawValue]?.doubleValue == want?.doubleValue, "\(f) \(c)")
        }
      }
      #expect(row["soreness_1_10"]?.doubleValue == c["values"]?["soreness_1_10"]?.doubleValue)
      #expect(row["illness_flag"] == c["values"]?["illness_flag"])
    }
  }

  /// Số của Health hôm nay và phép đếm "N thứ sẽ thay".
  @Test func healthMatchesRN() throws {
    let cases = Self.array(try Self.golden()["health"])
    #expect(cases.count == 200)
    #expect(cases.contains { ($0["changes"]?.doubleValue ?? 0) > 0 })
    for c in cases {
      #expect(HealthOwned.fromHealth(c["row"]) == (c["fromHealth"] == .bool(true)), "\(c)")
      var want: [String: Double] = [:]
      if case .object(let o)? = c["owned"] {
        for (k, v) in o { if let d = v.doubleValue { want[k] = d } }
      }
      #expect(HealthOwned.values(c["row"], BiometricLog.healthOwned) == want, "\(c)")
      let typed = Self.array(c["typed"]).map { Self.text($0) }
      let texts: [BiometricLog.Field: String] = [.hr: typed[0], .spo2: typed[1], .resp: typed[2]]
      #expect(BiometricLog.healthChanges(c["row"], texts: texts) == c["changes"]?.doubleValue.map { Int($0) }, "\(c)")
    }
  }
}

/// Kho giả: một hàng `manual` sẵn có tuỳ chọn; ghi nhận upsert.
private final class BioRows: RowStore, @unchecked Sendable {
  private let lock = NSLock()
  private let existing: [JSONValue]
  private var _upserts: [[String: JSONValue]] = []
  var fail = false
  init(existing: [JSONValue] = []) { self.existing = existing }
  var upserts: [[String: JSONValue]] { lock.withLock { _upserts } }
  func select(_ q: RowQuery) async throws(RowStoreError) -> [JSONValue] {
    q.table == "biometric_samples" ? existing : []
  }
  func insert(_ table: String, _ row: [String: JSONValue]) async throws(RowStoreError) {}
  func update(_ table: String, _ row: [String: JSONValue], where filters: [RowQuery.Filter]) async throws(RowStoreError)
    -> Int
  { 1 }
  func upsert(_ table: String, _ rows: [[String: JSONValue]], onConflict: String) async throws(RowStoreError) {
    if fail { throw RowStoreError(code: "500", message: "boom") }
    lock.withLock { _upserts += rows }
  }
}

private final class BioQueue: PlanWriteStore, @unchecked Sendable {
  private let lock = NSLock()
  private var rows: [OutboxEntry] = []
  var entries: [OutboxEntry] { lock.withLock { rows } }
  func enqueue(_ entries: [OutboxEntry]) async throws { lock.withLock { rows += entries } }
  func pending(userId: String) async throws -> [OutboxEntry] { lock.withLock { rows } }
}

private struct BioClock: WallClock {
  func now() -> Date { Date(timeIntervalSince1970: 1_791_610_200) }
}

@MainActor
struct BiometricLoggerTests {
  private static func make(_ rows: BioRows, _ queue: BioQueue? = BioQueue()) -> BiometricLogger {
    BiometricLogger(
      userId: "u1", store: rows, outbox: queue, clock: BioClock(), timeZone: TimeZone(identifier: "UTC")!,
      makeId: { "NEW-1" })
  }

  /// Chưa có hàng tay hôm nay: upsert hàng mới, nguồn `manual`, độ tin 0,7.
  @Test func firstReadingOfTheDay() async {
    let rows = BioRows()
    let l = Self.make(rows)
    #expect(await l.submit(texts: [.hr: "58", .hrv: "62"], soreness: 3, ill: false, online: true) == .saved)
    let r = rows.upserts.first
    #expect(rows.upserts.count == 1)
    #expect(r?["id"] == .string("new-1"))
    #expect(r?["source"] == .string("manual"))
    #expect(r?["confidence"] == .number(0.7))
    #expect(r?["hr_bpm"] == .number(58))
    #expect(r?["hrv_rmssd_ms"] == .number(62))
    #expect(r?["spo2_pct"] == .null)
    #expect(r?["soreness_1_10"] == .number(3))
    #expect(r?["illness_flag"] == .bool(false))
    #expect(r?["date_time"] == .string("2026-10-10T05:30:00.000Z"))
    #expect(l.done)
  }

  /// Nhập lại trong ngày: SỬA hàng tay đã có (ghi đè theo id của nó).
  @Test func secondReadingReplaces() async {
    let rows = BioRows(existing: [.object(["id": .string("old-1")])])
    let l = Self.make(rows)
    #expect(await l.submit(texts: [.spo2: "97"], soreness: nil, ill: false, online: true) == .saved)
    #expect(rows.upserts.first?["id"] == .string("old-1"))
  }

  /// Chỉ trả lời "bị ốm" cũng lưu được.
  @Test func illnessAloneSaves() async {
    let rows = BioRows()
    let l = Self.make(rows)
    #expect(await l.submit(texts: [:], soreness: nil, ill: true, online: true) == .saved)
    #expect(rows.upserts.first?["illness_flag"] == .bool(true))
  }

  /// Ô sai / không nhập gì: không gửi.
  @Test func invalidSendsNothing() async {
    let rows = BioRows()
    let l = Self.make(rows)
    #expect(await l.submit(texts: [:], soreness: nil, ill: false, online: true) == .invalid)
    #expect(await l.submit(texts: [.hr: "600"], soreness: nil, ill: false, online: true) == .invalid)
    #expect(await l.submit(texts: [.spo2: "abc"], soreness: nil, ill: false, online: true) == .invalid)
    #expect(rows.upserts.isEmpty)
  }

  /// Mất mạng: một hàng outbox, chạm lần hai không xếp thêm; hàng dùng được.
  @Test func offlineQueuesOnce() async throws {
    let queue = BioQueue()
    let l = Self.make(BioRows(), queue)
    #expect(await l.submit(texts: [.hr: "60"], soreness: nil, ill: false, online: false) == .queued)
    #expect(await l.submit(texts: [.hr: "60"], soreness: nil, ill: false, online: false) == .unavailable)
    let e = try #require(queue.entries.first)
    #expect(queue.entries.count == 1)
    #expect(e.kind == BiometricLog.kind)
    #expect(BiometricLog.isRow(e))
    #expect(BiometricLog.day(e, in: TimeZone(identifier: "UTC")!) == LocalDate("2026-10-10"))
  }

  /// Lỗi ghi: thất bại, thử lại được.
  @Test func writeFailureKeepsButtonLive() async {
    let rows = BioRows()
    rows.fail = true
    let l = Self.make(rows)
    #expect(await l.submit(texts: [.hr: "60"], soreness: nil, ill: false, online: true) == .failed)
    #expect(!l.done)
  }

  /// Hàng của Health hôm nay: điền sẵn ba ô của Health, không điền HRV / VO₂max.
  @Test func healthRowPrefills() {
    let row: JSONValue = .object([
      "source": .string("apple_health"), "hr_bpm": .number(56), "spo2_pct": .number(97.5),
      "resp_rate_rpm": .number(0), "hrv_rmssd_ms": .number(70),
    ])
    #expect(BiometricLog.prefill(row) == [.hr: "56", .spo2: "97.5"])
    #expect(BiometricLog.prefill(.object(["source": .string("manual"), "hr_bpm": .number(56)])).isEmpty)
  }
}
