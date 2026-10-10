public import Foundation

/// Kiểm duyệt bình luận phía người dùng (#527, lát 4) — menu nhấn giữ của
/// `app/community-post.tsx:229-253`, `useDeleteComment` / `useReport` /
/// `useHiddenReasons` / `useRequestReview` (`hooks/use-community.ts:669`,
/// `:813`, `:1014`, `:1039`) và `components/ascnd/hidden-notice.tsx` @ fac9ac2.
///
/// Server quyết hết: ai xoá được (policy "Authors and post owners delete
/// comments"), trần báo cáo 10 / 24 giờ (54000), ẩn khi đủ người báo cáo, và
/// kháng nghị (`community_appeal`). Phần này chỉ hỏi và nói lại kết quả.
public enum CommunityReportReason: String, Sendable, Hashable, CaseIterable {
  case spam, harassment, inappropriate, misleading, other
}

/// Lỗi của xoá / báo cáo / kháng nghị — mỗi loại một câu.
public enum CommunityModerationFailure: Error, Sendable, Hashable {
  case offline
  /// 54000 khi báo cáo: trần mỗi ngày.
  case reportLimit
  /// Xoá không chạm hàng nào (`confirmWrite`): có thể đã bị xoá.
  case nothingWritten
  case server(code: String?)
}

/// Một dòng của `community_my_hidden_reasons()` — `HiddenReason` của RN.
public struct CommunityHiddenReason: Sendable, Hashable {
  public let postId: String?
  public let commentId: String?
  /// Số người KHÁC NHAU đã báo cáo.
  public let reporters: Int
  public let topReason: CommunityReportReason?
  /// Đang có một yêu cầu xem lại CHỜ cho đợt ẩn này.
  public let reviewRequested: Bool
  /// Đội kiểm duyệt đã gỡ — quyết định cuối.
  public let removed: Bool
  /// Đã xem lại và giữ nguyên ẩn.
  public let reviewUpheld: Bool

  public init(
    postId: String?, commentId: String?, reporters: Int, topReason: CommunityReportReason?,
    reviewRequested: Bool, removed: Bool, reviewUpheld: Bool
  ) {
    self.postId = postId
    self.commentId = commentId
    self.reporters = reporters
    self.topReason = topReason
    self.reviewRequested = reviewRequested
    self.removed = removed
    self.reviewUpheld = reviewUpheld
  }

  /// `Number(r.reporters) || 0`, `!!r.review_requested`… Lý do lạ → `nil`
  /// (RN ép kiểu mù rồi tra bảng chữ — một lý do server thêm sau sẽ vỡ ở đó).
  public init(row: JSONValue) {
    self.init(
      postId: row["post_id"]?.stringValue,
      commentId: row["comment_id"]?.stringValue,
      reporters: Self.count(row["reporters"]),
      topReason: row["top_reason"]?.stringValue.flatMap(CommunityReportReason.init(rawValue:)),
      reviewRequested: JS.truthyValue(row["review_requested"] ?? .null),
      removed: JS.truthyValue(row["removed"] ?? .null),
      reviewUpheld: JS.truthyValue(row["review_upheld"] ?? .null))
  }

  static func count(_ v: JSONValue?) -> Int {
    switch v {
    case .number(let d)?: whole(d)
    case .string(let s)?: Double(s.trimmingCharacters(in: .whitespaces)).map(whole) ?? 0
    default: 0
    }
  }

  /// `NaN || 0`; số khổng lồ không làm sập `Int(_:)`.
  static func whole(_ d: Double) -> Int {
    guard d.isFinite, abs(d) < 1e15 else { return 0 }
    return Int(d)
  }
}

/// Phần thuần của `HiddenNotice`.
public enum HiddenNotice {
  /// Dòng "vì sao": `nCmHiddenWhy` (có lý do) / `nCmHiddenWhyN` (không), chỉ
  /// khi có ít nhất một người báo cáo.
  public struct Why: Sendable, Hashable {
    public let reporters: Int
    public let reason: CommunityReportReason?
  }

  public enum Step: Sendable, Hashable {
    /// Chưa biết lý do (đang đọc / đọc hỏng / không có dòng): chỉ tiêu đề.
    case unknown
    case removed
    case upheld
    /// Đã gửi yêu cầu xem lại (ở đây hoặc ở máy khác).
    case sent
    /// Còn nút "Yêu cầu xem lại".
    case canAsk
  }

  /// `why` của `hidden-notice.tsx`.
  public static func why(_ r: CommunityHiddenReason?) -> Why? {
    guard let r, r.reporters > 0 else { return nil }
    return Why(reporters: r.reporters, reason: r.topReason)
  }

  /// `!r ? null : final ? … : sent ? … : nút`. `askedHere` = `ask.isSuccess`.
  public static func step(_ r: CommunityHiddenReason?, askedHere: Bool) -> Step {
    guard let r else { return .unknown }
    if r.removed { return .removed }
    if r.reviewUpheld { return .upheld }
    if r.reviewRequested || askedHere { return .sent }
    return .canAsk
  }
}

extension CommentThread {
  /// Số dòng một lần xoá lấy đi (`useDeleteComment.onSuccess`): xoá một gốc thì
  /// server xoá luôn các câu trả lời (ON DELETE CASCADE) — 1 + số trả lời ĐANG
  /// THẤY của nó.
  public static func deletedCount<T>(_ seen: [T], id: String, node: (T) -> Node) -> Int {
    1 + seen.filter { node($0).parentId == id }.count
  }
}
