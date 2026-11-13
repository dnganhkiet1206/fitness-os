@testable import ASCNDBackend
import ASCNDCore
import Foundation
import Testing

/// Phòng linh vật (#527 Phase 7): thông điệp `RAISE EXCEPTION` của các hàm kinh
/// tế (`claim_quest_reward`, `buy_streak_freeze`) → lỗi có tên.
struct MascotMappingTests {
  @Test func serverRefusalsAreNamed() {
    #expect(SupabaseMascotEconomy.failure(message: "not signed in", code: "P0001") == .notSignedIn)
    #expect(SupabaseMascotEconomy.failure(message: "insufficient coins", code: "P0001") == .insufficientCoins)
    #expect(SupabaseMascotEconomy.failure(message: "freeze limit", code: "P0001") == .freezeLimit)
    #expect(SupabaseMascotEconomy.failure(message: "daily reward ceiling reached", code: "P0001") == .dailyCeiling)
    #expect(SupabaseMascotEconomy.failure(message: "unknown reward dev:1", code: "P0001") == .unknownReward)
    #expect(SupabaseMascotEconomy.failure(message: "already owned", code: "P0001") == .alreadyOwned)
    #expect(SupabaseMascotEconomy.failure(message: "unknown item head_x", code: "P0001") == .unknownItem)
    #expect(SupabaseMascotEconomy.failure(message: "boom", code: "XX000") == .server(code: "XX000"))
  }

  @Test func networkLossIsOffline() {
    #expect(SupabaseMascotEconomy.failure(URLError(.notConnectedToInternet)) == .offline)
    #expect(SupabaseMascotEconomy.failure(CocoaError(.fileReadCorruptFile)) == .server(code: nil))
  }

  /// Cột `numeric` có thể về dạng chuỗi — đọc như `Number(x)`.
  @Test func numbersAreReadLeniently() {
    #expect(SupabaseMascotSource.number(.number(1800)) == 1800)
    #expect(SupabaseMascotSource.number(.string("2500.5")) == 2500.5)
    #expect(SupabaseMascotSource.number(.null) == nil)
    #expect(SupabaseMascotSource.number(nil) == nil)
  }

  /// AUD-28: JSON của `mascot_wallet()` → dòng gộp cho `MascotWallet`.
  @Test func serverWalletDecodesIntoCompactRows() throws {
    let json = #"{"balance": 365, "xp": [{"key": "d:2000-01-03:meal", "n": 30}], "claimed": ["welcome", "x:photo"]}"#
    let dto = try JSONDecoder().decode(SupabaseMascotSource.WalletDTO.self, from: Data(json.utf8))
    let w = MascotWallet(rows: dto.rows)
    #expect(w.balance == 365)
    #expect(w.xp == 30 * MascotRules.xpForRefKey("d:2000-01-03:meal"))
    #expect(w.claimed == ["welcome", "x:photo"])
  }
}
