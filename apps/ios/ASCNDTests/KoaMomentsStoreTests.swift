import ASCNDCore
import Foundation
import Testing

@testable import ASCND

/// KOA-T60: "đã nhắc" của mốc hành trình chỉ có hiệu lực từ lần mở app sau (KOA_ECOSYSTEM.md, bộ điều phối):
/// trong một lần mở, Hôm nay và phòng Koa nói cùng một mốc; lần mở sau không nhắc lại ở đâu cả.
@MainActor
@Suite(.serialized) struct KoaMomentsStoreTests {
  private static let user = "ascnd-test-moments-\(UUID().uuidString)"

  @Test func markingSeenTakesEffectOnTheNextLaunch() {
    defer { UserDefaults.standard.removeObject(forKey: "koa.moments.seen.\(Self.user)") }
    KoaMomentsStore.forgetLaunch()
    #expect(KoaMomentsStore.seen(Self.user).isEmpty)
    // Hôm nay nói mốc và đánh dấu…
    KoaMomentsStore.markSeen("rankUp:2026-11-20", userId: Self.user)
    // …phòng Koa trong cùng lần mở vẫn thấy mốc đó là "chưa nhắc".
    #expect(!KoaMomentsStore.seen(Self.user).contains("rankUp:2026-11-20"))
    // Mở app lần sau: đã nhắc.
    KoaMomentsStore.forgetLaunch()
    #expect(KoaMomentsStore.seen(Self.user).contains("rankUp:2026-11-20"))
  }
}
