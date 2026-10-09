import ASCNDCore
import ASCNDTestSupport
import Foundation
import Testing

/// `localDayRangeISO` của RN (`lib/local-date.ts`), chạy bằng CHÍNH mã RN dưới
/// `TZ=<múi>` (node, tsc biên dịch nguyên tệp) — gồm ngày đổi giờ của Mỹ
/// (08/03, 01/11) và Anh (29/03, 25/10): 23 / 25 giờ, không phải 24.
struct SupplementDayRangeTests {
  static let cases: [(String, String, String, String)] = [
    ("UTC", "2026-10-08", "2026-10-08T00:00:00.000Z", "2026-10-09T00:00:00.000Z"),
    ("Asia/Ho_Chi_Minh", "2026-10-08", "2026-10-07T17:00:00.000Z", "2026-10-08T17:00:00.000Z"),
    ("America/New_York", "2026-10-08", "2026-10-08T04:00:00.000Z", "2026-10-09T04:00:00.000Z"),
    ("America/New_York", "2026-03-08", "2026-03-08T05:00:00.000Z", "2026-03-09T04:00:00.000Z"),
    ("America/New_York", "2026-11-01", "2026-11-01T04:00:00.000Z", "2026-11-02T05:00:00.000Z"),
    ("Europe/London", "2026-10-08", "2026-10-07T23:00:00.000Z", "2026-10-08T23:00:00.000Z"),
    ("Europe/London", "2026-03-29", "2026-03-29T00:00:00.000Z", "2026-03-29T23:00:00.000Z"),
    ("Europe/London", "2026-10-25", "2026-10-24T23:00:00.000Z", "2026-10-26T00:00:00.000Z"),
  ]

  @Test func dayRangeMatchesRN() throws {
    for (tz, day, start, end) in Self.cases {
      let r = Supplements.dayRange(try #require(LocalDate(day)), in: try #require(TimeZone(identifier: tz)))
      #expect(r.start == start && r.end == end, "\(tz) \(day)")
    }
  }

  /// `useAddSupplement`: tên / liều cắt khoảng trắng, `category: 'other'`,
  /// `notes: ''`; tên rỗng thì không có hàng nào.
  @Test func newRowIsTheRNInsert() {
    #expect(Supplements.newRow(userId: "u1", name: "  Creatine ", dose: " 5g ", timing: "morning") == .object([
      "user_id": .string("u1"), "name": .string("Creatine"), "category": .string("other"), "dose_text": .string("5g"),
      "timing": .string("morning"), "notes": .string(""),
    ]))
    #expect(Supplements.newRow(userId: "u1", name: "   ", dose: "5g", timing: "morning") == nil)
  }

  /// `[dose_text, timingLabel(timing)].filter(Boolean).join(' · ')`.
  @Test func detailJoinsWhatIsThere() {
    #expect(Supplements.detail(dose: "5g", timingLabel: "Sáng") == "5g · Sáng")
    #expect(Supplements.detail(dose: "", timingLabel: "Sáng") == "Sáng")
    #expect(Supplements.detail(dose: nil, timingLabel: nil) == "")
  }

  @Test func timingsAreTheRNFive() {
    #expect(Supplements.timings == ["morning", "pre-workout", "post-workout", "with meals", "before bed"])
    #expect(Supplements.defaultTiming == "morning")
  }
}

// MARK: - Đồ giả

private actor SupplementServer: SupplementSource {
  struct Item: Sendable { var id: String; var user: String; var name: String; var timing: String }
  var items: [Item] = []
  /// (người, id) đã uống, kèm thời điểm ISO.
  var intakes: [(user: String, id: String, at: String)] = []
  var failList: (any Error)?
  var failIntakes: (any Error)?
  var failWrite: (any Error)?
  var deleteCountOverride: Int?
  var writes = 0
  var ranges: [(String, String)] = []
  private var held: [CheckedContinuation<Void, Never>] = []
  private var holding = false

  func put(_ i: Item) { items.append(i) }
  func take(user: String, id: String, at: String) { intakes.append((user, id, at)) }
  func setFailList(_ e: (any Error)?) { failList = e }
  func setFailIntakes(_ e: (any Error)?) { failIntakes = e }
  func setFailWrite(_ e: (any Error)?) { failWrite = e }
  func setDeleteCount(_ n: Int?) { deleteCountOverride = n }
  func hold() { holding = true }
  func release() {
    holding = false
    let h = held
    held = []
    for c in h { c.resume() }
  }
  var parked: Int { held.count }

  func supplements(userId: String) async throws -> [Supplement] {
    let snapshot = items.filter { $0.user == userId }
      .map { Supplement(id: $0.id, name: $0.name, doseText: nil, timing: $0.timing, category: "other", taken: false) }
    if holding { await withCheckedContinuation { held.append($0) } }
    if let e = failList { throw e }
    return snapshot
  }

  func takenIds(userId: String, start: String, end: String) async throws -> Set<String> {
    ranges.append((start, end))
    if let e = failIntakes { throw e }
    return Set(intakes.filter { $0.user == userId && $0.at >= start && $0.at < end }.map(\.id))
  }

  func insert(_ row: JSONValue) async throws {
    writes += 1
    if let e = failWrite { throw e }
    guard let user = row["user_id"]?.stringValue, let name = row["name"]?.stringValue else { return }
    items.append(Item(id: "s\(items.count + 1)", user: user, name: name, timing: row["timing"]?.stringValue ?? ""))
  }

  func delete(id: String, userId: String) async throws -> Int {
    writes += 1
    if let e = failWrite { throw e }
    if let n = deleteCountOverride { return n }
    let before = items.count
    items.removeAll { $0.id == id && $0.user == userId }
    return before - items.count
  }
}

private actor SupplementCacheFake: SupplementCache {
  var saved: [String: SupplementSnapshot] = [:]
  func load(userId: String) async throws -> SupplementSnapshot? { saved[userId] }
  func save(userId: String, _ snapshot: SupplementSnapshot) async throws { saved[userId] = snapshot }
}

private struct SupplementHarness {
  let server = SupplementServer()
  let cache = SupplementCacheFake()
  /// 14:00 giờ Việt Nam ngày 08/10.
  let clock = ManualClock(EpochMillis(iso8601: "2026-10-08T07:00:00Z")!)
  let tz = TimeZone(identifier: "Asia/Ho_Chi_Minh")!

  @MainActor func book(_ user: String = "u1") -> SupplementBook {
    SupplementBook(userId: user, source: server, cache: cache, clock: clock, timeZone: tz)
  }
}

@MainActor
struct SupplementBookTests {
  /// Danh sách theo thứ tự server, dấu "đã uống" chỉ của HÔM NAY địa phương.
  @Test func readsTodaysChecklist() async {
    let h = SupplementHarness()
    await h.server.put(.init(id: "a", user: "u1", name: "Creatine", timing: "morning"))
    await h.server.put(.init(id: "b", user: "u1", name: "Omega 3", timing: "with meals"))
    await h.server.put(.init(id: "x", user: "u2", name: "Of someone else", timing: "morning"))
    await h.server.take(user: "u1", id: "a", at: "2026-10-08T01:00:00.000Z")  // 08:00 hôm nay
    await h.server.take(user: "u1", id: "b", at: "2026-10-07T16:00:00.000Z")  // 23:00 hôm qua
    let book = h.book()
    await book.load()
    #expect(book.items.map(\.id) == ["a", "b"])
    #expect(book.items.map(\.taken) == [true, false])
    #expect(book.takenCount == 1)
    let range = await h.server.ranges.last
    #expect(range?.0 == "2026-10-07T17:00:00.000Z" && range?.1 == "2026-10-08T17:00:00.000Z")
  }

  /// Lượt đọc intake hỏng: lỗi — KHÔNG hiện mọi mục là "chưa uống".
  @Test func intakeFailureIsAnErrorNotUntaken() async {
    let h = SupplementHarness()
    await h.server.put(.init(id: "a", user: "u1", name: "Creatine", timing: "morning"))
    await h.server.setFailIntakes(URLError(.badServerResponse))
    let book = h.book()
    await book.load()
    #expect(book.phase == .failed(.unavailable))
    #expect(book.items.isEmpty)
  }

  @Test func offlineFirstReadSaysOffline() async {
    let h = SupplementHarness()
    await h.server.setFailList(URLError(.notConnectedToInternet))
    let book = h.book()
    await book.load()
    #expect(book.phase == .failed(.offline))
  }

  /// Đọc được mà không có gì: rỗng, không phải lỗi.
  @Test func emptyIsReadyAndEmpty() async {
    let h = SupplementHarness()
    let book = h.book()
    await book.load()
    #expect(book.phase == .ready([]))
  }

  /// Mở lại lúc mất mạng: bản lưu hiện; lỗi giữ ở `staleFailure`, số không mất.
  @Test func offlineReopenShowsSavedCopy() async {
    let h = SupplementHarness()
    await h.server.put(.init(id: "a", user: "u1", name: "Creatine", timing: "morning"))
    await h.server.take(user: "u1", id: "a", at: "2026-10-08T01:00:00.000Z")
    await h.book().load()
    await h.server.setFailList(URLError(.notConnectedToInternet))
    let reopened = h.book()
    await reopened.load()
    #expect(reopened.items.map(\.id) == ["a"] && reopened.takenCount == 1)
    #expect(reopened.staleFailure == .offline)
  }

  /// Bản lưu của hôm qua: giữ danh sách, bỏ dấu "đã uống".
  @Test func yesterdaysCopyDropsTicks() async {
    let h = SupplementHarness()
    await h.server.put(.init(id: "a", user: "u1", name: "Creatine", timing: "morning"))
    await h.server.take(user: "u1", id: "a", at: "2026-10-08T01:00:00.000Z")
    await h.book().load()
    h.clock.advance(24 * 3_600_000)
    await h.server.setFailList(URLError(.notConnectedToInternet))
    let tomorrow = h.book()
    await tomorrow.load()
    #expect(tomorrow.items.map(\.id) == ["a"] && tomorrow.takenCount == 0)
  }

  /// Bản lưu của người khác không bao giờ hiện.
  @Test func cacheIsPerUser() async {
    let h = SupplementHarness()
    await h.server.put(.init(id: "a", user: "u1", name: "Creatine", timing: "morning"))
    await h.book("u1").load()
    await h.server.setFailList(URLError(.notConnectedToInternet))
    let other = h.book("u2")
    await other.load()
    #expect(other.phase == .failed(.offline))
  }

  // MARK: - Thêm / xoá

  @Test func addIsOnlineOnlyAndNeedsAName() async {
    let h = SupplementHarness()
    let book = h.book()
    await book.load()
    #expect(await book.add(name: "  ", dose: "5g", timing: "morning", online: true) == .emptyName)
    #expect(await book.add(name: "Creatine", dose: "5g", timing: "morning", online: false) == .onlineOnly)
    #expect(await h.server.writes == 0)
    #expect(await book.add(name: "Creatine", dose: "5g", timing: "morning", online: true) == .added)
    #expect(book.items.map(\.name) == ["Creatine"])
  }

  /// Mất mạng giữa chừng: "chỉ online"; lỗi khác: lỗi chung. Danh sách không đổi.
  @Test func addFailureIsReported() async {
    let h = SupplementHarness()
    let book = h.book()
    await book.load()
    await h.server.setFailWrite(URLError(.timedOut))
    #expect(await book.add(name: "Creatine", dose: "", timing: "morning", online: true) == .onlineOnly)
    await h.server.setFailWrite(URLError(.badServerResponse))
    #expect(await book.add(name: "Creatine", dose: "", timing: "morning", online: true) == .failed)
    #expect(book.items.isEmpty && !book.adding)
  }

  @Test func deleteIsOnlineOnlyAndConfirmed() async {
    let h = SupplementHarness()
    await h.server.put(.init(id: "a", user: "u1", name: "Creatine", timing: "morning"))
    let book = h.book()
    await book.load()
    #expect(await book.delete(id: "a", online: false) == .onlineOnly)
    #expect(book.items.count == 1)
    await h.server.setDeleteCount(0)
    #expect(await book.delete(id: "a", online: true) == .nothingWritten)
    #expect(book.items.count == 1)
    await h.server.setDeleteCount(nil)
    #expect(await book.delete(id: "a", online: true) == .deleted)
    #expect(book.items.isEmpty && !book.deleting)
  }

  // MARK: - Kết quả cũ

  /// Đóng sổ (đăng xuất / đổi tài khoản) lúc đang đọc: lượt về muộn không đổi màn.
  @Test func lateResultAfterCloseIsDropped() async {
    let h = SupplementHarness()
    await h.server.put(.init(id: "a", user: "u1", name: "Creatine", timing: "morning"))
    let book = h.book()
    await h.server.hold()
    async let loading: Void = book.load()
    while await h.server.parked == 0 { await Task.yield() }
    book.close()
    await h.server.release()
    await loading
    #expect(book.phase == .loading)
    #expect(await book.add(name: "X", dose: "", timing: "morning", online: true) == .failed)
  }
}
