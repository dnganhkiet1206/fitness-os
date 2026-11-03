import ASCNDCore
import Foundation
import Testing

@testable import ASCND

/// "Insight hôm nay" lưu trên máy (`SmartNudgesDefaultsCache`) không ở lại sau đăng xuất: RN xoá
/// persister của React Query trong `forgetPreviousAccount`.
@MainActor
@Suite(.serialized) struct SmartNudgesCacheTests {
  private static let key = "ascnd-test-user|2026-11-03|vi|s-"

  private func entry() -> SmartNudges.Entry {
    SmartNudges.Entry(
      nudges: [.init(type: "sleep", message: "Ngủ 5 tiếng, hôm nay tập nhẹ.", priority: .high)],
      at: EpochMillis(1_793_721_600_000))
  }

  @Test func keepsTheInsightForTheSameKey() {
    let cache = SmartNudgesDefaultsCache()
    cache.store(entry(), for: Self.key)
    #expect(cache.entry(Self.key) == entry())
    #expect(cache.entry("someone-else|2026-11-03|vi|s-") == nil, "khoá khác người thì không khớp")
    SmartNudgesDefaultsCache.clear()
  }

  @Test func signOutLeavesNoInsightOnTheDevice() {
    let cache = SmartNudgesDefaultsCache()
    cache.store(entry(), for: Self.key)
    SmartNudgesDefaultsCache.clear()
    #expect(cache.entry(Self.key) == nil)
    #expect(UserDefaults.standard.object(forKey: SmartNudgesDefaultsCache.defaultsKey) == nil)
  }
}
