public import Foundation
public import Observation

/// Quản trị Cộng đồng (#915, giai đoạn 2 — chỉ admin) — port của
/// `native/src/app/admin/{users,user,audit,images}.tsx` + `use-admin.ts`
/// (RN web) lên SwiftUI, trên đúng RPC `admin_*` của migration
/// `20261007130000_community_admin.sql`.
///
/// Như `ModerationBook`: quyền ở database, client chỉ hỏi `my_app_role()`
/// để biết nên VẼ gì. Moderator mở bảng quản trị thì dừng ở `.notStaff`,
/// không một lời gọi RPC admin nào rời máy. Sau mỗi quyết định đọc lại tất
/// cả từ server — không vá tay.
public struct AdminUserRow: Sendable, Hashable, Identifiable {
  public let userId: String
  public let email: String?
  public let handle: String?
  public let displayName: String?
  public let role: AppRole
  public let posts: Int
  public let hiddenPosts: Int
  public let removedPosts: Int
  public let openReportsAgainst: Int
  public let reportsFiled: Int

  public var id: String { userId }

  /// Tên hiển thị, rồi @handle, rồi email, rồi id.
  public var name: String {
    if let displayName, !displayName.isEmpty { return displayName }
    if let handle, !handle.isEmpty { return "@\(handle)" }
    if let email, !email.isEmpty { return email }
    return userId
  }

  public init?(row: JSONValue) {
    guard let userId = row["user_id"]?.stringValue else { return nil }
    self.userId = userId
    email = row["email"]?.stringValue
    handle = row["handle"]?.stringValue
    displayName = row["display_name"]?.stringValue
    role = AppRole.from(row["role"]?.stringValue)
    posts = CommunityHiddenReason.count(row["posts"])
    hiddenPosts = CommunityHiddenReason.count(row["hidden_posts"])
    removedPosts = CommunityHiddenReason.count(row["removed_posts"])
    openReportsAgainst = CommunityHiddenReason.count(row["open_reports_against"])
    reportsFiled = CommunityHiddenReason.count(row["reports_filed"])
  }
}

/// Toàn bộ một người (`admin_user`): hồ sơ, bài, báo cáo về họ, báo cáo họ
/// đã gửi (số lượng), lịch sử kiểm toán.
public struct AdminUserDetail: Sendable, Hashable {
  public struct Profile: Sendable, Hashable {
    public let handle: String
    public let displayName: String
    public let bio: String
  }

  public struct Post: Sendable, Hashable, Identifiable {
    public let id: String
    public let kind: CommunityFeed.Kind?
    public let caption: String
    public let hidden: Bool
    public let removed: Bool
    public let createdAt: String
    public let reports: Int
  }

  public struct ReportAgainst: Sendable, Hashable, Identifiable {
    public let id: String
    public let reasonRaw: String
    public let reason: CommunityReportReason?
    public let status: ModReportStatus
    public let createdAt: String
    public let targetType: ModTargetType
    public let targetId: String
  }

  public let userId: String
  public let email: String?
  public let role: AppRole
  public let profile: Profile?
  public let posts: [Post]
  public let reportsAgainst: [ReportAgainst]
  public let reportsFiled: Int
  public let history: [ModAuditRow]

  public var name: String {
    if let profile, !profile.displayName.isEmpty { return profile.displayName }
    if let email, !email.isEmpty { return email }
    return userId
  }

  public init?(row: JSONValue) {
    guard let userId = row["user_id"]?.stringValue else { return nil }
    self.userId = userId
    email = row["email"]?.stringValue
    role = AppRole.from(row["role"]?.stringValue)
    if case .object(let p)? = row["profile"] {
      profile = Profile(
        handle: p["handle"]?.stringValue ?? "", displayName: p["display_name"]?.stringValue ?? "",
        bio: p["bio"]?.stringValue ?? "")
    } else {
      profile = nil
    }
    var posts: [Post] = []
    if case .array(let rows)? = row["posts"] {
      for r in rows {
        guard let id = r["id"]?.stringValue else { continue }
        posts.append(Post(
          id: id, kind: r["kind"]?.stringValue.flatMap(CommunityFeed.Kind.init(rawValue:)),
          caption: r["caption"]?.stringValue ?? "", hidden: JS.truthyValue(r["hidden"] ?? .null),
          removed: JS.truthyValue(r["removed"] ?? .null), createdAt: r["created_at"]?.stringValue ?? "",
          reports: CommunityHiddenReason.count(r["reports"])))
      }
    }
    self.posts = posts
    var against: [ReportAgainst] = []
    if case .array(let rows)? = row["reports_against"] {
      for r in rows {
        guard let id = r["id"]?.stringValue,
          let status = r["status"]?.stringValue.flatMap(ModReportStatus.init(rawValue:)),
          let type = r["target_type"]?.stringValue.flatMap(ModTargetType.init(rawValue:)),
          let targetId = r["target_id"]?.stringValue
        else { continue }
        let raw = r["reason"]?.stringValue ?? ""
        against.append(ReportAgainst(
          id: id, reasonRaw: raw, reason: CommunityReportReason(rawValue: raw),
          status: status, createdAt: r["created_at"]?.stringValue ?? "",
          targetType: type, targetId: targetId))
      }
    }
    reportsAgainst = against
    reportsFiled = CommunityHiddenReason.count(row["reports_filed"])
    if case .array(let rows)? = row["history"] { history = rows.map(ModAuditRow.init(row:)) } else { history = [] }
  }
}

/// Một ảnh của thư viện (`admin_art`): toàn bộ, kể cả ảnh đã tắt.
public struct ArtRow: Sendable, Hashable, Identifiable {
  public let id: String
  public let kind: CommunityFeed.Kind?
  public let kindRaw: String
  public let style: String
  public let tags: [String]
  public let path: String
  public let altEn: String
  public let altVi: String
  public let active: Bool
  public let sort: Int
  public let createdAt: String
  public let usedBy: Int

  public init?(row: JSONValue) {
    guard let id = row["id"]?.stringValue else { return nil }
    self.id = id
    kindRaw = row["kind"]?.stringValue ?? ""
    kind = CommunityFeed.Kind(rawValue: kindRaw)
    style = row["style"]?.stringValue ?? ""
    if case .array(let t)? = row["tags"] { tags = t.compactMap(\.stringValue) } else { tags = [] }
    path = row["path"]?.stringValue ?? ""
    altEn = row["alt_en"]?.stringValue ?? ""
    altVi = row["alt_vi"]?.stringValue ?? ""
    active = JS.truthyValue(row["active"] ?? .null)
    sort = CommunityHiddenReason.count(row["sort"])
    createdAt = row["created_at"]?.stringValue ?? ""
    usedBy = CommunityHiddenReason.count(row["used_by"])
  }
}

/// Ảnh sắp tải lên thư viện qua Edge Function `admin-art`.
///
/// Kiểm ở client TRƯỚC khi gửi (cùng luật với function: PNG/JPEG/WebP ≤
/// 1 MiB, kiểu khai khớp byte đầu của tệp, style `^[a-z][a-z0-9_]{0,23}$`,
/// alt_en + alt_vi bắt buộc) — để admin biết lỗi ngay thay vì chờ server
/// trả 415/413/400. Server vẫn kiểm lại (client không đáng tin).
public struct ArtUpload: Sendable, Hashable {
  /// Trần 1 MiB — trùng trần của bucket `community-art`.
  public static let maxBytes = 1_048_576

  public let data: Data
  public let mimeType: String
  public let fileName: String
  public let kind: CommunityFeed.Kind
  public let style: String
  public let tags: String
  public let altEn: String
  public let altVi: String

  public init(
    data: Data, mimeType: String, fileName: String, kind: CommunityFeed.Kind,
    style: String, tags: String, altEn: String, altVi: String
  ) {
    self.data = data
    self.mimeType = mimeType
    self.fileName = fileName
    self.kind = kind
    self.style = style
    self.tags = tags
    self.altEn = altEn
    self.altVi = altVi
  }

  public enum Problem: Sendable, Hashable {
    case noFile, unsupportedType, tooLarge, badStyle, missingAlt
  }

  /// Kiểu ảnh theo BYTE ĐẦU của tệp (kiểu khai trong form ai cũng gõ được
  /// nên không tin) — cùng ba chữ ký với Edge Function `admin-art`.
  public static func detectMimeType(_ data: Data) -> String? {
    let b = [UInt8](data.prefix(12))
    if b.count >= 4 && b[0] == 0x89 && b[1] == 0x50 && b[2] == 0x4e && b[3] == 0x47 { return "image/png" }
    if b.count >= 3 && b[0] == 0xff && b[1] == 0xd8 && b[2] == 0xff { return "image/jpeg" }
    if b.count >= 12 && b[0] == 0x52 && b[1] == 0x49 && b[2] == 0x46 && b[3] == 0x46
      && b[8] == 0x57 && b[9] == 0x45 && b[10] == 0x42 && b[11] == 0x50 { return "image/webp" }
    return nil
  }

  /// `^[a-z][a-z0-9_]{0,23}$` — kiểm tay (không regex, để chạy được trên
  /// Linux như mọi test Core khác).
  public static func isValidStyle(_ s: String) -> Bool {
    guard (1...24).contains(s.count), let first = s.first, ("a"..."z").contains(first) else { return false }
    return s.allSatisfy { ("a"..."z").contains($0) || ("0"..."9").contains($0) || $0 == "_" }
  }

  /// Vấn đề đầu tiên của form tải lên (`nil` = sẵn sàng gửi). Thứ tự như
  /// function kiểm: tệp trước, rồi style, rồi alt.
  public static func problem(data: Data?, style: String, altEn: String, altVi: String) -> Problem? {
    guard let data else { return .noFile }
    guard detectMimeType(data) != nil else { return .unsupportedType }
    guard data.count <= maxBytes else { return .tooLarge }
    guard isValidStyle(style.trimmingCharacters(in: .whitespaces)) else { return .badStyle }
    guard !altEn.trimmingCharacters(in: .whitespaces).isEmpty,
      !altVi.trimmingCharacters(in: .whitespaces).isEmpty
    else { return .missingAlt }
    return nil
  }
}

/// Đọc / ghi quản trị trên server. Ném `ModerationFailure` (backend đã map).
/// `myRole` / `restrict` / `unrestrict` / `userRestriction` trùng chữ ký với
/// `ModerationRemote` — một backend thỏa cả hai protocol bằng cùng một hàm.
public protocol AdminRemote: Sendable {
  /// `my_app_role()`: vai trò của chính người đang đăng nhập.
  func myRole() async throws -> String
  /// `admin_audit`: `action` = nil thì mọi hành động.
  func adminAudit(action: String?) async throws -> [JSONValue]
  func adminUsers(query: String) async throws -> [JSONValue]
  func adminUser(id: String) async throws -> JSONValue
  func setRole(user: String, role: AppRole, reason: String) async throws
  func adminArt() async throws -> [JSONValue]
  func setArtActive(id: String, active: Bool, reason: String) async throws
  /// Tải ảnh qua Edge Function `admin-art` (multipart).
  func uploadArt(_ upload: ArtUpload) async throws
  /// `nil` khi người ấy không bị khoá.
  func userRestriction(user: String) async throws -> JSONValue?
  func restrict(user: String, hours: Int, reason: String) async throws
  func unrestrict(user: String, reason: String) async throws
  /// URL công khai của một ảnh trong bucket `community-art` (để xem trước).
  func artImageURL(path: String) -> URL?
}

/// Bảng quản trị của MỘT tài khoản (chỉ admin).
@MainActor @Observable
public final class AdminBook {
  public typealias Phase = ModerationBook.Phase
  public typealias DecisionResult = ModerationBook.DecisionResult

  public let userId: String
  /// `nil` = chưa hỏi.
  public private(set) var role: AppRole?
  public private(set) var phase: Phase = .loading
  public private(set) var failure: ModerationFailure?
  public private(set) var users: [AdminUserRow] = []
  public private(set) var usersQuery = ""
  public private(set) var audit: [ModAuditRow] = []
  public private(set) var auditAction: String?
  public private(set) var art: [ArtRow] = []
  /// Quyết định đang có lệnh chưa xong (chặn bấm đúp).
  public private(set) var working: Set<String> = []

  // MARK: - Màn chi tiết một người

  public private(set) var userPhase: Phase = .loading
  public private(set) var userFailure: ModerationFailure?
  public private(set) var userDetail: AdminUserDetail?
  public private(set) var restriction: ModUserRestriction?
  /// `false` = chưa biết (đang đọc / đọc hỏng) — không phải "không bị khoá".
  public private(set) var restrictionKnown = false

  @ObservationIgnored private let remote: any AdminRemote
  @ObservationIgnored private var generation = 0
  @ObservationIgnored private var closed = false
  @ObservationIgnored private var currentUser: String?

  public init(userId: String, remote: any AdminRemote) {
    self.userId = userId
    self.remote = remote
  }

  public func close() { closed = true }

  public func decidingArt(id: String) -> Bool { working.contains("art:\(id)") }
  public func settingRole(user: String) -> Bool { working.contains("role:\(user)") }
  public func restricting(user: String) -> Bool {
    working.contains("restrict:\(user)") || working.contains("unrestrict:\(user)")
  }

  /// URL công khai của một ảnh trong bucket `community-art` (để xem trước).
  public func artImageURL(path: String) -> URL? { remote.artImageURL(path: path) }

  /// Chỉ hỏi vai trò — màn bảng dùng để biết có hiện mục Quản trị không.
  public func loadRole() async {
    guard role == nil, !closed else { return }
    role = (try? await remote.myRole()).map(AppRole.from)
  }

  /// Người dùng + nhật ký + thư viện ảnh. Luôn hỏi lại vai trò trước; chỉ
  /// admin mới tải — moderator / người thường dừng ở `.notStaff`, không gọi
  /// RPC admin nào.
  public func load() async {
    generation += 1
    let gen = generation
    do {
      let role = try await checkRole()
      guard !closed, gen == generation else { return }
      guard role == .admin else {
        phase = .notStaff
        return
      }
      async let us = remote.adminUsers(query: usersQuery)
      async let au = remote.adminAudit(action: auditAction)
      async let ar = remote.adminArt()
      let (u, a, r) = try await (us, au, ar)
      guard !closed, gen == generation else { return }
      users = u.compactMap(AdminUserRow.init(row:))
      audit = a.map(ModAuditRow.init(row:))
      art = r.compactMap(ArtRow.init(row:))
      failure = nil
      phase = .ready
    } catch {
      guard !closed, gen == generation else { return }
      failure = ModerationBook.map(error)
      if phase != .ready { phase = .failed }
    }
  }

  /// Tìm người dùng: chỉ đọc lại danh sách (màn chờ người gõ dừng 300ms rồi
  /// mới gọi, như RN — mỗi phím một lượt quét `auth.users` là phí).
  /// Xoá kết quả cũ + về `.loading` trước khi đọc (như `selectReports`,
  /// Devin #924): đọc hỏng thì màn hiện lỗi thay vì hiện kết quả cũ dưới
  /// truy vấn mới.
  public func searchUsers(_ query: String) async {
    let q = query.trimmingCharacters(in: .whitespaces)
    guard q != usersQuery else { return }
    usersQuery = q
    guard role == .admin, !closed else { return }
    users = []
    phase = .loading
    do {
      users = try await remote.adminUsers(query: q).compactMap(AdminUserRow.init(row:))
      failure = nil
      phase = .ready
    } catch {
      guard !closed else { return }
      failure = ModerationBook.map(error)
      phase = .failed
    }
  }

  /// Lọc nhật ký theo hành động: chỉ đọc lại nhật ký. Xoá nhật ký cũ +
  /// về `.loading` trước khi đọc (như `selectReports`, Devin #924).
  public func selectAuditAction(_ action: String?) async {
    guard action != auditAction else { return }
    auditAction = action
    guard role == .admin, !closed else { return }
    audit = []
    phase = .loading
    do {
      audit = try await remote.adminAudit(action: action).map(ModAuditRow.init(row:))
      failure = nil
      phase = .ready
    } catch {
      guard !closed else { return }
      failure = ModerationBook.map(error)
      phase = .failed
    }
  }

  /// Chi tiết một người + tạm khoá đăng của họ (nếu có).
  public func loadUser(id: String) async {
    currentUser = id
    if role == .user || role == .moderator {
      userPhase = .notStaff
      return
    }
    userPhase = .loading
    userFailure = nil
    userDetail = nil
    restriction = nil
    restrictionKnown = false
    do {
      let row = try await remote.adminUser(id: id)
      guard !closed, currentUser == id else { return }
      guard let d = AdminUserDetail(row: row) else {
        userPhase = .failed
        userFailure = .server(code: nil)
        return
      }
      userDetail = d
      userPhase = .ready
      await loadRestriction(user: id)
    } catch {
      guard !closed, currentUser == id else { return }
      userPhase = .failed
      userFailure = ModerationBook.map(error)
    }
  }

  // MARK: - Quyết định

  /// Đổi vai trò, bắt buộc lý do. Không đổi vai trò của chính mình (server
  /// cũng chặn) và không hạ admin cuối cùng (server chặn — màn hiện lỗi).
  public func setRole(user: String, role: AppRole, reason: String) async -> DecisionResult {
    let key = "role:\(user)"
    guard self.role == .admin, !working.contains(key), !closed else { return .ignored }
    guard user != userId, !reason.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return .ignored }
    working.insert(key)
    defer { working.remove(key) }
    do {
      try await remote.setRole(user: user, role: role, reason: reason)
    } catch {
      return .failed(ModerationBook.map(error))
    }
    guard !closed else { return .done }
    await refreshAll()
    return .done
  }

  /// Tắt / bật lại một ảnh (không xoá: bài cũ đã dùng nó vẫn phải vẽ được).
  /// Lý do không bắt buộc (RN gửi '').
  public func setArtActive(id: String, active: Bool, reason: String) async -> DecisionResult {
    let key = "art:\(id)"
    guard role == .admin, !working.contains(key), !closed else { return .ignored }
    working.insert(key)
    defer { working.remove(key) }
    do {
      try await remote.setArtActive(id: id, active: active, reason: reason)
    } catch {
      return .failed(ModerationBook.map(error))
    }
    guard !closed else { return .done }
    await refreshAll()
    return .done
  }

  /// Tải ảnh mới lên thư viện. Form chưa hợp lệ thì không chạm server.
  public func uploadArt(_ upload: ArtUpload) async -> DecisionResult {
    let key = "upload"
    guard role == .admin, !working.contains(key), !closed else { return .ignored }
    guard
      ArtUpload.problem(data: upload.data, style: upload.style, altEn: upload.altEn, altVi: upload.altVi) == nil
    else { return .ignored }
    working.insert(key)
    defer { working.remove(key) }
    do {
      try await remote.uploadArt(upload)
    } catch {
      return .failed(ModerationBook.map(error))
    }
    guard !closed else { return .done }
    await refreshAll()
    return .done
  }

  /// Tạm khoá đăng 1–720 giờ, bắt buộc lý do. Server chặn khoá chính mình và
  /// người trong đội kiểm duyệt.
  public func restrict(user: String, hours: Int, reason: String) async -> DecisionResult {
    let key = "restrict:\(user)"
    guard role == .admin, !working.contains(key), !closed else { return .ignored }
    guard (1...720).contains(hours), !reason.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
      return .ignored
    }
    working.insert(key)
    defer { working.remove(key) }
    do {
      try await remote.restrict(user: user, hours: hours, reason: reason)
    } catch {
      return .failed(ModerationBook.map(error))
    }
    guard !closed else { return .done }
    await refreshAll()
    return .done
  }

  /// Gỡ tạm khoá đăng, bắt buộc lý do (ghi vào nhật ký kiểm toán).
  public func unrestrict(user: String, reason: String) async -> DecisionResult {
    let key = "unrestrict:\(user)"
    guard role == .admin, !working.contains(key), !closed else { return .ignored }
    guard !reason.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return .ignored }
    working.insert(key)
    defer { working.remove(key) }
    do {
      try await remote.unrestrict(user: user, reason: reason)
    } catch {
      return .failed(ModerationBook.map(error))
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

  /// Đọc lại mọi danh sách + chi tiết đang mở (nếu có).
  private func refreshAll() async {
    await load()
    if let id = currentUser, userPhase == .ready {
      await loadUser(id: id)
    }
  }
}
