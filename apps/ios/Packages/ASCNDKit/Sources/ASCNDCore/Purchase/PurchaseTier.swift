import Foundation

/// Gói của tài khoản: `free` / `plus` / `max` — cùng CHECK của bảng
/// `entitlements` (`20260810120000_economy_server_authority.sql`).
///
/// Server là nơi duy nhất quyết định gói: app chỉ đọc qua `current_tier()`
/// và không bao giờ tự suy gói từ giao dịch App Store. Một giao dịch đã mua
/// cũng phải qua `verify-purchase` rồi đọc lại `current_tier()` mới tính.
public enum PurchaseTier: String, Sendable, Hashable, CaseIterable {
  case free
  case plus
  case max

  /// Chuỗi server trả về (`current_tier()`, `verify-purchase`). Giá trị lạ →
  /// `nil`: người gọi quyết định, và quyết định an toàn duy nhất là coi như
  /// `free` — không bao giờ coi một chuỗi lạ là đã trả phí.
  public init?(serverValue: String) {
    self.init(rawValue: serverValue.lowercased())
  }

  public var isPaid: Bool { self != .free }
}
