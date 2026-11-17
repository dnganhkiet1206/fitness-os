@testable import ASCNDCore
import Foundation
import Testing

/// Quản trị Cộng đồng (#915, giai đoạn 2) — parse đúng hình dạng RPC
/// `admin_*` (`20261007130000_community_admin.sql`), chặn vai trò của
/// `AdminBook` (chỉ admin mới gọi RPC admin), kiểm ảnh tải lên, "Báo cáo của
/// tôi" và thông báo kiểm duyệt trong hộp thư.
///
/// Không có golden từ mã RN: phần parse là hình dạng RPC đã chốt ở migration;
/// phần còn lại là logic native mới (ghi `NATIVE_IMPROVEMENTS`).
struct CommunityModerationAdminParseTests {
  static func userRow() -> JSONValue {
    .object([
      "user_id": .string("u1"), "email": .string("kiet@example.com"), "handle": .string("kiet"),
      "display_name": .string("Kiệt"), "role": .string("moderator"),
      "posts": .number(12), "hidden_posts": .number(2), "removed_posts": .number(1),
      "open_reports_against": .number(3), "reports_filed": .number(5),
    ])
  }

  @Test func adminUserRowParses() throws {
    let u = try #require(AdminUserRow(row: Self.userRow()))
    #expect(u.userId == "u1" && u.role == .moderator)
    #expect(u.name == "Kiệt")
    #expect(u.posts == 12 && u.hiddenPosts == 2 && u.removedPosts == 1)
    #expect(u.openReportsAgainst == 3 && u.reportsFiled == 5)
    #expect(AdminUserRow(row: .object([:])) == nil)
    // Vai trò lạ server thêm sau → người thường (như `AppRole.from`).
    let strange: JSONValue = .object(["user_id": .string("u2"), "role": .string("superadmin")])
    #expect(try #require(AdminUserRow(row: strange)).role == .user)
    // Không tên hiển thị thì dùng handle, rồi email.
    let noName: JSONValue = .object(["user_id": .string("u3"), "email": .string("a@b.c")])
    #expect(try #require(AdminUserRow(row: noName)).name == "a@b.c")
  }

  @Test func adminUserDetailParses() throws {
    let row: JSONValue = .object([
      "user_id": .string("u1"), "email": .string("kiet@example.com"), "role": .string("user"),
      "profile": .object(["handle": .string("kiet"), "display_name": .string("Kiệt"), "bio": .string("Tập gym")]),
      "posts": .array([
        .object([
          "id": .string("p1"), "kind": .string("workout"), "caption": .string("Buổi tập"),
          "hidden": .bool(true), "removed": .bool(false), "created_at": .string("2026-11-15T10:00:00Z"),
          "reports": .number(3),
        ]),
        .object([
          "id": .string("p2"), "kind": .string("recipe"), "caption": .string("Cơm gà"),
          "hidden": .bool(false), "removed": .bool(true), "created_at": .string("2026-11-14T10:00:00Z"),
          "reports": .number(0),
        ]),
      ]),
      "reports_against": .array([
        .object([
          "id": .string("r1"), "reason": .string("spam"), "status": .string("open"),
          "created_at": .string("2026-11-16T08:00:00Z"), "target_type": .string("post"), "target_id": .string("p1"),
        ]),
      ]),
      "reports_filed": .number(5),
      "history": .array([
        .object([
          "id": .number(7), "action": .string("HIDE_POST"), "reason": .string("tự ẩn"),
          "actor_role": .string("system"), "created_at": .string("2026-11-16T08:30:00Z"), "actor": .null,
        ]),
      ]),
    ])
    let d = try #require(AdminUserDetail(row: row))
    #expect(d.name == "Kiệt" && d.profile?.bio == "Tập gym")
    #expect(d.posts.count == 2)
    #expect(d.posts[0].kind == .workout && d.posts[0].hidden && !d.posts[0].removed && d.posts[0].reports == 3)
    #expect(d.posts[1].removed)
    #expect(d.reportsAgainst.count == 1)
    #expect(d.reportsAgainst[0].reason == .spam && d.reportsAgainst[0].status == .open)
    #expect(d.reportsAgainst[0].targetType == .post && d.reportsAgainst[0].targetId == "p1")
    #expect(d.reportsFiled == 5)
    #expect(d.history.count == 1 && d.history[0].action == "HIDE_POST")
    #expect(AdminUserDetail(row: .object([:])) == nil)
  }

  @Test func artRowParses() throws {
    let row: JSONValue = .object([
      "id": .string("a1"), "kind": .string("workout"), "style": .string("minimal"),
      "tags": .array([.string("gym"), .string("morning")]), "path": .string("workout/minimal-abc.png"),
      "alt_en": .string("Gym"), "alt_vi": .string("Phòng gym"), "active": .bool(true), "sort": .number(0),
      "created_at": .string("2026-11-16T10:00:00Z"), "used_by": .number(7),
    ])
    let a = try #require(ArtRow(row: row))
    #expect(a.kind == .workout && a.style == "minimal")
    #expect(a.tags == ["gym", "morning"] && a.active && a.usedBy == 7)
    #expect(ArtRow(row: .object([:])) == nil)
  }

  @Test func artUploadDetectsTypeByMagicBytes() {
    let png = Data([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])
    let jpeg = Data([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10])
    let webp = Data([0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50])
    #expect(ArtUpload.detectMimeType(png) == "image/png")
    #expect(ArtUpload.detectMimeType(jpeg) == "image/jpeg")
    #expect(ArtUpload.detectMimeType(webp) == "image/webp")
    // HEIC của iPhone bị từ chối (màn đổi sang JPEG trước khi gửi).
    #expect(ArtUpload.detectMimeType(Data([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70])) == nil)
    #expect(ArtUpload.detectMimeType(Data()) == nil)
    // RIFF nhưng không phải WEBP thì không nhận.
    #expect(
      ArtUpload.detectMimeType(Data([0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x41, 0x56, 0x49, 0x20])) == nil)
  }

  @Test func artUploadStyleRule() {
    #expect(ArtUpload.isValidStyle("minimal"))
    #expect(ArtUpload.isValidStyle("a1_b2"))
    #expect(ArtUpload.isValidStyle(String(repeating: "a", count: 24)))
    #expect(!ArtUpload.isValidStyle(""))
    #expect(!ArtUpload.isValidStyle("Minimal"))  // chữ hoa
    #expect(!ArtUpload.isValidStyle("1abc"))  // phải bắt đầu bằng chữ cái
    #expect(!ArtUpload.isValidStyle("a-b"))  // gạch ngang
    #expect(!ArtUpload.isValidStyle("a b"))
    #expect(!ArtUpload.isValidStyle(String(repeating: "a", count: 25)))
  }

  @Test func artUploadProblemOrder() {
    let png = Data([0x89, 0x50, 0x4E, 0x47])
    var big = Data([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])
    big.append(Data(repeating: 0, count: ArtUpload.maxBytes + 1))  // PNG thật, quá 1 MiB
    #expect(ArtUpload.problem(data: nil, style: "minimal", altEn: "a", altVi: "b") == .noFile)
    #expect(ArtUpload.problem(data: Data([1, 2, 3]), style: "minimal", altEn: "a", altVi: "b") == .unsupportedType)
    // Quá 1 MiB thì báo cỡ trước, dù style cũng sai.
    #expect(ArtUpload.problem(data: big, style: "BAD", altEn: "a", altVi: "b") == .tooLarge)
    #expect(ArtUpload.problem(data: png, style: "BAD", altEn: "a", altVi: "b") == .badStyle)
    #expect(ArtUpload.problem(data: png, style: "minimal", altEn: "", altVi: "b") == .missingAlt)
    #expect(ArtUpload.problem(data: png, style: "minimal", altEn: "a", altVi: "  ") == .missingAlt)
    #expect(ArtUpload.problem(data: png, style: "minimal", altEn: "a", altVi: "b") == nil)
  }

  @Test func myReportParsesPostCommentAndUser() throws {
    let post: JSONValue = .object([
      "id": .string("r1"), "reason": .string("spam"), "note": .string("quảng cáo"), "status": .string("open"),
      "created_at": .string("2026-11-16T08:00:00Z"), "target_type": .string("post"), "target_id": .string("p1"),
      "excerpt": .string("Mua ngay…"), "removed": .bool(false),
    ])
    let p = try #require(MyReport(row: post))
    #expect(p.reason == .spam && p.status == .open && !p.isUserReport && !p.removed)
    let user: JSONValue = .object([
      "id": .string("r2"), "reason": .string("harassment"), "note": .null, "status": .string("actioned"),
      "created_at": .string("2026-11-15T08:00:00Z"), "target_type": .null, "target_id": .string("u9"),
      "excerpt": .string("@nguoixau"), "removed": .bool(false),
    ])
    let u = try #require(MyReport(row: user))
    #expect(u.isUserReport && u.status == .actioned)
    #expect(MyReport(row: .object(["id": .string("x")])) == nil)
  }

  @Test func inboxKeepsModerationRowsAndDropsBadPayload() {
    let rows: [JSONValue] = [
      // Thông báo kiểm duyệt: không có actor, có payload.
      .object([
        "id": .string("n1"), "actor_id": .null, "kind": .string("moderation"), "post_id": .string("p1"),
        "challenge_id": .null, "milestone": .null,
        "payload": .object([
          "outcome": .string("removed"), "reason": .string("spam"), "target_type": .string("post"),
          "comment_id": .null,
        ]),
        "created_at": .string("2026-11-16T10:00:00Z"), "read_at": .null,
      ]),
      // Payload thiếu outcome → bỏ hàng (không vẽ câu lạ).
      .object([
        "id": .string("n2"), "actor_id": .null, "kind": .string("moderation"), "post_id": .string("p2"),
        "challenge_id": .null, "milestone": .null, "payload": .object(["reason": .string("x")]),
        "created_at": .string("2026-11-16T10:00:00Z"), "read_at": .null,
      ]),
      // Payload vắng hẳn → bỏ hàng.
      .object([
        "id": .string("n3"), "actor_id": .null, "kind": .string("moderation"), "post_id": .string("p3"),
        "challenge_id": .null, "milestone": .null,
        "created_at": .string("2026-11-16T10:00:00Z"), "read_at": .null,
      ]),
    ]
    let items = CommunityInbox.build(rows: rows, profiles: [], challenges: [], lang: "vi")
    #expect(items.count == 1)
    #expect(items[0].kind == .moderation)
    #expect(items[0].moderation?.outcome == "removed" && items[0].moderation?.reason == "spam")
    #expect(CommunityInbox.sentence(items[0]) == .moderation)
    #expect(CommunityInbox.target(items[0]) == .post("p1"))
  }
}

@MainActor
struct CommunityModerationAdminBookTests {
  final class Remote: AdminRemote, @unchecked Sendable {
    var role = "admin"
    var roleCalls = 0
    var auditCalls = 0
    var usersCalls = 0
    var userCalls = 0
    var artCalls = 0
    var restrictionCalls = 0
    var setRoleCalls: [(String, AppRole, String)] = []
    var setArtCalls: [(String, Bool, String)] = []
    var uploadCalls = 0
    var restricted: [(String, Int, String)] = []
    var unrestricted: [(String, String)] = []
    var readFailure: (any Error)?
    var decideFailure: (any Error)?
    var userRows: [JSONValue] = []
    var auditRows: [JSONValue] = []
    var artRows: [JSONValue] = []
    var userRow: JSONValue = .object([:])
    var restrictionRow: JSONValue?
    var lastAuditAction: String?
    var lastUsersQuery = ""

    func myRole() async throws -> String {
      roleCalls += 1
      if let f = readFailure { throw f }
      return role
    }

    func adminAudit(action: String?) async throws -> [JSONValue] {
      auditCalls += 1
      lastAuditAction = action
      if let f = readFailure { throw f }
      return auditRows
    }

    func adminUsers(query: String) async throws -> [JSONValue] {
      usersCalls += 1
      lastUsersQuery = query
      if let f = readFailure { throw f }
      return userRows
    }

    func adminUser(id: String) async throws -> JSONValue {
      userCalls += 1
      if let f = readFailure { throw f }
      return userRow
    }

    func setRole(user: String, role: AppRole, reason: String) async throws {
      if let f = decideFailure { throw f }
      setRoleCalls.append((user, role, reason))
    }

    func adminArt() async throws -> [JSONValue] {
      artCalls += 1
      if let f = readFailure { throw f }
      return artRows
    }

    func setArtActive(id: String, active: Bool, reason: String) async throws {
      if let f = decideFailure { throw f }
      setArtCalls.append((id, active, reason))
    }

    func uploadArt(_ upload: ArtUpload) async throws {
      if let f = decideFailure { throw f }
      uploadCalls += 1
    }

    func userRestriction(user: String) async throws -> JSONValue? {
      restrictionCalls += 1
      if let f = readFailure { throw f }
      return restrictionRow
    }

    func restrict(user: String, hours: Int, reason: String) async throws {
      if let f = decideFailure { throw f }
      restricted.append((user, hours, reason))
    }

    func unrestrict(user: String, reason: String) async throws {
      if let f = decideFailure { throw f }
      unrestricted.append((user, reason))
    }

    func artImageURL(path: String) -> URL? { URL(string: "https://example.com/\(path)") }
  }

  static func validUpload() -> ArtUpload {
    ArtUpload(
      data: Data([0x89, 0x50, 0x4E, 0x47]), mimeType: "image/png", fileName: "art.png",
      kind: .workout, style: "minimal", tags: "gym", altEn: "Gym", altVi: "Phòng gym")
  }

  @Test func moderatorAndUserMakeNoAdminCalls() async {
    for role in ["moderator", "user"] {
      let r = Remote()
      r.role = role
      let b = AdminBook(userId: "me", remote: r)
      await b.load()
      #expect(b.phase == .notStaff, "role \(role)")
      #expect(r.roleCalls == 1)
      #expect(r.auditCalls == 0 && r.usersCalls == 0 && r.artCalls == 0 && r.userCalls == 0)
      #expect(await b.setRole(user: "u1", role: .moderator, reason: "x") == .ignored)
      #expect(await b.setArtActive(id: "a1", active: false, reason: "") == .ignored)
      #expect(await b.uploadArt(Self.validUpload()) == .ignored)
      #expect(r.setRoleCalls.isEmpty && r.setArtCalls.isEmpty && r.uploadCalls == 0)
      await b.loadUser(id: "u1")
      #expect(b.userPhase == .notStaff && r.userCalls == 0)
    }
  }

  @Test func adminLoadsAllThreeLists() async {
    let r = Remote()
    r.userRows = [CommunityModerationAdminParseTests.userRow()]
    r.auditRows = [.object([
      "id": .number(1), "action": .string("HIDE_POST"), "target_type": .string("post"),
      "target_id": .string("p1"), "reason": .string("spam"), "actor_role": .string("moderator"),
      "created_at": .string("2026-11-16T10:00:00Z"), "actor": .null,
    ])]
    r.artRows = [.object([
      "id": .string("a1"), "kind": .string("workout"), "style": .string("minimal"),
      "tags": .array([]), "path": .string("workout/minimal.png"), "alt_en": .string("Gym"),
      "alt_vi": .string("Gym"), "active": .bool(true), "sort": .number(0),
      "created_at": .string("2026-11-16T10:00:00Z"), "used_by": .number(0),
    ])]
    let b = AdminBook(userId: "me", remote: r)
    await b.load()
    #expect(b.phase == .ready && b.role == .admin)
    #expect(b.users.count == 1 && b.audit.count == 1 && b.art.count == 1)
    #expect(r.roleCalls == 1 && r.usersCalls == 1 && r.auditCalls == 1 && r.artCalls == 1)
  }

  @Test func searchAndAuditFilterOnlyRereadTheirOwnList() async {
    let r = Remote()
    let b = AdminBook(userId: "me", remote: r)
    await b.load()
    await b.searchUsers("kiet")
    #expect(r.usersCalls == 2 && r.lastUsersQuery == "kiet")
    #expect(r.auditCalls == 1 && r.artCalls == 1)
    // Cùng truy vấn thì không gọi lại.
    await b.searchUsers("kiet")
    #expect(r.usersCalls == 2)
    await b.selectAuditAction("HIDE_POST")
    #expect(r.auditCalls == 2 && r.lastAuditAction == "HIDE_POST")
    #expect(r.usersCalls == 2 && r.artCalls == 1)
    await b.selectAuditAction(nil)
    #expect(r.auditCalls == 3 && r.lastAuditAction == nil)
  }

  /// Đổi bộ lọc/truy vấn rồi đọc hỏng: KHÔNG giữ danh sách cũ dưới nhãn mới
  /// (Devin #924) — màn hiện lỗi, danh sách đã xoá.
  @Test func filterChangeFailureShowsErrorNotStaleList() async {
    let r = Remote()
    r.userRows = [CommunityModerationAdminParseTests.userRow()]
    r.auditRows = [.object([
      "id": .number(1), "action": .string("HIDE_POST"), "target_type": .string("post"),
      "target_id": .string("p1"), "reason": .string("spam"), "actor_role": .string("moderator"),
      "created_at": .string("2026-11-16T10:00:00Z"), "actor": .null,
    ])]
    let b = AdminBook(userId: "me", remote: r)
    await b.load()
    #expect(b.phase == .ready && b.users.count == 1 && b.audit.count == 1)
    r.readFailure = ModerationFailure.offline
    await b.searchUsers("kiet")
    #expect(b.phase == .failed && b.failure == .offline)
    #expect(b.users.isEmpty)
    await b.selectAuditAction("HIDE_POST")
    #expect(b.phase == .failed && b.failure == .offline)
    #expect(b.audit.isEmpty)
  }

  @Test func setRoleRefusesSelfAndEmptyReason() async {
    let r = Remote()
    let b = AdminBook(userId: "me", remote: r)
    await b.load()
    #expect(await b.setRole(user: "me", role: .moderator, reason: "x") == .ignored)
    #expect(await b.setRole(user: "u1", role: .moderator, reason: "   ") == .ignored)
    #expect(r.setRoleCalls.isEmpty)
    #expect(await b.setRole(user: "u1", role: .moderator, reason: "tin cậy") == .done)
    #expect(r.setRoleCalls.count == 1 && r.setRoleCalls[0].1 == .moderator)
  }

  @Test func adminDecisionRereadsEverything() async {
    let r = Remote()
    let b = AdminBook(userId: "me", remote: r)
    await b.load()
    let users = r.usersCalls, audit = r.auditCalls, art = r.artCalls
    #expect(await b.setArtActive(id: "a1", active: false, reason: "") == .done)
    #expect(r.setArtCalls.count == 1)
    #expect(r.usersCalls == users + 1 && r.auditCalls == audit + 1 && r.artCalls == art + 1)
  }

  @Test func uploadArtRefusesInvalidForm() async {
    let r = Remote()
    let b = AdminBook(userId: "me", remote: r)
    await b.load()
    let good = Self.validUpload()
    let bad = ArtUpload(
      data: good.data, mimeType: good.mimeType, fileName: good.fileName, kind: good.kind,
      style: "BAD STYLE", tags: good.tags, altEn: good.altEn, altVi: good.altVi)
    #expect(await b.uploadArt(bad) == .ignored)
    #expect(r.uploadCalls == 0)
    #expect(await b.uploadArt(Self.validUpload()) == .done)
    #expect(r.uploadCalls == 1)
  }

  @Test func loadUserLoadsDetailAndRestriction() async {
    let r = Remote()
    r.userRow = .object([
      "user_id": .string("u1"), "email": .string("kiet@example.com"), "role": .string("user"),
      "profile": .object(["handle": .string("kiet"), "display_name": .string("Kiệt"), "bio": .string("")]),
      "posts": .array([]), "reports_against": .array([]), "reports_filed": .number(0), "history": .array([]),
    ])
    r.restrictionRow = .object([
      "until": .string("2026-11-17T10:00:00Z"), "reason": .string("spam"),
      "created_at": .string("2026-11-16T10:00:00Z"),
    ])
    let b = AdminBook(userId: "me", remote: r)
    await b.loadUser(id: "u1")
    #expect(b.userPhase == .ready && b.userDetail?.userId == "u1")
    #expect(b.restrictionKnown && b.restriction?.reason == "spam")
    #expect(r.restrictionCalls == 1)
  }

  @Test func artImageURLPassesThrough() {
    let r = Remote()
    let b = AdminBook(userId: "me", remote: r)
    #expect(b.artImageURL(path: "workout/minimal.png")?.absoluteString == "https://example.com/workout/minimal.png")
  }
}
