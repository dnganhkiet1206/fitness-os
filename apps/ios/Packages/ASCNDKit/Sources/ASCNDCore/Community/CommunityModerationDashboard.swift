public import Foundation
public import Observation

/// Bảng kiểm duyệt Cộng đồng (#915, giai đoạn 1 — moderator) — port của
/// `native/src/app/admin/*` + `use-admin.ts` (RN web, A 03/10) lên SwiftUI,
/// trên đúng RPC `mod_*` của migration `20261007130000_community_admin.sql`
/// (+ `counted` của `20261007220000_community_report_trust.sql`).
///
/// Quyền ở database, không ở nút bấm: mọi RPC tự hỏi vai trò của người gọi
/// (`moderation_require`); client chỉ hỏi `my_app_role()` để biết nên VẼ gì.
/// Người thường không bao giờ gửi một lời gọi dữ liệu quản trị nào — sổ hỏi
/// vai trò trước rồi mới đọc, và không lưu gì xuống máy (như RN loại khoá
/// `admin*` khỏi cache lưu đĩa).
public enum AppRole: String, Sendable, Hashable, CaseIterable {
  case user, moderator, admin

  public var isStaff: Bool { self != .user }

  /// Như `useAppRole` của RN: chỉ `admin` / `moderator` là có vai trò, còn
  /// lại (kể cả giá trị lạ server thêm sau) là người thường.
  public static func from(_ raw: String?) -> AppRole {
    raw == "admin" ? .admin : raw == "moderator" ? .moderator : .user
  }
}

/// Bài hay bình luận bị báo cáo.
public enum ModTargetType: String, Sendable, Hashable {
  case post, comment
}

public enum ModReportStatus: String, Sendable, Hashable, CaseIterable {
  case open, actioned, dismissed
}

public enum ModAppealStatus: String, Sendable, Hashable, CaseIterable {
  case open, restored, upheld
}

/// Quyết định kiểm duyệt — tên RPC là `mod_<rawValue>`.
public enum ModAction: String, Sendable, Hashable, CaseIterable {
  case hide, restore, remove, dismiss

  /// Gỡ bắt buộc phải có lý do (server: 22023 khi lý do trống).
  public var requiresReason: Bool { self == .remove }
}

/// Lỗi của bảng kiểm duyệt — mỗi loại một câu.
public enum ModerationFailure: Error, Sendable, Hashable {
  case offline
  /// 42501: vai trò đã mất giữa chừng (hoặc chưa từng có).
  case forbidden
  /// P0002: đích / kháng nghị / người dùng không còn.
  case gone
  /// 22023 'cannot remove the last admin': không hạ admin cuối cùng.
  case lastAdmin
  case server(code: String?)
}

/// Một người trong bảng kiểm duyệt (tác giả, người báo cáo, người quyết định).
public struct ModPerson: Sendable, Hashable {
  public let userId: String
  public let handle: String
  public let displayName: String?

  public init(userId: String, handle: String, displayName: String?) {
    self.userId = userId
    self.handle = handle
    self.displayName = displayName
  }

  public init?(row: JSONValue) {
    guard let id = row["user_id"]?.stringValue else { return nil }
    self.init(
      userId: id, handle: row["handle"]?.stringValue ?? "",
      displayName: row["display_name"]?.stringValue)
  }

  /// Tên hiển thị, rồi @handle, rồi id.
  public var name: String {
    if let displayName, !displayName.isEmpty { return displayName }
    if !handle.isEmpty { return "@\(handle)" }
    return userId
  }
}

/// Một dòng của `moderation_audit_log` — chỉ thêm, không sửa, không xoá.
/// Hàng trong lịch sử của `mod_target` không có `target_type` / `target_id`
/// (đích đã biết là chính màn đang xem).
public struct ModAuditRow: Sendable, Hashable, Identifiable {
  public let id: Int
  public let action: String
  public let targetType: ModTargetType?
  public let targetId: String?
  public let reason: String
  public let actorRole: String
  public let createdAt: String
  public let actor: ModPerson?

  public init(row: JSONValue) {
    id = CommunityHiddenReason.count(row["id"])
    action = row["action"]?.stringValue ?? ""
    targetType = row["target_type"]?.stringValue.flatMap(ModTargetType.init(rawValue:))
    targetId = row["target_id"]?.stringValue
    reason = row["reason"]?.stringValue ?? ""
    actorRole = row["actor_role"]?.stringValue ?? ""
    createdAt = row["created_at"]?.stringValue ?? ""
    actor = row["actor"].flatMap(ModPerson.init(row:))
  }
}

/// `mod_dashboard()`: sáu số đếm + 10 việc gần nhất.
public struct ModDashboard: Sendable, Hashable {
  public let pendingReports: Int
  public let pendingAppeals: Int
  public let hiddenPosts: Int
  public let hiddenComments: Int
  public let removedPosts: Int
  public let reportsToday: Int
  public let recent: [ModAuditRow]

  public init(row: JSONValue) {
    pendingReports = CommunityHiddenReason.count(row["pending_reports"])
    pendingAppeals = CommunityHiddenReason.count(row["pending_appeals"])
    hiddenPosts = CommunityHiddenReason.count(row["hidden_posts"])
    hiddenComments = CommunityHiddenReason.count(row["hidden_comments"])
    removedPosts = CommunityHiddenReason.count(row["removed_posts"])
    reportsToday = CommunityHiddenReason.count(row["reports_today"])
    if case .array(let rows)? = row["recent"] { recent = rows.map(ModAuditRow.init(row:)) } else { recent = [] }
  }
}

/// Một mục của hàng đợi báo cáo (`mod_reports`): các báo cáo gom theo đích —
/// một bài ba người báo là MỘT việc.
public struct ModQueueItem: Sendable, Hashable, Identifiable {
  /// Xem trước nội dung (bài: caption ≤ 160 ký tự; bình luận: body ≤ 160).
  public struct Target: Sendable, Hashable {
    public let kind: CommunityFeed.Kind?
    public let caption: String?
    public let body: String?
    public let postId: String?
    public let hidden: Bool
    public let removed: Bool
    public let authorId: String
    public let createdAt: String

    public var excerpt: String { caption ?? body ?? "" }
  }

  /// Kháng nghị mới nhất của đích (nếu có).
  public struct AppealRef: Sendable, Hashable {
    public let id: String
    public let status: ModAppealStatus
    public let createdAt: String
  }

  public let type: ModTargetType
  public let targetId: String
  /// Số người KHÁC NHAU đã báo cáo.
  public let reportCount: Int
  /// Trong số đó, bao nhiêu được tính vào ngưỡng tự ẩn (tài khoản đủ điều
  /// kiện: ≥ 30 ngày tuổi VÀ có đóng góp trong 30 ngày).
  public let countedCount: Int
  public let reasons: [CommunityReportReason: Int]
  public let lastAt: String
  public let target: Target?
  public let author: ModPerson?
  public let appeal: AppealRef?

  public var id: String { "\(type.rawValue):\(targetId)" }

  /// Đang có kháng nghị CHỜ — tác giả đang đợi quyết định.
  public var hasOpenAppeal: Bool { appeal?.status == .open }

  /// Lý do được báo nhiều nhất (hoà thì lấy lý do đứng trước theo bảng chữ,
  /// để thứ tự ổn định).
  public var topReason: CommunityReportReason? {
    reasons.max { a, b in
      a.value != b.value ? a.value < b.value : a.key.rawValue > b.key.rawValue
    }?.key
  }

  public init?(row: JSONValue) {
    guard let type = row["target_type"]?.stringValue.flatMap(ModTargetType.init(rawValue:)),
      let targetId = row["target_id"]?.stringValue
    else { return nil }
    self.type = type
    self.targetId = targetId
    reportCount = CommunityHiddenReason.count(row["report_count"])
    countedCount = CommunityHiddenReason.count(row["counted_count"])
    var reasons: [CommunityReportReason: Int] = [:]
    if case .object(let o)? = row["reasons"] {
      for (k, v) in o {
        if let reason = CommunityReportReason(rawValue: k) { reasons[reason] = CommunityHiddenReason.count(v) }
      }
    }
    self.reasons = reasons
    lastAt = row["last_at"]?.stringValue ?? ""
    if case .object(let t)? = row["target"] {
      target = Target(
        kind: t["kind"]?.stringValue.flatMap(CommunityFeed.Kind.init(rawValue:)),
        caption: t["caption"]?.stringValue, body: t["body"]?.stringValue,
        postId: t["post_id"]?.stringValue, hidden: JS.truthyValue(t["hidden"] ?? .null),
        removed: JS.truthyValue(t["removed"] ?? .null), authorId: t["author_id"]?.stringValue ?? "",
        createdAt: t["created_at"]?.stringValue ?? "")
    } else {
      target = nil
    }
    author = row["author"].flatMap(ModPerson.init(row:))
    if case .object(let a)? = row["appeal"],
      let appealId = a["id"]?.stringValue,
      let status = a["status"]?.stringValue.flatMap(ModAppealStatus.init(rawValue:))
    {
      appeal = AppealRef(id: appealId, status: status, createdAt: a["created_at"]?.stringValue ?? "")
    } else {
      appeal = nil
    }
  }
}

/// Một mục của hàng đợi kháng nghị (`mod_appeals`).
public struct ModAppealItem: Sendable, Hashable, Identifiable {
  public let id: String
  public let status: ModAppealStatus
  public let message: String
  public let createdAt: String
  public let decidedAt: String?
  public let type: ModTargetType
  public let targetId: String
  public let excerpt: String?
  public let reports: Int
  public let author: ModPerson?

  public init?(row: JSONValue) {
    guard let id = row["id"]?.stringValue,
      let status = row["status"]?.stringValue.flatMap(ModAppealStatus.init(rawValue:)),
      let type = row["target_type"]?.stringValue.flatMap(ModTargetType.init(rawValue:)),
      let targetId = row["target_id"]?.stringValue
    else { return nil }
    self.id = id
    self.status = status
    message = row["message"]?.stringValue ?? ""
    createdAt = row["created_at"]?.stringValue ?? ""
    decidedAt = row["decided_at"]?.stringValue
    self.type = type
    self.targetId = targetId
    excerpt = row["excerpt"]?.stringValue
    reports = CommunityHiddenReason.count(row["reports"])
    author = row["author"].flatMap(ModPerson.init(row:))
  }
}

/// Toàn bộ một đích (`mod_target`): nội dung, tác giả, từng báo cáo, kháng
/// nghị và lịch sử kiểm toán.
public struct ModTargetDetail: Sendable, Hashable {
  public struct Target: Sendable, Hashable {
    public let id: String
    public let kind: CommunityFeed.Kind?
    public let caption: String?
    public let body: String?
    public let postId: String?
    public let visibility: String?
    public let hidden: Bool
    public let removedAt: String?
    public let likeCount: Int?
    public let commentCount: Int?
    public let createdAt: String

    public var removed: Bool { removedAt != nil }
    public var excerpt: String { caption ?? body ?? "" }
  }

  public struct Author: Sendable, Hashable {
    public let person: ModPerson
    public let role: AppRole
  }

  public struct Report: Sendable, Hashable, Identifiable {
    public let id: String
    /// Lý do thô từ server (để hiện khi lý do lạ chưa có trong app).
    public let reasonRaw: String
    public let reason: CommunityReportReason?
    public let note: String?
    public let status: ModReportStatus
    public let createdAt: String
    /// Báo cáo này có tính vào ngưỡng tự ẩn không.
    public let counted: Bool
    public let reporter: ModPerson?
  }

  public struct Appeal: Sendable, Hashable, Identifiable {
    public let id: String
    public let status: ModAppealStatus
    public let message: String
    public let createdAt: String
    public let decidedAt: String?
  }

  public let type: ModTargetType
  public let target: Target
  public let author: Author?
  /// Dải lịch sử tác giả (`author_stats` của `mod_target`, migration
  /// 20261117070000) — `nil` khi server chưa deploy migration (màn ẩn dải,
  /// KHÔNG hiện số 0 giả).
  public let authorStats: ModAuthorStats?
  /// Tạm khoá đăng kèm trong `mod_target` (cùng dữ liệu
  /// `mod_user_restriction`) — `nil` khi trường vắng (server cũ) hoặc khi
  /// không bị khoá. Sổ phân biệt hai trường hợp bằng khóa thô.
  public let restriction: ModUserRestriction?
  public let reports: [Report]
  public let appeals: [Appeal]
  public let history: [ModAuditRow]

  public var openAppeal: Appeal? { appeals.first { $0.status == .open } }

  public init?(row: JSONValue) {
    guard let type = row["type"]?.stringValue.flatMap(ModTargetType.init(rawValue:)),
      case .object(let t)? = row["target"],
      let id = t["id"]?.stringValue
    else { return nil }
    self.type = type
    target = Target(
      id: id, kind: t["kind"]?.stringValue.flatMap(CommunityFeed.Kind.init(rawValue:)),
      caption: t["caption"]?.stringValue, body: t["body"]?.stringValue,
      postId: t["post_id"]?.stringValue, visibility: t["visibility"]?.stringValue,
      hidden: JS.truthyValue(t["hidden"] ?? .null), removedAt: t["removed_at"]?.stringValue,
      likeCount: t["like_count"]?.intValue, commentCount: t["comment_count"]?.intValue,
      createdAt: t["created_at"]?.stringValue ?? "")
    if case .object(let a)? = row["author"], let person = ModPerson(row: .object(a)) {
      author = Author(person: person, role: AppRole.from(a["role"]?.stringValue))
    } else {
      author = nil
    }
    authorStats = row["author_stats"].flatMap(ModAuthorStats.init(row:))
    restriction = row["restriction"].flatMap(ModUserRestriction.init(row:))
    var reports: [Report] = []
    if case .array(let rows)? = row["reports"] {
      for r in rows {
        guard let rid = r["id"]?.stringValue,
          let status = r["status"]?.stringValue.flatMap(ModReportStatus.init(rawValue:))
        else { continue }
        let raw = r["reason"]?.stringValue ?? ""
        reports.append(Report(
          id: rid, reasonRaw: raw, reason: CommunityReportReason(rawValue: raw),
          note: r["note"]?.stringValue, status: status, createdAt: r["created_at"]?.stringValue ?? "",
          counted: JS.truthyValue(r["counted"] ?? .null),
          reporter: r["reporter"].flatMap(ModPerson.init(row:))))
      }
    }
    self.reports = reports
    var appeals: [Appeal] = []
    if case .array(let rows)? = row["appeals"] {
      for r in rows {
        guard let aid = r["id"]?.stringValue,
          let status = r["status"]?.stringValue.flatMap(ModAppealStatus.init(rawValue:))
        else { continue }
        appeals.append(Appeal(
          id: aid, status: status, message: r["message"]?.stringValue ?? "",
          createdAt: r["created_at"]?.stringValue ?? "", decidedAt: r["decided_at"]?.stringValue))
      }
    }
    self.appeals = appeals
    if case .array(let rows)? = row["history"] { history = rows.map(ModAuditRow.init(row:)) } else { history = [] }
  }
}

/// Trạng thái tạm khoá đăng của một người (`mod_user_restriction`) — `nil` khi
/// không bị khoá.
public struct ModUserRestriction: Sendable, Hashable {
  public let until: String
  public let reason: String
  public let createdAt: String

  public init?(row: JSONValue) {
    guard let until = row["until"]?.stringValue else { return nil }
    self.until = until
    reason = row["reason"]?.stringValue ?? ""
    createdAt = row["created_at"]?.stringValue ?? ""
  }
}

/// Lịch sử của tác giả trên một đích (`author_stats` của `mod_target`) —
/// số bài, bài ẩn, bài gỡ, báo cáo đang mở về họ, báo cáo họ đã gửi. Cùng
/// truy vấn với `admin_users`.
public struct ModAuthorStats: Sendable, Hashable {
  public let posts: Int
  public let hiddenPosts: Int
  public let removedPosts: Int
  public let openReportsAgainst: Int
  public let reportsFiled: Int

  public init?(row: JSONValue) {
    guard case .object = row else { return nil }
    posts = CommunityHiddenReason.count(row["posts"])
    hiddenPosts = CommunityHiddenReason.count(row["hidden_posts"])
    removedPosts = CommunityHiddenReason.count(row["removed_posts"])
    openReportsAgainst = CommunityHiddenReason.count(row["open_reports_against"])
    reportsFiled = CommunityHiddenReason.count(row["reports_filed"])
  }
}

/// Nhãn "chờ lâu" của hàng đợi: một việc chưa quyết sau 48 giờ thì hiện nhãn
/// (Discourse nhắc mọi mod khi một cờ quá 48 giờ chưa xử lý — ở đây chỉ là
/// nhãn trên hàng đợi, chưa phải push).
public enum ModStale {
  /// 48 giờ, tính bằng giây.
  public static let threshold: TimeInterval = 48 * 3600

  /// Chuỗi ngày lạ / thiếu thì coi là chưa chờ lâu (không gắn nhãn sai).
  /// Supabase trả timestamp có phần lẻ giây (`2026-11-14T09:00:00.123Z`) —
  /// thử formatter có `.withFractionalSeconds` trước, rồi mới formatter mặc
  /// định (formatter có phần lẻ giây không parse được chuỗi không có nó).
  public static func isStale(_ iso: String, now: Date) -> Bool {
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    if let date = formatter.date(from: iso) { return now.timeIntervalSince(date) > threshold }
    formatter.formatOptions = [.withInternetDateTime]
    guard let date = formatter.date(from: iso) else { return false }
    return now.timeIntervalSince(date) > threshold
  }
}

/// Lý do mẫu cho sheet lý do (nghiên cứu 17/11, mẫu 3: lý do mẫu + tự gửi
/// cho tác giả là công cụ nhất quán rẻ nhất). Năm lý do đầu dùng lại nhãn của
/// `CommunityReportReason`; ba lý do sau có khoá riêng
/// (`community.mod.preset.*`). "Khác" để tự gõ — chạm thì xoá ô lý do và
/// đặt con trỏ vào ô.
public enum ModReasonPreset: String, Sendable, Hashable, CaseIterable {
  case spam, harassment, inappropriate, misleading
  case rules, duplicate, advertising
  case other

  /// `nil` = dùng nhãn báo cáo sẵn có (`HiddenNoticeView.reasonText`).
  public var presetKey: String? {
    switch self {
    case .rules: "community.mod.preset.rules"
    case .duplicate: "community.mod.preset.duplicate"
    case .advertising: "community.mod.preset.advertising"
    default: nil
    }
  }

  public var reportReason: CommunityReportReason? {
    switch self {
    case .spam: .spam
    case .harassment: .harassment
    case .inappropriate: .inappropriate
    case .misleading: .misleading
    case .other: .other
    case .rules, .duplicate, .advertising: nil
    }
  }
}

/// Sắp xếp hàng đợi để ca trực xử lý cái nặng trước.
///
/// Khác RN (ghi `NATIVE_IMPROVEMENTS`): RN hiện theo thứ tự server (báo cáo
/// mới nhất trước). Native xếp: (1) có kháng nghị đang mở — tác giả đang đợi;
/// (2) số báo cáo ĐƯỢC TÍNH giảm dần — gần ngưỡng tự ẩn / đã tự ẩn là nặng;
/// (3) tổng số báo cáo giảm dần; (4) báo cáo cũ trước — ai đợi lâu xử lý trước;
/// (5) id để thứ tự ổn định.
public enum ModTriage {
  public static func sort(_ items: [ModQueueItem]) -> [ModQueueItem] {
    items.sorted { a, b in
      if a.hasOpenAppeal != b.hasOpenAppeal { return a.hasOpenAppeal }
      if a.countedCount != b.countedCount { return a.countedCount > b.countedCount }
      if a.reportCount != b.reportCount { return a.reportCount > b.reportCount }
      if a.lastAt != b.lastAt { return a.lastAt < b.lastAt }
      return a.targetId < b.targetId
    }
  }
}

/// Đọc / ghi kiểm duyệt trên server. Ném `ModerationFailure` (backend đã map);
/// lỗi lạ thì sổ coi là `.server(code: nil)`.
public protocol ModerationRemote: Sendable {
  /// `my_app_role()`: vai trò của chính người đang đăng nhập.
  func myRole() async throws -> String
  func dashboard() async throws -> JSONValue
  func reports(status: ModReportStatus) async throws -> [JSONValue]
  func appeals(status: ModAppealStatus) async throws -> [JSONValue]
  func target(type: ModTargetType, id: String) async throws -> JSONValue
  /// `nil` khi người ấy không bị khoá.
  func userRestriction(user: String) async throws -> JSONValue?
  func decide(action: ModAction, type: ModTargetType, id: String, reason: String) async throws
  func decideAppeal(id: String, approve: Bool, reason: String) async throws
  func restrict(user: String, hours: Int, reason: String) async throws
  func unrestrict(user: String, reason: String) async throws
}

/// Bảng kiểm duyệt của MỘT tài khoản.
///
/// Như RN (`use-admin.ts`): hỏi vai trò trước, người thường thì không một lời
/// gọi dữ liệu quản trị nào rời máy; sau mỗi quyết định đọc lại tất cả từ
/// server (một quyết định đổi hàng đợi, kháng nghị, bảng số và lịch sử cùng
/// lúc — không vá tay). Mọi quyết định chỉ khi có mạng: người khác thấy kết
/// quả, không xếp hàng khi mất mạng.
@MainActor @Observable
public final class ModerationBook {
  public enum Phase: Sendable, Hashable {
    case loading
    case failed
    case ready
    /// Đã hỏi vai trò và người này không phải đội kiểm duyệt.
    case notStaff
  }

  /// Kết quả của một quyết định kiểm duyệt.
  public enum DecisionResult: Sendable, Hashable {
    case done
    case failed(ModerationFailure)
    /// Không được phép, lý do trống khi bắt buộc, hay quyết định ấy đang có
    /// một lệnh chưa xong — không chạm server.
    case ignored
  }

  public let userId: String
  /// `nil` = chưa hỏi.
  public private(set) var role: AppRole?
  public private(set) var phase: Phase = .loading
  public private(set) var failure: ModerationFailure?
  public private(set) var dashboard: ModDashboard?
  public private(set) var reportStatus: ModReportStatus = .open
  public private(set) var reports: [ModQueueItem] = []
  public private(set) var appealStatus: ModAppealStatus = .open
  public private(set) var appeals: [ModAppealItem] = []
  /// Quyết định đang có lệnh chưa xong (chặn bấm đúp).
  public private(set) var working: Set<String> = []

  // MARK: - Màn chi tiết một đích

  public private(set) var targetPhase: Phase = .loading
  public private(set) var targetFailure: ModerationFailure?
  public private(set) var detail: ModTargetDetail?
  public private(set) var restriction: ModUserRestriction?
  /// `false` = chưa biết (đang đọc / đọc hỏng) — không phải "không bị khoá".
  public private(set) var restrictionKnown = false

  @ObservationIgnored private let remote: any ModerationRemote
  @ObservationIgnored private var generation = 0
  @ObservationIgnored private var closed = false
  @ObservationIgnored private var currentTarget: (ModTargetType, String)?

  public init(userId: String, remote: any ModerationRemote) {
    self.userId = userId
    self.remote = remote
  }

  public func close() { closed = true }

  /// Có quyết định đang chạy cho đích / kháng nghị / người này không (để màn
  /// tắt nút, chặn bấm đúp).
  public func deciding(type: ModTargetType, id: String) -> Bool {
    working.contains("decide:\(type.rawValue):\(id)")
  }

  public func decidingAppeal(id: String) -> Bool { working.contains("appeal:\(id)") }

  public func restricting(user: String) -> Bool {
    working.contains("restrict:\(user)") || working.contains("unrestrict:\(user)")
  }

  /// Chỉ hỏi vai trò — lối vào ở feed dùng để biết có hiện nút không. Hỏi hỏng
  /// thì vai trò vẫn `nil` (không hiện nút); màn bảng gọi `load()` sẽ hỏi lại.
  public func loadRole() async {
    guard role == nil, !closed else { return }
    role = (try? await remote.myRole()).map(AppRole.from)
  }

  /// Bảng số + hai hàng đợi. Luôn hỏi lại vai trò trước (vai trò có thể đổi
  /// giữa chừng); người thường thì dừng ở `.notStaff`, không gọi dữ liệu nào.
  /// Làm mới hỏng khi đã có dữ liệu thì giữ dữ liệu cũ.
  public func load() async {
    generation += 1
    let gen = generation
    do {
      let role = try await checkRole()
      guard !closed, gen == generation else { return }
      guard role.isStaff else {
        phase = .notStaff
        return
      }
      async let dash = remote.dashboard()
      async let reps = remote.reports(status: reportStatus)
      async let apps = remote.appeals(status: appealStatus)
      let (d, r, a) = try await (dash, reps, apps)
      guard !closed, gen == generation else { return }
      dashboard = ModDashboard(row: d)
      reports = ModTriage.sort(r.compactMap(ModQueueItem.init(row:)))
      appeals = a.compactMap(ModAppealItem.init(row:))
      failure = nil
      phase = .ready
    } catch {
      guard !closed, gen == generation else { return }
      failure = Self.map(error)
      if phase != .ready { phase = .failed }
    }
  }

  /// Đổi bộ lọc báo cáo / kháng nghị: đọc lại tất cả (đơn giản, luôn khớp).
  /// Xoá danh sách cũ + về `.loading` TRƯỚC khi đọc: đọc hỏng thì màn hiện
  /// lỗi thay vì gắn nhãn bộ lọc mới cho danh sách cũ (Devin #916).
  public func selectReports(_ status: ModReportStatus) async {
    guard status != reportStatus else { return }
    reportStatus = status
    reports = []
    phase = .loading
    await load()
  }

  public func selectAppeals(_ status: ModAppealStatus) async {
    guard status != appealStatus else { return }
    appealStatus = status
    appeals = []
    phase = .loading
    await load()
  }

  /// Chi tiết một đích + hạn chế đăng của tác giả (nếu có). Hạn chế đọc hỏng
  /// thì chưa biết, không chặn màn chi tiết.
  public func loadTarget(type: ModTargetType, id: String) async {
    currentTarget = (type, id)
    // Đã biết là người thường thì không gọi dữ liệu quản trị nào (server vẫn
    // là cổng chặn thật khi vai trò chưa biết).
    if role == .user {
      targetPhase = .notStaff
      return
    }
    targetPhase = .loading
    targetFailure = nil
    detail = nil
    restriction = nil
    restrictionKnown = false
    // Vai trò chưa biết (sổ mới từ trang người dùng/nhật ký — Devin #924):
    // hỏi vai trò trước khi đọc đích, để các quyết định sau đó không bị chặn
    // im lặng ở `role?.isStaff`. Chỉ thêm một RPC khi chưa biết — luồng
    // hàng đợi bình thường (vai trò đã có) không đổi.
    if role == nil {
      do {
        let role = try await checkRole()
        guard !closed, currentTarget?.0 == type, currentTarget?.1 == id else { return }
        guard role.isStaff else {
          targetPhase = .notStaff
          return
        }
      } catch {
        guard !closed, currentTarget?.0 == type, currentTarget?.1 == id else { return }
        targetPhase = .failed
        targetFailure = Self.map(error)
        return
      }
    }
    do {
      let row = try await remote.target(type: type, id: id)
      guard !closed, currentTarget?.0 == type, currentTarget?.1 == id else { return }
      guard let d = ModTargetDetail(row: row) else {
        targetPhase = .failed
        targetFailure = .server(code: nil)
        return
      }
      detail = d
      targetPhase = .ready
      // Server mới (20261117070000) kèm `restriction` trong `mod_target`:
      // khoá có mặt (kể cả `null` = không bị khoá) thì dùng luôn, khỏi gọi
      // thêm. Khoá VẮNG = server cũ → gọi `mod_user_restriction` như trước.
      if row["restriction"] != nil {
        restriction = d.restriction
        restrictionKnown = true
      } else if let author = d.author {
        await loadRestriction(user: author.person.userId)
      } else {
        restrictionKnown = true
      }
    } catch {
      guard !closed, currentTarget?.0 == type, currentTarget?.1 == id else { return }
      targetPhase = .failed
      targetFailure = Self.map(error)
    }
  }

  // MARK: - Quyết định

  /// Ẩn / khôi phục / gỡ / bác báo cáo. Xong thì đọc lại tất cả.
  public func decide(_ action: ModAction, type: ModTargetType, id: String, reason: String) async -> DecisionResult {
    let key = "decide:\(type.rawValue):\(id)"
    guard role?.isStaff == true, !working.contains(key), !closed else { return .ignored }
    if action.requiresReason, reason.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { return .ignored }
    working.insert(key)
    defer { working.remove(key) }
    do {
      try await remote.decide(action: action, type: type, id: id, reason: reason)
    } catch {
      return .failed(Self.map(error))
    }
    guard !closed else { return .done }
    await refreshAll()
    return .done
  }

  /// Chấp nhận (khôi phục nội dung) hay từ chối (giữ ẩn) một kháng nghị.
  public func decideAppeal(id: String, approve: Bool, reason: String) async -> DecisionResult {
    let key = "appeal:\(id)"
    guard role?.isStaff == true, !working.contains(key), !closed else { return .ignored }
    working.insert(key)
    defer { working.remove(key) }
    do {
      try await remote.decideAppeal(id: id, approve: approve, reason: reason)
    } catch {
      return .failed(Self.map(error))
    }
    guard !closed else { return .done }
    await refreshAll()
    return .done
  }

  /// Tạm khoá đăng 1–720 giờ, bắt buộc lý do. Server chặn khoá chính mình và
  /// người trong đội kiểm duyệt (22023 → `.server`).
  public func restrict(user: String, hours: Int, reason: String) async -> DecisionResult {
    let key = "restrict:\(user)"
    guard role?.isStaff == true, !working.contains(key), !closed else { return .ignored }
    guard (1...720).contains(hours), !reason.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
      return .ignored
    }
    working.insert(key)
    defer { working.remove(key) }
    do {
      try await remote.restrict(user: user, hours: hours, reason: reason)
    } catch {
      return .failed(Self.map(error))
    }
    guard !closed else { return .done }
    await refreshAll()
    return .done
  }

  /// Gỡ tạm khoá đăng, bắt buộc lý do (ghi vào nhật ký kiểm toán).
  public func unrestrict(user: String, reason: String) async -> DecisionResult {
    let key = "unrestrict:\(user)"
    guard role?.isStaff == true, !working.contains(key), !closed else { return .ignored }
    guard !reason.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return .ignored }
    working.insert(key)
    defer { working.remove(key) }
    do {
      try await remote.unrestrict(user: user, reason: reason)
    } catch {
      return .failed(Self.map(error))
    }
    guard !closed else { return .done }
    await refreshAll()
    return .done
  }

  /// Kết quả của gói "gỡ + khoá đăng": hai lệnh chạy nối nhau, lỗi từng phần
  /// phải nói rõ phần nào hỏng (để màn cho thử lại đúng phần ấy).
  public enum RemoveRestrictResult: Sendable, Hashable {
    case done
    /// Gỡ hỏng — chưa khoá gì.
    case removeFailed(ModerationFailure)
    /// Đã gỡ, khoá hỏng — nội dung đã gỡ, tác giả chưa bị khoá.
    case restrictFailed(ModerationFailure)
    case ignored
  }

  /// Gói "gỡ + khoá đăng" (nghiên cứu 17/11, mẫu 2: một chạm gói cả quyết
  /// định nội dung lẫn hành động với người dùng — như gói Agree của
  /// Discourse). Một lý do cho cả hai lệnh; gỡ trước, khoá sau. Gỡ hỏng thì
  /// dừng (chưa khoá); khoá hỏng thì vẫn đọc lại tất cả rồi báo phần khoá.
  public func removeAndRestrict(
    type: ModTargetType, id: String, user: String, reason: String, hours: Int
  ) async -> RemoveRestrictResult {
    let decideKey = "decide:\(type.rawValue):\(id)"
    let restrictKey = "restrict:\(user)"
    guard role?.isStaff == true, !working.contains(decideKey), !working.contains(restrictKey), !closed else {
      return .ignored
    }
    guard (1...720).contains(hours), !reason.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
      return .ignored
    }
    working.insert(decideKey)
    working.insert(restrictKey)
    defer {
      working.remove(decideKey)
      working.remove(restrictKey)
    }
    do {
      try await remote.decide(action: .remove, type: type, id: id, reason: reason)
    } catch {
      return .removeFailed(Self.map(error))
    }
    do {
      try await remote.restrict(user: user, hours: hours, reason: reason)
    } catch {
      guard !closed else { return .restrictFailed(Self.map(error)) }
      await refreshAll()
      return .restrictFailed(Self.map(error))
    }
    guard !closed else { return .done }
    await refreshAll()
    return .done
  }

  // MARK: - Nội bộ

  private func checkRole() async throws -> AppRole {
    let role = AppRole.from(try await remote.myRole())
    self.role = role
    return role
  }

  private func loadRestriction(user: String) async {
    do {
      let row = try await remote.userRestriction(user: user)
      guard !closed else { return }
      restriction = row.flatMap(ModUserRestriction.init(row:))
      restrictionKnown = true
    } catch {
      guard !closed else { return }
      restrictionKnown = false
    }
  }

  /// Đọc lại bảng số + hàng đợi + chi tiết đang mở (nếu có), như
  /// `invalidateQueries` với tiền tố `admin_` của RN.
  private func refreshAll() async {
    await load()
    if let (type, id) = currentTarget, targetPhase == .ready {
      await loadTarget(type: type, id: id)
    }
  }

  static func map(_ error: any Error) -> ModerationFailure {
    if let f = error as? ModerationFailure { return f }
    return .server(code: nil)
  }
}
