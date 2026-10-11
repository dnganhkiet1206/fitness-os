public import Foundation
public import Observation

/// Thử thách cộng đồng (#527, lát 14) — `app/community-challenges.tsx` +
/// `app/community-challenge.tsx` + `components/ascnd/challenge-hero.tsx` +
/// `useChallenges` / `useChallengeHistory` / `useJoinChallenge` /
/// `useClaimChallenge` / `localizeChallenge` (`hooks/use-community.ts`) +
/// `lib/challenge-reminders.ts` @ fac9ac2.
///
/// Như RN:
/// - tổng quan từ RPC `community_challenges_overview` (độ lệch giờ HIỆN TẠI
///   của máy — server đếm ngày có tập theo giờ địa phương), lịch sử từ
///   `community_challenge_history` (số xu ĐÃ VÀO SỔ);
/// - bốn nhóm: Đang tham gia (đã đạt trước, rồi sắp hết hạn trước), Đang mở
///   (đông người trước), Sắp bắt đầu (gần ngày mở trước), Đã hoàn thành;
/// - thẻ nổi bật: cái đang theo mà chưa nhận, không thì cái đông người nhất
///   còn mở;
/// - đã đạt + đã hết hạn + chưa nhận → còn 7 ngày để nhận (`pendingClaims`);
/// - tham gia: chèn kèm `offset_min` (23505 = đã tham gia); rời: phải chạm
///   ≥ 1 hàng; nhận: RPC `claim_community_challenge` trả số xu.
public enum CommunityChallenges {
  /// `CLAIM_WINDOW_DAYS` — phải bằng `current_date - 7` của tổng quan.
  public static let claimWindowDays = 7

  public struct Challenge: Sendable, Hashable, Identifiable {
    public let id: String
    public let title: String
    public let description: String
    public let target: Int
    public let startsOn: String
    public let endsOn: String
    public let rewardCoins: Int
    public let participants: Int
    public let joined: Bool
    public let progress: Int
    public let claimed: Bool
    /// Dựng lại từ lịch sử (hết hạn quá 7 ngày): không có số người tham gia.
    public let fromHistory: Bool

    public var reached: Bool { progress >= target }
    /// `Math.min(100, progress / target × 100)`.
    public var percent: Double { target > 0 ? min(100, Double(progress) / Double(target) * 100) : 100 }
  }

  public struct HistoryItem: Sendable, Hashable, Identifiable {
    public let id: String
    public let title: String
    public let description: String
    public let target: Int
    public let startsOn: String
    public let endsOn: String
    public let coins: Int
    public let claimedAt: String
  }

  static func int(_ v: JSONValue?) -> Int {
    guard let d = v?.doubleValue, d.isFinite else { return 0 }
    return Int(d)
  }

  /// `localizeChallenge`: tiếng Anh dùng bản `_en` khi có chữ.
  static func localized(_ r: JSONValue, _ key: String, lang: String) -> String {
    let base = r[key]?.stringValue ?? ""
    guard lang == "en", let en = r["\(key)_en"]?.stringValue, !RepEntry.trimJS(en).isEmpty else { return base }
    return en
  }

  public static func challenge(_ r: JSONValue, lang: String) -> Challenge? {
    guard let id = r["id"]?.stringValue else { return nil }
    return Challenge(
      id: id, title: localized(r, "title", lang: lang), description: localized(r, "description", lang: lang),
      target: int(r["target"]), startsOn: r["starts_on"]?.stringValue ?? "", endsOn: r["ends_on"]?.stringValue ?? "",
      rewardCoins: int(r["reward_coins"]), participants: int(r["participants"]), joined: r["joined"] == .bool(true),
      progress: int(r["progress"]), claimed: r["claimed"] == .bool(true), fromHistory: false)
  }

  public static func historyItem(_ r: JSONValue, lang: String) -> HistoryItem? {
    guard let id = r["id"]?.stringValue else { return nil }
    return HistoryItem(
      id: id, title: localized(r, "title", lang: lang), description: localized(r, "description", lang: lang),
      target: int(r["target"]), startsOn: r["starts_on"]?.stringValue ?? "", endsOn: r["ends_on"]?.stringValue ?? "",
      coins: int(r["coins"]), claimedAt: r["claimed_at"]?.stringValue ?? "")
  }

  /// Thử thách đã hết hạn quá 7 ngày, mở từ "Đã hoàn thành": đã tham gia, đã
  /// đạt, đã nhận; phần thưởng là số ĐÃ VÀO SỔ.
  public static func fromHistory(_ h: HistoryItem) -> Challenge {
    Challenge(
      id: h.id, title: h.title, description: h.description, target: h.target, startsOn: h.startsOn, endsOn: h.endsOn,
      rewardCoins: h.coins, participants: 0, joined: true, progress: h.target, claimed: true, fromHistory: true)
  }

  /// `dayGap` (`lib/local-date.ts`): ngày lịch từ `from` tới `to`; ngày hỏng
  /// → `nil` (RN: `NaN`, mọi phép so đều sai).
  public static func dayGap(_ from: String, _ to: String) -> Int? {
    guard let a = LocalDate(from), let b = LocalDate(to) else { return nil }
    return b.daysSinceEpoch - a.daysSinceEpoch
  }

  public struct Groups: Sendable, Hashable {
    public let joined: [Challenge]
    public let open: [Challenge]
    public let soon: [Challenge]
  }

  /// Ba nhóm đầu của trang thử thách (sắp xếp ổn định như `Array.sort`).
  public static func groups(_ all: [Challenge], today: String) -> Groups {
    func stable(_ xs: [Challenge], _ before: (Challenge, Challenge) -> Bool?) -> [Challenge] {
      xs.enumerated().sorted { x, y in before(x.element, y.element) ?? (x.offset < y.offset) }.map(\.element)
    }
    let joined = stable(all.filter { $0.joined && !$0.claimed }) { a, b in
      if a.reached != b.reached { return a.reached }
      return a.endsOn == b.endsOn ? nil : a.endsOn < b.endsOn
    }
    let open = stable(
      all.filter { x in
        !x.joined && (dayGap(today, x.startsOn).map { $0 <= 0 } ?? false)
          && (dayGap(today, x.endsOn).map { $0 >= 0 } ?? false)
      }
    ) { a, b in a.participants == b.participants ? nil : a.participants > b.participants }
    let soon = stable(all.filter { !$0.joined && (dayGap(today, $0.startsOn).map { $0 > 0 } ?? false) }) { a, b in
      a.startsOn == b.startsOn ? nil : a.startsOn < b.startsOn
    }
    return Groups(joined: joined, open: open, soon: soon)
  }

  /// `featuredChallenge`: cái đang theo mà chưa nhận, rồi cái đông người nhất
  /// (trong những cái chưa hết hạn).
  public static func featured(_ items: [Challenge], today: String) -> Challenge? {
    let open = items.filter { dayGap(today, $0.endsOn).map { $0 >= 0 } ?? false }
    if let mine = open.first(where: { $0.joined && !$0.claimed }) { return mine }
    return open.enumerated().sorted { x, y in
      x.element.participants != y.element.participants
        ? x.element.participants > y.element.participants : x.offset < y.offset
    }.first?.element
  }

  public struct Pending: Sendable, Hashable, Identifiable {
    public let challenge: Challenge
    /// 0 = hôm nay là ngày cuối để nhận.
    public let daysLeft: Int
    public var id: String { challenge.id }
  }

  /// `pendingClaims`: đã đạt, đã hết hạn, chưa nhận, còn trong cửa sổ; sắp
  /// hết hạn nhận trước.
  public static func pendingClaims(_ items: [Challenge], today: String) -> [Pending] {
    let due: [Pending] = items.compactMap { x in
      guard x.joined, !x.claimed, x.reached, let gap = dayGap(today, x.endsOn), gap < 0,
        let end = LocalDate(x.endsOn), let left = dayGap(today, end.adding(days: claimWindowDays).description),
        left >= 0
      else { return nil }
      return Pending(challenge: x, daysLeft: left)
    }
    return due.enumerated().sorted { a, b in
      a.element.daysLeft != b.element.daysLeft ? a.element.daysLeft < b.element.daysLeft : a.offset < b.offset
    }.map(\.element)
  }
}

public protocol CommunityChallengesRemote: Sendable {
  /// RPC `community_challenges_overview(p_offset_min)`.
  func challengesOverview(offsetMinutes: Int) async throws -> [JSONValue]
  /// RPC `community_challenge_history()`.
  func challengeHistory() async throws -> [JSONValue]
  /// Chèn (23505 = đã tham gia) / xoá (phải chạm ≥ 1 hàng).
  func setChallengeMembership(me: String, challengeId: String, join: Bool, offsetMinutes: Int) async throws
  /// RPC `claim_community_challenge` → số xu đã vào sổ.
  func claimChallenge(_ challengeId: String, offsetMinutes: Int) async throws -> Int
}

/// Thử thách cộng đồng của MỘT tài khoản — thẻ Khám phá, trang thử thách,
/// màn một thử thách, thẻ nhắc trong hộp thư dùng chung.
@MainActor @Observable
public final class CommunityChallengesBook {
  public let userId: String
  public private(set) var phase: CommunityFeedBook.Phase = .loading
  public private(set) var items: [CommunityChallenges.Challenge] = []
  public private(set) var historyPhase: CommunityFeedBook.Phase = .loading
  public private(set) var history: [CommunityChallenges.HistoryItem] = []
  /// Thử thách đang có lệnh tham gia / rời / nhận chưa xong.
  public private(set) var working: Set<String> = []

  @ObservationIgnored private let remote: any CommunityChallengesRemote
  @ObservationIgnored private let clock: any WallClock
  @ObservationIgnored private let offset: @Sendable () -> Int

  public init(
    userId: String, remote: any CommunityChallengesRemote, clock: any WallClock = SystemWallClock(),
    offsetMinutes: @escaping @Sendable () -> Int = { TimeZone.current.secondsFromGMT() / 60 }
  ) {
    self.userId = userId
    self.remote = remote
    self.clock = clock
    self.offset = offsetMinutes
  }

  /// Hôm nay theo giờ máy (`localDateStr()`).
  public var today: String { LocalDate(clock.nowMillis(), in: .current).description }

  public var groups: CommunityChallenges.Groups { CommunityChallenges.groups(items, today: today) }
  public var featured: CommunityChallenges.Challenge? { CommunityChallenges.featured(items, today: today) }
  public var pending: [CommunityChallenges.Pending] { CommunityChallenges.pendingClaims(items, today: today) }

  /// Một thử thách: bản sống, hoặc dựng lại từ lịch sử.
  public func challenge(_ id: String) -> CommunityChallenges.Challenge? {
    items.first { $0.id == id } ?? history.first { $0.id == id }.map(CommunityChallenges.fromHistory)
  }

  public func load(lang: String) async {
    let remote = self.remote, offset = self.offset()
    if phase != .ready { phase = .loading }
    do {
      let rows = try await remote.challengesOverview(offsetMinutes: offset)
      items = rows.compactMap { CommunityChallenges.challenge($0, lang: lang) }
      phase = .ready
    } catch {
      if phase != .ready { phase = .failed }
    }
  }

  public func loadHistory(lang: String) async {
    let remote = self.remote
    if historyPhase != .ready { historyPhase = .loading }
    do {
      let rows = try await remote.challengeHistory()
      history = rows.compactMap { CommunityChallenges.historyItem($0, lang: lang) }
      historyPhase = .ready
    } catch {
      if historyPhase != .ready { historyPhase = .failed }
    }
  }

  /// Tham gia / rời; xong (kể cả hỏng) đọc lại tổng quan.
  public func setJoined(_ id: String, _ on: Bool, lang: String) async -> CommunityPostActions.Outcome {
    guard !working.contains(id) else { return .ignored }
    working.insert(id)
    defer { working.remove(id) }
    let remote = self.remote, me = userId, offset = self.offset()
    let failure = await CommunityPostActions.attempt {
      try await remote.setChallengeMembership(me: me, challengeId: id, join: on, offsetMinutes: offset)
    }
    await load(lang: lang)
    return failure.map(CommunityPostActions.Outcome.failed) ?? .done
  }

  public enum ClaimResult: Sendable, Hashable {
    /// Số xu đã vào sổ, và tên thử thách (để chúc mừng).
    case claimed(coins: Int, title: String)
    case failed(CommunityModerationFailure)
    case ignored
  }

  /// Nhận thưởng; xong đọc lại tổng quan + lịch sử.
  public func claim(_ id: String, lang: String) async -> ClaimResult {
    guard !working.contains(id) else { return .ignored }
    working.insert(id)
    defer { working.remove(id) }
    let remote = self.remote, offset = self.offset()
    let title = challenge(id)?.title ?? ""
    do {
      let coins = try await remote.claimChallenge(id, offsetMinutes: offset)
      await load(lang: lang)
      await loadHistory(lang: lang)
      return .claimed(coins: coins, title: title)
    } catch let f as CommunityModerationFailure {
      return .failed(f)
    } catch {
      return .failed(.server(code: nil))
    }
  }
}
