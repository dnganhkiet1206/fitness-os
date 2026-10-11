public import Foundation
public import Observation

/// Thư viện Đã lưu (#527, lát 7) — `app/community-saved.tsx` +
/// `useSavedPosts` (`hooks/use-community-saved.ts`) + `lib/saved-library.ts` @
/// fac9ac2.
///
/// Như RN:
/// - thứ tự là thứ tự LƯU (mới nhất trước), không phải lúc đăng;
/// - trang 30 theo con trỏ của DÒNG LƯU `(created_at, post_id)` — bài bị ẩn /
///   xoá / của người đã chặn rơi khỏi trang mà con trỏ vẫn đi tiếp;
/// - lọc lại ở máy: chỉ id đã lưu, bài ẩn chỉ còn khi là của mình, mỗi bài
///   một lần;
/// - bộ lọc Buổi tập | Công thức | Tất cả (mở ở Tất cả; Tiến trình chỉ ở Tất
///   cả); lọc rỗng mà còn trang cũ hơn thì đọc tiếp tới khi thấy hay hết;
/// - luôn đọc lại khi mở; bỏ lưu ngay trong thư viện thì mục ấy ở lại tới lần
///   mở sau.
public enum CommunitySaved {
  public static let page = 30

  public enum Filter: String, Sendable, Hashable, CaseIterable {
    case workout, recipe, all
  }

  /// `selectSaved`: bài còn được vẽ, theo thứ tự lưu.
  public static func select(ids: [String], rows: [JSONValue], me: String) -> [JSONValue] {
    var firstAt: [String: Int] = [:]
    for (i, id) in ids.enumerated() where firstAt[id] == nil { firstAt[id] = i }
    var seen = Set<String>()
    let kept = rows.filter { r in
      guard let id = r["id"]?.stringValue, firstAt[id] != nil else { return false }
      let hidden = r["hidden"].map { JS.truthyValue($0) } ?? false
      guard !hidden || r["author_id"]?.stringValue == me else { return false }
      return seen.insert(id).inserted
    }
    // `Array.sort` của JS ổn định; `sorted` của Swift không hứa — giữ chỉ số gốc.
    return kept.enumerated()
      .sorted { a, b in
        let x = firstAt[a.element["id"]?.stringValue ?? ""] ?? 0
        let y = firstAt[b.element["id"]?.stringValue ?? ""] ?? 0
        return x != y ? x < y : a.offset < b.offset
      }
      .map(\.element)
  }

  /// `filterSaved`: "Tất cả" gồm cả Tiến trình.
  public static func filter(_ posts: [CommunityFeed.Post], _ f: Filter) -> [CommunityFeed.Post] {
    f == .all ? posts : posts.filter { $0.kind.rawValue == f.rawValue }
  }

  /// `savedCursor`: con trỏ từ DÒNG LƯU cuối trang; trang thiếu = hết.
  public static func cursor(_ saves: [(postId: String, createdAt: String)], size: Int = page)
    -> CommunityPayloads.Cursor?
  {
    guard saves.count >= size, let last = saves.last else { return nil }
    return CommunityPayloads.Cursor(at: last.createdAt, id: last.postId)
  }
}

public protocol CommunitySavedRemote: CommunityFeedRemote {
  /// `community_saves` của mình (`post_id, created_at`), mới → cũ theo
  /// `(created_at, post_id)`, cũ hơn con trỏ nếu có.
  func saves(me: String, olderThan: String?, limit: Int) async throws -> [JSONValue]
  /// `community_posts` theo id (RLS bỏ bài bị ẩn / bị chặn).
  func posts(ids: [String]) async throws -> [JSONValue]
}

/// Thư viện của MỘT tài khoản.
@MainActor @Observable
public final class CommunitySavedBook {
  public let userId: String
  public private(set) var phase: CommunityFeedBook.Phase = .loading
  /// Mọi bài đã tải, theo thứ tự lưu.
  public private(set) var posts: [CommunityFeed.Post] = []
  public private(set) var canLoadMore = false
  public private(set) var loadingMore = false
  public private(set) var moreFailed = false
  public var filter: Filter = .all

  public typealias Filter = CommunitySaved.Filter

  @ObservationIgnored private let remote: any CommunitySavedRemote
  @ObservationIgnored private var next: CommunityPayloads.Cursor?
  @ObservationIgnored private var generation = 0

  public init(userId: String, remote: any CommunitySavedRemote) {
    self.userId = userId
    self.remote = remote
  }

  public var visible: [CommunityFeed.Post] { CommunitySaved.filter(posts, filter) }

  /// Lọc rỗng ở những trang ĐÃ tải mà còn trang cũ hơn: chưa phải "chưa có".
  public var hunting: Bool { phase == .ready && visible.isEmpty && canLoadMore && !moreFailed }

  public func artURL(_ art: CommunityFeed.Art) -> URL? { remote.artURL(path: art.path) }

  public func load() async {
    generation += 1
    let gen = generation
    if posts.isEmpty { phase = .loading }
    do {
      let (page, cursor) = try await fetch(nil)
      guard gen == generation else { return }
      posts = page
      next = cursor
      canLoadMore = cursor != nil
      moreFailed = false
      phase = .ready
    } catch {
      guard gen == generation else { return }
      if phase != .ready { phase = .failed }
    }
  }

  public func loadMore() async {
    guard phase == .ready, canLoadMore, !loadingMore, let cursor = next else { return }
    let gen = generation
    loadingMore = true
    defer { loadingMore = false }
    do {
      let (page, cursor) = try await fetch(cursor)
      guard gen == generation else { return }
      let seen = Set(posts.map(\.id))
      posts += page.filter { !seen.contains($0.id) }
      next = cursor
      canLoadMore = cursor != nil
      moreFailed = false
    } catch {
      guard gen == generation else { return }
      moreFailed = true
    }
  }

  /// Bộ lọc rỗng mà còn trang: đọc tiếp tới khi thấy một mục đúng loại hay hết.
  public func hunt() async {
    while hunting && !loadingMore {
      await loadMore()
    }
  }

  private func fetch(_ cursor: CommunityPayloads.Cursor?) async throws -> ([CommunityFeed.Post], CommunityPayloads.Cursor?) {
    let remote = self.remote, me = userId
    let saves = try await remote.saves(
      me: me, olderThan: cursor.map { CommunityPayloads.olderThan($0, idCol: "post_id") }, limit: CommunitySaved.page)
    // Cột NOT NULL ở server; một dòng hỏng thì bỏ.
    let keys = saves.compactMap { s -> (postId: String, createdAt: String)? in
      guard let id = s["post_id"]?.stringValue, let at = s["created_at"]?.stringValue else { return nil }
      return (postId: id, createdAt: at)
    }
    let next = CommunitySaved.cursor(keys)
    let ids = keys.map(\.postId)
    guard !ids.isEmpty else { return ([], next) }
    let rows = try await remote.posts(ids: ids)
    let posts = try await CommunityFeed.hydrate(CommunitySaved.select(ids: ids, rows: rows, me: me), me: me, remote: remote)
    return (posts, next)
  }
}

// MARK: - Thích / lưu / menu bài (lát 6)

extension CommunitySavedBook: CommunityPostHost {
  public func post(id: String) -> CommunityFeed.Post? { posts.first { $0.id == id } }

  /// Bỏ lưu ngay trong thư viện: đổi dấu tại chỗ, mục ở lại tới lần mở sau.
  public func replace(_ post: CommunityFeed.Post) {
    if let i = posts.firstIndex(where: { $0.id == post.id }) { posts[i] = post }
  }

  public func reloadAfterAction() async { await load() }
}
