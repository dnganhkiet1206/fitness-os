public import Foundation

/// Bình luận Cộng đồng (#527, lát 3) — `lib/comment-thread.ts` + phần đọc của
/// `useComments` (`hooks/use-community.ts`) @ fac9ac2.
///
/// Server quyết hai thứ, phần này chỉ VẼ theo: `parent_id` luôn trỏ vào một
/// bình luận gốc (trigger chuẩn hoá); một `@handle` là một người chỉ khi
/// `community_comment_mentions` có dòng cho nó. Chuỗi trông giống handle mà
/// server không xác nhận thì vẫn là chữ.
///
/// Golden: `Fixtures/community-comments-golden.json` — chính `comment-thread.ts`
/// biên dịch (`gen-community-comments.mjs`).
public struct CommunityComment: Sendable, Hashable, Identifiable {
  public let id: String
  public let postId: String
  public let parentId: String?
  public let body: String
  public let createdAt: String
  public let authorId: String
  public let author: CommunityFeed.Author?
  public let mine: Bool
  /// Ẩn vì bị báo cáo — RLS chỉ cho tác giả thấy dòng ẩn.
  public let hidden: Bool
  /// handle (chữ thường) → user_id, chỉ lượt nhắc server đã xác nhận.
  public let mentions: [String: String]

  public init(
    id: String, postId: String, parentId: String?, body: String, createdAt: String, authorId: String,
    author: CommunityFeed.Author?, mine: Bool, hidden: Bool, mentions: [String: String]
  ) {
    self.id = id
    self.postId = postId
    self.parentId = parentId
    self.body = body
    self.createdAt = createdAt
    self.authorId = authorId
    self.author = author
    self.mine = mine
    self.hidden = hidden
    self.mentions = mentions
  }
}

/// Phần thuần của `comment-thread.ts`.
public enum CommentThread {
  public static let commentColumns = "id, post_id, parent_id, author_id, body, hidden, created_at"
  /// `COMMENT_PAGE`.
  public static let page = 50
  /// CHECK của bảng: `char_length(btrim(body)) BETWEEN 1 AND 500`; ô RN `maxLength={500}`.
  public static let maxLength = 500

  public struct Part: Sendable, Hashable {
    public let text: String
    /// Có khi đoạn là một lượt nhắc server đã xác nhận.
    public let userId: String?
  }

  /// Cùng mẫu với server: `@([a-zA-Z0-9_.]*[a-zA-Z0-9_])`.
  static let handlePattern = "@([a-zA-Z0-9_.]*[a-zA-Z0-9_])"

  /// `mentionParts`: chữ và đoạn nhắc (đoạn có `userId`). Chỉ số theo UTF-16
  /// như JS.
  public static func mentionParts(_ body: String, known: [String: String]) -> [Part] {
    let ns = body as NSString
    let handle = try? NSRegularExpression(pattern: handlePattern)
    var out: [Part] = []
    var last = 0
    for m in handle?.matches(in: body, range: NSRange(location: 0, length: ns.length)) ?? [] {
      let name = ns.substring(with: m.range(at: 1)).lowercased()
      guard let userId = known[name] else { continue }
      if m.range.location > last {
        out.append(Part(text: ns.substring(with: NSRange(location: last, length: m.range.location - last)), userId: nil))
      }
      out.append(Part(text: ns.substring(with: m.range), userId: userId))
      last = m.range.location + m.range.length
    }
    if last < ns.length { out.append(Part(text: ns.substring(from: last), userId: nil)) }
    return out.isEmpty ? [Part(text: body, userId: nil)] : out
  }

  public struct Node: Sendable, Hashable {
    public let id: String
    public let parentId: String?
    public let createdAt: String
    public init(id: String, parentId: String?, createdAt: String) {
      self.id = id
      self.parentId = parentId
      self.createdAt = createdAt
    }
  }

  /// `threadComments`: gốc theo thứ tự đến, mỗi gốc kèm trả lời theo thứ tự
  /// đến. Trả lời mà gốc không có trong danh sách đứng một mình như một gốc.
  /// Sắp ỔN ĐỊNH như `Array.prototype.sort` (mốc bằng nhau giữ thứ tự vào).
  public static func threads<T>(_ list: [T], node: (T) -> Node) -> [(root: T, replies: [T])] {
    let byTime = list.enumerated().sorted { a, b in
      let x = node(a.element).createdAt, y = node(b.element).createdAt
      return x != y ? x < y : a.offset < b.offset
    }.map(\.element)
    let ids = Set(byTime.map { node($0).id })
    var order: [(root: T, replies: [T])] = []
    var index: [String: Int] = [:]
    for c in byTime {
      let n = node(c)
      if let p = n.parentId, ids.contains(p) { continue }
      index[n.id] = order.count
      order.append((c, []))
    }
    for c in byTime {
      guard let p = node(c).parentId, ids.contains(p), let i = index[p] else { continue }
      order[i].replies.append(c)
    }
    return order
  }

  /// `replyPrefix`: `@handle ` để người được trả lời đọc thấy tên mình.
  public static func replyPrefix(_ handle: String?) -> String {
    guard let handle, !handle.isEmpty else { return "" }
    return "@\(handle) "
  }

  /// `missingRoots`: `parent_id` của trả lời mà gốc không trong trang, mỗi id
  /// một lần, theo thứ tự gặp.
  public static func missingRoots(_ rows: [Node]) -> [String] {
    let here = Set(rows.map(\.id))
    var out: [String] = []
    for r in rows {
      if let p = r.parentId, !here.contains(p), !out.contains(p) { out.append(p) }
    }
    return out
  }

  /// `mergeCommentPages`: các trang (rows + roots) thành MỘT danh sách cũ → mới,
  /// mỗi id một lần (bản gặp trước thắng).
  public static func mergePages<T>(_ pages: [(rows: [T], roots: [T])], node: (T) -> Node) -> [T] {
    var seen = Set<String>()
    var all: [T] = []
    for p in pages {
      for c in p.rows + p.roots where seen.insert(node(c).id).inserted { all.append(c) }
    }
    return all.sorted { a, b in
      let x = node(a), y = node(b)
      return x.createdAt != y.createdAt ? x.createdAt < y.createdAt : x.id < y.id
    }
  }

  /// Ô viết: cắt theo `maxLength` (UTF-16, ranh giới ký tự) như ô RN.
  public static func clamp(_ draft: String) -> String { CommunityProfileForm.clamp(draft, max: maxLength) }

  /// Thân gửi đi: `body.trim()`; rỗng = không gửi.
  public static func sendable(_ draft: String) -> String? {
    let body = RepEntry.trimJS(draft)
    return body.isEmpty ? nil : body
  }
}

extension CommunityComment {
  public var node: CommentThread.Node { .init(id: id, parentId: parentId, createdAt: createdAt) }
}
