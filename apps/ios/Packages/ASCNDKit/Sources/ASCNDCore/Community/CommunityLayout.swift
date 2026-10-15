import Foundation

/// Bố cục feed Cộng đồng kiểu Apple News pha Instagram (15/10, chủ dự án duyệt
/// mock): mỗi bài một CHUYÊN MỤC có logo; khối "Thịnh hành" đánh số; phần còn
/// lại xếp nhịp thẻ lớn → thẻ hàng → lưới hai cột, không để hai bài cùng
/// chuyên mục đứng liền nhau. Chỉ là cách VẼ những bài đã tải — không đổi thứ
/// tự server trả, không cần schema.
public enum CommunityLayout {
  /// Chuyên mục hiện trên dải đầu thẻ.
  public enum Category: String, Sendable, Hashable, CaseIterable {
    /// Cơ thể: bài tiến bộ (cân nặng, vòng eo, mức tạ theo tuần).
    case health
    /// Bài công thức.
    case food
    /// Những gì hệ thống ASCND ghi lại: buổi tập, PR (sau này: huy chương, thử thách).
    case ascnd

    public static func of(_ kind: CommunityFeed.Kind) -> Category {
      switch kind {
      case .progress: .health
      case .recipe: .food
      case .workout: .ascnd
      }
    }
  }

  /// Một ô của feed.
  public enum Slot: Sendable, Hashable, Identifiable {
    /// Thẻ lớn: mảng "ảnh" rộng trên cùng.
    case hero(CommunityFeed.Post)
    /// Thẻ hàng: tiêu đề trái, ảnh vuông phải.
    case row(CommunityFeed.Post)
    /// Hai thẻ nhỏ cạnh nhau.
    case grid(CommunityFeed.Post, CommunityFeed.Post)

    public var id: String {
      switch self {
      case .hero(let p): "h:\(p.id)"
      case .row(let p): "r:\(p.id)"
      case .grid(let a, let b): "g:\(a.id):\(b.id)"
      }
    }

    public var posts: [CommunityFeed.Post] {
      switch self {
      case .hero(let p), .row(let p): [p]
      case .grid(let a, let b): [a, b]
      }
    }
  }

  /// Điểm thịnh hành: tương tác chia cho tuổi bài (kiểu Hacker News) — lưu nặng
  /// nhất, rồi bình luận, rồi thích; bài cũ tụt dần. `nil` khi bài chưa có
  /// tương tác nào hoặc không đọc được thời điểm đăng.
  public static func trendScore(_ p: CommunityFeed.Post, now: EpochMillis) -> Double? {
    let engagement = Double(p.likeCount + 2 * p.commentCount + 3 * p.saveCount)
    guard engagement > 0, let t = EpochMillis(iso8601: p.createdAt) else { return nil }
    let hours = max(0, Double(now.millis - t.millis) / 3_600_000)
    return engagement / pow(hours + 2, 1.5)
  }

  /// Tối đa `limit` bài thịnh hành, điểm cao trước (hoà thì giữ thứ tự feed).
  /// Bỏ bài đăng quá `window` giờ — "hôm nay" chứ không phải mọi thời.
  public static func trending(
    _ posts: [CommunityFeed.Post], now: EpochMillis, limit: Int = 3, window: Double = 72
  ) -> [CommunityFeed.Post] {
    let scored = posts.enumerated().compactMap { i, p -> (Int, Double, CommunityFeed.Post)? in
      guard let s = trendScore(p, now: now), let t = EpochMillis(iso8601: p.createdAt),
        Double(now.millis - t.millis) <= window * 3_600_000
      else { return nil }
      return (i, s, p)
    }
    return scored.sorted { $0.1 != $1.1 ? $0.1 > $1.1 : $0.0 < $1.0 }.prefix(limit).map(\.2)
  }

  /// Bài đủ "mạnh" để làm thẻ lớn: buổi tập có PR / có số, có ảnh, hoặc đã có
  /// tương tác.
  public static func isStrong(_ p: CommunityFeed.Post) -> Bool {
    if p.art != nil || p.likeCount + p.commentCount + p.saveCount >= 3 { return true }
    switch p.kind {
    case .workout: return p.workout.pr || p.workout.volumeKg > 0
    case .progress: return p.progress != nil
    case .recipe: return false
    }
  }

  /// Đổi chỗ nhẹ để hai bài cùng chuyên mục không đứng liền nhau — chỉ nhìn
  /// trước `lookahead` bài, nên feed vẫn gần đúng thứ tự thời gian.
  public static func diversified(_ posts: [CommunityFeed.Post], lookahead: Int = 3) -> [CommunityFeed.Post] {
    var rest = posts
    var out: [CommunityFeed.Post] = []
    while !rest.isEmpty {
      let last = out.last.map { Category.of($0.kind) }
      let window = rest.prefix(lookahead)
      let pick = window.firstIndex { Category.of($0.kind) != last } ?? rest.startIndex
      out.append(rest.remove(at: pick))
    }
    return out
  }

  /// Nhịp: thẻ lớn (nếu bài đủ mạnh, không thì thẻ hàng) → hai thẻ hàng → một
  /// lưới hai cột → lặp lại. Bài lẻ cuối cùng không ghép lưới được thành thẻ hàng.
  public static func slots(_ posts: [CommunityFeed.Post]) -> [Slot] {
    let list = diversified(posts)
    var out: [Slot] = []
    var i = 0
    var beat = 0
    while i < list.count {
      switch beat % 4 {
      case 0:
        out.append(isStrong(list[i]) ? .hero(list[i]) : .row(list[i]))
        i += 1
      case 3:
        if i + 1 < list.count {
          out.append(.grid(list[i], list[i + 1]))
          i += 2
        } else {
          out.append(.row(list[i]))
          i += 1
        }
      default:
        out.append(.row(list[i]))
        i += 1
      }
      beat += 1
    }
    return out
  }
}
