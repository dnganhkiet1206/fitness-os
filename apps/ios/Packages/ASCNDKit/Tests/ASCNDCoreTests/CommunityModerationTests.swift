@testable import ASCNDCore
import Foundation
import Testing

/// Ghi chú "đang ẩn" + số bị xoá = CHÍNH biểu thức của `hidden-notice.tsx` /
/// `useHiddenReasons` / `useDeleteComment` @ fac9ac2 —
/// `Fixtures/community-moderation-golden.json` (`gen-community-moderation.mjs`).
struct CommunityModerationGoldenTests {
  static func root() throws -> JSONValue {
    let url = try #require(
      Bundle.module.url(forResource: "community-moderation-golden", withExtension: "json", subdirectory: "Fixtures"))
    return try JSONDecoder().decode(JSONValue.self, from: Data(contentsOf: url))
  }

  static func stepName(_ s: HiddenNotice.Step) -> String {
    switch s {
    case .unknown: "unknown"
    case .removed: "removed"
    case .upheld: "upheld"
    case .sent: "sent"
    case .canAsk: "canAsk"
    }
  }

  /// `reasons.data?.find(x => x.comment_id === commentId)`.
  static func reason(_ rows: JSONValue?, commentId: String) -> CommunityHiddenReason? {
    guard case .array(let rows)? = rows else { return nil }
    return rows.map(CommunityHiddenReason.init(row:)).first { $0.commentId == commentId }
  }

  @Test func hiddenNoticeIsRNs() throws {
    let cases = CommunityCommentsGoldenTests.array(try Self.root()["hidden"])
    #expect(cases.count == 200)
    for c in cases {
      let id = c["commentId"]?.stringValue ?? ""
      let asked = c["askSuccess"].map { JS.truthyValue($0) } ?? false
      // `rows: null` = lý do chưa về (đang đọc / đọc hỏng).
      let r = Self.reason(c["rows"], commentId: id)
      let out = c["out"]
      #expect(Self.stepName(HiddenNotice.step(r, askedHere: asked)) == out?["step"]?.stringValue, "\(c)")
      let why = HiddenNotice.why(r)
      if case .object(let w)? = out?["why"] {
        #expect(why?.reporters == w["n"]?.doubleValue.map { Int($0) }, "\(c)")
        #expect(why?.reason?.rawValue == w["reason"]?.stringValue, "\(c)")
        #expect((why?.reason == nil ? "whyN" : "why") == w["key"]?.stringValue, "\(c)")
      } else {
        #expect(why == nil, "\(c)")
      }
    }
  }

  @Test func deletedCountIsRNs() throws {
    let cases = CommunityCommentsGoldenTests.array(try Self.root()["deleted"])
    #expect(cases.count == 80)
    for c in cases {
      let pages = CommunityCommentsGoldenTests.array(c["pages"]).map {
        (rows: CommunityCommentsGoldenTests.array($0["rows"]), roots: CommunityCommentsGoldenTests.array($0["roots"]))
      }
      let seen = CommentThread.mergePages(pages, node: CommunityCommentsGoldenTests.node)
      let got = CommentThread.deletedCount(seen, id: c["commentId"]?.stringValue ?? "", node: CommunityCommentsGoldenTests.node)
      #expect(Double(got) == c["out"]?.doubleValue, "\(c)")
    }
  }

  @Test func hiddenReasonRowIsReadDefensively() {
    let r = CommunityHiddenReason(
      row: .object([
        "comment_id": .string("c1"), "reporters": .string("3"), "top_reason": .string("brand-new"),
        "review_requested": .null,
      ]))
    #expect(r.reporters == 3)
    #expect(r.topReason == nil)  // lý do lạ không làm vỡ màn
    #expect(!r.reviewRequested && !r.removed && !r.reviewUpheld)
    #expect(CommunityHiddenReason(row: .object(["reporters": .number(1e300)])).reporters == 0)
  }
}

/// Menu bình luận + kháng nghị trên `CommunityPostBook` (#527, lát 4).
@MainActor
struct CommunityModerationBookTests {
  typealias Remote = CommunityPostBookTests.Remote

  static func loaded(_ r: Remote) async -> CommunityPostBook {
    let b = CommunityPostBookTests.book(r)
    await b.load()
    return b
  }

  static func comment(_ b: CommunityPostBook, _ id: String) -> CommunityComment? { b.comments.first { $0.id == id } }

  @Test func onlyAuthorsAndPostOwnersDeleteOthersReport() async throws {
    let r = Remote()
    r.postRow = Remote.postRow(count: 2)
    CommunityPostBookTests.seed(r, count: 2) { ["me", "a"][$0] }
    var b = await Self.loaded(r)
    let mine = try #require(Self.comment(b, "c0000"))
    let theirs = try #require(Self.comment(b, "c0001"))
    #expect(b.canDelete(mine))
    #expect(!b.canDelete(theirs))
    #expect(await b.delete(theirs) == .ignored)  // không chạm server
    #expect(await b.report(mine) == .ignored)
    #expect(r.deleted.isEmpty && r.reported.isEmpty)
    // Chủ bài xoá được mọi bình luận trên bài (policy DELETE).
    r.postRow = Remote.postRow(mine: true, count: 2)
    b = await Self.loaded(r)
    #expect(b.canDelete(try #require(Self.comment(b, "c0001"))))
  }

  @Test func deletingARootTakesItsVisibleRepliesOffTheCount() async throws {
    let r = Remote()
    r.postRow = Remote.postRow(count: 4)
    r.table = [
      Remote.comment(3, author: "x"), Remote.comment(2, author: "b", parent: "c0000"),
      Remote.comment(1, author: "a", parent: "c0000"), Remote.comment(0, author: "me"),
    ]
    let b = await Self.loaded(r)
    let root = try #require(Self.comment(b, "c0000"))
    #expect(await b.delete(root) == .done)
    #expect(r.deleted == ["c0000"])
    #expect(b.commentCount == 1)  // 4 − (1 + 2 trả lời đang thấy)
    #expect(b.comments.map(\.id) == ["c0003"])  // đọc lại sau khi server nhận
    #expect(b.working.isEmpty)
  }

  @Test func deleteFailuresNeverPretendAndNothingWrittenRereads() async throws {
    let r = Remote()
    r.postRow = Remote.postRow(count: 2)
    CommunityPostBookTests.seed(r, count: 2) { _ in "me" }
    let b = await Self.loaded(r)
    let c = try #require(Self.comment(b, "c0001"))
    for f in [CommunityModerationFailure.offline, .server(code: "500")] {
      r.deleteFailure = f
      let calls = r.pageCalls
      #expect(await b.delete(c) == .failed(f))
      #expect(r.pageCalls == calls)  // không đọc lại, không trừ số
    }
    #expect(b.commentCount == 2)
    #expect(b.comments.count == 2)
    // Không chạm hàng nào (máy khác đã xoá): lỗi có tên, đọc lại để thấy sự thật.
    r.deleteFailure = .nothingWritten
    r.table.removeAll { $0["id"]?.stringValue == "c0001" }
    #expect(await b.delete(c) == .failed(.nothingWritten))
    #expect(b.comments.map(\.id) == ["c0000"])
    #expect(b.commentCount == 2)
  }

  @Test func aSecondTapWhileWorkingIsIgnored() async throws {
    let r = Remote()
    r.postRow = Remote.postRow(count: 1)
    CommunityPostBookTests.seed(r, count: 1) { _ in "me" }
    let b = await Self.loaded(r)
    let c = try #require(Self.comment(b, "c0000"))
    async let first = b.delete(c)
    async let second = b.delete(c)
    let results = await [first, second]
    #expect(results.filter { $0 == .ignored }.count == 1)
    #expect(results.filter { $0 == .done }.count == 1)
    #expect(r.deleted == ["c0000"])
  }

  @Test func reportSendsInappropriateAndNamesTheDailyLimit() async throws {
    let r = Remote()
    r.postRow = Remote.postRow(count: 1)
    CommunityPostBookTests.seed(r, count: 1) { _ in "a" }
    let b = await Self.loaded(r)
    let c = try #require(Self.comment(b, "c0000"))
    r.reportFailure = .reportLimit
    #expect(await b.report(c) == .failed(.reportLimit))
    r.reportFailure = .offline
    #expect(await b.report(c) == .failed(.offline))
    #expect(r.reported.isEmpty)
    r.reportFailure = nil
    #expect(await b.report(c) == .done)
    #expect(r.reported.map(\.id) == ["c0000"])
    #expect(r.reported.first?.reason == .inappropriate)
    #expect(b.comments.map(\.id) == ["c0000"])  // báo cáo không tự ẩn ở máy
    #expect(b.commentCount == 1)
  }

  @Test func hiddenReasonsAreAskedOnlyForMyHiddenComments() async {
    let r = Remote()
    r.postRow = Remote.postRow()
    CommunityPostBookTests.seed(r, count: 2) { _ in "me" }
    _ = await Self.loaded(r)
    #expect(r.hiddenCalls == 0)
    r.table.insert(Remote.comment(5, author: "a", hidden: true), at: 0)  // ẩn của người khác: không hỏi
    _ = await Self.loaded(r)
    #expect(r.hiddenCalls == 0)
    r.table.insert(Remote.comment(6, author: "me", hidden: true), at: 0)
    _ = await Self.loaded(r)
    #expect(r.hiddenCalls == 1)
  }

  @Test func appealOnceThenTheNoticeSaysSent() async throws {
    let r = Remote()
    r.postRow = Remote.postRow()
    r.table = [Remote.comment(0, author: "me", hidden: true)]
    r.hiddenRows = [
      .object([
        "post_id": .null, "comment_id": .string("c0000"), "reporters": .number(3),
        "top_reason": .string("spam"), "review_requested": .bool(false), "removed": .bool(false),
        "review_upheld": .bool(false),
      ])
    ]
    let b = await Self.loaded(r)
    let c = try #require(Self.comment(b, "c0000"))
    #expect(b.hiddenStep(c) == .canAsk)
    #expect(b.hiddenWhy(c) == HiddenNotice.Why(reporters: 3, reason: .spam))
    r.appealFailure = .offline
    #expect(await b.appeal(c) == .failed(.offline))
    #expect(b.hiddenStep(c) == .canAsk)  // lỗi không thành "đã gửi"
    r.appealFailure = nil
    #expect(await b.appeal(c) == .done)
    #expect(r.appeals.map(\.id) == ["c0000"])
    #expect(r.appeals.first?.message == "")
    #expect(b.hiddenStep(c) == .sent)
    #expect(await b.appeal(c) == .ignored)  // một lần
    #expect(r.appeals.count == 1)
  }

  @Test func unknownReasonsShowNoButtonAndFinalDecisionsAreSaid() async throws {
    let r = Remote()
    r.postRow = Remote.postRow()
    r.table = [Remote.comment(0, author: "me", hidden: true)]
    r.failHidden = true
    var b = await Self.loaded(r)
    var c = try #require(Self.comment(b, "c0000"))
    #expect(b.hiddenStep(c) == .unknown)
    #expect(await b.appeal(c) == .ignored)
    r.failHidden = false
    r.hiddenRows = [.object(["comment_id": .string("c0000"), "reporters": .number(2), "removed": .bool(true)])]
    b = await Self.loaded(r)
    c = try #require(Self.comment(b, "c0000"))
    #expect(b.hiddenStep(c) == .removed)
    #expect(b.hiddenWhy(c) == HiddenNotice.Why(reporters: 2, reason: nil))
    #expect(await b.appeal(c) == .ignored)
  }
}
