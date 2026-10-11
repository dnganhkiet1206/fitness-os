public import Foundation
public import Observation

/// Hộp thông báo Cộng đồng (#527, lát 9) — `app/community-inbox.tsx` +
/// `useInbox` / `useMarkInboxRead` / `localizeChallenge`
/// (`hooks/use-community.ts`) @ fac9ac2.
///
/// Như RN:
/// - 100 thông báo mới nhất; lượt THÍCH cùng một bài gộp một dòng (người mới
///   nhất đứng đầu, "và N người khác" đếm cả người không còn hồ sơ); bình
///   luận / theo dõi / trả lời / nhắc / lưu / thử mỗi cái một dòng; mốc thử
///   thách 50 / 100 nói TÊN thử thách (dịch khi đọc); loại lạ bỏ; dòng không
///   còn ai có hồ sơ bỏ;
/// - mở màn = đánh dấu cả hộp đã đọc (một RPC, hỏng thì im — lần mở sau đánh
///   dấu lại), nhưng dòng chưa đọc LÚC MỞ giữ chấm "mới" tới khi rời màn;
/// - chạm: mốc → thử thách; theo dõi → hồ sơ người ấy; còn lại → bài.
public enum CommunityInbox {
  public static let limit = 100

  public enum Kind: String, Sendable, Hashable, CaseIterable {
    case like, comment, follow, reply, mention, save
    case tryWorkout = "try"
    case challengeMilestone = "challenge_milestone"
  }

  public struct Challenge: Sendable, Hashable {
    public let id: String
    public let title: String
    /// 50 hoặc 100.
    public let milestone: Int
  }

  public struct Item: Sendable, Hashable, Identifiable {
    public let key: String
    public let kind: Kind
    /// Người mới nhất đứng đầu; chỉ người còn hồ sơ.
    public internal(set) var actors: [CommunityFeed.Author]
    /// Tổng số người, kể cả người không còn hồ sơ.
    public internal(set) var count: Int
    public let postId: String?
    public let at: String
    public internal(set) var unread: Bool
    public let challenge: Challenge?
    public var id: String { key }
  }

  /// `localizeChallenge`: tiếng Anh dùng `title_en` khi có chữ.
  public static func challengeTitle(_ row: JSONValue, lang: String) -> String {
    let vi = row["title"]?.stringValue ?? ""
    guard lang == "en", let en = row["title_en"]?.stringValue, !RepEntry.trimJS(en).isEmpty else { return vi }
    return en
  }

  /// Thân `queryFn` của `useInbox` (hàng đã mới → cũ).
  public static func build(rows: [JSONValue], profiles: [JSONValue], challenges: [JSONValue], lang: String) -> [Item] {
    var byId: [String: CommunityFeed.Author] = [:]
    for p in profiles { if let a = CommunityFeed.author(p) { byId[a.userId] = a } }
    var chById: [String: (id: String, title: String)] = [:]
    for c in challenges {
      if let id = c["id"]?.stringValue { chById[id] = (id, challengeTitle(c, lang: lang)) }
    }
    var out: [Item] = []
    var likeAt: [String: Int] = [:]
    for r in rows {
      guard let kind = r["kind"]?.stringValue.flatMap(Kind.init(rawValue:)) else { continue }
      let key = r["id"]?.stringValue ?? ""
      let at = r["created_at"]?.stringValue ?? ""
      let unread = r["read_at"] == .null
      if kind == .challengeMilestone {
        let m = r["milestone"]?.doubleValue
        guard let cid = r["challenge_id"]?.stringValue, let ch = chById[cid], m == 50 || m == 100 else { continue }
        out.append(
          Item(
            key: key, kind: kind, actors: [], count: 1, postId: nil, at: at, unread: unread,
            challenge: Challenge(id: ch.id, title: ch.title, milestone: Int(m ?? 0))))
        continue
      }
      let actor = r["actor_id"]?.stringValue.flatMap { byId[$0] }
      let postId = r["post_id"]?.stringValue
      if kind == .like, let postId, !postId.isEmpty {
        if let i = likeAt[postId] {
          out[i].count += 1
          if let actor { out[i].actors.append(actor) }
          out[i].unread = out[i].unread || unread
          continue
        }
        likeAt[postId] = out.count
        out.append(
          Item(
            key: "like:\(postId)", kind: kind, actors: actor.map { [$0] } ?? [], count: 1, postId: postId, at: at,
            unread: unread, challenge: nil))
        continue
      }
      out.append(
        Item(
          key: key, kind: kind, actors: actor.map { [$0] } ?? [], count: 1, postId: postId, at: at, unread: unread,
          challenge: nil))
    }
    return out.filter { !$0.actors.isEmpty || $0.challenge != nil }
  }

  /// Câu của một dòng (`sentence` của màn).
  public enum Sentence: Sendable, Hashable {
    case follow, comment, reply, mention, save, tryWorkout
    case challengeDone, challengeHalf
    case like
    /// "{name} và N người khác".
    case likeMany(others: Int)
  }

  public static func sentence(_ x: Item) -> Sentence {
    switch x.kind {
    case .follow: return .follow
    case .comment: return .comment
    case .reply: return .reply
    case .mention: return .mention
    case .save: return .save
    case .tryWorkout: return .tryWorkout
    default:
      if let ch = x.challenge { return ch.milestone == 100 ? .challengeDone : .challengeHalf }
      return x.count > 1 ? .likeMany(others: x.count - 1) : .like
    }
  }

  public enum Target: Sendable, Hashable {
    case challenge(String)
    case user(String)
    case post(String)
  }

  /// `open`: mốc → thử thách; theo dõi → hồ sơ; còn lại → bài (nếu có).
  public static func target(_ x: Item) -> Target? {
    if let ch = x.challenge { return .challenge(ch.id) }
    if x.kind == .follow, let a = x.actors.first { return .user(a.userId) }
    if let p = x.postId, !p.isEmpty { return .post(p) }
    return nil
  }
}

public protocol CommunityInboxRemote: Sendable {
  /// `community_notifications` của mình, mới → cũ, tối đa `limit`.
  func notifications(me: String, limit: Int) async throws -> [JSONValue]
  func profiles(ids: [String]) async throws -> [JSONValue]
  /// `community_challenges` (`id, title, title_en, …`) theo id.
  func challenges(ids: [String]) async throws -> [JSONValue]
  /// RPC `community_mark_notifications_read`.
  func markNotificationsRead() async throws
}

/// Hộp thư của MỘT tài khoản — dùng chung cho chuông trên feed (chấm "mới") và
/// màn hộp thư.
@MainActor @Observable
public final class CommunityInboxBook {
  public let userId: String
  public private(set) var phase: CommunityFeedBook.Phase = .loading
  public private(set) var items: [CommunityInbox.Item] = []
  /// Dòng chưa đọc lúc MỞ màn (`nil` khi chưa mở / chưa đọc xong).
  public private(set) var fresh: Set<String>?

  @ObservationIgnored private let remote: any CommunityInboxRemote
  @ObservationIgnored private var generation = 0
  @ObservationIgnored private var viewing = false

  public init(userId: String, remote: any CommunityInboxRemote) {
    self.userId = userId
    self.remote = remote
  }

  /// Chấm trên chuông: còn dòng chưa đọc.
  public var hasNew: Bool { items.contains { $0.unread } }

  /// Chấm "mới" của một dòng: theo ảnh chụp lúc mở, chưa có thì theo server.
  public func isNew(_ x: CommunityInbox.Item) -> Bool { fresh.map { $0.contains(x.key) } ?? x.unread }

  public func load(lang: String) async {
    generation += 1
    let gen = generation, remote = self.remote, me = userId
    if items.isEmpty { phase = .loading }
    do {
      let rows = try await remote.notifications(me: me, limit: CommunityInbox.limit)
      var profiles: [JSONValue] = []
      var challenges: [JSONValue] = []
      if !rows.isEmpty {
        let actorIds = Self.unique(rows.compactMap { $0["actor_id"]?.stringValue })
        let chIds = Self.unique(rows.compactMap { $0["challenge_id"]?.stringValue })
        if !actorIds.isEmpty { profiles = try await remote.profiles(ids: actorIds) }
        if !chIds.isEmpty { challenges = try await remote.challenges(ids: chIds) }
      }
      guard gen == generation else { return }
      items = CommunityInbox.build(rows: rows, profiles: profiles, challenges: challenges, lang: lang)
      phase = .ready
      if viewing && fresh == nil { await snapshot() }
    } catch {
      guard gen == generation else { return }
      if phase != .ready { phase = .failed }
    }
  }

  /// Mở màn hộp thư: chụp dòng chưa đọc rồi đánh dấu cả hộp đã đọc.
  public func beginViewing(lang: String) async {
    viewing = true
    fresh = nil
    if phase == .ready { await snapshot() }
    await load(lang: lang)
  }

  private func snapshot() async {
    let unread = Set(items.filter(\.unread).map(\.key))
    fresh = unread
    guard !unread.isEmpty else { return }
    // Im lặng CÓ CHỦ Ý: hỏng thì lần mở sau đánh dấu lại.
    let remote = self.remote
    guard (try? await remote.markNotificationsRead()) != nil else { return }
    for i in items.indices { items[i].unread = false }
  }

  private static func unique(_ xs: [String]) -> [String] {
    var seen = Set<String>()
    return xs.filter { seen.insert($0).inserted }
  }
}
