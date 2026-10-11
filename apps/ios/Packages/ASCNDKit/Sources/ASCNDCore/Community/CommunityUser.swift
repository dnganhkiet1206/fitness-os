public import Foundation
public import Observation

/// Hồ sơ cộng đồng của một người (#527, lát 5) — `app/community-user.tsx` +
/// `useCommunityUser` / `useCommunityUserKinds` / `useCommunityUserPosts` /
/// `useUserStats` / `useUserBadges` / `useProgressJourney` / `useFollow` /
/// `useMute` / `useUnmute` / `useMutedUsers` / `useBlock` / `useReport`
/// (`hooks/use-community.ts`) và `lib/progress-journey.ts` @ fac9ac2.
///
/// Chỉ những gì người ấy CHỦ ĐỘNG đưa lên — tên, giới thiệu, linh vật, bài;
/// không một con số nào đọc từ dữ liệu sức khoẻ riêng của họ. Server quyết ai
/// thấy gì (RLS: chặn, riêng tư, ẩn, tắt tiếng; RPC `community_user_stats` /
/// `community_user_badges` trả rỗng khi chưa bật hay khi chặn nhau).
public enum CommunityUser {
  /// `PostKindFilter`.
  public enum KindFilter: String, Sendable, Hashable, CaseIterable {
    case all, workout, progress, recipe
  }

  /// `KIND_ORDER`.
  public static let kindOrder: [KindFilter] = [.workout, .progress, .recipe]

  public struct Stats: Sendable, Hashable {
    public let posts: Int
    public let likes: Int
    public let tries: Int
  }

  public struct Badge: Sendable, Hashable, Identifiable {
    public let challengeId: String
    public let title: String
    public var id: String { challengeId }
  }

  /// `useCommunityUserKinds`: loại bài người ấy THẬT SỰ có, theo `KIND_ORDER`.
  public static func kinds(_ raw: [String]) -> [KindFilter] {
    let have = Set(raw)
    return kindOrder.filter { have.contains($0.rawValue) }
  }

  /// Loại đang lọc: về `all` khi loại đã chọn không còn bài.
  public static func effectiveKind(_ pick: KindFilter, kinds: [KindFilter]) -> KindFilter {
    pick != .all && !kinds.contains(pick) ? .all : pick
  }

  /// Hàng lọc chỉ hiện khi có ≥ 2 loại.
  public static func showsKindRow(_ kinds: [KindFilter]) -> Bool { kinds.count >= 2 }

  /// Thẻ Hành trình: đang xem bài Tiến trình, hoặc người ấy chỉ có loại ấy.
  public static func showsJourney(kind: KindFilter, kinds: [KindFilter]) -> Bool {
    kind == .progress || kinds == [.progress]
  }

  /// `useUserStats`: hàng đầu của RPC, `?? 0` từng ô.
  public static func stats(_ rows: [JSONValue]) -> Stats? {
    guard let r = rows.first, case .object = r else { return nil }
    let n = { (k: String) -> Int in
      if case .number(let d)? = r[k], d.isFinite, abs(d) < 1e15 { return Int(d) }
      return 0
    }
    return Stats(posts: n("posts"), likes: n("likes"), tries: n("tries"))
  }

  public static func badges(_ rows: [JSONValue]) -> [Badge] {
    rows.compactMap { r in
      guard let id = r["challenge_id"]?.stringValue, let title = r["title"]?.stringValue else { return nil }
      return Badge(challengeId: id, title: title)
    }
  }
}

/// `lib/progress-journey.ts`: mọi bài Tiến trình người xem ĐƯỢC THẤY gộp
/// thành một dòng cho mỗi chỉ số — số đầu của lần đầu tới số cuối của lần mới
/// nhất; cần ≥ 2 bài; bài nâng chỉ lấy bài tập xuất hiện nhiều nhất (hoà thì
/// bài tập của lần mới nhất).
public enum ProgressJourney {
  public enum Key: String, Sendable, Hashable { case weight, waist, lift }

  public struct Line: Sendable, Hashable {
    public let key: Key
    public let name: String?
    public let start: Double
    public let end: Double
    public let updates: Int
    public let firstAt: String
    public let lastAt: String
  }

  public struct Journey: Sendable, Hashable {
    public let lines: [Line]
    public let posts: Int
    public let firstAt: String?
    public let lastAt: String?
  }

  /// Một dòng đã đổi đơn vị (`progress-journey.tsx`): cân theo đơn vị tài
  /// khoản (`displayWeight`), eo cm (như ô eo của thẻ bài Tiến trình);
  /// `delta` = `Math.round((b − a) · 10) / 10`.
  public struct Row: Sendable, Hashable {
    public let key: Key
    public let name: String?
    public let start: Double
    public let end: Double
    public let unit: String
    public let delta: Double

    /// `+1.5 kg` / `−2 cm` / `±0 kg` — dấu trừ là "−" như RN.
    public func deltaText(locale: Locale) -> String {
      let sign = delta > 0 ? "+" : delta < 0 ? "\u{2212}" : "\u{00B1}"
      return "\(sign)\(ProgressJourney.number(abs(delta), locale: locale)) \(unit)"
    }
  }

  public static func row(_ l: Line, unit: WeightUnit) -> Row {
    let isLen = l.key == .waist
    let fmt = { (v: Double) in isLen ? Units.jsRound1(v) : unit.display(v) }
    let a = fmt(l.start), b = fmt(l.end)
    return Row(
      key: l.key, name: l.name, start: a, end: b, unit: isLen ? "cm" : unit.label, delta: JS.round((b - a) * 10) / 10)
  }

  /// `(Math.round(v * 10) / 10).toLocaleString(locale)`.
  public static func number(_ v: Double, locale: Locale) -> String {
    let f = NumberFormatter()
    f.locale = locale
    f.numberStyle = .decimal
    f.maximumFractionDigits = 3
    let r = JS.round(v * 10) / 10
    return f.string(from: NSNumber(value: r)) ?? CommunityCard.number(r)
  }

  struct Point {
    let at: String
    let start: Double
    let end: Double
  }

  /// `metric`: `{start, end}` hữu hạn (`Number(...)`), không `null`.
  static func metric(_ v: JSONValue?) -> (start: Double, end: Double)? {
    guard case .object(let o)? = v else { return nil }
    guard let s = o["start"], let e = o["end"], s != .null, e != .null else { return nil }
    let start = SessionEnergy.num(s), end = SessionEnergy.num(e)
    guard start.isFinite, end.isFinite else { return nil }
    return (start, end)
  }

  static func line(_ key: Key, _ pts: [Point], name: String? = nil) -> Line? {
    guard pts.count >= 2, let first = pts.first, let last = pts.last else { return nil }
    return Line(
      key: key, name: name, start: first.start, end: last.end, updates: pts.count, firstAt: first.at, lastAt: last.at)
  }

  /// `buildJourney(posts)` — `rows`: `id`, `created_at`, `payload`.
  public static func build(_ rows: [JSONValue]) -> Journey {
    let posts = rows.map { (id: $0["id"]?.stringValue ?? "", at: $0["created_at"]?.stringValue ?? "", payload: $0["payload"]) }
    // Cũ trước, ổn định khi trùng giờ (id phân xử).
    let sorted = posts.sorted { a, b in a.at != b.at ? a.at < b.at : a.id < b.id }
    var weight: [Point] = [], waist: [Point] = []
    var liftNames: [String] = []  // thứ tự `Map` (lần đầu gặp)
    var lifts: [String: [Point]] = [:]
    var liftLast: [String: Int] = [:]
    for (i, p) in sorted.enumerated() {
      let o: JSONValue? = { if case .object? = p.payload { return p.payload } else { return nil } }()
      if let w = metric(o?["weight"]) { weight.append(Point(at: p.at, start: w.start, end: w.end)) }
      if let w = metric(o?["waist"]) { waist.append(Point(at: p.at, start: w.start, end: w.end)) }
      let l = metric(o?["lift"])
      let name: String = {
        guard case .object(let lo)? = o?["lift"], case .string(let n)? = lo["name"] else { return "" }
        return RepEntry.trimJS(n)
      }()
      if let l, !name.isEmpty {
        if lifts[name] == nil { liftNames.append(name) }
        lifts[name, default: []].append(Point(at: p.at, start: l.start, end: l.end))
        liftLast[name] = i
      }
    }
    var liftName: String?
    for name in liftNames {
      let pts = lifts[name] ?? []
      guard let best = liftName.flatMap({ lifts[$0] }) else {
        liftName = name
        continue
      }
      if pts.count > best.count || (pts.count == best.count && (liftLast[name] ?? 0) > (liftLast[liftName!] ?? 0)) {
        liftName = name
      }
    }
    let lines = [
      line(.weight, weight), line(.waist, waist),
      liftName.flatMap { line(.lift, lifts[$0] ?? [], name: $0) },
    ].compactMap { $0 }
    return Journey(lines: lines, posts: sorted.count, firstAt: sorted.first?.at, lastAt: sorted.last?.at)
  }
}

/// Đọc / ghi màn hồ sơ một người. Mọi lệnh qua RLS; ghi ném
/// `CommunityModerationFailure`.
public protocol CommunityUserRemote: CommunityFeedRemote {
  /// Hàng `community_profiles` (`profileColumns`), `nil` khi không có / không
  /// được thấy.
  func userProfile(id: String) async throws -> JSONValue?
  /// `count: 'exact', head: true` trên `community_follows`.
  func followCounts(userId: String) async throws -> (followers: Int, following: Int)
  func iFollow(me: String, userId: String) async throws -> Bool
  /// Cột `kind` của tối đa 500 bài của người ấy.
  func userKinds(userId: String) async throws -> [String]
  func userStats(userId: String) async throws -> [JSONValue]
  func userBadges(userId: String) async throws -> [JSONValue]
  /// `community_mutes` của mình còn hạn: `muted_id`, `until`.
  func mutes(me: String, nowISO: String) async throws -> [JSONValue]
  /// Tối đa 100 bài Tiến trình (`id, created_at, payload`), mới → cũ.
  func journeyPosts(userId: String) async throws -> [JSONValue]
  func follow(me: String, userId: String, on: Bool) async throws
  func mute(me: String, userId: String) async throws
  func unmute(me: String, userId: String) async throws
  func block(me: String, userId: String) async throws
  func reportUser(me: String, userId: String, reason: CommunityReportReason) async throws
}

@MainActor @Observable
public final class CommunityUserBook {
  public enum Phase: Sendable, Hashable {
    case loading
    case failed
    /// Không có hồ sơ (đã xoá / không được thấy).
    case gone
    case ready
  }

  public enum ActionResult: Sendable, Hashable {
    case done
    case failed(CommunityModerationFailure)
    case ignored
  }

  public let userId: String
  public let targetId: String
  public private(set) var phase: Phase = .loading
  public private(set) var profile: CommunityFeed.Author?
  public private(set) var followers = 0
  public private(set) var following = 0
  public private(set) var iFollow = false
  public var isMe: Bool { targetId == userId }
  public private(set) var kinds: [CommunityUser.KindFilter] = []
  public private(set) var pick: CommunityUser.KindFilter = .all
  public var kind: CommunityUser.KindFilter { CommunityUser.effectiveKind(pick, kinds: kinds) }
  public private(set) var stats: CommunityUser.Stats?
  public private(set) var badges: [CommunityUser.Badge] = []
  /// Hạn tắt tiếng người này (ISO), `nil` khi không tắt tiếng.
  public private(set) var mutedUntil: String?
  public private(set) var posts: [CommunityFeed.Post] = []
  public private(set) var postsPhase: CommunityFeedBook.Phase = .loading
  public private(set) var canLoadMore = false
  public private(set) var loadingMore = false
  public private(set) var moreFailed = false
  public private(set) var journey: ProgressJourney.Journey?
  public private(set) var working = false

  @ObservationIgnored private let remote: any CommunityUserRemote
  @ObservationIgnored private let clock: any WallClock
  @ObservationIgnored private var generation = 0
  @ObservationIgnored private var closed = false

  public init(userId: String, targetId: String, remote: any CommunityUserRemote, clock: any WallClock = SystemWallClock()) {
    self.userId = userId
    self.targetId = targetId
    self.remote = remote
    self.clock = clock
  }

  public func close() { closed = true }

  public func artURL(_ art: CommunityFeed.Art) -> URL? { remote.artURL(path: art.path) }

  public var showsKindRow: Bool { CommunityUser.showsKindRow(kinds) }
  public var showsJourney: Bool { CommunityUser.showsJourney(kind: kind, kinds: kinds) }

  // MARK: - Đọc

  /// Hồ sơ + số theo dõi (bắt buộc); loại bài / thống kê / huy hiệu / tắt
  /// tiếng (hỏng thì phần ấy ẩn); rồi trang bài đầu.
  public func load() async {
    let remote = self.remote, me = userId, id = targetId
    do {
      async let prof = remote.userProfile(id: id)
      async let counts = remote.followCounts(userId: id)
      async let mine = remote.iFollow(me: me, userId: id)
      let (p, c, f) = try await (prof, counts, mine)
      guard !closed else { return }
      guard let p, let author = CommunityFeed.author(p) else {
        profile = nil
        phase = .gone
        return
      }
      profile = author
      followers = c.followers
      following = c.following
      iFollow = f
      phase = .ready
    } catch {
      guard !closed else { return }
      if phase != .ready { phase = .failed }
      return
    }
    await loadSide()
    await reloadPosts()
  }

  private func loadSide() async {
    let remote = self.remote, me = userId, id = targetId
    let nowISO = WorkoutSessionRecord.iso8601(clock.nowMillis())
    async let k = capture { try await remote.userKinds(userId: id) }
    async let s = capture { try await remote.userStats(userId: id) }
    async let b = capture { try await remote.userBadges(userId: id) }
    async let m = capture { try await remote.mutes(me: me, nowISO: nowISO) }
    let (kr, sr, br, mr) = await (k, s, b, m)
    guard !closed else { return }
    if let raw = try? kr.get() { kinds = CommunityUser.kinds(raw) }
    stats = (try? sr.get()).flatMap(CommunityUser.stats)
    badges = (try? br.get()).map(CommunityUser.badges) ?? []
    if let rows = try? mr.get() {
      mutedUntil = rows.first { $0["muted_id"]?.stringValue == id }?["until"]?.stringValue
    }
    if showsJourney { await loadJourney() }
  }

  private func loadJourney() async {
    let remote = self.remote, id = targetId
    guard let rows = try? await remote.journeyPosts(userId: id), !closed else { return }
    journey = ProgressJourney.build(rows)
  }

  /// Đổi bộ lọc loại (lọc Ở SERVER).
  public func select(_ k: CommunityUser.KindFilter) async {
    guard k != pick else { return }
    pick = k
    if showsJourney && journey == nil { await loadJourney() }
    await reloadPosts()
  }

  public func reloadPosts() async {
    generation += 1
    let gen = generation
    if posts.isEmpty { postsPhase = .loading }
    do {
      let page = try await fetchPage(cursor: nil)
      guard !closed, gen == generation else { return }
      posts = page
      canLoadMore = CommunityPayloads.nextCursor(page.map { (createdAt: $0.createdAt, id: $0.id) }, size: CommunityFeed.page) != nil
      moreFailed = false
      postsPhase = .ready
    } catch {
      guard !closed, gen == generation else { return }
      if postsPhase != .ready { postsPhase = .failed }
    }
  }

  public func loadMore() async {
    guard postsPhase == .ready, canLoadMore, !loadingMore, !closed,
      let cursor = CommunityPayloads.nextCursor(posts.map { (createdAt: $0.createdAt, id: $0.id) }, size: CommunityFeed.page)
    else { return }
    let gen = generation
    loadingMore = true
    defer { loadingMore = false }
    do {
      let page = try await fetchPage(cursor: cursor)
      guard !closed, gen == generation else { return }
      let seen = Set(posts.map(\.id))
      posts += page.filter { !seen.contains($0.id) }
      canLoadMore = CommunityPayloads.nextCursor(page.map { (createdAt: $0.createdAt, id: $0.id) }, size: CommunityFeed.page) != nil
      moreFailed = false
    } catch {
      guard !closed, gen == generation else { return }
      moreFailed = true
    }
  }

  private func fetchPage(cursor: CommunityPayloads.Cursor?) async throws -> [CommunityFeed.Post] {
    var q = CommunityPostQuery()
    q.authors = [targetId]
    if kind != .all { q.kinds = [kind.rawValue] }
    q.cursorFilter = cursor.map { CommunityPayloads.olderThan($0) }
    let remote = self.remote, me = userId
    let rows = try await remote.posts(q)
    return try await CommunityFeed.hydrate(rows, me: me, remote: remote)
  }

  // MARK: - Ghi

  /// Theo dõi / bỏ theo dõi; xong (kể cả hỏng) thì đọc lại số theo dõi
  /// (`onSettled` của RN).
  public func toggleFollow() async -> ActionResult {
    guard phase == .ready, !isMe, !working, !closed else { return .ignored }
    let on = !iFollow
    let result = await act { [remote, userId, targetId] in try await remote.follow(me: userId, userId: targetId, on: on) }
    await refreshCounts()
    return result
  }

  public func mute() async -> ActionResult {
    guard phase == .ready, !isMe, mutedUntil == nil, !working, !closed else { return .ignored }
    let result = await act { [remote, userId, targetId] in try await remote.mute(me: userId, userId: targetId) }
    if result == .done { await refreshMutesAndPosts() }
    return result
  }

  public func unmute() async -> ActionResult {
    guard phase == .ready, mutedUntil != nil, !working, !closed else { return .ignored }
    let result = await act { [remote, userId, targetId] in try await remote.unmute(me: userId, userId: targetId) }
    if result == .done { await refreshMutesAndPosts() }
    return result
  }

  /// Chặn: thành công thì màn đóng (`nav.back()`).
  public func block() async -> ActionResult {
    guard phase == .ready, !isMe, !working, !closed else { return .ignored }
    return await act { [remote, userId, targetId] in try await remote.block(me: userId, userId: targetId) }
  }

  public func report() async -> ActionResult {
    guard phase == .ready, !isMe, !working, !closed else { return .ignored }
    return await act { [remote, userId, targetId] in
      try await remote.reportUser(me: userId, userId: targetId, reason: .inappropriate)
    }
  }

  private func act(_ body: @Sendable () async throws -> Void) async -> ActionResult {
    working = true
    defer { working = false }
    do {
      try await body()
      return .done
    } catch let f as CommunityModerationFailure {
      return .failed(f)
    } catch {
      return .failed(.server(code: nil))
    }
  }

  private func refreshCounts() async {
    let remote = self.remote, me = userId, id = targetId
    async let c = capture { try await remote.followCounts(userId: id) }
    async let f = capture { try await remote.iFollow(me: me, userId: id) }
    let (cr, fr) = await (c, f)
    guard !closed else { return }
    if let v = try? cr.get() {
      followers = v.followers
      following = v.following
    }
    if let v = try? fr.get() { iFollow = v }
  }

  private func refreshMutesAndPosts() async {
    let remote = self.remote, me = userId, id = targetId
    let nowISO = WorkoutSessionRecord.iso8601(clock.nowMillis())
    if let rows = try? await remote.mutes(me: me, nowISO: nowISO), !closed {
      mutedUntil = rows.first { $0["muted_id"]?.stringValue == id }?["until"]?.stringValue
    }
    await reloadPosts()
  }
}
