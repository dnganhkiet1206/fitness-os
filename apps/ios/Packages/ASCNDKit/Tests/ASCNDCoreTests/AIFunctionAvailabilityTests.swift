@testable import ASCNDCore
import Foundation
import Testing

/// KOA-T08: trạng thái dò function AI — chưa biết / có / trục trặc / không có, kèm hạn dò lại.
struct AIFunctionAvailabilityTests {
  let t0 = Date(timeIntervalSince1970: 1_000_000)

  @Test func statusMapsToState() {
    #expect(AIFunctionAvailability.state(forStatus: 401) == .available)
    #expect(AIFunctionAvailability.state(forStatus: 400) == .available)
    #expect(AIFunctionAvailability.state(forStatus: 429) == .available)
    #expect(AIFunctionAvailability.state(forStatus: 404) == .missing)
    #expect(AIFunctionAvailability.state(forStatus: 500) == .unhealthy)
    #expect(AIFunctionAvailability.state(forStatus: 503) == .unhealthy)
  }

  @Test func offlineAtLaunchIsAPlaceholderNotAVanishedEntry() {
    var a = AIFunctionAvailability()
    #expect(a.state(.coach) == .unknown)
    a.record(.coach, status: nil, at: t0)
    #expect(a.state(.coach) == .unknown)
    #expect(!a.isDeployed(.coach))
    #expect(a.showsPlaceholder(.coach))
    #expect(a.needsProbe(.coach, now: t0), "chưa biết: dò lại ngay khi có dịp (chạm thử lại / tiền cảnh)")
    // Mạng trở lại, dò lại → hiện.
    a.record(.coach, status: 401, at: t0.addingTimeInterval(5))
    #expect(a.isDeployed(.coach))
    #expect(!a.showsPlaceholder(.coach))
  }

  @Test func aBlipDoesNotHideAKnownGoodFunction() {
    var a = AIFunctionAvailability()
    a.record(.coach, status: 401, at: t0)
    a.record(.coach, status: nil, at: t0.addingTimeInterval(60))
    #expect(a.isDeployed(.coach))
  }

  @Test func unhealthyIsAPlaceholderAndMissingIsHidden() {
    var a = AIFunctionAvailability()
    a.record(.coach, status: 500, at: t0)
    #expect(a.state(.coach) == .unhealthy)
    #expect(!a.isDeployed(.coach) && a.showsPlaceholder(.coach))
    a.record(.scanFood, status: 404, at: t0)
    #expect(!a.isDeployed(.scanFood) && !a.showsPlaceholder(.scanFood))
  }

  @Test func staleVerdictsAreReprobed() {
    var a = AIFunctionAvailability()
    a.record(.coach, status: 401, at: t0)
    #expect(!a.needsProbe(.coach, now: t0.addingTimeInterval(29 * 60)))
    #expect(a.needsProbe(.coach, now: t0.addingTimeInterval(31 * 60)), "đã biết là có thì vẫn dò lại khi cũ")
    a.record(.coach, status: 500, at: t0)
    #expect(!a.needsProbe(.coach, now: t0.addingTimeInterval(60)), "không dội function đang hỏng")
    #expect(a.needsProbe(.coach, now: t0.addingTimeInterval(121)))
  }
}
