@testable import ASCNDCore
import Testing

/// Cờ deploy theo từng function AI (#527): một function sập chỉ chặn lối vào
/// của chính nó, không chặn mọi tính năng AI.
struct AIFunctionAvailabilityTests {
  @Test func oneFunctionDownGatesOnlyItsFeature() {
    var availability = AIFunctionAvailability()
    for fn in AIFunctionAvailability.probed { availability.set(fn, deployed: true) }
    availability.set(.coach, deployed: false)
    #expect(!availability.isDeployed(.coach))
    #expect(availability.isDeployed(.coachMemory))
    #expect(availability.isDeployed(.mealSuggest))
    #expect(availability.isDeployed(.scanFood))
    #expect(availability.isDeployed(.weeklyReview))
    #expect(availability.isDeployed(.smartNudges))
  }

  @Test func allHealthyUngatesEveryFeature() {
    var availability = AIFunctionAvailability()
    availability.markAllDeployed()
    for fn in AIFunctionAvailability.probed { #expect(availability.isDeployed(fn)) }
  }

  @Test func unknownGatesLikeNotDeployed() {
    // Chưa dò / mất mạng: lối vào ẩn, như `false` — không hiện màn lỗi.
    let availability = AIFunctionAvailability()
    for fn in AIFunctionAvailability.probed { #expect(!availability.isDeployed(fn)) }
  }

  @Test func probedSetIsExactlyTheSixGatedFunctions() {
    #expect(
      Set(AIFunctionAvailability.probed)
        == [.coach, .coachMemory, .mealSuggest, .scanFood, .weeklyReview, .smartNudges])
    #expect(AIFunctionAvailability.probed.count == 6)
  }

  @Test func logParseIsNeverProbedOrGated() {
    // Đường ghi bằng câu kể không bị chặn bao giờ: AI hỏng thì luật trên máy
    // vẫn đọc câu (`TellKoaSheet`), nên `ai-log-parse` không có cờ dò và
    // không lối vào nào nhìn nó.
    #expect(!AIFunctionAvailability.probed.contains(.logParse))
  }

  @Test func bodyCheckAndNonAIFunctionsAreNotProbed() {
    // `body-check` không bị ẩn lối vào; bốn function còn lại không phải AI.
    #expect(!AIFunctionAvailability.probed.contains(.bodyCheck))
    #expect(!AIFunctionAvailability.probed.contains(.verifyPurchase))
    #expect(!AIFunctionAvailability.probed.contains(.storeWebhook))
    #expect(!AIFunctionAvailability.probed.contains(.deleteAccount))
    #expect(!AIFunctionAvailability.probed.contains(.adminArt))
  }
}
