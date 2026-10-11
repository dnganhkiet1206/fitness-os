public import Foundation
public import Observation

/// Quyền riêng tư Cộng đồng (#527, lát 10) — `app/community-privacy.tsx` +
/// `readCommunitySettings` / `readDiscoverKinds` / `useSetDefaultVisibility` /
/// `useSetShowBadges` / `useSetNotify` / `useSetDiscoverKinds` /
/// `useBlockedUsers` / `useUnblock` / `useMutedUsers` / `useUnmute` /
/// `useDeleteAllMyPosts` (`hooks/use-community.ts`) @ fac9ac2.
///
/// Như RN:
/// - cài đặt ở bảng riêng chỉ chủ nhân đọc; chưa có dòng = mặc định của cột
///   (công khai, huy hiệu TẮT, mọi thông báo BẬT, Khám phá cả ba loại);
/// - mỗi lựa chọn ghi một `upsert` theo `user_id`; trong lúc ghi hiện giá trị
///   vừa chọn; xong (kể cả hỏng) đọc lại;
/// - Khám phá: công tắc cuối cùng còn bật không tắt được;
/// - Đã chặn mới → cũ, bỏ chặn hỏi lại, phải chạm ≥ 1 hàng, không tự theo dõi
///   lại; Đã tắt tiếng (còn hạn, sắp hết trước) chỉ hiện khi có ai, bỏ không
///   hỏi lại;
/// - Xoá mọi bài của tôi: hỏi hai lần, trả về số bài đã xoá (0 là câu trả lời
///   đúng); hồ sơ giữ nguyên.
public enum CommunityPrivacy {
  public enum Visibility: String, Sendable, Hashable {
    case `public`, followers
  }

  /// Nhóm thông báo, đúng thứ tự trên màn (`NOTIFY_KEYS`).
  public enum NotifyKey: String, Sendable, Hashable, CaseIterable {
    case likes, comments, mentions, follows, saves, tries, challenges
    public var column: String { "notify_\(rawValue)" }
  }

  public struct Settings: Sendable, Hashable {
    public var defaultVisibility: Visibility
    public var showBadges: Bool
    public var notify: [NotifyKey: Bool]
    public var discoverKinds: [String]
  }

  public static let columns =
    "default_visibility, show_badges, discover_kinds, "
    + NotifyKey.allCases.map(\.column).joined(separator: ", ")

  /// `readCommunitySettings` (hàng hoặc `nil`).
  public static func settings(_ row: JSONValue?) -> Settings {
    var notify: [NotifyKey: Bool] = [:]
    for k in NotifyKey.allCases { notify[k] = row?[k.column] != .bool(false) }
    return Settings(
      defaultVisibility: row?["default_visibility"] == .string("followers") ? .followers : .public,
      showBadges: row?["show_badges"] == .bool(true),
      notify: notify,
      discoverKinds: CommunityPayloads.discover(row?["discover_kinds"]))
  }

  /// Bật / tắt một loại ở Khám phá — thứ tự catalog.
  public static func kinds(_ kinds: [String], toggling k: String, on: Bool) -> [String] {
    CommunityPayloads.discoverKinds.filter { $0 == k ? on : kinds.contains($0) }
  }

  /// Công tắc cuối cùng còn bật thì khoá.
  public static func isLastOn(_ kinds: [String], _ k: String) -> Bool { kinds.contains(k) && kinds.count == 1 }

  /// Một người trong danh sách chặn / tắt tiếng; hồ sơ `nil` = đã xoá hồ sơ.
  public struct Person: Sendable, Hashable, Identifiable {
    public let userId: String
    /// Chặn: lúc chặn. Tắt tiếng: hạn.
    public let at: String
    public let profile: CommunityFeed.Author?
    public var id: String { userId }
  }

  /// `rows.map(r => ({user_id: r[idCol], …, profile: byId.get(…) ?? null}))`.
  public static func people(rows: [JSONValue], idColumn: String, atColumn: String, profiles: [JSONValue]) -> [Person] {
    var byId: [String: CommunityFeed.Author] = [:]
    for p in profiles { if let a = CommunityFeed.author(p) { byId[a.userId] = a } }
    return rows.compactMap { r in
      guard let id = r[idColumn]?.stringValue else { return nil }
      return Person(userId: id, at: r[atColumn]?.stringValue ?? "", profile: byId[id])
    }
  }
}

public protocol CommunityPrivacyRemote: Sendable {
  /// Hàng `community_settings` (cột `CommunityPrivacy.columns`) hoặc `nil`.
  func privacySettings(me: String) async throws -> JSONValue?
  /// `upsert` theo `user_id` với `updated_at` mới.
  func updateSettings(me: String, patch: [String: JSONValue]) async throws
  /// `community_blocks` của mình (`blocked_id, created_at`), mới → cũ.
  func blocks(me: String) async throws -> [JSONValue]
  func mutes(me: String, nowISO: String) async throws -> [JSONValue]
  func profiles(ids: [String]) async throws -> [JSONValue]
  /// Phải chạm ≥ 1 hàng (`nothingWritten`).
  func unblock(me: String, userId: String) async throws
  func unmute(me: String, userId: String) async throws
  /// Số bài đã xoá.
  func deleteAllPosts(me: String) async throws -> Int
}

@MainActor @Observable
public final class CommunityPrivacyBook {
  public let userId: String
  public private(set) var settingsPhase: CommunityFeedBook.Phase = .loading
  public private(set) var settings = CommunityPrivacy.settings(nil)
  public private(set) var blocked: [CommunityPrivacy.Person] = []
  public private(set) var blockedPhase: CommunityFeedBook.Phase = .loading
  public private(set) var muted: [CommunityPrivacy.Person] = []
  public private(set) var mutedPhase: CommunityFeedBook.Phase = .loading
  /// Người đang có lệnh bỏ chặn / bỏ tắt tiếng chưa xong.
  public private(set) var working: Set<String> = []
  public private(set) var wiping = false
  /// Lựa chọn đang ghi (hiện thay cho giá trị server trong lúc chờ).
  public private(set) var pendingVisibility: CommunityPrivacy.Visibility?
  public private(set) var pendingBadges: Bool?
  public private(set) var pendingNotify: (key: CommunityPrivacy.NotifyKey, on: Bool)?
  public private(set) var pendingKinds: [String]?

  @ObservationIgnored private let remote: any CommunityPrivacyRemote
  @ObservationIgnored private let clock: any WallClock

  public init(userId: String, remote: any CommunityPrivacyRemote, clock: any WallClock = SystemWallClock()) {
    self.userId = userId
    self.remote = remote
    self.clock = clock
  }

  public var visibility: CommunityPrivacy.Visibility { pendingVisibility ?? settings.defaultVisibility }
  public var badgesOn: Bool { pendingBadges ?? settings.showBadges }
  public var kinds: [String] { pendingKinds ?? settings.discoverKinds }
  public func notifyOn(_ k: CommunityPrivacy.NotifyKey) -> Bool {
    if let p = pendingNotify, p.key == k { return p.on }
    return settings.notify[k] ?? true
  }

  public func load() async {
    await loadSettings()
    await loadBlocked()
    await loadMuted()
  }

  public func loadSettings() async {
    let remote = self.remote, me = userId
    if settingsPhase != .ready { settingsPhase = .loading }
    do {
      settings = CommunityPrivacy.settings(try await remote.privacySettings(me: me))
      settingsPhase = .ready
    } catch {
      settingsPhase = .failed
    }
  }

  public func loadBlocked() async {
    let remote = self.remote, me = userId
    do {
      let rows = try await remote.blocks(me: me)
      let ids = rows.compactMap { $0["blocked_id"]?.stringValue }
      let profiles = ids.isEmpty ? [] : try await remote.profiles(ids: ids)
      blocked = CommunityPrivacy.people(rows: rows, idColumn: "blocked_id", atColumn: "created_at", profiles: profiles)
      blockedPhase = .ready
    } catch {
      blockedPhase = .failed
    }
  }

  public func loadMuted() async {
    let remote = self.remote, me = userId
    let now = WorkoutSessionRecord.iso8601(clock.nowMillis())
    do {
      let rows = try await remote.mutes(me: me, nowISO: now)
      let ids = rows.compactMap { $0["muted_id"]?.stringValue }
      let profiles = ids.isEmpty ? [] : try await remote.profiles(ids: ids)
      muted = CommunityPrivacy.people(rows: rows, idColumn: "muted_id", atColumn: "until", profiles: profiles)
      mutedPhase = .ready
    } catch {
      mutedPhase = .failed
    }
  }

  // MARK: - Ghi cài đặt

  public func setVisibility(_ v: CommunityPrivacy.Visibility) async -> CommunityPostActions.Outcome {
    guard v != visibility else { return .ignored }
    pendingVisibility = v
    defer { pendingVisibility = nil }
    return await write(["default_visibility": .string(v.rawValue)])
  }

  public func setBadges(_ on: Bool) async -> CommunityPostActions.Outcome {
    guard on != badgesOn else { return .ignored }
    pendingBadges = on
    defer { pendingBadges = nil }
    return await write(["show_badges": .bool(on)])
  }

  public func setNotify(_ k: CommunityPrivacy.NotifyKey, on: Bool) async -> CommunityPostActions.Outcome {
    pendingNotify = (k, on)
    defer { pendingNotify = nil }
    return await write([k.column: .bool(on)])
  }

  /// Bật / tắt một loại ở Khám phá; công tắc cuối cùng không tắt được.
  public func setKind(_ k: String, on: Bool) async -> CommunityPostActions.Outcome {
    guard on || !CommunityPrivacy.isLastOn(kinds, k) else { return .ignored }
    let next = CommunityPrivacy.kinds(kinds, toggling: k, on: on)
    pendingKinds = next
    defer { pendingKinds = nil }
    return await write(["discover_kinds": .array(next.map(JSONValue.string))])
  }

  /// `upsert` rồi đọc lại (kể cả khi hỏng — `onSettled`).
  private func write(_ patch: [String: JSONValue]) async -> CommunityPostActions.Outcome {
    let remote = self.remote, me = userId
    let failure = await CommunityPostActions.attempt { try await remote.updateSettings(me: me, patch: patch) }
    await loadSettings()
    return failure.map(CommunityPostActions.Outcome.failed) ?? .done
  }

  // MARK: - Chặn / tắt tiếng / xoá

  public func unblock(_ userId: String) async -> CommunityPostActions.Outcome {
    guard !working.contains(userId) else { return .ignored }
    working.insert(userId)
    defer { working.remove(userId) }
    let remote = self.remote, me = self.userId
    let failure = await CommunityPostActions.attempt { try await remote.unblock(me: me, userId: userId) }
    if failure == nil { await loadBlocked() }
    return failure.map(CommunityPostActions.Outcome.failed) ?? .done
  }

  public func unmute(_ userId: String) async -> CommunityPostActions.Outcome {
    guard !working.contains(userId) else { return .ignored }
    working.insert(userId)
    defer { working.remove(userId) }
    let remote = self.remote, me = self.userId
    let failure = await CommunityPostActions.attempt { try await remote.unmute(me: me, userId: userId) }
    await loadMuted()
    return failure.map(CommunityPostActions.Outcome.failed) ?? .done
  }

  public enum WipeResult: Sendable, Hashable {
    case deleted(Int)
    case failed(CommunityModerationFailure)
    case ignored
  }

  /// Xoá mọi bài của mình (đã hỏi hai lần ở màn).
  public func deleteAllPosts() async -> WipeResult {
    guard !wiping else { return .ignored }
    wiping = true
    defer { wiping = false }
    do {
      return .deleted(try await remote.deleteAllPosts(me: userId))
    } catch let f as CommunityModerationFailure {
      return .failed(f)
    } catch {
      return .failed(.server(code: nil))
    }
  }
}
