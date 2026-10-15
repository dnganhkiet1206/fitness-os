@testable import ASCNDCore
import Foundation
import Testing

/// Bố cục feed kiểu Apple News (15/10).
struct CommunityLayoutTests {
  static let now = EpochMillis(iso8601: "2026-10-15T12:00:00Z")!

  static func post(
    _ id: String, kind: String = "workout", hoursAgo: Double = 1, likes: Int = 0, comments: Int = 0, saves: Int = 0,
    payload: JSONValue = .object([:])
  ) -> CommunityFeed.Post {
    let at = Date(timeIntervalSince1970: Double(now.millis) / 1000 - hoursAgo * 3600)
    let row: JSONValue = .object([
      "id": .string(id), "kind": .string(kind), "payload": payload, "author_id": .string("u"),
      "created_at": .string(ISO8601DateFormatter().string(from: at)), "like_count": .number(Double(likes)),
      "comment_count": .number(Double(comments)), "save_count": .number(Double(saves)),
    ])
    return CommunityFeed.hydrate([row], me: "me", authors: [], liked: [], saved: [], arts: [])[0]
  }

  @Test func categoryFollowsKind() {
    #expect(CommunityLayout.Category.of(.progress) == .health)
    #expect(CommunityLayout.Category.of(.recipe) == .food)
    #expect(CommunityLayout.Category.of(.workout) == .ascnd)
  }

  @Test func trendScoreWeighsSavesAndDecays() {
    let quiet = Self.post("q")
    #expect(CommunityLayout.trendScore(quiet, now: Self.now) == nil)
    let liked = Self.post("l", likes: 3)
    let saved = Self.post("s", saves: 1)
    #expect(CommunityLayout.trendScore(liked, now: Self.now) == CommunityLayout.trendScore(saved, now: Self.now))
    let old = Self.post("o", hoursAgo: 30, likes: 3)
    #expect(CommunityLayout.trendScore(old, now: Self.now)! < CommunityLayout.trendScore(liked, now: Self.now)!)
  }

  @Test func trendingSkipsQuietAndOldPosts() {
    let posts = [
      Self.post("a", likes: 1), Self.post("quiet"), Self.post("b", likes: 10), Self.post("old", hoursAgo: 100, likes: 50),
      Self.post("c", comments: 1), Self.post("d", hoursAgo: 0, likes: 1),
    ]
    let got = CommunityLayout.trending(posts, now: Self.now).map(\.id)
    #expect(got == ["b", "c", "d"])
  }

  @Test func diversifiedAvoidsSameCategoryNeighbours() {
    let posts = [Self.post("w1"), Self.post("w2"), Self.post("r1", kind: "recipe"), Self.post("w3")]
    #expect(CommunityLayout.diversified(posts).map(\.id) == ["w1", "r1", "w2", "w3"])
    // không có bài khác loại trong tầm nhìn → giữ thứ tự
    let same = [Self.post("a"), Self.post("b")]
    #expect(CommunityLayout.diversified(same).map(\.id) == ["a", "b"])
  }

  @Test func slotsFollowTheBeat() {
    let strong = Self.post("w", payload: .object(["pr": .bool(true)]))
    let posts = [strong] + (1...5).map { Self.post("r\($0)", kind: "recipe") }
    let slots = CommunityLayout.slots(posts)
    // nhịp: thẻ lớn, hai hàng, lưới; r5 không đủ mạnh làm thẻ lớn → hàng
    #expect(slots.map(\.id) == ["h:w", "r:r1", "r:r2", "g:r3:r4", "r:r5"])
    #expect(slots.flatMap(\.posts).count == posts.count)
  }

  @Test func weakPostNeverHero_loneTailIsRow() {
    let slots = CommunityLayout.slots([Self.post("a", kind: "recipe"), Self.post("b", kind: "recipe"),
                                       Self.post("c", kind: "recipe"), Self.post("d", kind: "recipe")])
    #expect(slots.map(\.id) == ["r:a", "r:b", "r:c", "r:d"])
  }

  @Test func localizedNumbersUseTheAppLocale() {
    let vi = Locale(identifier: "vi_VN")
    let en = Locale(identifier: "en_US")
    #expect(CommunityCard.decimal(121.7, locale: vi) == "121,7")
    #expect(CommunityCard.decimal(121.7, locale: en) == "121.7")
    #expect(CommunityCard.decimal(6757, locale: vi) == "6.757")
    #expect(CommunityCard.decimal(80, locale: vi) == "80")
    let t = CommunityCard.Tile(kind: .weight, liftName: nil, unit: "lb", start: 119, end: 121.7, series: [119, 121.7])
    #expect(t.deltaText(locale: vi) == "+2,7 lb")
    #expect(t.endText(locale: vi) == "121,7 lb")
    #expect(t.deltaText == "+2.7 lb", "bản RN giữ nguyên")
  }
}
