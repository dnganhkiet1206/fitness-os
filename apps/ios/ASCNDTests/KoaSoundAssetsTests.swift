import Foundation
import Testing

@testable import ASCND

/// KOA-T28: mọi tiếng code gọi đều có trong gói; mọi tiếng trong gói đều có chủ.
@MainActor
@Suite struct KoaSoundAssetsTests {
  @Test func everyNameTheCodeUsesShips() {
    #expect(KoaSound.auditAssets(KoaSound.expectedAssets + KoaSound.reactionAssets).isEmpty)
  }

  @Test func everyShippedSoundHasAnOwner() {
    let shipped = (Bundle.main.urls(forResourcesWithExtension: "wav", subdirectory: nil) ?? [])
      .map { $0.deletingPathExtension().lastPathComponent }
      .filter { $0.hasPrefix("koa-") }
    let owned = Set(KoaSound.expectedAssets + KoaSound.reactionAssets + KoaSound.reservedAssets)
    #expect(!shipped.isEmpty)
    #expect(shipped.filter { !owned.contains($0) }.sorted() == [])
  }
}
