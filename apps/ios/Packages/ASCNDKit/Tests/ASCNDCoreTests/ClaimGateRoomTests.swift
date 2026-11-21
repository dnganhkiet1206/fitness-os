@testable import ASCNDCore
import Foundation
import Testing

/// KOA-T55 (đợt 2): phòng Koa và thử thách tuần dùng cùng cổng nhận thưởng.
@MainActor
struct ClaimGateRoomTests {
  typealias Room = MascotRoomControllerTests
  typealias Weekly = WeeklyChallengesBookTests

  static func gate() -> ClaimGate {
    ClaimGate(userId: "u1", defaults: UserDefaults(suiteName: "claimgate-room-\(UUID())")!)
  }

  /// Sổ xu phòng đọc được đi vào cổng: chỗ nhận khác biết "welcome" đã nhận.
  @Test func roomWalletFeedsTheGate() async {
    let s = Room.FakeSource()
    s.ledgerRows = Room.welcomed
    let gate = Self.gate()
    let c = MascotRoomController(
      userId: "u1", today: LocalDate("2026-10-08")!, source: s, economy: Room.FakeEconomy(source: s), gate: gate)
    await c.load()
    #expect(gate.isClaimed("welcome"))
  }

  /// Khoá cổng đã biết (nhận ở Hôm nay / bộ quan sát) mà sổ phòng chưa có: phòng coi là đã nhận.
  @Test func keyClaimedElsewhereShowsClaimedInTheRoom() async {
    let s = Room.FakeSource()
    s.ledgerRows = Room.welcomed
    let gate = Self.gate()
    let ref = MascotRules.questRefKey(LocalDate("2026-10-08")!, .workout)
    gate.markClaimed(ref)
    let c = MascotRoomController(
      userId: "u1", today: LocalDate("2026-10-08")!, source: s, economy: Room.FakeEconomy(source: s), gate: gate)
    await c.load()
    #expect(c.isClaimed(ref))
  }

  /// Túi chào mừng nhận ở phòng được ghi vào cổng.
  @Test func welcomeClaimedInTheRoomIsRecorded() async {
    let s = Room.FakeSource()
    let gate = Self.gate()
    let e = Room.FakeEconomy(source: s)
    let c = MascotRoomController(userId: "u1", today: LocalDate("2026-10-08")!, source: s, economy: e, gate: gate)
    await c.load()
    #expect(e.claims.contains("welcome"))
    #expect(gate.isClaimed("welcome"))
  }

  /// Thử thách đã nhận ở chỗ khác (cổng biết): vẫn ghi xong, không gửi, không mừng.
  @Test func challengePaidElsewhereIsNotSentOrCelebrated() async {
    let s = Weekly.FakeStore()
    s.challenges = [Weekly.row("c1", "workouts_3", current: 2, target: 3, tier: "bronze")]
    s.workouts = (0..<4).map { .object(["id": .string("w\($0)")]) }
    let e = Weekly.FakeEconomy()
    let gate = ClaimGate(userId: "acct-A", defaults: Weekly.freshDefaults())
    gate.markClaimed("ch:bronze:2026-10-05:workouts_3")
    let b = WeeklyChallengesBook(
      userId: "acct-A", today: LocalDate("2026-10-08")!, store: s, economy: e,
      english: { ("T \($0)", "D \($0)", "R \($0)") }, timeZone: TimeZone(identifier: "Asia/Ho_Chi_Minh")!,
      defaults: Weekly.freshDefaults(), gate: gate)
    await b.load()
    #expect(e.claims.isEmpty)
    #expect(s.updates.last?.0["completed"] == .bool(true))
    #expect(b.justCompleted.isEmpty)
  }

  /// Thử thách vừa nhận được ghi vào cổng.
  @Test func challengePaidHereIsRecorded() async {
    let s = Weekly.FakeStore()
    s.challenges = [Weekly.row("c1", "workouts_3", current: 2, target: 3, tier: "bronze")]
    s.workouts = (0..<4).map { .object(["id": .string("w\($0)")]) }
    let gate = ClaimGate(userId: "acct-A", defaults: Weekly.freshDefaults())
    let b = WeeklyChallengesBook(
      userId: "acct-A", today: LocalDate("2026-10-08")!, store: s, economy: Weekly.FakeEconomy(),
      english: { ("T \($0)", "D \($0)", "R \($0)") }, timeZone: TimeZone(identifier: "Asia/Ho_Chi_Minh")!,
      defaults: Weekly.freshDefaults(), gate: gate)
    await b.load()
    #expect(b.justCompleted == ["workouts_3"])
    #expect(gate.isClaimed("ch:bronze:2026-10-05:workouts_3"))
  }

  // MARK: - Bộ sưu tập (cửa hàng)

  typealias Shop = MascotShopBookTests

  static func shop(gate: ClaimGate) -> (MascotShopBook, Shop.Wardrobe, Shop.Economy) {
    let s = Shop.Source()
    s.entries = [LedgerRow(amount: 0, refKey: "seed")]
    let w = Shop.Wardrobe(s)
    w.rows = [InventoryRow(itemKey: "head_santa", equipped: false), InventoryRow(itemKey: "top_xmas", equipped: false)]
    let e = Shop.Economy(s)
    return (MascotShopBook(userId: "u1", source: s, wardrobe: w, economy: e, gate: gate), w, e)
  }

  /// Bộ đã nhận ở chỗ khác (cổng biết, sổ cửa hàng chưa thấy): hiện "đã nhận", không gửi.
  @Test func setClaimedElsewhereIsNotSentFromTheShop() async {
    let gate = Self.gate()
    gate.markClaimed("set:xmas")
    let (book, _, e) = Self.shop(gate: gate)
    await book.load()
    let xmas = MascotShop.collections.first { $0.id == "xmas" }!
    #expect(book.isClaimed(xmas))
    #expect(await book.claim(xmas) == .notReady)
    #expect(e.claims.isEmpty)
  }

  /// Bộ vừa nhận ở cửa hàng được ghi vào cổng.
  @Test func setClaimedInTheShopIsRecorded() async {
    let gate = Self.gate()
    let (book, _, _) = Self.shop(gate: gate)
    await book.load()
    let xmas = MascotShop.collections.first { $0.id == "xmas" }!
    #expect(await book.claim(xmas) == .claimed(coins: 120))
    #expect(gate.isClaimed("set:xmas"))
  }
}
