public import Foundation
public import Observation

/// Tìm người / công thức / bài viết (#527, lát 8) — `app/community-search.tsx`
/// + `searchTerm` / `useSearchPeople` / `useFindRecipes` / `useSearchPosts` /
/// `useFollowSuggestions` / `useFollow` (`hooks/use-community.ts`) @ fac9ac2.
///
/// Như RN:
/// - một ô, ba phân đoạn (Người | Công thức | Bài viết); đổi phân đoạn chữ đã
///   gõ ở lại; chỉ hỏi server cho phân đoạn đang mở;
/// - gõ tới đâu tìm tới đó, trễ 250 ms; ≥ 2 ký tự (sau khi bỏ `@` đầu) mới tìm,
///   đúng 1 ký tự thì nhắc "gõ ít nhất 2";
/// - Người: ô trống → gợi ý (RPC `community_follow_suggestions`, kèm lý do),
///   có chữ → `community_search_profiles` (tối đa 20, server lọc cặp đã chặn);
///   nút Theo dõi trên dòng, xong (kể cả hỏng) đọc lại cờ "đang theo dõi";
/// - Công thức / Bài viết: `community_find_recipes` / `community_find_posts`
///   rồi bài theo id, xếp lại theo thứ tự server trả; thẻ như feed.
public enum CommunitySearch {
  public static let minLength = 2
  public static let maxLength = 40
  public static let debounce: Duration = .milliseconds(250)

  public enum Mode: String, Sendable, Hashable, CaseIterable {
    case people, recipe, posts
  }

  /// `searchTerm`: bỏ khoảng trắng hai đầu và mọi `@` ở đầu.
  public static func term(_ q: String) -> String {
    var s = Substring(RepEntry.trimJS(q))
    while s.first == "@" { s = s.dropFirst() }
    return String(s)
  }

  /// `q.trim()` — chữ đặt vào câu "không có … khớp" của Công thức / Bài viết.
  public static func trimmed(_ q: String) -> String { RepEntry.trimJS(q) }

  /// `searchTerm(term).length >= 2` (đếm UTF-16 như JS).
  public static func searching(_ q: String) -> Bool { term(q).utf16.count >= minLength }

  /// Nhắc "gõ ít nhất 2 ký tự": chữ đang gõ (chưa trễ) còn đúng 1 ký tự.
  public static func showsMinHint(typed: String, searched: String) -> Bool {
    !searching(searched) && term(typed).utf16.count == 1
  }

  /// Chuỗi gửi server: người = `searchTerm(q).toLowerCase()`; công thức / bài
  /// = `q.trim().toLowerCase()` (giữ `@`). Ngắn hơn 2 thì không hỏi.
  public static func query(_ q: String, mode: Mode) -> String? {
    let s = (mode == .people ? term(q) : RepEntry.trimJS(q)).lowercased()
    return s.utf16.count >= minLength ? s : nil
  }

  public struct Person: Sendable, Hashable, Identifiable {
    public let author: CommunityFeed.Author
    public let iFollow: Bool
    public let recentPosts: Int
    public var id: String { author.userId }
  }

  public static func person(_ r: JSONValue) -> Person? {
    guard let a = CommunityFeed.author(r) else { return nil }
    let n = r["recent_posts"]?.doubleValue ?? 0
    return Person(author: a, iFollow: r["i_follow"] == .bool(true), recentPosts: n.isFinite ? Int(n) : 0)
  }

  /// Lý do một gợi ý ở đây: chính thức → "Tài khoản chính thức"; có bài gần
  /// đây → "N bài trong 2 tuần qua"; không thì `@handle`.
  public enum Why: Sendable, Hashable {
    case official
    case active(Int)
    case handle(String)
  }

  public static func why(_ p: Person) -> Why {
    if p.author.isOfficial { return .official }
    if p.recentPosts != 0 { return .active(p.recentPosts) }
    return .handle(p.author.handle)
  }

  /// `post_id` của các hit, theo thứ tự server (chỉ chuỗi).
  public static func hitIds(_ hits: [JSONValue]) -> [String] {
    hits.compactMap { $0["post_id"]?.stringValue }
  }

  /// `.in()` không giữ thứ tự: xếp lại theo `ids`, bỏ id không có bài.
  public static func ordered(ids: [String], rows: [JSONValue]) -> [JSONValue] {
    var byId: [String: JSONValue] = [:]
    for r in rows { if let id = r["id"]?.stringValue { byId[id] = r } }
    return ids.compactMap { byId[$0] }
  }
}

public protocol CommunitySearchRemote: CommunityFeedRemote {
  func searchProfiles(term: String) async throws -> [JSONValue]
  func followSuggestions() async throws -> [JSONValue]
  func findRecipes(term: String) async throws -> [JSONValue]
  func findPosts(term: String) async throws -> [JSONValue]
  func posts(ids: [String]) async throws -> [JSONValue]
  func follow(me: String, userId: String, on: Bool) async throws
}

/// Màn tìm của MỘT tài khoản.
@MainActor @Observable
public final class CommunitySearchBook {
  public enum Phase: Sendable, Hashable {
    /// Chưa hỏi (ô trống / < 2 ký tự).
    case idle
    case loading
    case failed
    case ready
  }

  public let userId: String
  public private(set) var mode: CommunitySearch.Mode
  /// Chữ đã qua bước trễ — thứ đang được tìm.
  public private(set) var searched = ""
  public private(set) var suggestions: [CommunitySearch.Person] = []
  public private(set) var suggestionsPhase: Phase = .loading
  public private(set) var people: [CommunitySearch.Person] = []
  public private(set) var peoplePhase: Phase = .idle
  public private(set) var hits: [CommunityFeed.Post] = []
  public private(set) var hitsPhase: Phase = .idle
  /// Người đang có lệnh theo dõi chưa xong.
  public private(set) var following: Set<String> = []

  @ObservationIgnored private let remote: any CommunitySearchRemote
  @ObservationIgnored private var generation = 0

  public init(userId: String, mode: CommunitySearch.Mode = .people, remote: any CommunitySearchRemote) {
    self.userId = userId
    self.mode = mode
    self.remote = remote
  }

  public var isSearching: Bool { CommunitySearch.searching(searched) }

  public func artURL(_ art: CommunityFeed.Art) -> URL? { remote.artURL(path: art.path) }

  /// Mở màn: gợi ý (đọc một lần, như `useFollowSuggestions`).
  public func loadSuggestions() async {
    let remote = self.remote
    if suggestions.isEmpty { suggestionsPhase = .loading }
    do {
      let rows = try await remote.followSuggestions()
      suggestions = rows.compactMap(CommunitySearch.person)
      suggestionsPhase = .ready
    } catch {
      if suggestionsPhase != .ready { suggestionsPhase = .failed }
    }
  }

  public func select(_ m: CommunitySearch.Mode) async {
    guard m != mode else { return }
    mode = m
    await run()
  }

  /// Chữ sau bước trễ 250 ms.
  public func search(_ q: String) async {
    guard q != searched else { return }
    searched = q
    await run()
  }

  /// Đọc lại phân đoạn đang mở (Thử lại / kéo làm mới).
  public func retry() async {
    if mode == .people && !isSearching { await loadSuggestions() } else { await run() }
  }

  private func run() async {
    generation += 1
    let gen = generation, remote = self.remote, me = userId
    guard let q = CommunitySearch.query(searched, mode: mode), isSearching else {
      if mode == .people { peoplePhase = .idle } else { hitsPhase = .idle }
      return
    }
    switch mode {
    case .people:
      peoplePhase = .loading
      do {
        let rows = try await remote.searchProfiles(term: q)
        guard gen == generation else { return }
        people = rows.compactMap(CommunitySearch.person)
        peoplePhase = .ready
      } catch {
        guard gen == generation else { return }
        peoplePhase = .failed
      }
    case .recipe, .posts:
      hitsPhase = .loading
      hits = []
      let recipes = mode == .recipe
      do {
        let found: [JSONValue]
        if recipes { found = try await remote.findRecipes(term: q) } else { found = try await remote.findPosts(term: q) }
        let ids = CommunitySearch.hitIds(found)
        var posts: [CommunityFeed.Post] = []
        if !ids.isEmpty {
          let rows = try await remote.posts(ids: ids)
          posts = try await CommunityFeed.hydrate(CommunitySearch.ordered(ids: ids, rows: rows), me: me, remote: remote)
        }
        guard gen == generation else { return }
        hits = posts
        hitsPhase = .ready
      } catch {
        guard gen == generation else { return }
        hitsPhase = .failed
      }
    }
  }

  /// Theo dõi / bỏ theo dõi từ một dòng. Xong (kể cả hỏng) đọc lại gợi ý và
  /// kết quả đang thấy — chúng mang cờ "đang theo dõi".
  public func follow(_ userId: String, on: Bool) async -> CommunityPostActions.Outcome {
    guard userId != self.userId, !following.contains(userId) else { return .ignored }
    following.insert(userId)
    defer { following.remove(userId) }
    let remote = self.remote, me = self.userId
    let failure = await CommunityPostActions.attempt { try await remote.follow(me: me, userId: userId, on: on) }
    await loadSuggestions()
    if mode == .people && isSearching { await run() }
    return failure.map(CommunityPostActions.Outcome.failed) ?? .done
  }
}

// MARK: - Thích / lưu / menu bài (lát 6)

extension CommunitySearchBook: CommunityPostHost {
  public func post(id: String) -> CommunityFeed.Post? { hits.first { $0.id == id } }

  public func replace(_ post: CommunityFeed.Post) {
    if let i = hits.firstIndex(where: { $0.id == post.id }) { hits[i] = post }
  }

  public func reloadAfterAction() async { await run() }
}
