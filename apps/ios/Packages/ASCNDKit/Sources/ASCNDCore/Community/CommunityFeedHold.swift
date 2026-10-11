public import Foundation

/// "N bài mới" (#527, lát 17) — `lib/feed-hold.ts` + `use-feed-hold.ts` @ fac9ac2.
///
/// Feed đọc lại khi người ta đang ở giữa (quay về từ một bài, vừa đăng bài, …)
/// thì bài mới KHÔNG chèn lên đẩy bài đang đọc khỏi ngón tay: chúng bị GIỮ sau
/// một viên "N bài mới", như X. Chạm viên → lên đầu và thấy chúng.
///
/// Giữ = chuỗi bài CHƯA THẤY đứng TRƯỚC bài đã thấy đầu tiên, trừ bài của chính
/// mình. Không giữ gì khi chưa thấy gì, hoặc không bài đã thấy nào còn trong
/// feed (không còn điểm neo). Ở đầu feed (`atTop`) thì không giữ.
public enum CommunityFeedHold {
  /// `NEAR_TOP`: dừng cách đỉnh vài điểm (hay nảy âm khi kéo làm mới) vẫn là "ở đầu".
  public static let nearTop = 120.0

  public static func atTop(_ y: Double) -> Bool { y < nearTop }

  /// `heldAbove`.
  public static func heldAbove(_ ids: [String], seen: Set<String>, mine: Set<String>) -> [String] {
    guard let anchor = ids.firstIndex(where: seen.contains) else { return [] }
    return ids[..<anchor].filter { !mine.contains($0) }
  }

  /// Sổ "đã thấy" — mỗi tab một sổ, chỉ THÊM (đã vẽ thì thấy mãi), trừ khi chạm
  /// viên: lúc ấy sổ của tab thành đúng danh sách đang có (`release`).
  public struct Ledger: Sendable, Hashable {
    private var seen: [String: Set<String>] = [:]

    public init() {}

    public func seen(_ tab: String) -> Set<String> { seen[tab] ?? [] }

    /// Ghi những bài vừa được vẽ; `false` khi không có gì mới (khỏi ghi lại).
    @discardableResult
    public mutating func ack(_ ids: [String], tab: String) -> Bool {
      let had = seen[tab] ?? []
      let add = ids.filter { !had.contains($0) }
      guard !add.isEmpty else { return false }
      seen[tab] = had.union(add)
      return true
    }

    /// Chạm viên: mọi bài đang về đều thành đã thấy ngay.
    public mutating func release(_ ids: [String], tab: String) { seen[tab] = Set(ids) }
  }

  /// Bài vẽ ra và bài bị giữ, theo thứ tự feed.
  public static func split(
    _ posts: [CommunityFeed.Post], tab: String, atTop top: Bool, ledger: Ledger
  ) -> (shown: [CommunityFeed.Post], held: [CommunityFeed.Post]) {
    guard !top else { return (posts, []) }
    let mine = Set(posts.filter(\.mine).map(\.id))
    let held = Set(heldAbove(posts.map(\.id), seen: ledger.seen(tab), mine: mine))
    guard !held.isEmpty else { return (posts, []) }
    return (posts.filter { !held.contains($0.id) }, posts.filter { held.contains($0.id) })
  }

  /// Tối đa ba gương mặt trên viên — một người đăng ba bài là một gương mặt.
  public static func faces(_ held: [CommunityFeed.Post]) -> [CommunityFeed.Author] {
    var out: [CommunityFeed.Author] = []
    for p in held {
      if out.count == 3 { break }
      if let a = p.author, !out.contains(where: { $0.userId == a.userId }) { out.append(a) }
    }
    return out
  }
}
