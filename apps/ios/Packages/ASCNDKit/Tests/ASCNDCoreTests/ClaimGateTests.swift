@testable import ASCNDCore
import Foundation
import Testing

/// KOA-T55: một cổng nhận thưởng cho mọi chỗ tự nhận của tài khoản.
@MainActor
struct ClaimGateTests {
  typealias Economy = KoaWeekTests.Economy

  static func defaults() throws -> UserDefaults {
    try #require(UserDefaults(suiteName: "claimgate-\(UUID())"))
  }

  @Test func claimsOnceAndRemembersAcrossRestarts() async throws {
    let d = try Self.defaults()
    let gate = ClaimGate(userId: "u", defaults: d)
    var sent = 0
    guard case .paid(20) = await gate.claim("x:water", send: { sent += 1; return 20 }) else {
      Issue.record("lượt đầu phải nhận")
      return
    }
    guard case .alreadyClaimed = await gate.claim("x:water", send: { sent += 1; return 20 }) else {
      Issue.record("lượt hai: đã nhận")
      return
    }
    // Mở lại app: cổng mới, cùng kho máy.
    #expect(ClaimGate(userId: "u", defaults: d).isClaimed("x:water"))
    #expect(!ClaimGate(userId: "other", defaults: d).isClaimed("x:water"), "theo từng tài khoản")
    #expect(sent == 1)
  }

  /// Bản cập nhật không nhận / mừng lại khoá đã nhận bằng khoá máy cũ của từng chỗ.
  @Test func honoursLegacyPerSiteKeys() throws {
    let d = try Self.defaults()
    d.set(true, forKey: "ascnd_koa_week.u.ch:silver:2026-10-19:koa_week")
    d.set(true, forKey: "ascnd_koa_quest.u.ov:2026-10-20")
    let gate = ClaimGate(userId: "u", defaults: d)
    #expect(gate.isClaimed("ch:silver:2026-10-19:koa_week"))
    #expect(gate.isClaimed("ov:2026-10-20"))
    #expect(!gate.isClaimed("ov:2026-10-21"))
  }

  @Test func serverSetWinsWithoutSending() async throws {
    let gate = ClaimGate(userId: "u", defaults: try Self.defaults())
    gate.absorbServer(["d:2026-10-20:workout"])
    var sent = 0
    guard case .alreadyClaimed = await gate.claim("d:2026-10-20:workout", send: { sent += 1; return 10 }) else {
      Issue.record("khoá server đã có")
      return
    }
    #expect(sent == 0)
    // Lượt đọc sau thiếu khoá (ngoài cửa sổ của `mascot_wallet()`): vẫn nhớ.
    gate.absorbServer([])
    #expect(gate.isClaimed("d:2026-10-20:workout"))
  }

  @Test func failureIsNotRememberedSoARetrySends() async throws {
    let gate = ClaimGate(userId: "u", defaults: try Self.defaults())
    guard case .failed = await gate.claim("x:sleep", send: { throw MascotFailure.offline }) else {
      Issue.record("mất mạng → hỏng")
      return
    }
    #expect(!gate.isClaimed("x:sleep"))
    guard case .paid(15) = await gate.claim("x:sleep", send: { 15 }) else {
      Issue.record("thử lại nhận được")
      return
    }
  }

  /// Server trả 0 = đã nhận ở máy / lượt khác (KOA-T01): nhớ, không mừng.
  @Test func duplicateFromServerIsRememberedNotCelebrated() async throws {
    let gate = ClaimGate(userId: "u", defaults: try Self.defaults())
    guard case .alreadyClaimed = await gate.claim("x:meal", send: { 0 }) else {
      Issue.record("0 = trùng")
      return
    }
    #expect(gate.isClaimed("x:meal"))
  }

  /// Hai chỗ gọi chồng nhau: một lượt gửi, lượt kia "đang nhận".
  @Test func overlappingCallersSendOnce() async throws {
    let gate = ClaimGate(userId: "u", defaults: try Self.defaults())
    let econ = Economy()
    econ.delayMs = 50
    async let a = gate.claim("x:a", send: { try await econ.claimReward(refKey: "x:a", reason: "") })
    async let b = gate.claim("x:a", send: { try await econ.claimReward(refKey: "x:a", reason: "") })
    let (ra, rb) = await (a, b)
    let paid = [ra, rb].filter { if case .paid = $0 { true } else { false } }.count
    let busy = [ra, rb].filter { if case .busy = $0 { true } else { false } }.count
    #expect(paid == 1 && busy == 1)
    #expect(econ.claims == ["x:a"])
  }

  // MARK: - Đường chéo (nhận ở chỗ này, chỗ kia không mừng lần hai)

  /// Hôm nay nhận tuần qua sổ của nó, phòng Koa dùng sổ khác cùng cổng: phòng không gửi, không mừng.
  @Test func weekClaimedOnTodayIsNotCelebratedAgainInTheRoom() async throws {
    let gate = ClaimGate(userId: "u", defaults: try Self.defaults())
    let econ = Economy()
    let today = KoaWeekBook(userId: "u", economy: econ, gate: gate)
    let room = KoaWeekBook(userId: "u", economy: econ, gate: gate)
    #expect(await today.claimIfComplete(KoaWeekTests.complete()) == KoaWeek.rewardCoins)
    #expect(await room.claimIfComplete(KoaWeekTests.complete()) == nil)
    #expect(room.claim == .claimed)
    #expect(econ.claims.count == 1, "phòng không gửi lần hai")
  }

  /// Bộ quan sát nhiệm vụ đọc sổ xu (máy khác đã nhận tuần): sổ tuần trên máy này không gửi, không mừng.
  @Test func serverClaimSeenByTheObserverStopsTheWeekBook() async throws {
    let gate = ClaimGate(userId: "u", defaults: try Self.defaults())
    let ref = KoaWeekTests.complete().refKey
    let observer = QuestObserver(
      userId: "u", source: QuestHabitProducerTests.Fake(), gate: gate, onQuestDone: { _, _ in })
    observer.observe(
      token: observer.begin(), day: LocalDate("2026-10-23")!, signals: QuestHabitProducerTests.signals(), claimed: [ref])
    let econ = Economy()
    let book = KoaWeekBook(userId: "u", economy: econ, gate: gate)
    #expect(await book.claimIfComplete(KoaWeekTests.complete()) == nil)
    #expect(book.claim == .claimed)
    #expect(econ.claims.isEmpty)
  }
}
