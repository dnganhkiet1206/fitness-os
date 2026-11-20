public import Foundation

/// Cổng nhận thưởng dùng chung của MỘT tài khoản (KOA-T55): mọi chỗ tự nhận một khoá `ref_key`
/// (tuần của Koa, tăng tải, khám phá…) hỏi cùng một nơi "khoá này nhận chưa / đang nhận không".
///
/// Thứ tự tin:
/// 1. Tập khoá server đã nhận (`mascot_wallet()` / sổ xu — `absorbServer`), nguồn thật.
/// 2. Khoá máy này đã nhận (lưu `UserDefaults`, còn sau khi tắt app). Đọc cả khoá cũ của từng chỗ
///    (`ascnd_koa_quest.` / `ascnd_koa_week.`) để bản cập nhật không nhận / mừng lại.
/// 3. Khoá đang có lượt gửi (trong bộ nhớ): hai chỗ gọi chồng nhau chỉ gửi một lượt.
///
/// Server vẫn là chốt cuối (`ref_key` UNIQUE, trả 0 khi trùng — KOA-T01); cổng này chỉ để các
/// đường trong app không cãi nhau (nhận ở Hôm nay rồi phòng Koa mừng lần hai).
@MainActor
public final class ClaimGate {
  public enum Outcome: Sendable {
    /// Vừa nhận ở lượt này, số xu server trả.
    case paid(Int)
    /// Đã nhận trước đó (server, máy này, hoặc server trả 0 vì trùng) — không mừng.
    case alreadyClaimed
    /// Đang có lượt khác gửi khoá này.
    case busy
    /// Gửi hỏng — chưa biết nhận chưa; chỗ gọi tự quyết thử lại.
    case failed(any Error)
  }

  /// Tiền tố khoá máy cũ của từng chỗ trước KOA-T55 — vẫn đọc, không ghi.
  public static let legacyPrefixes = ["ascnd_koa_quest", "ascnd_koa_week"]

  public let userId: String
  private let defaults: UserDefaults
  private var server: Set<String> = []
  private var inFlight: Set<String> = []

  public init(userId: String, defaults: UserDefaults = .standard) {
    self.userId = userId
    self.defaults = defaults
  }

  private func key(_ ref: String) -> String { "ascnd_claim.\(userId).\(ref)" }

  /// Khoá đã nhận (server hoặc máy này).
  public func isClaimed(_ ref: String) -> Bool {
    if server.contains(ref) || defaults.bool(forKey: key(ref)) { return true }
    return Self.legacyPrefixes.contains { defaults.bool(forKey: "\($0).\(userId).\(ref)") }
  }

  public func isInFlight(_ ref: String) -> Bool { inFlight.contains(ref) }

  /// Tập khoá server trả (`MascotWallet.claimed`). Chỉ thêm: một lượt đọc thiếu khoá (cửa sổ 7 / 28
  /// ngày của `mascot_wallet()`) không làm khoá đã biết thành "chưa nhận".
  public func absorbServer(_ claimed: Set<String>) { server.formUnion(claimed) }

  /// Ghi nhận khoá đã nhận (ở máy này).
  public func markClaimed(_ ref: String) { defaults.set(true, forKey: key(ref)) }

  /// Nhận `ref` qua `send` (trả số xu server trả): một lượt một lúc, nhớ khi server đã trả lời.
  public func claim(_ ref: String, send: () async throws -> Int) async -> Outcome {
    if isClaimed(ref) { return .alreadyClaimed }
    guard !inFlight.contains(ref) else { return .busy }
    inFlight.insert(ref)
    defer { inFlight.remove(ref) }
    do {
      let amount = try await send()
      markClaimed(ref)
      return MascotRules.isDuplicateClaim(amount) ? .alreadyClaimed : .paid(amount)
    } catch {
      return .failed(error)
    }
  }
}
