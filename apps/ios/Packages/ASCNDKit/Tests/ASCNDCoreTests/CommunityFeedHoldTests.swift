@testable import ASCNDCore
import Foundation
import Testing

/// "N bài mới" (lát 17) — `Fixtures/feed-hold-golden.json` = CHÍNH `heldAbove` /
/// `atTop` của `lib/feed-hold.ts` @ fac9ac2 (`tools/feed-hold/gen.cjs`: 6 ca có
/// tên + 120 ca ngẫu nhiên cố định); sổ và cách chia theo `use-feed-hold.ts`.
struct CommunityFeedHoldTests {
  static func golden() throws -> JSONValue {
    let url = try #require(
      Bundle.module.url(forResource: "feed-hold-golden", withExtension: "json", subdirectory: "Fixtures"))
    return try JSONDecoder().decode(JSONValue.self, from: Data(contentsOf: url))
  }

  static func strings(_ v: JSONValue?) -> [String] { KoaRenderGoldenTests.array(v).compactMap { $0.stringValue } }

  @Test func heldAboveIsRNs() throws {
    let cases = KoaRenderGoldenTests.array(try Self.golden()["held"])
    #expect(cases.count == 126)
    for (i, c) in cases.enumerated() {
      let got = CommunityFeedHold.heldAbove(
        Self.strings(c["ids"]), seen: Set(Self.strings(c["seen"])), mine: Set(Self.strings(c["mine"])))
      #expect(got == Self.strings(c["held"]), "#\(i)")
    }
  }

  @Test func atTopIsRNs() throws {
    let g = try Self.golden()
    #expect(g["nearTop"]?.doubleValue == CommunityFeedHold.nearTop)
    for c in KoaRenderGoldenTests.array(g["top"]) {
      let y = c["y"]?.doubleValue ?? .nan
      #expect(CommunityFeedHold.atTop(y) == (c["top"] == .bool(true)), "\(y)")
    }
  }

  /// Bài giả: `author_id` = tác giả, `me` là chính mình.
  static func posts(_ rows: [(id: String, author: String)]) -> [CommunityFeed.Post] {
    let authors = Set(rows.map(\.author)).sorted().map { a -> JSONValue in
      .object(["user_id": .string(a), "handle": .string(a), "display_name": .string(a)])
    }
    let json = rows.map { r -> JSONValue in
      .object([
        "id": .string(r.id), "kind": .string("workout"), "payload": .object([:]), "author_id": .string(r.author),
        "created_at": .string("2026-10-11T00:00:00Z"),
      ])
    }
    return CommunityFeed.hydrate(json, me: "me", authors: authors, liked: [], saved: [], arts: [])
  }

  @Test func splitHoldsNewPostsOnlyMidFeed() {
    var ledger = CommunityFeedHold.Ledger()
    let first = Self.posts([("a", "u1"), ("b", "u2")])
    ledger.ack(first.map(\.id), tab: "discover")
    let next = Self.posts([("n1", "u3"), ("mine", "me"), ("n2", "u3"), ("a", "u1"), ("b", "u2")])

    let mid = CommunityFeedHold.split(next, tab: "discover", atTop: false, ledger: ledger)
    #expect(mid.held.map(\.id) == ["n1", "n2"])
    #expect(mid.shown.map(\.id) == ["mine", "a", "b"])  // bài của chính mình không bị giữ
    // ở đầu feed: không giữ gì
    #expect(CommunityFeedHold.split(next, tab: "discover", atTop: true, ledger: ledger).held.isEmpty)
    // tab kia có sổ riêng, chưa thấy gì → không giữ
    #expect(CommunityFeedHold.split(next, tab: "following", atTop: false, ledger: ledger).held.isEmpty)
    // một người đăng hai bài là một gương mặt
    #expect(CommunityFeedHold.faces(mid.held).map(\.userId) == ["u3"])

    // chạm viên: mọi bài đang có thành đã thấy
    ledger.release(next.map(\.id), tab: "discover")
    #expect(CommunityFeedHold.split(next, tab: "discover", atTop: false, ledger: ledger).held.isEmpty)
  }

  @Test func ledgerOnlyGrows() {
    var ledger = CommunityFeedHold.Ledger()
    // `ack` là `mutating` — gọi ngoài `#expect` (macro chỉ thấy bản sao bất biến)
    let first = ledger.ack(["a", "b"], tab: "t")
    let again = ledger.ack(["b", "a"], tab: "t")  // vẽ lại cùng danh sách: không ghi
    let more = ledger.ack(["c"], tab: "t")
    #expect(first)
    #expect(!again)
    #expect(more)
    #expect(ledger.seen("t") == ["a", "b", "c"])  // bài cuộn qua rồi vẫn là đã thấy
  }

  @Test func atMostThreeFaces() {
    let held = Self.posts([("1", "u1"), ("2", "u2"), ("3", "u3"), ("4", "u4")])
    #expect(CommunityFeedHold.faces(held).map(\.userId) == ["u1", "u2", "u3"])
  }

  /// "Đang tập hôm nay" (14/10): trong ngày địa phương, mới nhất trước, mỗi
  /// người một lần, không có mình.
  @Test func todayFacesAreTodaysPostersNewestFirst() {
    func post(_ id: String, _ who: String, _ at: String, _ kind: String = "workout") -> JSONValue {
      .object([
        "id": .string(id), "kind": .string(kind), "payload": .object([:]), "author_id": .string(who),
        "created_at": .string(at),
      ])
    }
    let authors = ["u1", "u2", "me"].map { a -> JSONValue in
      .object(["user_id": .string(a), "handle": .string(a), "display_name": .string(a)])
    }
    let posts = CommunityFeed.hydrate(
      [
        post("a", "u1", "2026-10-14T08:00:00Z"), post("b", "u2", "2026-10-14T09:00:00Z", "recipe"),
        post("c", "u1", "2026-10-14T10:00:00Z", "progress"), post("d", "me", "2026-10-14T11:00:00Z"),
        post("e", "u2", "2026-10-13T09:00:00Z"),
      ], me: "me", authors: authors, liked: [], saved: [], arts: [])
    let utc = TimeZone(identifier: "UTC")!
    let f = CommunityToday.faces(posts, me: "me", now: EpochMillis(iso8601: "2026-10-14T12:00:00Z")!, timeZone: utc)
    #expect(f.map(\.author.userId) == ["u1", "u2"])
    #expect(f.map(\.kind) == [.progress, .recipe])
    #expect(CommunityToday.faces(posts, me: "me", now: EpochMillis(iso8601: "2026-10-16T12:00:00Z")!, timeZone: utc).isEmpty)
  }
}
