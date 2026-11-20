import ASCNDCore
import Testing

@testable import ASCND

/// KOA-T54 (3): thẻ tuần ở phòng Koa nói theo trạng thái nhận, không theo "đủ tuần".
@MainActor
@Suite struct RoomWeekDetailTests {
  @Test func followsTheClaimNotTheCompletion() {
    let reward = String(localized: "kw.reward \(KoaGains.fullWeek) \(KoaWeek.rewardCoins)")
    #expect(MascotRoomView.weekDetail(complete: true, claim: .notYet) == reward, "đủ tuần mà chưa nhận: chưa phải đã nhận")
    #expect(MascotRoomView.weekDetail(complete: true, claim: .failed) == String(localized: "kw.retry"))
    #expect(MascotRoomView.weekDetail(complete: true, claim: .claimed) == String(localized: "kw.claimed"))
    #expect(MascotRoomView.weekDetail(complete: true, claim: .justClaimed(coins: 50)) == String(localized: "kw.claimed"))
    #expect(MascotRoomView.weekDetail(complete: false, claim: .notYet) == reward)
  }
}
