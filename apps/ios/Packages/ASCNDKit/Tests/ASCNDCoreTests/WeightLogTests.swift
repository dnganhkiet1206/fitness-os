import ASCNDCore
import ASCNDTestSupport
import Foundation
import Testing

/// Ghi cân nặng (#527 Phase 4) — luật của `use-weight-write.ts`,
/// `use-fitness-data.ts` (`useLogWeight`), `offline-write.ts` (`case 'weight'`).
struct WeightLogRuleTests {
  /// `plausible('weight_kg', kg)`: `[20, 400]`, đầu mút tính.
  @Test func boundsAreTwentyToFourHundredKg() {
    #expect(WeightLog.plausible(20) && WeightLog.plausible(400) && WeightLog.plausible(72.4))
    #expect(!WeightLog.plausible(19.99) && !WeightLog.plausible(400.01) && !WeightLog.plausible(.nan))
  }

  /// Câu báo lỗi đọc dải theo đơn vị đang hiện: `String(displayWeight(...))`.
  @Test func boundsTextFollowsTheUnit() {
    let kg = WeightLog.boundsText(.kg), lb = WeightLog.boundsText(.lbs)
    #expect(kg.min == "20" && kg.max == "400")
    #expect(lb.min == "44.1" && lb.max == "881.8")
  }

  /// `todayWeight ?? profileKg ?? DEFAULT_KG`.
  @Test func seedIsTodayThenProfileThenSeventy() {
    #expect(WeightLog.seedKg(today: 71.2, profile: 80) == 71.2)
    #expect(WeightLog.seedKg(today: nil, profile: 80) == 80)
    #expect(WeightLog.seedKg(today: nil, profile: nil) == 70)
  }

  /// Hàng upsert của `useLogWeight` (`notes: ''`).
  @Test func rowIsTheRNUpsert() {
    #expect(WeightLog.row(userId: "u1", kg: 72.4, date: LocalDate("2026-10-09")!) == .object([
      "user_id": .string("u1"), "date": .string("2026-10-09"), "weight_kg": .number(72.4), "notes": .string(""),
    ]))
  }

  /// Hàng outbox chỉ dùng được khi của chính chủ, ngày hợp lệ, cân trong dải.
  @Test func outboxRowGuards() {
    let day = LocalDate("2026-10-09")!
    let good = WeightLog.entry(id: "W", userId: "u1", kg: 72, date: day, createdAt: EpochMillis(0))
    #expect(good.id == "w" && good.kind == "weight" && WeightLog.isRow(good))
    let other = OutboxEntry(id: "x", userId: "u1", kind: "weight",
                            payload: WeightLog.row(userId: "u2", kg: 72, date: day), createdAt: EpochMillis(0))
    #expect(!WeightLog.isRow(other))
    let wild = OutboxEntry(id: "y", userId: "u1", kind: "weight",
                           payload: WeightLog.row(userId: "u1", kg: 900, date: day), createdAt: EpochMillis(0))
    #expect(!WeightLog.isRow(wild))
  }
}

private actor WeightServer: WeightLogSource {
  var rows: [String: Double] = [:]  // "user|date"
  var failRead: (any Error)?
  var failWrite: (any Error)?
  var writes = 0
  private var held: [CheckedContinuation<Void, Never>] = []
  private var holding = false

  func setFailRead(_ e: (any Error)?) { failRead = e }
  func setFailWrite(_ e: (any Error)?) { failWrite = e }
  func put(_ user: String, _ date: String, _ kg: Double) { rows["\(user)|\(date)"] = kg }
  func hold() { holding = true }
  func release() {
    holding = false
    let h = held
    held = []
    for c in h { c.resume() }
  }
  var parked: Int { held.count }

  func weight(userId: String, date: LocalDate) async throws -> Double? {
    let v = rows["\(userId)|\(date.description)"]
    if holding { await withCheckedContinuation { held.append($0) } }
    if let e = failRead { throw e }
    return v
  }

  func log(userId: String, kg: Double, date: LocalDate) async throws {
    writes += 1
    if let e = failWrite { throw e }
    rows["\(userId)|\(date.description)"] = kg
  }
}

private actor WeightOutbox: PlanWriteStore {
  var entries: [OutboxEntry] = []
  func enqueue(_ es: [OutboxEntry]) async throws {
    for e in es where !entries.contains(where: { $0.id == e.id }) { entries.append(e) }
  }
  func pending(userId: String) async throws -> [OutboxEntry] { entries.filter { $0.userId == userId } }
}

private final class WeightIds: @unchecked Sendable {
  private let lock = NSLock()
  private var n = 0
  func next() -> String { lock.withLock { n += 1; return "w-\(n)" } }
}

private struct WeightHarness {
  let server = WeightServer()
  let outbox = WeightOutbox()
  /// 23:30 giờ Việt Nam ngày 08/10 — ngày địa phương khác ngày UTC sau 17:00 UTC.
  let clock = ManualClock(EpochMillis(iso8601: "2026-10-08T16:30:00Z")!)
  let ids = WeightIds()

  @MainActor func logger(_ user: String = "u1") -> WeightLogger {
    let ids = self.ids
    return WeightLogger(
      userId: user, source: server, store: outbox, clock: clock, timeZone: TimeZone(identifier: "Asia/Ho_Chi_Minh")!,
      makeId: { ids.next() })
  }
}

@MainActor
struct WeightLoggerTests {
  @Test func loadsTodaysWeighInForTheLocalDay() async {
    let h = WeightHarness()
    await h.server.put("u1", "2026-10-08", 71.4)
    await h.server.put("u1", "2026-10-07", 99)
    let l = h.logger()
    await l.load()
    #expect(l.loaded && l.todayKg == 71.4)
  }

  /// Đọc hỏng = như chưa cân: hạt giống rơi về hồ sơ (`data` là `undefined`).
  @Test func readFailureSeedsFromProfile() async {
    let h = WeightHarness()
    await h.server.setFailRead(URLError(.badServerResponse))
    let l = h.logger()
    await l.load()
    #expect(l.loaded && l.todayKg == nil)
    #expect(WeightLog.seedKg(today: l.todayKg, profile: 80) == 80)
  }

  /// Có mạng: ghi thẳng (upsert hôm nay địa phương), nút mở lại sau khi xong.
  @Test func onlineSaveWritesTodayAndReopensTheButton() async {
    let h = WeightHarness()
    let l = h.logger()
    #expect(await l.submit(kg: 72.5, online: true) == .saved)
    #expect(await h.server.rows["u1|2026-10-08"] == 72.5)
    #expect(l.todayKg == 72.5 && !l.pending)
    #expect(await h.outbox.entries.isEmpty)
  }

  /// Ngoài dải: không gửi gì.
  @Test func outOfRangeSendsNothing() async {
    let h = WeightHarness()
    let l = h.logger()
    #expect(await l.submit(kg: 19.9, online: true) == .outOfRange)
    #expect(await l.submit(kg: 0, online: true) == .outOfRange)
    #expect(await h.server.writes == 0)
  }

  /// Mất mạng lúc chạm: xếp hàng bền, ngày đọc lúc chạm; nút chết luôn —
  /// chạm lần hai không xếp thêm lần cân (`queue.isSuccess`).
  @Test func offlineQueuesOnceAndLocksTheButton() async {
    let h = WeightHarness()
    let l = h.logger()
    #expect(await l.submit(kg: 72.5, online: false) == .queued)
    #expect(l.pending && l.queued)
    #expect(await l.submit(kg: 73, online: false) == .unavailable)
    let queued = await h.outbox.entries
    #expect(queued.count == 1 && queued[0].kind == "weight")
    #expect(queued[0].payload["date"]?.stringValue == "2026-10-08")
    #expect(queued[0].payload["weight_kg"]?.doubleValue == 72.5)
    #expect(await h.server.writes == 0)
  }

  /// Mất mạng giữa chừng / lỗi server: báo ra, không gì được ghi, nút mở lại.
  @Test func failedWriteIsReported() async {
    let h = WeightHarness()
    let l = h.logger()
    await h.server.setFailWrite(URLError(.timedOut))
    #expect(await l.submit(kg: 72.5, online: true) == .offline)
    await h.server.setFailWrite(URLError(.badServerResponse))
    #expect(await l.submit(kg: 72.5, online: true) == .failed)
    #expect(!l.pending && l.todayKg == nil)
  }

  /// Đóng màn (đổi tài khoản) lúc đang đọc: lượt về muộn không đổi gì.
  @Test func lateReadAfterCloseIsDropped() async {
    let h = WeightHarness()
    await h.server.put("u1", "2026-10-08", 71.4)
    let l = h.logger()
    await h.server.hold()
    async let loading: Void = l.load()
    while await h.server.parked == 0 { await Task.yield() }
    l.close()
    await h.server.release()
    await loading
    #expect(!l.loaded && l.todayKg == nil)
    #expect(await l.submit(kg: 72, online: true) == .unavailable)
  }

  /// Cân của người khác không bao giờ là của mình.
  @Test func weighInIsPerUser() async {
    let h = WeightHarness()
    await h.server.put("u2", "2026-10-08", 90)
    let l = h.logger("u1")
    await l.load()
    #expect(l.todayKg == nil)
  }
}
