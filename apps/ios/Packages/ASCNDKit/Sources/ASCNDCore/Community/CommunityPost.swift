public import Foundation
public import Observation

/// Lỗi khi gửi bình luận — `postingError(…, 'comment')` của RN.
public enum CommunityCommentFailure: Error, Sendable, Hashable {
  /// 54000: trần bình luận mỗi giờ.
  case limit
  /// CR001: đội kiểm duyệt đang tạm khoá đăng.
  case restricted
  case offline
  case server(code: String?)
}

/// Một gốc + các câu trả lời của nó.
public struct CommentGroup: Sendable, Hashable, Identifiable {
  public let root: CommunityComment
  public let replies: [CommunityComment]
  public var id: String { root.id }
}

/// Đọc / ghi màn một bài trên server (#527, lát 3). Mọi lệnh qua RLS.
public protocol CommunityPostRemote: CommunityFeedRemote {
  /// Một hàng `community_posts` (cột `CommunityFeed.postColumns`), `nil` khi
  /// không còn / không được xem.
  func post(id: String) async throws -> JSONValue?
  /// Một trang bình luận mới → cũ (`created_at`, `id` giảm dần), `limit` dòng,
  /// cũ hơn con trỏ nếu có (`.or(olderThan)`).
  func comments(postId: String, olderThan: String?, limit: Int) async throws -> [JSONValue]
  func comments(ids: [String]) async throws -> [JSONValue]
  /// `community_comment_mentions` (`comment_id, user_id`) của các bình luận.
  func commentMentions(commentIds: [String]) async throws -> [JSONValue]
  /// `community_mutes`: người mình đang tắt tiếng, còn hạn (`until > now`).
  func mutedIds(me: String, nowISO: String) async throws -> [String]
  /// Chèn một bình luận (thân đã trim). Ném `CommunityCommentFailure`.
  func addComment(postId: String, me: String, body: String, parentId: String?) async throws
}

/// Màn một bài + bình luận (`app/community-post.tsx`, `useCommunityPost`,
/// `useComments`, `useAddComment` @ fac9ac2).
///
/// Như RN: bài đọc lỗi = lỗi có thử lại; không còn bài = "Bài không còn nữa";
/// bình luận theo trang 50 mới → cũ, nối thành một danh sách cũ → mới
/// (`mergeCommentPages`), gốc của trả lời mồ côi tải kèm; "Xem bình luận cũ
/// hơn" hỏng thì giữ những gì đã có; gửi cần mạng, lỗi 54000 / CR001 có tên,
/// không bao giờ báo "đã gửi" khi server chưa nhận.
///
/// Khác RN (ghi `NATIVE_IMPROVEMENTS`): bình luận của người mình đang tắt tiếng
/// được lọc phía máy (server chỉ lọc bài).
@MainActor @Observable
public final class CommunityPostBook {
  public enum Phase: Sendable, Hashable {
    case loading
    case failed
    case ready
    /// Bài không còn / không được xem.
    case gone
  }

  public enum SendResult: Sendable, Hashable {
    case sent
    case failed(CommunityCommentFailure)
    /// Thân rỗng, đang gửi, hay ô gửi không được phép — không chạm server.
    case ignored
  }

  public let userId: String
  public let postId: String
  public private(set) var phase: Phase = .loading
  public private(set) var post: CommunityFeed.Post?
  /// Số bình luận trên thẻ: của bài + những câu mình vừa gửi ở màn này.
  public private(set) var commentCount = 0
  public private(set) var commentsPhase: CommunityFeedBook.Phase = .loading
  /// Cũ → mới, đã lọc người đang tắt tiếng.
  public private(set) var comments: [CommunityComment] = []
  public private(set) var canLoadOlder = false
  public private(set) var loadingOlder = false
  public private(set) var olderFailed = false
  public private(set) var restriction: CommunityFeed.Restriction?
  /// Hồ sơ cộng đồng của mình (`nil` = chưa có; `hasProfile == nil` = chưa biết).
  public private(set) var myProfile: CommunityProfile?
  public private(set) var hasProfile: Bool?
  public private(set) var sending = false

  @ObservationIgnored private let remote: any CommunityPostRemote
  @ObservationIgnored private let clock: any WallClock
  @ObservationIgnored private var pages: [(rows: [CommunityComment], roots: [CommunityComment])] = []
  @ObservationIgnored private var muted: Set<String> = []
  @ObservationIgnored private var closed = false

  public init(userId: String, postId: String, remote: any CommunityPostRemote, clock: any WallClock = SystemWallClock()) {
    self.userId = userId
    self.postId = postId
    self.remote = remote
    self.clock = clock
  }

  public func close() { closed = true }

  public func artURL(_ art: CommunityFeed.Art) -> URL? { remote.artURL(path: art.path) }

  /// Luồng một tầng của danh sách đang hiện.
  public var threads: [(root: CommunityComment, replies: [CommunityComment])] {
    CommentThread.threads(comments, node: \.node)
  }

  /// `threads` dạng `Identifiable` cho `ForEach`.
  public var threadGroups: [CommentGroup] { threads.map { CommentGroup(root: $0.root, replies: $0.replies) } }

  /// Ô viết được hay không: tác giả tắt bình luận (trừ chính tác giả), đang bị
  /// hạn chế, hay chưa có hồ sơ → không.
  public var canComment: Bool {
    guard let post, myProfile != nil, restriction == nil else { return false }
    return !post.commentsOff || post.mine
  }

  // MARK: - Đọc

  /// Bài + trang bình luận đầu + tắt tiếng / hạn chế / hồ sơ.
  public func load() async {
    let remote = self.remote, me = userId
    do {
      guard let row = try await remote.post(id: postId) else {
        guard !closed else { return }
        post = nil
        phase = .gone
        return
      }
      let hydrated = try await CommunityFeed.hydrate([row], me: me, remote: remote)
      guard !closed else { return }
      guard let p = hydrated.first else {
        phase = .gone
        return
      }
      post = p
      commentCount = p.commentCount
      phase = .ready
    } catch {
      guard !closed else { return }
      if phase != .ready { phase = .failed }
      return
    }
    await loadExtras()
    await reloadComments()
  }

  /// Đọc lại mọi trang đang giữ (như `invalidateQueries` của RN); lần đầu hỏng
  /// là lỗi, làm mới hỏng giữ bình luận đang có.
  public func reloadComments() async {
    let want = max(1, pages.count)
    var fresh: [(rows: [CommunityComment], roots: [CommunityComment])] = []
    var cursor: CommunityPayloads.Cursor?
    do {
      for i in 0..<want {
        if i > 0 && cursor == nil { break }
        let page = try await fetchPage(after: cursor)
        fresh.append(page)
        cursor = Self.nextCursor(page.rows)
      }
      guard !closed else { return }
      pages = fresh
      canLoadOlder = cursor != nil
      olderFailed = false
      publish()
      commentsPhase = .ready
    } catch {
      guard !closed else { return }
      if commentsPhase != .ready { commentsPhase = .failed }
    }
  }

  /// "Xem bình luận cũ hơn". Hỏng → giữ danh sách, báo `olderFailed`.
  public func loadOlder() async {
    guard commentsPhase == .ready, canLoadOlder, !loadingOlder, !closed,
      let cursor = pages.last.flatMap({ Self.nextCursor($0.rows) })
    else { return }
    loadingOlder = true
    defer { loadingOlder = false }
    do {
      let page = try await fetchPage(after: cursor)
      guard !closed else { return }
      pages.append(page)
      canLoadOlder = Self.nextCursor(page.rows) != nil
      olderFailed = false
      publish()
    } catch {
      guard !closed else { return }
      olderFailed = true
    }
  }

  // MARK: - Ghi

  /// Gửi bình luận / trả lời (`parentId` = bình luận được bấm; server gắn vào gốc).
  public func send(_ draft: String, replyTo parentId: String?) async -> SendResult {
    guard let body = CommentThread.sendable(CommentThread.clamp(draft)), canComment, !sending, !closed else {
      return .ignored
    }
    sending = true
    defer { sending = false }
    do {
      try await remote.addComment(postId: postId, me: userId, body: body, parentId: parentId)
    } catch let f as CommunityCommentFailure {
      return .failed(f)
    } catch {
      return .failed(.server(code: nil))
    }
    guard !closed else { return .sent }
    commentCount += 1
    await reloadComments()
    return .sent
  }

  // MARK: - Nội bộ

  private func publish() {
    let merged = CommentThread.mergePages(pages, node: \.node)
    comments = merged.filter { $0.mine || !muted.contains($0.authorId) }
  }

  static func nextCursor(_ rows: [CommunityComment]) -> CommunityPayloads.Cursor? {
    CommunityPayloads.nextCursor(rows.map { (createdAt: $0.createdAt, id: $0.id) }, size: CommentThread.page)
  }

  private func fetchPage(after cursor: CommunityPayloads.Cursor?) async throws -> (
    rows: [CommunityComment], roots: [CommunityComment]
  ) {
    let remote = self.remote, me = userId
    let rows = try await remote.comments(
      postId: postId, olderThan: cursor.map { CommunityPayloads.olderThan($0) }, limit: CommentThread.page)
    let missing = CommentThread.missingRoots(rows.map(Self.node))
    var roots: [JSONValue] = []
    if !missing.isEmpty { roots = try await remote.comments(ids: missing) }
    let all = rows + roots
    let ids = all.compactMap { $0["id"]?.stringValue }
    var mentionRows: [JSONValue] = []
    if !ids.isEmpty { mentionRows = try await remote.commentMentions(commentIds: ids) }
    var people: [String] = []
    for r in all { if let a = r["author_id"]?.stringValue, !people.contains(a) { people.append(a) } }
    for m in mentionRows { if let u = m["user_id"]?.stringValue, !people.contains(u) { people.append(u) } }
    var profiles: [JSONValue] = []
    if !people.isEmpty { profiles = try await remote.profiles(ids: people) }
    let byId = Dictionary(profiles.compactMap(CommunityFeed.author).map { ($0.userId, $0) }) { a, _ in a }
    let toComment = { (r: JSONValue) -> CommunityComment? in
      guard let id = r["id"]?.stringValue else { return nil }
      let authorId = r["author_id"]?.stringValue ?? ""
      var mentions: [String: String] = [:]
      for m in mentionRows where m["comment_id"]?.stringValue == id {
        if let u = m["user_id"]?.stringValue, let who = byId[u] { mentions[who.handle.lowercased()] = who.userId }
      }
      return CommunityComment(
        id: id, postId: r["post_id"]?.stringValue ?? "", parentId: r["parent_id"]?.stringValue,
        body: r["body"]?.stringValue ?? "", createdAt: r["created_at"]?.stringValue ?? "", authorId: authorId,
        author: byId[authorId], mine: authorId == me, hidden: JS.truthyValue(r["hidden"] ?? .null), mentions: mentions)
    }
    return (rows.compactMap(toComment), roots.compactMap(toComment))
  }

  static func node(_ r: JSONValue) -> CommentThread.Node {
    .init(id: r["id"]?.stringValue ?? "", parentId: r["parent_id"]?.stringValue, createdAt: r["created_at"]?.stringValue ?? "")
  }

  /// Tắt tiếng, hạn chế, hồ sơ — mỗi khối hỏng thì bỏ qua (tắt tiếng hỏng =
  /// không lọc, như RN không lọc; hồ sơ hỏng = chưa biết, không mời tạo nhầm).
  private func loadExtras() async {
    let remote = self.remote, me = userId
    let nowISO = WorkoutSessionRecord.iso8601(clock.nowMillis())
    var mutedIds: [String] = []
    do { mutedIds = try await remote.mutedIds(me: me, nowISO: nowISO) } catch { mutedIds = [] }
    var restrictionRow: JSONValue?
    do { restrictionRow = try await remote.restriction(me: me, nowISO: nowISO) } catch { restrictionRow = nil }
    var profileRow: JSONValue?
    var profileKnown = true
    do { profileRow = try await remote.myProfile(me: me) } catch { profileKnown = false }
    guard !closed else { return }
    muted = Set(mutedIds)
    restriction = restrictionRow.flatMap { row in
      row["until"]?.stringValue.map { CommunityFeed.Restriction(until: $0, reason: row["reason"]?.stringValue) }
    }
    if profileKnown {
      myProfile = profileRow.flatMap(CommunityProfile.init(row:))
      hasProfile = myProfile != nil
    }
  }
}
