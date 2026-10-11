@testable import ASCNDCore
import Foundation
import Testing

/// Ghi giấc ngủ (#527, `log-sleep`). Golden: `sleep-window.ts` / `plausible.ts`
/// / `health-owned.ts` @ fac9ac2 biên dịch + các khối của màn chép nguyên văn
/// (`gen-sleep-log.mjs`).
struct SleepLogGoldenTests {
  static func golden() throws -> JSONValue {
    let url = try #require(Bundle.module.url(forResource: "sleep-log-golden", withExtension: "json", subdirectory: "Fixtures"))
    return try JSONDecoder().decode(JSONValue.self, from: Data(contentsOf: url))
  }

  static func array(_ v: JSONValue?) -> [JSONValue] {
    if case .array(let a)? = v { return a }
    return []
  }

  static func int(_ v: JSONValue?) -> Int? { v?.doubleValue.map { Int($0) } }

  static func clock(_ v: JSONValue?) -> SleepLog.Clock? {
    let a = array(v)
    guard a.count == 2, let h = int(a[0]), let m = int(a[1]) else { return nil }
    return SleepLog.Clock(hour: h, minute: m)
  }

  static func text(_ v: JSONValue?) -> String {
    if case .string(let s)? = v { return s }
    return ""
  }

  @Test func boundsMatchRN() throws {
    let b = try Self.golden()["BOUNDS"]
    #expect(SleepLog.durationBounds.lowerBound == b?["duration"]?["min"]?.doubleValue)
    #expect(SleepLog.durationBounds.upperBound == b?["duration"]?["max"]?.doubleValue)
    #expect(SleepLog.stageBounds.lowerBound == b?["stage"]?["min"]?.doubleValue)
    #expect(SleepLog.stageBounds.upperBound == b?["stage"]?["max"]?.doubleValue)
  }

  /// `sleepSpan` ở 4 múi giờ, gồm hai ngày đổi giờ của New York.
  @Test func sleepSpanMatchesRN() throws {
    let cases = Self.array(try Self.golden()["span"])
    #expect(cases.count == 600)
    for c in cases {
      guard case .string(let id)? = c["tz"], let tz = TimeZone(identifier: id),
        let ref = c["ref"]?.doubleValue, let bed = Self.clock(c["bed"]), let wake = Self.clock(c["wake"])
      else {
        Issue.record("ca hỏng: \(c)")
        continue
      }
      let s = SleepLog.span(bed: bed, wake: wake, ref: EpochMillis(Int64(ref)), in: tz)
      #expect(Double(s.bed.millis) == c["bedAt"]?.doubleValue, "\(c)")
      #expect(Double(s.wake.millis) == c["wakeAt"]?.doubleValue, "\(c)")
      #expect(s.minutes == Self.int(c["minutes"]), "\(c)")
    }
  }

  /// Thời lượng / ô giai đoạn / tổng vượt / hàng ghi.
  @Test func stageChecksMatchRN() throws {
    let cases = Self.array(try Self.golden()["stage"])
    #expect(cases.count == 300)
    for c in cases {
      let texts = [Self.text(c["deep"]), Self.text(c["rem"]), Self.text(c["light"])]
      let minutes = try #require(Self.int(c["duration"]))
      #expect(SleepLog.durationBad(minutes) == (c["durationBad"] == .bool(true)), "\(c)")
      let bad = c["stageBad"] == .bool(true)
      #expect(texts.allSatisfy(SleepLog.stageOK) == !bad, "\(c)")
      #expect(SleepLog.stageSum(texts) == c["stageSum"]?.doubleValue, "\(c)")
      let want: SleepLog.StageProblem? =
        bad ? .outOfRange
        : c["stagesOverrun"] == .bool(true)
          ? .overrun(sum: c["stageSum"]?.doubleValue ?? .nan, total: minutes) : nil
      #expect(SleepLog.stageProblem(texts, minutes: minutes) == want, "\(c)")
      let span = SleepLog.Span(bed: EpochMillis(Int64(0)), wake: EpochMillis(Int64(minutes) * 60_000), minutes: minutes)
      let row = SleepLog.row(userId: "u1", span: span, quality: 8, stages: texts)
      for k in SleepLog.stageColumns {
        #expect(row[k]?.doubleValue == c["row"]?[k]?.doubleValue, "\(k) \(c)")
      }
    }
  }

  /// `sleepRowToReplace`: hàng đầu tiên chồng lấn; mốc hỏng bị bỏ qua.
  @Test func replaceMatchesRN() throws {
    let cases = Self.array(try Self.golden()["replace"])
    #expect(cases.count == 150)
    #expect(cases.contains { $0["expected"] != .null })
    for c in cases {
      let got = SleepLog.replaceId(bed: Self.text(c["bedtime"]), wake: Self.text(c["waketime"]), rows: Self.array(c["rows"]))
      let want: String? = if case .string(let s)? = c["expected"] { s } else { nil }
      #expect(got == want, "\(c)")
    }
  }

  /// Đêm của Health: nhận ra nguồn, giai đoạn của Health, số thứ bị sửa.
  @Test func healthMatchesRN() throws {
    let cases = Self.array(try Self.golden()["health"])
    #expect(cases.count == 200)
    for c in cases {
      let night = c["night"]
      #expect(SleepLog.fromHealth(night) == (c["fromHealth"] == .bool(true)), "\(c)")
      var want: [String: Double] = [:]
      if case .object(let o)? = c["stages"] {
        for (k, v) in o { if let d = v.doubleValue { want[k] = d } }
      }
      #expect(SleepLog.healthStages(night) == want, "\(c)")
      let typed = Self.array(c["typed"]).map { Self.text($0) }
      let bed = try #require(c["bedAt"]?.doubleValue)
      let wake = try #require(c["wakeAt"]?.doubleValue)
      let span = SleepLog.Span(bed: EpochMillis(Int64(bed)), wake: EpochMillis(Int64(wake)), minutes: 0)
      #expect(SleepLog.healthChanges(night: night, typed: typed, span: span) == Self.int(c["changes"]), "\(c)")
    }
  }
}

/// Kho hàng giả: `sleep_logs` + `daily_logs` trong bộ nhớ.
private final class Rows: RowStore, @unchecked Sendable {
  private let lock = NSLock()
  private var _sleeps: [JSONValue]
  private var _inserted: [[String: JSONValue]] = []
  private var _updated: [(String, [String: JSONValue])] = []
  var failWrite = false
  var vanished = false

  init(sleeps: [JSONValue] = []) { _sleeps = sleeps }

  var inserted: [[String: JSONValue]] { lock.withLock { _inserted } }
  var updatedIds: [String] { lock.withLock { _updated.map(\.0) } }

  func select(_ q: RowQuery) async throws(RowStoreError) -> [JSONValue] {
    q.table == "sleep_logs" ? lock.withLock { _sleeps } : []
  }
  func insert(_ table: String, _ row: [String: JSONValue]) async throws(RowStoreError) {
    if table == "sleep_logs" {
      if failWrite { throw RowStoreError(code: "500", message: "boom") }
      lock.withLock { _inserted.append(row) }
    }
  }
  func update(_ table: String, _ row: [String: JSONValue], where filters: [RowQuery.Filter]) async throws(RowStoreError)
    -> Int
  {
    guard table == "sleep_logs" else { return 1 }
    if vanished { return 0 }
    var id = ""
    for f in filters { if case .eq("id", .string(let s)) = f { id = s } }
    lock.withLock { _updated.append((id, row)) }
    return 1
  }
}

private final class Queue: PlanWriteStore, @unchecked Sendable {
  private let lock = NSLock()
  private var rows: [OutboxEntry] = []
  var entries: [OutboxEntry] { lock.withLock { rows } }
  func enqueue(_ entries: [OutboxEntry]) async throws { lock.withLock { rows += entries } }
  func pending(userId: String) async throws -> [OutboxEntry] { lock.withLock { rows } }
}

private struct FixedClock: WallClock {
  let date: Date
  func now() -> Date { date }
}

@MainActor
struct SleepLoggerTests {
  /// 2026-10-10 05:30 UTC — 12:30 ở Hà Nội.
  private static let clock = FixedClock(date: Date(timeIntervalSince1970: 1_791_610_200))
  private static let hanoi = TimeZone(identifier: "Asia/Ho_Chi_Minh")!

  private static func make(_ rows: Rows, _ queue: Queue? = Queue()) -> SleepLogger {
    SleepLogger(userId: "u1", store: rows, outbox: queue, clock: clock, timeZone: hanoi, makeId: { "ROW-1" })
  }

  private static let night = SleepLog.Span(
    bed: EpochMillis(iso8601: "2026-10-09T16:00:00.000Z")!, wake: EpochMillis(iso8601: "2026-10-10T00:00:00.000Z")!,
    minutes: 480)

  /// Chưa có giấc nào: thêm một hàng đúng cột, giai đoạn trống là 0.
  @Test func newNightInserts() async {
    let rows = Rows()
    let l = Self.make(rows)
    #expect(await l.submit(span: Self.night, quality: 6, stages: ["90", "", "200"], online: true) == .saved)
    #expect(
      rows.inserted == [
        [
          "user_id": .string("u1"), "bedtime": .string("2026-10-09T16:00:00.000Z"),
          "waketime": .string("2026-10-10T00:00:00.000Z"), "quality": .number(6), "deep_min": .number(90),
          "rem_min": .number(0), "light_min": .number(200),
        ]
      ])
    #expect(l.done)
  }

  /// Ghi lại cùng đêm (chồng lấn) là SỬA hàng ấy, không thêm.
  @Test func sameNightUpdates() async {
    let rows = Rows(sleeps: [
      .object(["id": .string("n1"), "bedtime": .string("2026-10-09T15:30:00.000Z"), "waketime": .string("2026-10-09T23:00:00.000Z")])
    ])
    let l = Self.make(rows)
    #expect(await l.submit(span: Self.night, quality: 8, stages: [], online: true) == .saved)
    #expect(rows.updatedIds == ["n1"])
    #expect(rows.inserted.isEmpty)
  }

  /// Hàng cần sửa vừa bị xoá ở máy khác: lỗi có tên, không "đã lưu".
  @Test func vanishedRowIsNamed() async {
    let rows = Rows(sleeps: [
      .object(["id": .string("n1"), "bedtime": .string("2026-10-09T15:30:00.000Z"), "waketime": .string("2026-10-09T23:00:00.000Z")])
    ])
    rows.vanished = true
    let l = Self.make(rows)
    #expect(await l.submit(span: Self.night, quality: 8, stages: [], online: true) == .replaceGone)
    #expect(!l.done)
  }

  /// Mất mạng: một hàng outbox `sleep` mang id cố định; chạm lần hai không xếp thêm.
  @Test func offlineQueuesOnce() async throws {
    let queue = Queue()
    let rows = Rows()
    let l = Self.make(rows, queue)
    #expect(await l.submit(span: Self.night, quality: 8, stages: ["60"], online: false) == .queued)
    #expect(await l.submit(span: Self.night, quality: 8, stages: ["60"], online: false) == .unavailable)
    let e = try #require(queue.entries.first)
    #expect(queue.entries.count == 1)
    #expect(e.kind == SleepLog.kind)
    #expect(e.payload["id"] == .string("row-1"))
    #expect(SleepLog.isRow(e))
    #expect(SleepLog.replayDay(e, in: Self.hanoi) == LocalDate("2026-10-10"))
    #expect(rows.inserted.isEmpty)
  }

  /// Sai thời lượng / giai đoạn: không gửi gì.
  @Test func invalidSendsNothing() async {
    let rows = Rows()
    let l = Self.make(rows)
    let short = SleepLog.Span(bed: Self.night.bed, wake: Self.night.bed, minutes: 5)
    #expect(await l.submit(span: short, quality: 8, stages: [], online: true) == .invalid)
    #expect(await l.submit(span: Self.night, quality: 8, stages: ["300", "200", "100"], online: true) == .invalid)
    #expect(await l.submit(span: Self.night, quality: 8, stages: ["abc"], online: true) == .invalid)
    #expect(rows.inserted.isEmpty)
  }

  /// Lỗi ghi: thất bại, thử lại được.
  @Test func writeFailureKeepsButtonLive() async {
    let rows = Rows()
    rows.failWrite = true
    let l = Self.make(rows)
    #expect(await l.submit(span: Self.night, quality: 8, stages: [], online: true) == .failed)
    #expect(!l.done)
  }

  /// Đêm của Health hôm nay được nhận ra; đêm ghi tay thì không.
  @Test func loadsOnlyHealthNights() async {
    let health = Rows(sleeps: [
      .object([
        "id": .string("h"), "source": .string("apple_health"), "bedtime": .string("2026-10-09T16:00:00.000Z"),
        "waketime": .string("2026-10-10T00:00:00.000Z"), "deep_min": .number(70),
      ])
    ])
    let l = Self.make(health)
    await l.load()
    #expect(l.healthNight?["id"] == .string("h"))
    #expect(l.healthChanges(span: Self.night, stages: ["70", "", ""]) == 0, "không sửa gì → không hỏi")
    #expect(l.healthChanges(span: Self.night, stages: ["80", "", ""]) == 1)
    let manual = Rows(sleeps: [
      .object(["id": .string("m"), "source": .string("manual"), "bedtime": .string("2026-10-09T16:00:00.000Z"),
        "waketime": .string("2026-10-10T00:00:00.000Z")])
    ])
    let m = Self.make(manual)
    await m.load()
    #expect(m.healthNight == nil)
  }

  /// Hàng outbox hỏng không bao giờ được gửi.
  @Test func badQueueRowsAreRefused() {
    func e(_ p: [String: JSONValue], user: String = "u1") -> OutboxEntry {
      OutboxEntry(id: "x", userId: user, kind: SleepLog.kind, payload: .object(p), createdAt: EpochMillis(Int64(0)))
    }
    var ok = SleepLog.row(userId: "u1", span: Self.night, quality: 8, stages: [])
    ok["id"] = .string("x")
    #expect(SleepLog.isRow(e(ok)))
    #expect(!SleepLog.isRow(e(ok, user: "u2")))
    var noId = ok
    noId["id"] = nil
    #expect(!SleepLog.isRow(e(noId)))
    var badTime = ok
    badTime["waketime"] = .string("yesterday")
    #expect(!SleepLog.isRow(e(badTime)))
  }
}
