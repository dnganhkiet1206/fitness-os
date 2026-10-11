public import Foundation
public import Observation

/// Feed Cộng đồng chỉ đọc (#527, lát 1) — `useCommunityFeed`, `hydrate`,
/// `useUsefulThisWeek`, `useMyRestriction`, `useMyCommunityProfile` @ fac9ac2.
///
/// Như RN: hai tab — Đang theo dõi (bài của mình + người mình theo dõi) và Khám
/// phá (mặc định — tài khoản mới chưa theo dõi ai; lọc loại bài theo
/// `community_settings.discover_kinds`); trang 30 bài mới
/// → cũ theo khoá `(created_at, id)`; mỗi trang ghép tác giả, đã thích / đã lưu
/// của MÌNH và ảnh minh hoạ (kể cả ảnh đã tắt — bài cũ vẫn vẽ được); "Hữu ích
/// tuần này": tối đa 3 bài của 168 giờ qua, `useful_score ≥ 5`, không phải bài
/// mình, cùng bộ lọc loại, chỉ ở Khám phá; nhãn bị hạn chế đăng. Mọi lượt đọc đi qua RLS (chặn,
/// riêng tư, ẩn, tắt tiếng do server lọc).
///
/// Khác RN: không giới hạn 5 trang trong bộ nhớ (danh sách chữ, không tốn) và
/// kéo để làm mới tải lại từ trang đầu (RN tải lại mọi trang đang giữ).
public enum CommunityFeed {
  public static let page = 30
  public static let usefulMinScore = 5
  public static let usefulWindowDays = 7

  public enum Tab: String, Sendable, Hashable, CaseIterable { case following, discover }
  public enum Kind: String, Sendable, Hashable { case workout, progress, recipe }

  public struct Author: Sendable, Hashable {
    public let userId: String
    public let handle: String
    public let displayName: String
    public let mascotId: String?
    public let isOfficial: Bool
    public let bio: String?
  }

  public struct Art: Sendable, Hashable {
    public let id: String
    public let kind: String
    public let style: String
    public let path: String
    public let altEn: String
    public let altVi: String
  }

  public struct Post: Sendable, Hashable, Identifiable {
    public let id: String
    public let kind: Kind
    public let workout: CommunityPayloads.Workout
    public let progress: CommunityPayloads.Progress?
    public let recipe: CommunityPayloads.Recipe?
    public let caption: String
    public let followersOnly: Bool
    public internal(set) var likeCount: Int
    public internal(set) var commentCount: Int
    public internal(set) var saveCount: Int
    public let hidden: Bool
    public let createdAt: String
    public let author: Author?
    public internal(set) var liked: Bool
    public internal(set) var saved: Bool
    public let mine: Bool
    public let art: Art?
    public internal(set) var commentsOff: Bool
    /// "Hữu ích tuần này": số lần người khác thử bài.
    public internal(set) var tries: Int?
  }

  public struct Restriction: Sendable, Hashable {
    public let until: String
    public let reason: String?
  }

  public static let postColumns =
    "id, author_id, kind, payload, caption, visibility, like_count, comment_count, save_count, hidden, created_at, art_id, comments_off"
  public static let profileColumns = "user_id, handle, display_name, mascot_id, is_official, bio"
  public static let artColumns = "id, kind, style, tags, path, alt_en, alt_vi, active, sort"

  static func author(_ r: JSONValue) -> Author? {
    guard let id = r["user_id"]?.stringValue else { return nil }
    return Author(
      userId: id, handle: r["handle"]?.stringValue ?? "", displayName: r["display_name"]?.stringValue ?? "",
      mascotId: r["mascot_id"]?.stringValue, isOfficial: r["is_official"] == .bool(true), bio: r["bio"]?.stringValue)
  }

  static func art(_ r: JSONValue) -> Art? {
    guard let id = r["id"]?.stringValue, let path = r["path"]?.stringValue else { return nil }
    return Art(
      id: id, kind: r["kind"]?.stringValue ?? "", style: r["style"]?.stringValue ?? "", path: path,
      altEn: r["alt_en"]?.stringValue ?? "", altVi: r["alt_vi"]?.stringValue ?? "")
  }

  static func count(_ v: JSONValue?) -> Int {
    let n = JS.number(v)
    return n.isFinite ? Int(n) : 0
  }

  /// `hydrate`: hàng bài + các bảng phụ đã đọc → bài cho thẻ, giữ thứ tự hàng.
  public static func hydrate(
    _ rows: [JSONValue], me: String, authors: [JSONValue], liked: Set<String>, saved: Set<String>, arts: [JSONValue]
  ) -> [Post] {
    let byId = Dictionary(authors.compactMap(author).map { ($0.userId, $0) }) { a, _ in a }
    let artById = Dictionary(arts.compactMap(art).map { ($0.id, $0) }) { a, _ in a }
    return rows.compactMap { r in
      guard let id = r["id"]?.stringValue else { return nil }
      let kindText = r["kind"]?.stringValue
      let kind: Kind = kindText == "progress" ? .progress : kindText == "recipe" ? .recipe : .workout
      let raw = r["payload"]
      let tries = r["try_count"].map { count($0) }
      return Post(
        id: id, kind: kind, workout: CommunityPayloads.workout(raw),
        progress: kind == .progress ? CommunityPayloads.progress(raw) : nil,
        recipe: kind == .recipe ? CommunityPayloads.recipe(raw) : nil, caption: r["caption"]?.stringValue ?? "",
        followersOnly: r["visibility"]?.stringValue == "followers", likeCount: count(r["like_count"]),
        commentCount: count(r["comment_count"]), saveCount: count(r["save_count"]),
        hidden: JS.truthyValue(r["hidden"] ?? .null), createdAt: r["created_at"]?.stringValue ?? "",
        author: r["author_id"]?.stringValue.flatMap { byId[$0] }, liked: liked.contains(id), saved: saved.contains(id),
        mine: r["author_id"]?.stringValue == me, art: r["art_id"]?.stringValue.flatMap { artById[$0] },
        commentsOff: r["comments_off"] == .bool(true), tries: tries)
    }
  }
}

extension CommunityFeed {
  /// `hydrate` của RN: đọc tác giả, đã thích / đã lưu của MÌNH và ảnh minh hoạ
  /// cho các hàng bài, rồi ghép — feed, Hữu ích và màn chi tiết bài dùng chung.
  public static func hydrate(_ rows: [JSONValue], me: String, remote: any CommunityFeedRemote) async throws -> [Post] {
    guard !rows.isEmpty else { return [] }
    let ids = rows.compactMap { $0["id"]?.stringValue }
    let authorIds = Array(Set(rows.compactMap { $0["author_id"]?.stringValue })).sorted()
    let artIds = Array(Set(rows.compactMap { $0["art_id"]?.stringValue })).sorted()
    async let authors = remote.profiles(ids: authorIds)
    async let liked = remote.likedPostIds(me: me, postIds: ids)
    async let saved = remote.savedPostIds(me: me, postIds: ids)
    async let arts: [JSONValue] = artIds.isEmpty ? [] : remote.art(ids: artIds)
    return try await hydrate(rows, me: me, authors: authors, liked: Set(liked), saved: Set(saved), arts: arts)
  }
}

/// Một lượt đọc bài (`community_posts`).
public struct CommunityPostQuery: Sendable, Hashable {
  /// `author_id in (...)` (Đang theo dõi).
  public var authors: [String]?
  /// `kind in (...)` (Khám phá / Hữu ích).
  public var kinds: [String]?
  /// `.or(...)` của con trỏ.
  public var cursorFilter: String?
  /// Trang "mới hơn" hỏi tăng dần.
  public var ascending = false
  public var limit = CommunityFeed.page
  /// "Hữu ích tuần này": `created_at >= since`, `author_id != me`,
  /// `useful_score >= …`, sắp theo điểm rồi mới → cũ, kèm `try_count`.
  public var usefulSince: String?
  public var excludeAuthor: String?

  public init() {}
}

/// Đọc Cộng đồng trên server. Mọi lệnh đi qua RLS; ném lỗi thô.
public protocol CommunityFeedRemote: Sendable {
  func followees(me: String) async throws -> [String]
  /// Hàng `community_settings` của mình (hoặc `nil`).
  func settings(me: String) async throws -> JSONValue?
  func posts(_ q: CommunityPostQuery) async throws -> [JSONValue]
  func profiles(ids: [String]) async throws -> [JSONValue]
  func likedPostIds(me: String, postIds: [String]) async throws -> [String]
  func savedPostIds(me: String, postIds: [String]) async throws -> [String]
  func art(ids: [String]) async throws -> [JSONValue]
  /// Hạn chế đăng còn hiệu lực (`until > now`).
  func restriction(me: String, nowISO: String) async throws -> JSONValue?
  func myProfile(me: String) async throws -> JSONValue?
  /// URL công khai của ảnh minh hoạ (bucket `community-art`).
  func artURL(path: String) -> URL?
}

/// Feed của MỘT tài khoản.
@MainActor @Observable
public final class CommunityFeedBook {
  public enum Phase: Sendable, Hashable {
    case loading
    case failed
    case ready
  }

  public let userId: String
  public private(set) var tab: CommunityFeed.Tab = .discover
  public private(set) var phase: Phase = .loading
  public private(set) var posts: [CommunityFeed.Post] = []
  public private(set) var useful: [CommunityFeed.Post] = []
  public private(set) var restriction: CommunityFeed.Restriction?
  /// `nil` = chưa biết; `false` = chưa tạo hồ sơ cộng đồng.
  public private(set) var hasProfile: Bool?
  public private(set) var canLoadMore = false
  public private(set) var loadingMore = false
  public private(set) var moreFailed = false

  @ObservationIgnored private let remote: any CommunityFeedRemote
  @ObservationIgnored private let clock: any WallClock
  @ObservationIgnored private var cursor: CommunityPayloads.Cursor?
  @ObservationIgnored private var generation = 0
  @ObservationIgnored private var closed = false

  public init(userId: String, remote: any CommunityFeedRemote, clock: any WallClock = SystemWallClock()) {
    self.userId = userId
    self.remote = remote
    self.clock = clock
  }

  public func close() { closed = true }

  public func artURL(_ art: CommunityFeed.Art) -> URL? { remote.artURL(path: art.path) }

  /// Đổi tab: danh sách cũ bỏ, đọc trang đầu của tab mới.
  public func select(_ tab: CommunityFeed.Tab) async {
    guard tab != self.tab else { return }
    self.tab = tab
    posts = []
    phase = .loading
    await load()
  }

  /// Trang đầu (+ Hữu ích, hạn chế, hồ sơ). Lần đầu hỏng → lỗi (≠ trống); đọc
  /// lại hỏng khi đã có bài thì giữ bài. Ba khối phụ hỏng không làm hỏng feed.
  public func load() async {
    generation += 1
    let gen = generation
    let tab = self.tab
    do {
      let kinds = try await discoverFilter()
      var q = CommunityPostQuery()
      if tab == .following {
        let followees = try await remote.followees(me: userId)
        q.authors = [userId] + followees
      } else {
        q.kinds = kinds
      }
      let page = try await fetch(q)
      let (u, r, p) = await loadExtras(tab: tab, kinds: kinds)
      guard !closed, gen == generation else { return }
      posts = page.posts
      cursor = page.next
      canLoadMore = page.next != nil
      moreFailed = false
      useful = u
      restriction = r
      if let p { hasProfile = p }
      phase = .ready
    } catch {
      guard !closed, gen == generation else { return }
      if phase != .ready { phase = .failed }
    }
  }

  /// Trang cũ hơn. Hỏng → giữ danh sách, báo `moreFailed` (thử lại được).
  public func loadMore() async {
    guard phase == .ready, canLoadMore, !loadingMore, let cursor, !closed else { return }
    loadingMore = true
    defer { loadingMore = false }
    let gen = generation
    do {
      var q = CommunityPostQuery()
      if tab == .following {
        let followees = try await remote.followees(me: userId)
        q.authors = [userId] + followees
      } else {
        q.kinds = try await discoverFilter()
      }
      q.cursorFilter = CommunityPayloads.olderThan(cursor)
      let page = try await fetch(q)
      guard !closed, gen == generation else { return }
      let seen = Set(posts.map(\.id))
      posts += page.posts.filter { !seen.contains($0.id) }
      self.cursor = page.next
      canLoadMore = page.next != nil
      moreFailed = false
    } catch {
      guard !closed, gen == generation else { return }
      moreFailed = true
    }
  }

  // MARK: - Nội bộ

  /// `discoverFilter`: loại bài đã chọn, `nil` khi chọn đủ ba (không lọc).
  private func discoverFilter() async throws -> [String]? {
    let kinds = CommunityPayloads.discover(try await remote.settings(me: userId)?["discover_kinds"])
    return kinds.count < CommunityPayloads.discoverKinds.count ? kinds : nil
  }

  private func fetch(_ q: CommunityPostQuery) async throws -> (posts: [CommunityFeed.Post], next: CommunityPayloads.Cursor?) {
    let rows = try await remote.posts(q)
    let posts = try await hydrate(rows)
    let keys = rows.compactMap { r -> (createdAt: String, id: String)? in
      guard let id = r["id"]?.stringValue, let at = r["created_at"]?.stringValue else { return nil }
      return (at, id)
    }
    return (posts, CommunityPayloads.nextCursor(keys, size: q.limit))
  }

  private func hydrate(_ rows: [JSONValue]) async throws -> [CommunityFeed.Post] {
    try await CommunityFeed.hydrate(rows, me: userId, remote: remote)
  }

  /// Hữu ích tuần này (chỉ Khám phá) + hạn chế + hồ sơ — mỗi khối hỏng thì để
  /// trống.
  private func loadExtras(tab: CommunityFeed.Tab, kinds: [String]?) async -> (
    [CommunityFeed.Post], CommunityFeed.Restriction?, Bool?
  ) {
    let now = clock.nowMillis()
    let since = WorkoutSessionRecord.iso8601(
      EpochMillis(now.millis - Int64(CommunityFeed.usefulWindowDays) * 24 * 3600 * 1000))
    var q = CommunityPostQuery()
    q.kinds = kinds
    q.limit = 3
    q.usefulSince = since
    q.excludeAuthor = userId
    var useful: [CommunityFeed.Post] = []
    if tab == .discover { useful = (try? await hydrate(try await remote.posts(q))) ?? [] }
    var row: JSONValue?
    do { row = try await remote.restriction(me: userId, nowISO: WorkoutSessionRecord.iso8601(now)) } catch { row = nil }
    let restriction = row.flatMap { row -> CommunityFeed.Restriction? in
      guard let until = row["until"]?.stringValue else { return nil }
      return CommunityFeed.Restriction(until: until, reason: row["reason"]?.stringValue)
    }
    // Đọc hồ sơ hỏng = chưa biết (không mời tạo hồ sơ nhầm); không có hàng = chưa tạo.
    var profile: Bool?
    do { profile = try await remote.myProfile(me: userId) != nil } catch { profile = nil }
    return (useful, restriction, profile)
  }
}

// MARK: - Thích / lưu / menu bài (#527, lát 6)

extension CommunityFeedBook: CommunityPostHost {
  public func post(id: String) -> CommunityFeed.Post? {
    posts.first { $0.id == id } ?? useful.first { $0.id == id }
  }

  /// `patchPost`: cùng một bài ở cả bảng tin lẫn "Hữu ích tuần này".
  public func replace(_ post: CommunityFeed.Post) {
    if let i = posts.firstIndex(where: { $0.id == post.id }) { posts[i] = post }
    if let i = useful.firstIndex(where: { $0.id == post.id }) {
      // "Hữu ích" mang thêm `tries` của truy vấn riêng — giữ nó.
      var p = post
      p.tries = useful[i].tries
      useful[i] = p
    }
  }

  /// `invalidateQueries(['community_feed'])`.
  public func reloadAfterAction() async { await load() }
}
