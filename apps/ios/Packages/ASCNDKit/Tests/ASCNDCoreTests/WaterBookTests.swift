import ASCNDCore
import ASCNDTestSupport
import Foundation
import Testing

/// `WaterBook` (#527 Phase 3) — hành vi của `use-water.ts`: thêm qua hàng đợi
/// bền, "−" chỉ online, ngày đọc lúc chạm, theo người dùng, bỏ kết quả cũ.

// MARK: - Đồ giả

/// Server giả của `water_logs`: hàng theo người; đọc có thể bị giữ lại để
/// dựng lượt về muộn.
private actor Server: WaterSource {
  struct Row: Sendable { var id: String; var user: String; var date: LocalDate; var ml: Int; var at: EpochMillis; var created: EpochMillis }
  var table: [Row] = []
  var failNext: (any Error)?
  var deleteCountOverride: Int?
  var removeCalls = 0
  private var held: [CheckedContinuation<Void, Never>] = []
  private var holding = false

  func put(_ r: Row) { table.append(r) }
  func delete(id: String) { table.removeAll { $0.id == id } }
  func fail(_ e: any Error) { failNext = e }
  func overrideDeleteCount(_ n: Int?) { deleteCountOverride = n }
  func hold() { holding = true }
  func release() {
    holding = false
    let h = held
    held = []
    for c in h { c.resume() }
  }
  var parked: Int { held.count }

  private func gate() async throws {
    if holding { await withCheckedContinuation { held.append($0) } }
    if let e = failNext {
      failNext = nil
      throw e
    }
  }

  /// Chụp hàng TRƯỚC khi chờ: lượt bị giữ trả về số của lúc nó được hỏi.
  func logs(userId: String, date: LocalDate) async throws -> [WaterLog] {
    let snapshot = table.filter { $0.user == userId && $0.date == date }
      .map { WaterLog(id: $0.id, amountMl: $0.ml, loggedAt: $0.at, createdAt: $0.created) }
    try await gate()
    return snapshot
  }

  func rows(userId: String, from: LocalDate) async throws -> [WaterRow] {
    table.filter { $0.user == userId && $0.date >= from }.map { WaterRow(id: $0.id, date: $0.date, amountMl: $0.ml) }
  }

  func removeNewest(userId: String, date: LocalDate) async throws -> Int? {
    removeCalls += 1
    try await gate()
    let mine = table.filter { $0.user == userId && $0.date == date }
      .map { WaterLog(id: $0.id, amountMl: $0.ml, loggedAt: $0.at, createdAt: $0.created) }
    guard let newest = Water.newestFirst(mine).first else { return nil }
    if let n = deleteCountOverride { return n }
    table.removeAll { $0.id == newest.id }
    return 1
  }
}

/// Outbox giả: ghi theo id (idempotent), `drain` = vòng sync đã gửi xong.
private actor Outbox: PlanWriteStore {
  var entries: [OutboxEntry] = []
  func enqueue(_ es: [OutboxEntry]) async throws {
    for e in es where !entries.contains(where: { $0.id == e.id }) { entries.append(e) }
  }
  func pending(userId: String) async throws -> [OutboxEntry] { entries.filter { $0.userId == userId } }
  func drain() { entries = [] }
}

private actor Cache: WaterCache {
  var saved: [String: WaterSnapshot] = [:]
  func load(userId: String) async throws -> WaterSnapshot? { saved[userId] }
  func save(userId: String, _ snapshot: WaterSnapshot) async throws { saved[userId] = snapshot }
}

private final class Ids: @unchecked Sendable {
  private let lock = NSLock()
  private var n = 0
  func next() -> String { lock.withLock { n += 1; return "id-\(n)" } }
}

private enum W {
  static let utc = TimeZone(identifier: "UTC")!
  static func at(_ iso: String) -> EpochMillis { EpochMillis(iso8601: iso)! }
  static let day = LocalDate("2026-10-08")!
}

private struct Harness {
  let server = Server()
  let outbox = Outbox()
  let cache = Cache()
  let clock = ManualClock(W.at("2026-10-08T10:00:00Z"))
  let ids = Ids()

  @MainActor func book(_ user: String = "u1") -> WaterBook {
    let ids = self.ids
    return WaterBook(
      userId: user, source: server, cache: cache, store: outbox, clock: clock, timeZone: W.utc,
      makeId: { ids.next() })
  }
}

@MainActor
struct WaterBookTests {
  // MARK: - Đọc

  @Test func readsTodayNewestFirstAndTheWeek() async {
    let h = Harness()
    await h.server.put(.init(id: "a", user: "u1", date: W.day, ml: 250, at: W.at("2026-10-08T08:00:00Z"), created: W.at("2026-10-08T08:00:00Z")))
    await h.server.put(.init(id: "b", user: "u1", date: W.day, ml: 500, at: W.at("2026-10-08T09:00:00Z"), created: W.at("2026-10-08T09:00:00Z")))
    await h.server.put(.init(id: "c", user: "u1", date: W.day.adding(days: -2), ml: 750, at: W.at("2026-10-06T09:00:00Z"), created: W.at("2026-10-06T09:00:00Z")))
    // Hàng của người khác: không bao giờ hiện.
    await h.server.put(.init(id: "x", user: "u2", date: W.day, ml: 9999, at: W.at("2026-10-08T09:30:00Z"), created: W.at("2026-10-08T09:30:00Z")))
    let book = h.book()
    await book.load()
    #expect(book.loaded && book.failure == nil)
    #expect(book.logs.map(\.id) == ["b", "a"])
    #expect(book.totalMl == 750)
    #expect(book.week.map(\.totalMl) == [0, 0, 0, 0, 750, 0, 750])
    #expect(await h.cache.saved["u1"]?.logs.count == 2)
  }

  /// Lần đọc đầu hỏng: không có số nào — màn nói lỗi, không nói "0".
  @Test func firstReadFailureIsNotZero() async {
    let h = Harness()
    await h.server.fail(URLError(.notConnectedToInternet))
    let book = h.book()
    await book.load()
    #expect(!book.loaded && book.failure == .offline)
    await h.server.fail(URLError(.badServerResponse))
    await book.refresh()
    #expect(!book.loaded && book.failure == .unavailable)
  }

  /// Mở lúc mất mạng: bản lưu trên máy hiện, lỗi được ghi lại, số giữ nguyên.
  @Test func offlineOpenShowsTheSavedCopy() async {
    let h = Harness()
    await h.server.put(.init(id: "a", user: "u1", date: W.day, ml: 250, at: W.at("2026-10-08T08:00:00Z"), created: W.at("2026-10-08T08:00:00Z")))
    await h.book().load()
    await h.server.fail(URLError(.notConnectedToInternet))
    let reopened = h.book()
    await reopened.load()
    #expect(reopened.loaded && reopened.failure == .offline)
    #expect(reopened.totalMl == 250)
  }

  /// Bản lưu của NGƯỜI KHÁC không bao giờ là của mình.
  @Test func cacheIsPerUser() async {
    let h = Harness()
    await h.server.put(.init(id: "a", user: "u1", date: W.day, ml: 250, at: W.at("2026-10-08T08:00:00Z"), created: W.at("2026-10-08T08:00:00Z")))
    await h.book("u1").load()
    await h.server.fail(URLError(.notConnectedToInternet))
    let other = h.book("u2")
    await other.load()
    #expect(!other.loaded && other.logs.isEmpty)
  }

  // MARK: - Thêm

  /// `useAddWater`: id + ngày chọn lúc chạm; mất mạng → "đã giữ"; hiện ngay.
  @Test func addQueuesTheRNRowAndShowsItAtOnce() async throws {
    let h = Harness()
    let book = h.book()
    await book.load()
    let outcome = try await book.add(amountMl: 250, online: false)
    #expect(outcome == .queued)
    let queued = await h.outbox.entries
    #expect(queued.count == 1 && queued[0].kind == Water.addKind)
    #expect(queued[0].payload["date"]?.stringValue == "2026-10-08")
    #expect(queued[0].payload["logged_at"]?.stringValue == "2026-10-08T10:00:00.000Z")
    #expect(book.logs.map(\.id) == ["id-1"] && book.logs[0].pending)
    #expect(book.totalMl == 250 && book.week.last?.totalMl == 250)
    #expect(try await book.add(amountMl: 500, online: true) == .saved)
    #expect(book.totalMl == 750)
  }

  @Test func addRefusesNothing() async {
    let h = Harness()
    let book = h.book()
    await #expect(throws: WaterBook.AddRefusal.invalidAmount) { try await book.add(amountMl: 0, online: true) }
    #expect(await h.outbox.entries.isEmpty)
  }

  /// App để mở qua nửa đêm: lần chạm sau 0h ghi vào NGÀY MỚI, không phải ngày
  /// màn render lần cuối.
  @Test func addReadsTheDayAtTheTap() async throws {
    let h = Harness()
    h.clock.advance(14 * 3_600_000 - 60_000)  // 23:59
    let book = h.book()
    await book.load()
    #expect(book.date == W.day)
    h.clock.advance(2 * 60_000)  // 00:01 hôm sau
    try await book.add(amountMl: 250, online: true)
    #expect(await h.outbox.entries.first?.payload["date"]?.stringValue == "2026-10-09")
    #expect(book.date == W.day.adding(days: 1))
    #expect(book.totalMl == 250)
  }

  /// Lần uống đã tới server mà outbox chưa kịp xoá: KHÔNG cộng hai lần.
  @Test func aSentDrinkIsCountedOnce() async throws {
    let h = Harness()
    let book = h.book()
    await book.load()
    try await book.add(amountMl: 250, online: true)
    await h.server.put(.init(id: "id-1", user: "u1", date: W.day, ml: 250, at: W.at("2026-10-08T10:00:00Z"), created: W.at("2026-10-08T10:00:01Z")))
    await book.refresh()
    #expect(book.logs.count == 1 && book.totalMl == 250 && book.week.last?.totalMl == 250)
  }

  /// Gửi xong (outbox trống), rồi "−" xoá đúng lần ấy trên server: đọc lại
  /// KHÔNG làm nó sống lại từ bản nhớ của sổ.
  @Test func aRemovedDrinkDoesNotComeBack() async throws {
    let h = Harness()
    let book = h.book()
    await book.load()
    try await book.add(amountMl: 250, online: true)
    await h.server.put(.init(id: "id-1", user: "u1", date: W.day, ml: 250, at: W.at("2026-10-08T10:00:00Z"), created: W.at("2026-10-08T10:00:01Z")))
    await h.outbox.drain()
    await book.refresh()
    #expect(await book.removeLast(online: true) == .removed)
    #expect(book.logs.isEmpty && book.totalMl == 0)
    await book.refresh()
    #expect(book.logs.isEmpty)
  }

  /// Lần uống trong outbox của người khác không hiện ở sổ này.
  @Test func anotherUsersQueuedDrinkIsNotMine() async throws {
    let h = Harness()
    try await h.book("u2").add(amountMl: 999, online: false)
    let mine = h.book("u1")
    await mine.load()
    #expect(mine.logs.isEmpty && mine.totalMl == 0)
  }

  /// Mở lại app khi lần uống còn trong outbox: vẫn hiện (RN giữ bản vá).
  @Test func queuedDrinkSurvivesReopen() async throws {
    let h = Harness()
    try await h.book().add(amountMl: 330, online: false)
    await h.server.fail(URLError(.notConnectedToInternet))
    let reopened = h.book()
    await reopened.load()
    #expect(reopened.totalMl == 330)
  }

  // MARK: - "−"

  /// `useOnlineMutation`: mất mạng thì từ chối, không vá, không gọi server.
  @Test func removeIsOnlineOnly() async {
    let h = Harness()
    await h.server.put(.init(id: "a", user: "u1", date: W.day, ml: 250, at: W.at("2026-10-08T08:00:00Z"), created: W.at("2026-10-08T08:00:00Z")))
    let book = h.book()
    await book.load()
    #expect(await book.removeLast(online: false) == .onlineOnly)
    #expect(book.totalMl == 250 && !book.removing)
    #expect(await h.server.removeCalls == 0)
  }

  /// Xoá đúng lần MỚI NHẤT theo `newestFirst`.
  @Test func removeTakesTheNewest() async {
    let h = Harness()
    let t = W.at("2026-10-08T08:00:00Z")
    await h.server.put(.init(id: "a", user: "u1", date: W.day, ml: 250, at: t, created: W.at("2026-10-08T08:00:01Z")))
    await h.server.put(.init(id: "b", user: "u1", date: W.day, ml: 500, at: t, created: W.at("2026-10-08T08:00:02Z")))
    let book = h.book()
    await book.load()
    #expect(await book.removeLast(online: true) == .removed)
    #expect(book.logs.map(\.id) == ["a"] && book.totalMl == 250)
  }

  /// Không có gì để xoá: im (`if (!last) return`). Xoá ra 0 hàng: lỗi
  /// `nCxNothingWrittenWater`, số trả lại như cũ.
  @Test func removeNothingAndNothingWritten() async {
    let h = Harness()
    let book = h.book()
    await book.load()
    #expect(await book.removeLast(online: true) == .nothingToRemove)
    await h.server.put(.init(id: "a", user: "u1", date: W.day, ml: 250, at: W.at("2026-10-08T08:00:00Z"), created: W.at("2026-10-08T08:00:00Z")))
    await book.refresh()
    await h.server.overrideDeleteCount(0)
    #expect(await book.removeLast(online: true) == .nothingWritten)
    #expect(book.totalMl == 250)
  }

  /// Vá lạc quan rồi trả lại khi lỗi (`rollbackWater`); mất mạng giữa chừng là
  /// "chỉ online".
  @Test func removeRollsBackOnFailure() async {
    let h = Harness()
    await h.server.put(.init(id: "a", user: "u1", date: W.day, ml: 250, at: W.at("2026-10-08T08:00:00Z"), created: W.at("2026-10-08T08:00:00Z")))
    let book = h.book()
    await book.load()
    await h.server.hold()
    async let result = book.removeLast(online: true)
    while await h.server.parked == 0 { await Task.yield() }
    #expect(book.logs.isEmpty && book.removing && !book.canRemove)
    await h.server.fail(URLError(.timedOut))
    await h.server.release()
    #expect(await result == .onlineOnly)
    #expect(book.totalMl == 250 && !book.removing)
  }

  // MARK: - Theo người dùng / kết quả cũ

  /// Đóng sổ (đăng xuất / đổi tài khoản) trong lúc đang đọc: lượt về muộn
  /// không đổi màn.
  @Test func lateResultAfterCloseIsDropped() async {
    let h = Harness()
    await h.server.put(.init(id: "a", user: "u1", date: W.day, ml: 250, at: W.at("2026-10-08T08:00:00Z"), created: W.at("2026-10-08T08:00:00Z")))
    let book = h.book()
    await h.server.hold()
    async let loading: Void = book.load()
    while await h.server.parked == 0 { await Task.yield() }
    book.close()
    await h.server.release()
    await loading
    #expect(!book.loaded && book.logs.isEmpty)
    await #expect(throws: WaterBook.AddRefusal.unavailable) { try await book.add(amountMl: 250, online: true) }
  }

  /// Lượt đọc cũ về SAU lượt mới: bỏ, không đè số mới bằng số cũ.
  @Test func olderReadLandingLastIsDropped() async {
    let h = Harness()
    let book = h.book()
    await book.load()
    await h.server.hold()
    async let older: Void = book.refresh()
    while await h.server.parked == 0 { await Task.yield() }
    await h.server.put(.init(id: "a", user: "u1", date: W.day, ml: 250, at: W.at("2026-10-08T08:00:00Z"), created: W.at("2026-10-08T08:00:00Z")))
    // Lượt mới đi thẳng (không giữ), lượt cũ còn nằm chờ.
    await h.server.stopHolding()
    await book.refresh()
    #expect(book.totalMl == 250)
    await h.server.release()
    await older
    #expect(book.totalMl == 250)
  }
}
