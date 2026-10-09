public import Observation

/// Hàng đợi ăn mừng (`lib/celebration-queue.ts` @ fac9ac2): huy chương vừa trao,
/// thử thách vừa xong — hiện MỘT cái mỗi lần, theo thứ tự đến; đăng xuất thì bỏ
/// hết (`onUserScopedReset`), để người sau không thấy pháo hoa của người trước.
@MainActor
@Observable
public final class CelebrationQueue {
  /// `CelebrationAward`.
  public struct Item: Sendable, Hashable, Identifiable {
    public let id: Int
    public let title: String
    public let description: String
    public let icon: String
    public let tier: Awards.Tier
    /// Khoá huy chương — để vẽ ĐÚNG tấm đĩa (dáng theo miền, mốc). `nil` cho
    /// thử thách: đĩa tròn với icon của thử thách.
    public let awardKey: String?
  }

  public private(set) var items: [Item] = []
  @ObservationIgnored private var seq = 0

  public init() {}

  /// Cái đang hiện.
  public var head: Item? { items.first }

  public func enqueue(title: String, description: String, icon: String, tier: String, awardKey: String? = nil) {
    seq += 1
    items.append(
      Item(
        id: seq, title: title, description: description, icon: icon, tier: Awards.Tier(rawValue: tier) ?? .bronze,
        awardKey: awardKey))
  }

  /// Đóng cái đang hiện; cái kế lên.
  public func dequeue() {
    if !items.isEmpty { items.removeFirst() }
  }

  /// Phiên kết thúc.
  public func clear() { items = [] }
}
