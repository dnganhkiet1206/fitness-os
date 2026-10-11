public import Foundation
public import Observation

/// Ảnh của bài Cộng đồng, lấy từ thư viện do app cấp (#527, lát 11) —
/// `lib/community-art.ts` + `useArtChoice` / `useCommunityArt` @ fac9ac2.
///
/// Người dùng KHÔNG tải ảnh lên: app chọn sẵn một ảnh hợp nội dung, người dùng
/// chỉ đổi PHONG CÁCH. Chỉ ảnh còn dùng và đúng loại (đúng hai điều server
/// kiểm lúc đăng).
public enum CommunityArtLibrary {
  public struct Item: Sendable, Hashable {
    public let id: String
    public let kind: String
    public let style: String
    public let tags: [String]
    public let path: String
    public let active: Bool
    public let sort: Double
    /// Hàng gốc (`artColumns`) — dựng thẻ xem trước bằng chính đường của feed.
    public let row: JSONValue
  }

  public static func item(_ r: JSONValue) -> Item? {
    guard let id = r["id"]?.stringValue else { return nil }
    let tags: [String] = if case .array(let a)? = r["tags"] { a.compactMap(\.stringValue) } else { [] }
    return Item(
      id: id, kind: r["kind"]?.stringValue ?? "", style: r["style"]?.stringValue ?? "", tags: tags,
      path: r["path"]?.stringValue ?? "", active: r["active"] == .bool(true), sort: r["sort"]?.doubleValue ?? 0, row: r)
  }

  /// `pickArt`: nhãn trùng nhiều nhất trước, ảnh không nhãn sau, ảnh nhãn khác
  /// cuối; hoà theo `sort` rồi `id`. Có phong cách thì chỉ trong phong cách
  /// ấy (không còn ảnh nào thì bỏ lọc).
  public static func pick(_ library: [Item], kind: String, tags: [String], style: String?) -> Item? {
    let usable = library.filter { $0.active && $0.kind == kind }
    let inStyle = style.map { s in usable.filter { $0.style == s } } ?? usable
    let pool = inStyle.isEmpty ? usable : inStyle
    let want = Set(tags)
    func score(_ a: Item) -> Int {
      if a.tags.isEmpty { return 1 }
      let hit = a.tags.filter { want.contains($0) }.count
      return hit > 0 ? 2 + hit : 0
    }
    return pool.enumerated().sorted { x, y in
      let (a, b) = (x.element, y.element)
      if score(a) != score(b) { return score(a) > score(b) }
      if a.sort != b.sort { return a.sort < b.sort }
      if a.id != b.id { return a.id < b.id }
      return x.offset < y.offset
    }.first?.element
  }

  /// `artStyles`: phong cách còn ảnh cho loại bài này, theo `sort` nhỏ nhất.
  public static func styles(_ library: [Item], kind: String) -> [String] {
    var first: [(style: String, sort: Double)] = []
    for a in library where a.active && a.kind == kind {
      if let i = first.firstIndex(where: { $0.style == a.style }) {
        if a.sort < first[i].sort { first[i].sort = a.sort }
      } else {
        first.append((a.style, a.sort))
      }
    }
    return first.sorted { $0.sort != $1.sort ? $0.sort < $1.sort : $0.style < $1.style }.map(\.style)
  }

  private static let groups: [(tag: String, pattern: String)] = [
    ("legs", "squat|lunge|leg press|leg curl|leg extension|calf|hip thrust|deadlift|step[- ]?up|chân|đùi|bắp chuối|mông"),
    ("push", "bench|chest|press|push[- ]?up|dip|fly|tricep|ngực|đẩy|vai|tay sau"),
    ("pull", "row|pull[- ]?up|chin[- ]?up|pulldown|curl|lat\\b|face pull|shrug|kéo|lưng|xà|tay trước"),
    ("cardio", "run|jog|bike|cycl|rowing machine|erg|treadmill|jump rope|elliptical|chạy|đạp xe|nhảy dây|cardio"),
  ]

  private static let regexes: [(tag: String, re: NSRegularExpression)] = groups.compactMap { g in
    (try? NSRegularExpression(pattern: g.pattern, options: [.caseInsensitive])).map { (g.tag, $0) }
  }

  /// `workoutTags`: nhóm đầu khớp thì dừng ("Leg Press" là chân); ≥ 2 nhóm
  /// sức (không tính cardio) → thêm `full`.
  public static func workoutTags(_ names: [String]) -> [String] {
    var found = Set<String>()
    for n in names {
      let range = NSRange(n.startIndex..., in: n)
      for g in regexes where g.re.firstMatch(in: n, range: range) != nil {
        found.insert(g.tag)
        break
      }
    }
    var tags = groups.map(\.tag).filter { found.contains($0) }
    if tags.filter({ $0 != "cardio" }).count >= 2 { tags.append("full") }
    return tags
  }

  /// Phong cách có tên dịch sẵn (`styleLabel` của RN; tên ở xcstrings).
  public static let knownStyles: Set<String> = ["mono", "neon", "paper", "photo", "line"]

  /// `styleLabel` cho khoá lạ (admin thêm sau): viết hoa chữ đầu từng từ.
  public static func styleLabel(_ style: String) -> String {
    let words = style.split(separator: "_", omittingEmptySubsequences: true)
    let joined = words.map { $0.prefix(1).uppercased() + $0.dropFirst() }.joined(separator: " ")
    return joined.isEmpty ? style : joined
  }
}

/// Chia sẻ một buổi tập (#527, lát 11) — `app/community-share.tsx` +
/// `payloadFromSession` / `useMySharedSessions` / `useShareWorkout` @ fac9ac2.
public enum CommunityShare {
  /// Ba mươi ngày buổi tập.
  public static let days = 30
  public static let captionLimit = 500

  public typealias Visibility = CommunityPrivacy.Visibility

  /// `payloadFromSession`: mỗi bài một dòng (bỏ khởi động), dòng mang số set
  /// và set nặng nhất (hoà thì nhiều rep hơn); khối lượng làm tròn 0.1; phút
  /// chỉ khi 1…600.
  public static func workoutPayload(_ s: JSONValue, minutes: Int?) -> JSONValue {
    let sets: [JSONValue] = if case .array(let a)? = s["sets"] { a } else { [] }
    var order: [String] = []
    var per: [String: [String: JSONValue]] = [:]
    for x in sets {
      if JS.truthyValue(x["warmup"] ?? .null) { continue }
      let trimmed = RepEntry.trimJS(x["exerciseName"]?.stringValue ?? "")
      let name = trimmed.isEmpty ? "?" : trimmed
      let id = x["exerciseId"]?.stringValue
      let k = (id?.isEmpty == false) ? id! : "name:\(name)"
      let w = PersonalRecords.jsNumber(x["weight"]) ?? 0
      let r = Double(FitnessCalc.jsRound(PersonalRecords.jsNumber(x["reps"]) ?? 0))
      if var cur = per[k] {
        cur["sets"] = .number((cur["sets"]?.doubleValue ?? 0) + 1)
        let cw = cur["weight"]?.doubleValue ?? 0, cr = cur["reps"]?.doubleValue ?? 0
        if w > cw || (w == cw && r > cr) {
          cur["weight"] = .number(w)
          cur["reps"] = .number(r)
        }
        per[k] = cur
      } else {
        order.append(k)
        per[k] = [
          "exerciseId": id.map(JSONValue.string) ?? .null, "exerciseName": .string(name), "library": .bool(false),
          "sets": .number(1), "weight": .number(w), "reps": .number(r),
        ]
      }
    }
    let exercises = order.compactMap { per[$0].map(JSONValue.object) }
    let title = sessionTitle(s)
    let volume = PersonalRecords.jsNumber(s["volume_load"]) ?? 0
    return .object([
      "title": title.map(JSONValue.string) ?? .null,
      "performedAt": s["date_time"] ?? .null,
      "volumeKg": .number(Double(FitnessCalc.jsRound(volume * 10)) / 10),
      "pr": .bool(JS.truthyValue(s["pr_detected"] ?? .null)),
      "minutes": minutes.map { (1...600).contains($0) ? .number(Double($0)) : .null } ?? .null,
      "exerciseCount": .number(Double(exercises.count)),
      "exercises": .array(exercises),
    ])
  }

  /// `s.template_name?.trim() || null` — tên buổi trong danh sách chọn.
  public static func sessionTitle(_ s: JSONValue) -> String? {
    let t = RepEntry.trimJS(s["template_name"]?.stringValue ?? "")
    return t.isEmpty ? nil : t
  }

  /// Tên các bài trong payload — nhãn chọn ảnh.
  public static func exerciseNames(_ payload: JSONValue) -> [String] {
    guard case .array(let a)? = payload["exercises"] else { return [] }
    return a.compactMap { $0["exerciseName"]?.stringValue }
  }

  /// `trainingMinutes(sets) || null`.
  public static func minutes(_ s: JSONValue) -> Int? {
    SessionDetail.trainingMinutes(SessionDetail.rawSets(s["sets"]))
  }
}

/// Lỗi khi đăng — mỗi loại một câu.
public enum CommunityShareFailure: Error, Sendable, Hashable {
  /// 23505: buổi này đã có bài (một buổi một bài).
  case alreadyShared
  /// P0001: chưa có hồ sơ cộng đồng.
  case profileRequired
  /// 54000: đăng nhiều quá trong một giờ.
  case postLimit
  /// CR001: đội kiểm duyệt đang tạm khoá đăng.
  case restricted
  /// Công thức: 22023 "empty meal" — bữa bị xoá hết món giữa lúc chọn và đăng.
  case emptyMeal
  /// Công thức: chưa đặt tên món (kiểm ở máy, không gửi).
  case nameNeeded
  case offline
  case server(code: String?)
}

public protocol CommunityShareRemote: Sendable {
  func myProfile(me: String) async throws -> JSONValue?
  /// Hàng `community_settings` (cột `CommunityPrivacy.columns`) hoặc `nil`.
  func privacySettings(me: String) async throws -> JSONValue?
  /// `community_art` còn dùng, theo `sort` rồi `id`.
  func artLibrary() async throws -> [JSONValue]
  /// `source_id` các bài của mình (buổi đã chia sẻ).
  func sharedSessionIds(me: String) async throws -> [String]
  /// RPC `share_workout` / `share_workout_with_art`; ném `CommunityShareFailure`.
  func shareWorkout(
    sessionId: String, caption: String, visibility: CommunityShare.Visibility, minutes: Int?, artId: String?
  ) async throws
  func artURL(path: String) -> URL?
}

/// Màn chia sẻ buổi tập của MỘT tài khoản.
@MainActor @Observable
public final class CommunityShareWorkoutBook {
  public enum Phase: Sendable, Hashable {
    case loading
    case failed
    /// Chưa có hồ sơ: bài cần một cái tên.
    case noProfile
    case ready
  }

  public let userId: String
  public private(set) var phase: Phase = .loading
  /// Buổi 30 ngày, mới trước.
  public private(set) var sessions: [JSONValue] = []
  public private(set) var shared: Set<String> = []
  public var picked: String?
  public var caption = ""
  /// Chưa chạm thì theo "Mặc định khi đăng"; đã chọn thì giữ.
  public var visibilityPick: CommunityShare.Visibility?
  public var stylePick: String?
  public private(set) var posting = false

  @ObservationIgnored private let remote: any CommunityShareRemote
  @ObservationIgnored private let history: any HistorySource
  @ObservationIgnored private let clock: any WallClock
  @ObservationIgnored private var profileRow: JSONValue?
  @ObservationIgnored private var defaultVisibility: CommunityShare.Visibility = .public
  @ObservationIgnored private var library: [CommunityArtLibrary.Item] = []

  public init(
    userId: String, picked: String? = nil, remote: any CommunityShareRemote, history: any HistorySource,
    clock: any WallClock = SystemWallClock()
  ) {
    self.userId = userId
    self.picked = picked
    self.remote = remote
    self.history = history
    self.clock = clock
  }

  public var visibility: CommunityShare.Visibility { visibilityPick ?? defaultVisibility }
  public var session: JSONValue? { sessions.first { $0["id"]?.stringValue == picked } }
  public var minutes: Int? { session.flatMap(CommunityShare.minutes) }
  public var payload: JSONValue? { session.map { CommunityShare.workoutPayload($0, minutes: minutes) } }
  public var art: CommunityArtLibrary.Item? {
    let tags = payload.map { CommunityArtLibrary.workoutTags(CommunityShare.exerciseNames($0)) } ?? []
    return CommunityArtLibrary.pick(library, kind: "workout", tags: tags, style: stylePick)
  }
  public var styles: [String] { CommunityArtLibrary.styles(library, kind: "workout") }

  /// ĐÚNG cái thẻ sẽ được đăng.
  public var preview: CommunityFeed.Post? {
    guard let payload, let profileRow else { return nil }
    let row: JSONValue = .object([
      "id": .string("preview"), "author_id": .string(userId), "kind": .string("workout"), "payload": payload,
      "caption": .string(RepEntry.trimJS(caption)), "visibility": .string(visibility.rawValue),
      "like_count": .number(0), "comment_count": .number(0), "save_count": .number(0), "hidden": .bool(false),
      "created_at": .string(WorkoutSessionRecord.iso8601(clock.nowMillis())),
      "art_id": art.map { .string($0.id) } ?? .null, "comments_off": .bool(false),
    ])
    return CommunityFeed.hydrate(
      [row], me: userId, authors: [profileRow], liked: [], saved: [], arts: art.map { [$0.row] } ?? []
    ).first
  }

  public func artURL(_ art: CommunityFeed.Art) -> URL? { remote.artURL(path: art.path) }

  public func load() async {
    let remote = self.remote, history = self.history, me = userId
    if phase != .ready { phase = .loading }
    do {
      let since = EpochMillis(clock.nowMillis().millis - Int64(CommunityShare.days) * 24 * 3600 * 1000)
      async let prof = remote.myProfile(me: me)
      async let rows = history.sessions(userId: me, since: since)
      let (p, r) = try await (prof, rows)
      // Phụ: hỏng thì để mặc định — không chặn việc đăng.
      let settings = try? await remote.privacySettings(me: me)
      let sharedIds = (try? await remote.sharedSessionIds(me: me)) ?? []
      let art = (try? await remote.artLibrary()) ?? []
      profileRow = p
      sessions = r.sorted { ($0["date_time"]?.stringValue ?? "") > ($1["date_time"]?.stringValue ?? "") }
      shared = Set(sharedIds)
      defaultVisibility = CommunityPrivacy.settings(settings).defaultVisibility
      library = art.compactMap(CommunityArtLibrary.item)
      phase = p == nil ? .noProfile : .ready
    } catch {
      phase = .failed
    }
  }

  public enum PostResult: Sendable, Hashable {
    case posted
    case failed(CommunityShareFailure)
    case ignored
  }

  public func post() async -> PostResult {
    guard let s = session, let id = s["id"]?.stringValue, !posting else { return .ignored }
    posting = true
    defer { posting = false }
    let remote = self.remote, caption = self.caption, vis = visibility, minutes = self.minutes, artId = art?.id
    do {
      try await remote.shareWorkout(sessionId: id, caption: caption, visibility: vis, minutes: minutes, artId: artId)
      shared.insert(id)
      return .posted
    } catch let f as CommunityShareFailure {
      return .failed(f)
    } catch {
      return .failed(.server(code: nil))
    }
  }
}
