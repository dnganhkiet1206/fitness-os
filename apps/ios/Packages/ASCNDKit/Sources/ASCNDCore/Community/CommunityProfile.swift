public import Foundation
public import Observation

/// Hồ sơ cộng đồng của tôi (#527, lát 2) — `app/community-profile.tsx`,
/// `useMyCommunityProfile`, `useSaveCommunityProfile` (`hooks/use-community.ts`),
/// `lib/mascots.ts` @ fac9ac2.
///
/// Như RN: tên người dùng là chữ thường, số, `.` và `_`, 3–24 ký tự (cùng CHECK
/// của bảng) — kiểm ngay dưới ô thay vì để server từ chối; tên hiển thị bắt
/// buộc; ghi là upsert theo `user_id` (tạo hoặc sửa), cần mạng (`now(2)`);
/// 23505 = tên đã có người dùng, lỗi có tên để người ta sửa được.
///
/// Golden: `Fixtures/community-profile-golden.json` — chính `HANDLE` của màn
/// RN (đọc nguyên văn từ git, `gen-community-profile.mjs`).
public enum CommunityProfileForm {
  public static let handleMax = 24
  public static let nameMax = 40
  public static let bioMax = 160

  /// `handle.trim().toLowerCase()`.
  public static func normalized(_ handle: String) -> String {
    RepEntry.trimJS(handle).lowercased()
  }

  /// `/^[a-z0-9_.]{3,24}$/` — ASCII, không cho gì khác.
  public static func isValid(_ h: String) -> Bool {
    let scalars = h.unicodeScalars
    guard (3...24).contains(scalars.count) else { return false }
    return scalars.allSatisfy { s in
      (s >= "a" && s <= "z") || (s >= "0" && s <= "9") || s == "_" || s == "."
    }
  }

  /// Gõ dở mà sai luật → nói lý do dưới ô (ô trống thì im).
  public static func isBad(_ raw: String) -> Bool {
    let h = normalized(raw)
    return !h.isEmpty && !isValid(h)
  }

  public static func canSave(handle: String, name: String) -> Bool {
    isValid(normalized(handle)) && !RepEntry.trimJS(name).isEmpty
  }

  /// `maxLength` của ô RN đếm theo đơn vị UTF-16; cắt ở ranh giới ký tự.
  public static func clamp(_ s: String, max: Int) -> String {
    var used = 0
    var out = ""
    for ch in s {
      let n = ch.utf16.count
      if used + n > max { break }
      used += n
      out.append(ch)
    }
    return out
  }

  /// Hàng upsert như `useSaveCommunityProfile` chuẩn hoá.
  public static func row(userId: String, handle: String, name: String, bio: String, mascotId: String?) -> JSONValue {
    .object([
      "user_id": .string(userId), "handle": .string(normalized(handle)),
      "display_name": .string(RepEntry.trimJS(name)), "bio": .string(RepEntry.trimJS(bio)),
      "mascot_id": mascotId.map(JSONValue.string) ?? .null,
    ])
  }
}

/// Linh vật làm ảnh đại diện — `MASCOTS` / `isUnlocked` của `lib/mascots.ts`.
public enum CommunityMascots {
  public enum UnlockKind: Sendable, Hashable { case workouts, meals }

  public struct Unlock: Sendable, Hashable {
    public let kind: UnlockKind
    public let count: Int
  }

  public struct Mascot: Sendable, Hashable, Identifiable {
    public let id: String
    public let name: String
    public let emoji: String
    /// `nil` = miễn phí.
    public let unlock: Unlock?
    /// Bản trả phí chưa mở — luôn khoá.
    public let pro: Bool
  }

  public static let all: [Mascot] = [
    Mascot(id: "koa", name: "Koa", emoji: "🐨", unlock: nil, pro: false),
    Mascot(id: "blaze", name: "Blaze", emoji: "🦁", unlock: Unlock(kind: .workouts, count: 10), pro: false),
    Mascot(id: "swift", name: "Swift", emoji: "🦊", unlock: Unlock(kind: .meals, count: 25), pro: false),
    Mascot(id: "titan", name: "Titan", emoji: "🦍", unlock: Unlock(kind: .workouts, count: 30), pro: false),
    Mascot(id: "drago", name: "Drago", emoji: "🐉", unlock: nil, pro: true),
    Mascot(id: "nova", name: "Nova", emoji: "🦄", unlock: nil, pro: true),
  ]

  public static let defaultId = "koa"

  /// CHẾ ĐỘ TEST — mọi linh vật (kể cả Drago / Nova trả phí) chọn được, như
  /// `TEST_UNLOCK_ALL = true` của RN @ fac9ac2 (`lib/dev-flags.ts`). Kiệt chốt
  /// giữ mở trong giai đoạn chưa phát hành (#527, 6093754296).
  ///
  /// ⚠️ PHẢI đổi thành `false` TRƯỚC KHI PHÁT HÀNH — mục 1 của
  /// `apps/ios/docs/APPLE_DEVELOPER_PROGRAM.md` (checklist trước release).
  /// Test `testModeIsOnUntilRelease` ghim giá trị này để việc lật là một thay
  /// đổi có chủ đích, không lặng lẽ. Chỉ áp cho bộ chọn linh vật hồ sơ cộng
  /// đồng — không đụng server, xu hay quyền mua.
  public static let testUnlockAll = true

  public struct Stats: Sendable, Hashable {
    public let workouts: Int
    public let meals: Int
    public init(workouts: Int, meals: Int) {
      self.workouts = workouts
      self.meals = meals
    }
    public static let zero = Stats(workouts: 0, meals: 0)
  }

  /// `isUnlocked`.
  public static func isUnlocked(_ m: Mascot, stats: Stats, unlockAll: Bool = testUnlockAll) -> Bool {
    if unlockAll { return true }
    if m.pro { return false }
    guard let u = m.unlock else { return true }
    return (u.kind == .workouts ? stats.workouts : stats.meals) >= u.count
  }

  public static func mascot(_ id: String?) -> Mascot {
    all.first { $0.id == id } ?? all[0]
  }
}

public struct CommunityProfile: Sendable, Hashable {
  public let handle: String
  public let displayName: String
  public let bio: String
  public let mascotId: String?

  public init(handle: String, displayName: String, bio: String, mascotId: String?) {
    self.handle = handle
    self.displayName = displayName
    self.bio = bio
    self.mascotId = mascotId
  }

  public init?(row: JSONValue) {
    guard let handle = row["handle"]?.stringValue else { return nil }
    self.init(
      handle: handle, displayName: row["display_name"]?.stringValue ?? "", bio: row["bio"]?.stringValue ?? "",
      mascotId: row["mascot_id"]?.stringValue)
  }
}

public enum CommunityProfileFailure: Error, Sendable, Hashable {
  /// 23505 trên `handle`.
  case handleTaken
  case offline
  case server(code: String?)
}

/// Hồ sơ cộng đồng trên server. Ném `CommunityProfileFailure` khi ghi.
public protocol CommunityProfileRemote: Sendable {
  /// Hàng `community_profiles` của mình (hoặc `nil` khi chưa tạo).
  func myProfile(me: String) async throws -> JSONValue?
  /// Số buổi tập / bữa ăn để mở khoá linh vật (`useUnlockStats`).
  func unlockStats(me: String) async throws -> CommunityMascots.Stats
  /// Upsert theo `user_id`.
  func saveProfile(_ row: JSONValue) async throws
}

/// Màn hồ sơ của MỘT tài khoản.
@MainActor @Observable
public final class CommunityProfileBook {
  public enum Phase: Sendable, Hashable {
    case loading
    case failed
    case ready
  }

  public enum SaveResult: Sendable, Hashable {
    case saved
    case handleTaken
    case failed(CommunityProfileFailure)
  }

  public let userId: String
  public private(set) var phase: Phase = .loading
  /// `nil` khi chưa tạo hồ sơ.
  public private(set) var existing: CommunityProfile?
  public private(set) var stats: CommunityMascots.Stats = .zero
  public private(set) var saving = false

  @ObservationIgnored private let remote: any CommunityProfileRemote
  @ObservationIgnored private let unlockAll: Bool
  @ObservationIgnored private var closed = false

  /// - Parameter unlockAll: mặc định là cờ test (`CommunityMascots.testUnlockAll`).
  public init(
    userId: String, remote: any CommunityProfileRemote, unlockAll: Bool = CommunityMascots.testUnlockAll
  ) {
    self.userId = userId
    self.remote = remote
    self.unlockAll = unlockAll
  }

  public func close() { closed = true }

  /// Hồ sơ hỏng → lỗi (không mời tạo hồ sơ mới đè lên hồ sơ đã có). Đếm mở
  /// khoá hỏng → 0 / 0 như RN (`stats ?? { workouts: 0, meals: 0 }`).
  public func load() async {
    let remote = self.remote, me = userId
    async let statsRead: CommunityMascots.Stats? = try? remote.unlockStats(me: me)
    do {
      let row = try await remote.myProfile(me: me)
      let s = await statsRead
      guard !closed else { return }
      existing = row.flatMap(CommunityProfile.init(row:))
      stats = s ?? .zero
      phase = .ready
    } catch {
      _ = await statsRead
      guard !closed else { return }
      if phase != .ready { phase = .failed }
    }
  }

  /// Linh vật chọn được: đã mở khoá, cộng linh vật hồ sơ đang dùng (không lặng lẽ
  /// đổi mặt của người ta).
  public var choices: [CommunityMascots.Mascot] {
    CommunityMascots.all.filter {
      CommunityMascots.isUnlocked($0, stats: stats, unlockAll: unlockAll) || $0.id == existing?.mascotId
    }
  }

  /// Linh vật điền sẵn: của hồ sơ, hoặc linh vật đang chọn trong app nếu đã mở
  /// khoá, không thì Koa (`useMascot().mascot`).
  public func initialMascot(selected: String) -> String {
    if let id = existing?.mascotId { return id }
    let m = CommunityMascots.mascot(selected)
    return CommunityMascots.isUnlocked(m, stats: stats, unlockAll: unlockAll) ? m.id : CommunityMascots.defaultId
  }

  public func save(handle: String, name: String, bio: String, mascotId: String?) async -> SaveResult {
    guard CommunityProfileForm.canSave(handle: handle, name: name), !saving, !closed else {
      return .failed(.server(code: nil))
    }
    saving = true
    defer { saving = false }
    let row = CommunityProfileForm.row(userId: userId, handle: handle, name: name, bio: bio, mascotId: mascotId)
    do {
      try await remote.saveProfile(row)
      guard !closed else { return .saved }
      existing = CommunityProfile(row: row)
      return .saved
    } catch CommunityProfileFailure.handleTaken {
      return .handleTaken
    } catch let f as CommunityProfileFailure {
      return .failed(f)
    } catch {
      return .failed(.server(code: nil))
    }
  }
}
