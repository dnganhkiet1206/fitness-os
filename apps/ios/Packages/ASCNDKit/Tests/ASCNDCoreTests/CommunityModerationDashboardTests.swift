@testable import ASCNDCore
import Foundation
import Testing

/// Bảng kiểm duyệt Cộng đồng (#915) — parse đúng hình dạng RPC `mod_*`
/// (`20261007130000_community_admin.sql` +
/// `20261007220000_community_report_trust.sql`), thứ tự triage, chặn vai trò
/// và đọc lại sau quyết định.
///
/// Không có golden từ mã RN: logic thuần ở đây (triage) là mới, không có ở RN
/// (ghi `NATIVE_IMPROVEMENTS`); phần còn lại là giải mã hình dạng RPC đã chốt
/// ở migration.
struct CommunityModerationDashboardParseTests {
  static func person(_ id: String = "u1", handle: String = "kiet") -> JSONValue {
    .object(["user_id": .string(id), "handle": .string(handle), "display_name": .string("Kiệt")])
  }

  static func auditRow(_ id: Double = 1, action: String = "HIDE_POST") -> JSONValue {
    .object([
      "id": .number(id), "action": .string(action), "target_type": .string("post"),
      "target_id": .string("p1"), "reason": .string("spam"), "actor_role": .string("moderator"),
      "created_at": .string("2026-11-16T10:00:00Z"), "actor": person(),
    ])
  }

  @Test func dashboardCountsAndRecent() {
    let row: JSONValue = .object([
      "pending_reports": .number(3), "pending_appeals": .number(1), "hidden_posts": .number(2),
      "hidden_comments": .number(0), "removed_posts": .number(5), "reports_today": .number(7),
      "recent": .array([Self.auditRow(), Self.auditRow(2, action: "DISMISS_REPORT")]),
    ])
    let d = ModDashboard(row: row)
    #expect(d.pendingReports == 3 && d.pendingAppeals == 1)
    #expect(d.hiddenPosts == 2 && d.hiddenComments == 0)
    #expect(d.removedPosts == 5 && d.reportsToday == 7)
    #expect(d.recent.count == 2)
    #expect(d.recent[0].action == "HIDE_POST" && d.recent[0].targetType == .post)
    #expect(d.recent[0].actor?.handle == "kiet")
  }

  @Test func dashboardToleratesMissingFields() {
    let d = ModDashboard(row: .object([:]))
    #expect(d.pendingReports == 0 && d.reportsToday == 0 && d.recent.isEmpty)
    let bad = ModDashboard(row: .object(["pending_reports": .string("không phải số"), "recent": .null]))
    #expect(bad.pendingReports == 0 && bad.recent.isEmpty)
  }

  @Test func queueItemParsesPostAndComment() throws {
    let post: JSONValue = .object([
      "target_type": .string("post"), "target_id": .string("p1"), "report_count": .number(5),
      "counted_count": .number(3), "reasons": .object(["spam": .number(4), "other": .number(1)]),
      "last_at": .string("2026-11-16T10:00:00Z"),
      "target": .object([
        "kind": .string("workout"), "caption": .string("Buổi tập"), "hidden": .bool(true),
        "removed": .bool(false), "author_id": .string("u1"), "created_at": .string("2026-11-15T10:00:00Z"),
      ]),
      "author": Self.person(), "appeal": .object(["id": .string("a1"), "status": .string("open"), "created_at": .string("2026-11-16T09:00:00Z")]),
    ])
    let item = try #require(ModQueueItem(row: post))
    #expect(item.type == .post && item.reportCount == 5 && item.countedCount == 3)
    #expect(item.reasons[.spam] == 4 && item.reasons[.other] == 1)
    #expect(item.topReason == .spam)
    #expect(item.target?.kind == .workout && item.target?.excerpt == "Buổi tập")
    #expect(item.target?.hidden == true && item.target?.removed == false)
    #expect(item.hasOpenAppeal)
    #expect(item.id == "post:p1")

    let comment: JSONValue = .object([
      "target_type": .string("comment"), "target_id": .string("c1"), "report_count": .number(1),
      "counted_count": .number(0), "reasons": .object(["harassment": .number(1)]),
      "last_at": .string("2026-11-16T10:00:00Z"),
      "target": .object([
        "body": .string("Bình luận xấu"), "post_id": .string("p9"), "hidden": .bool(false),
        "removed": .bool(false), "author_id": .string("u2"), "created_at": .string("2026-11-16T08:00:00Z"),
      ]),
      "author": .null, "appeal": .null,
    ])
    let c = try #require(ModQueueItem(row: comment))
    #expect(c.type == .comment && c.target?.body == "Bình luận xấu" && c.target?.postId == "p9")
    #expect(c.author == nil && !c.hasOpenAppeal)
  }

  @Test func queueItemDropsUnknownTypeAndUnknownReasons() throws {
    let badType: JSONValue = .object(["target_type": .string("user"), "target_id": .string("x")])
    #expect(ModQueueItem(row: badType) == nil)
    let noId: JSONValue = .object(["target_type": .string("post")])
    #expect(ModQueueItem(row: noId) == nil)
    // Lý do lạ server thêm sau: bỏ khỏi bảng lý do, không vỡ mục.
    let strange: JSONValue = .object([
      "target_type": .string("post"), "target_id": .string("p1"), "report_count": .number(2),
      "counted_count": .number(2), "reasons": .object(["spam": .number(1), "brand_new": .number(1)]),
      "last_at": .string("2026-11-16T10:00:00Z"), "target": .null, "author": .null, "appeal": .null,
    ])
    let item = try #require(ModQueueItem(row: strange))
    #expect(item.reasons == [.spam: 1] && item.topReason == .spam)
  }

  @Test func appealItemParses() throws {
    let row: JSONValue = .object([
      "id": .string("a1"), "status": .string("open"), "message": .string("Tôi không spam"),
      "created_at": .string("2026-11-16T09:00:00Z"), "decided_at": .null,
      "target_type": .string("post"), "target_id": .string("p1"), "excerpt": .string("Buổi tập"),
      "reports": .number(3), "author": Self.person(),
    ])
    let a = try #require(ModAppealItem(row: row))
    #expect(a.message == "Tôi không spam" && a.decidedAt == nil)
    #expect(a.excerpt == "Buổi tập" && a.reports == 3)
    #expect(a.author?.userId == "u1")
  }

  @Test func targetDetailParsesReportsAppealsHistory() throws {
    let row: JSONValue = .object([
      "type": .string("post"),
      "target": .object([
        "id": .string("p1"), "kind": .string("recipe"), "caption": .string("Cơm gà"),
        "visibility": .string("public"), "hidden": .bool(true), "removed_at": .null,
        "like_count": .number(4), "comment_count": .number(2), "created_at": .string("2026-11-15T10:00:00Z"),
      ]),
      "author": .object([
        "user_id": .string("u1"), "handle": .string("kiet"), "display_name": .string("Kiệt"), "role": .string("user"),
      ]),
      "reports": .array([
        .object([
          "id": .string("r1"), "reason": .string("spam"), "note": .string("quảng cáo"),
          "status": .string("open"), "created_at": .string("2026-11-16T08:00:00Z"), "counted": .bool(true),
          "reporter": .object(["user_id": .string("u9"), "handle": .string("bao")]),
        ]),
        .object([
          "id": .string("r2"), "reason": .string("other"), "note": .null,
          "status": .string("open"), "created_at": .string("2026-11-16T09:00:00Z"), "counted": .bool(false),
          "reporter": .null,
        ]),
      ]),
      "appeals": .array([
        .object([
          "id": .string("a1"), "status": .string("open"), "message": .string("Xin xem lại"),
          "created_at": .string("2026-11-16T09:30:00Z"), "decided_at": .null,
        ]),
      ]),
      "history": .array([
        .object([
          "id": .number(7), "action": .string("HIDE_POST"), "reason": .string("tự ẩn"),
          "actor_role": .string("system"), "created_at": .string("2026-11-16T08:30:00Z"), "actor": .null,
        ]),
      ]),
    ])
    let d = try #require(ModTargetDetail(row: row))
    #expect(d.target.kind == .recipe && d.target.hidden && !d.target.removed)
    #expect(d.target.likeCount == 4 && d.target.commentCount == 2)
    #expect(d.author?.role == .user)
    #expect(d.reports.count == 2)
    #expect(d.reports[0].reason == .spam && d.reports[0].counted && d.reports[0].note == "quảng cáo")
    #expect(d.reports[1].reason == .other && !d.reports[1].counted)
    #expect(d.openAppeal?.id == "a1")
    #expect(d.history.count == 1 && d.history[0].targetType == nil)  // lịch sử của đích không mang đích
  }

  @Test func targetDetailRequiresTypeAndTarget() {
    #expect(ModTargetDetail(row: .object(["type": .string("post")])) == nil)
    #expect(ModTargetDetail(row: .object(["type": .string("user"), "target": .object(["id": .string("x")])])) == nil)
  }

  @Test func restrictionParses() throws {
    let row: JSONValue = .object([
      "until": .string("2026-11-17T10:00:00Z"), "reason": .string("spam"),
      "created_at": .string("2026-11-16T10:00:00Z"),
    ])
    let r = try #require(ModUserRestriction(row: row))
    #expect(r.until == "2026-11-17T10:00:00Z" && r.reason == "spam")
    #expect(ModUserRestriction(row: .object([:])) == nil)
  }

  @Test func appRoleFallsBackToUser() {
    #expect(AppRole.from("admin") == .admin && AppRole.from("moderator") == .moderator)
    #expect(AppRole.from("user") == .user && AppRole.from("superadmin") == .user && AppRole.from(nil) == .user)
    #expect(AppRole.moderator.isStaff && !AppRole.user.isStaff)
  }

  @Test func triageOrdersHeaviestFirst() {
    func row(_ id: String, counted: Int, total: Int, lastAt: String, appealOpen: Bool) -> JSONValue {
      let appeal: JSONValue =
        appealOpen
        ? .object(["id": .string("a"), "status": .string("open"), "created_at": .string("2026-11-16T09:00:00Z")])
        : .null
      return .object([
        "target_type": .string("post"), "target_id": .string(id), "report_count": .number(Double(total)),
        "counted_count": .number(Double(counted)), "reasons": .object([:]),
        "last_at": .string(lastAt), "target": .null, "author": .null, "appeal": appeal,
      ])
    }
    let items = [
      row("new", counted: 1, total: 1, lastAt: "2026-11-16T10:00:00Z", appealOpen: false),
      row("appeal", counted: 0, total: 1, lastAt: "2026-11-16T11:00:00Z", appealOpen: true),
      row("heavy", counted: 3, total: 5, lastAt: "2026-11-16T09:00:00Z", appealOpen: false),
      row("heavy-old", counted: 3, total: 3, lastAt: "2026-11-15T09:00:00Z", appealOpen: false),
      row("many-untrusted", counted: 0, total: 9, lastAt: "2026-11-16T08:00:00Z", appealOpen: false),
    ].compactMap(ModQueueItem.init(row:))
    #expect(items.count == 5)
    // Kháng nghị chờ trước, rồi số ĐƯỢC TÍNH (không phải tổng số), rồi tổng
    // số, rồi cũ trước.
    // Kháng nghị chờ trước; rồi counted giảm dần (heavy 3, heavy-old 3, new 1,
    // many-untrusted 0); heavy trước heavy-old vì tổng nhiều hơn; new trước
    // many-untrusted vì 1 báo cáo được tính nặng hơn 9 báo cáo không được tính.
    #expect(ModTriage.sort(items).map(\.targetId) == ["appeal", "heavy", "heavy-old", "new", "many-untrusted"])
  }
}

@MainActor
struct CommunityModerationDashboardBookTests {
  final class Remote: ModerationRemote, @unchecked Sendable {
    var role = "moderator"
    var roleCalls = 0
    var dashboardCalls = 0
    var reportCalls = 0
    var appealCalls = 0
    var targetCalls = 0
    var restrictionCalls = 0
    var decided: [(ModAction, ModTargetType, String, String)] = []
    var appealsDecided: [(String, Bool, String)] = []
    var restricted: [(String, Int, String)] = []
    var unrestricted: [(String, String)] = []
    var readFailure: (any Error)?
    var decideFailure: (any Error)?
    var restrictionFailure: (any Error)?
    var reportRows: [JSONValue] = []
    var appealRows: [JSONValue] = []
    var targetRow: JSONValue = .object([:])
    var restrictionRow: JSONValue?

    func myRole() async throws -> String {
      roleCalls += 1
      if let f = readFailure { throw f }
      return role
    }

    func dashboard() async throws -> JSONValue {
      dashboardCalls += 1
      if let f = readFailure { throw f }
      return .object([
        "pending_reports": .number(1), "pending_appeals": .number(0), "hidden_posts": .number(0),
        "hidden_comments": .number(0), "removed_posts": .number(0), "reports_today": .number(1),
        "recent": .array([]),
      ])
    }

    func reports(status: ModReportStatus) async throws -> [JSONValue] {
      reportCalls += 1
      if let f = readFailure { throw f }
      return reportRows
    }

    func appeals(status: ModAppealStatus) async throws -> [JSONValue] {
      appealCalls += 1
      if let f = readFailure { throw f }
      return appealRows
    }

    func target(type: ModTargetType, id: String) async throws -> JSONValue {
      targetCalls += 1
      if let f = readFailure { throw f }
      return targetRow
    }

    func userRestriction(user: String) async throws -> JSONValue? {
      restrictionCalls += 1
      if let f = restrictionFailure { throw f }
      return restrictionRow
    }

    func decide(action: ModAction, type: ModTargetType, id: String, reason: String) async throws {
      if let f = decideFailure { throw f }
      decided.append((action, type, id, reason))
    }

    func decideAppeal(id: String, approve: Bool, reason: String) async throws {
      if let f = decideFailure { throw f }
      appealsDecided.append((id, approve, reason))
    }

    func restrict(user: String, hours: Int, reason: String) async throws {
      if let f = decideFailure { throw f }
      restricted.append((user, hours, reason))
    }

    func unrestrict(user: String, reason: String) async throws {
      if let f = decideFailure { throw f }
      unrestricted.append((user, reason))
    }
  }

  static func targetRow(hidden: Bool = false, removed: Bool = false) -> JSONValue {
    .object([
      "type": .string("post"),
      "target": .object([
        "id": .string("p1"), "kind": .string("workout"), "caption": .string("Buổi tập"),
        "visibility": .string("public"), "hidden": .bool(hidden),
        "removed_at": removed ? .string("2026-11-16T10:00:00Z") : .null,
        "like_count": .number(1), "comment_count": .number(0), "created_at": .string("2026-11-15T10:00:00Z"),
      ]),
      "author": .object([
        "user_id": .string("u1"), "handle": .string("kiet"), "display_name": .string("Kiệt"),
        "role": .string("user"),
      ]),
      "reports": .array([]), "appeals": .array([]), "history": .array([]),
    ])
  }

  @Test func regularUserMakesNoAdminCalls() async {
    let r = Remote()
    r.role = "user"
    let b = ModerationBook(userId: "me", remote: r)
    await b.load()
    #expect(b.phase == .notStaff)
    #expect(r.roleCalls == 1)  // chỉ hỏi vai trò
    #expect(r.dashboardCalls == 0 && r.reportCalls == 0 && r.appealCalls == 0 && r.targetCalls == 0)
    // Quyết định cũng không chạm server.
    #expect(await b.decide(.hide, type: .post, id: "p1", reason: "x") == .ignored)
    #expect(r.decided.isEmpty)
    // Màn chi tiết cũng không gọi khi đã biết là người thường.
    await b.loadTarget(type: .post, id: "p1")
    #expect(b.targetPhase == .notStaff)
    #expect(r.targetCalls == 0)
  }

  @Test func staffLoadsDashboardAndQueues() async {
    let r = Remote()
    let b = ModerationBook(userId: "me", remote: r)
    await b.load()
    #expect(b.phase == .ready && b.role == .moderator)
    #expect(b.dashboard?.pendingReports == 1)
    #expect(r.roleCalls == 1 && r.dashboardCalls == 1 && r.reportCalls == 1 && r.appealCalls == 1)
  }

  @Test func loadRoleOnlyAsksRole() async {
    let r = Remote()
    let b = ModerationBook(userId: "me", remote: r)
    await b.loadRole()
    #expect(b.role == .moderator && r.roleCalls == 1)
    #expect(r.dashboardCalls == 0 && r.reportCalls == 0 && r.appealCalls == 0)
    // Hỏi lần hai thì dùng vai trò đã biết.
    await b.loadRole()
    #expect(r.roleCalls == 1)
  }

  @Test func loadRoleFailureLeavesRoleUnknown() async {
    let r = Remote()
    r.readFailure = ModerationFailure.offline
    let b = ModerationBook(userId: "me", remote: r)
    await b.loadRole()
    #expect(b.role == nil)
    // Màn bảng hỏi lại thì vẫn hỏi vai trò (không kẹt ở "không phải nhân viên").
    r.readFailure = nil
    await b.load()
    #expect(b.phase == .ready && b.role == .moderator)
  }

  @Test func loadFailureKeepsOldDataWhenReady() async {
    let r = Remote()
    let b = ModerationBook(userId: "me", remote: r)
    await b.load()
    #expect(b.phase == .ready)
    r.readFailure = ModerationFailure.offline
    await b.load()
    #expect(b.phase == .ready)  // giữ dữ liệu cũ
    #expect(b.failure == .offline)
    #expect(b.dashboard?.pendingReports == 1)
  }

  @Test func firstLoadFailureIsFailedWithNamedError() async {
    let r = Remote()
    r.readFailure = ModerationFailure.forbidden
    let b = ModerationBook(userId: "me", remote: r)
    await b.load()
    #expect(b.phase == .failed && b.failure == .forbidden)
    // Lỗi lạ (không phải ModerationFailure) thành .server.
    r.readFailure = NSError(domain: "x", code: 1)
    await b.load()
    #expect(b.failure == .server(code: nil))
  }

  @Test func decisionRereadsEverything() async {
    let r = Remote()
    r.targetRow = Self.targetRow()
    let b = ModerationBook(userId: "me", remote: r)
    await b.load()
    await b.loadTarget(type: .post, id: "p1")
    #expect(b.targetPhase == .ready)
    let dash = r.dashboardCalls, reps = r.reportCalls, apps = r.appealCalls, tgts = r.targetCalls
    #expect(await b.decide(.hide, type: .post, id: "p1", reason: "spam") == .done)
    #expect(r.decided.count == 1 && r.decided[0].0 == .hide)
    #expect(r.dashboardCalls == dash + 1 && r.reportCalls == reps + 1 && r.appealCalls == apps + 1)
    #expect(r.targetCalls == tgts + 1)  // chi tiết đang mở cũng đọc lại
    #expect(b.working.isEmpty)
  }

  @Test func decisionFailureDoesNotReread() async {
    let r = Remote()
    let b = ModerationBook(userId: "me", remote: r)
    await b.load()
    r.decideFailure = ModerationFailure.offline
    #expect(await b.decide(.remove, type: .post, id: "p1", reason: "spam") == .failed(.offline))
    #expect(r.dashboardCalls == 1)  // không đọc lại
  }

  @Test func removeWithoutReasonAndBadHoursNeverReachServer() async {
    let r = Remote()
    let b = ModerationBook(userId: "me", remote: r)
    await b.load()
    #expect(await b.decide(.remove, type: .post, id: "p1", reason: "   ") == .ignored)
    #expect(await b.restrict(user: "u1", hours: 0, reason: "spam") == .ignored)
    #expect(await b.restrict(user: "u1", hours: 721, reason: "spam") == .ignored)
    #expect(await b.restrict(user: "u1", hours: 24, reason: "") == .ignored)
    #expect(await b.unrestrict(user: "u1", reason: "") == .ignored)
    #expect(r.decided.isEmpty && r.restricted.isEmpty && r.unrestricted.isEmpty)
    #expect(await b.restrict(user: "u1", hours: 24, reason: "spam") == .done)
    #expect(r.restricted.count == 1 && r.restricted[0].1 == 24)
  }

  @Test func appealDecisionAndUnrestrictCallTheRightRPCs() async {
    let r = Remote()
    let b = ModerationBook(userId: "me", remote: r)
    await b.load()
    #expect(await b.decideAppeal(id: "a1", approve: true, reason: "") == .done)
    #expect(r.appealsDecided.count == 1 && r.appealsDecided[0].1 == true)
    #expect(await b.unrestrict(user: "u1", reason: "hết hạn") == .done)
    #expect(r.unrestricted.count == 1)
  }

  @Test func targetLoadsRestrictionForItsAuthor() async {
    let r = Remote()
    r.targetRow = Self.targetRow()
    r.restrictionRow = .object([
      "until": .string("2026-11-17T10:00:00Z"), "reason": .string("spam"),
      "created_at": .string("2026-11-16T10:00:00Z"),
    ])
    let b = ModerationBook(userId: "me", remote: r)
    await b.loadTarget(type: .post, id: "p1")
    #expect(b.targetPhase == .ready && b.detail?.target.id == "p1")
    #expect(b.restrictionKnown && b.restriction?.reason == "spam")
    #expect(r.restrictionCalls == 1)
  }

  @Test func targetGoneIsNamed() async {
    let r = Remote()
    r.readFailure = ModerationFailure.gone
    let b = ModerationBook(userId: "me", remote: r)
    await b.loadTarget(type: .post, id: "p1")
    #expect(b.targetPhase == .failed && b.targetFailure == .gone)
  }

  @Test func restrictionFailureDoesNotBlockTarget() async {
    let r = Remote()
    r.targetRow = Self.targetRow()
    r.restrictionFailure = ModerationFailure.offline
    let b = ModerationBook(userId: "me", remote: r)
    // Đích về được, hạn chế đọc hỏng: màn chi tiết vẫn hiện, chỉ chưa biết hạn chế.
    await b.loadTarget(type: .post, id: "p1")
    #expect(b.targetPhase == .ready && !b.restrictionKnown && b.restriction == nil)
    // Không bị khoá thì `nil` nhưng đã biết.
    r.restrictionFailure = nil
    await b.loadTarget(type: .post, id: "p1")
    #expect(b.restrictionKnown && b.restriction == nil)
  }
}
