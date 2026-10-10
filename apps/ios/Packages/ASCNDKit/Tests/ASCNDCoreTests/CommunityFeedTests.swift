@testable import ASCNDCore
import Foundation
import Testing

/// Feed Cộng đồng = `use-community.ts` (đọc payload, trích nguyên văn),
/// `lib/recipe-post.ts`, `lib/feed-page.ts`, `lib/time-ago.ts` @ fac9ac2 —
/// `Fixtures/community-feed-golden.json` là chính mã RN chạy trên payload hỏng.
struct CommunityFeedGoldenTests {
  static func root() throws -> JSONValue {
    let url = try #require(
      Bundle.module.url(forResource: "community-feed-golden", withExtension: "json", subdirectory: "Fixtures"))
    return try JSONDecoder().decode(JSONValue.self, from: Data(contentsOf: url))
  }

  static func array(_ v: JSONValue?) -> [JSONValue] {
    if case .array(let a)? = v { return a }
    return []
  }

  static func num(_ v: JSONValue?) -> Double? {
    if case .number(let n)? = v { return n }
    return nil
  }

  /// Ô vào là `null` trong golden = khoá có mặt mang `null` (đúng như JSON thật).
  static func raw(_ c: JSONValue) -> JSONValue? { c["raw"] }

  static func metric(_ m: CommunityPayloads.Metric?, _ w: JSONValue?) {
    guard let w, w != .null else {
      #expect(m == nil)
      return
    }
    #expect(m?.start == num(w["start"]))
    #expect(m?.end == num(w["end"]))
    #expect(m?.series == array(w["series"]).compactMap { num($0) })
  }

  @Test func workoutPayloadIsRNs() throws {
    let cases = Self.array(try Self.root()["workouts"])
    #expect(cases.count == 120)
    for c in cases {
      let got = CommunityPayloads.workout(Self.raw(c))
      let w = c["out"]
      #expect(got.title == w?["title"]?.stringValue, "\(c)")
      #expect(got.performedAt == w?["performedAt"]?.stringValue)
      #expect(got.volumeKg == Self.num(w?["volumeKg"]), "\(c)")
      #expect(got.pr == (w?["pr"] == .bool(true)))
      #expect(got.minutes == Self.num(w?["minutes"]), "\(c)")
      #expect(got.exerciseCount == Self.num(w?["exerciseCount"]), "\(c)")
      let lines = Self.array(w?["exercises"])
      #expect(got.exercises.count == lines.count)
      for (g, l) in zip(got.exercises, lines) {
        #expect(g.exerciseId == l["exerciseId"]?.stringValue)
        #expect(g.exerciseName == l["exerciseName"]?.stringValue)
        #expect(g.library == (l["library"] == .bool(true)))
        #expect(g.sets == Self.num(l["sets"]), "\(c)")
        #expect(g.weight == Self.num(l["weight"]))
        #expect(g.reps == Self.num(l["reps"]))
      }
    }
  }

  @Test func progressPayloadIsRNs() throws {
    let cases = Self.array(try Self.root()["progress"])
    #expect(cases.count == 100)
    var lifts = 0
    for c in cases {
      let got = CommunityPayloads.progress(Self.raw(c))
      let w = c["out"]
      #expect(got.weeks == Self.num(w?["weeks"]), "\(c)")
      Self.metric(got.weight, w?["weight"])
      Self.metric(got.waist, w?["waist"])
      Self.metric(got.lift, w?["lift"])
      #expect(got.liftName == w?["lift"]?["name"]?.stringValue, "\(c)")
      if got.lift != nil { lifts += 1 }
    }
    #expect(lifts > 0)
  }

  @Test func recipePayloadIsRNs() throws {
    let cases = Self.array(try Self.root()["recipes"])
    #expect(cases.count == 100)
    for c in cases {
      let got = CommunityPayloads.recipe(Self.raw(c))
      let w = c["out"]
      #expect(got.title == w?["title"]?.stringValue)
      #expect(got.mealType == w?["mealType"]?.stringValue)
      #expect(got.kcal == Self.num(w?["kcal"]), "\(c)")  // tính lại, không tin 9999 của payload
      #expect(got.protein == Self.num(w?["protein"]))
      #expect(got.carbs == Self.num(w?["carbs"]))
      #expect(got.fat == Self.num(w?["fat"]))
      let lines = Self.array(w?["ingredients"])
      #expect(got.ingredients.count == lines.count, "\(c)")
      for (g, l) in zip(got.ingredients, lines) {
        #expect(g.name == l["name"]?.stringValue)
        #expect(g.grams == Self.num(l["grams"]), "\(c)")
        #expect(g.kcal == Self.num(l["kcal"]))
      }
    }
  }

  @Test func discoverKindsAreRNs() throws {
    let cases = Self.array(try Self.root()["discover"])
    #expect(cases.count == 8)
    for c in cases {
      #expect(CommunityPayloads.discover(Self.raw(c)) == Self.array(c["out"]).compactMap(\.stringValue), "\(c)")
    }
  }

  static func cursor(_ v: JSONValue?) -> CommunityPayloads.Cursor? {
    guard let at = v?["at"]?.stringValue, let id = v?["id"]?.stringValue else { return nil }
    return CommunityPayloads.Cursor(at: at, id: id, newer: v?["newer"] == .bool(true))
  }

  @Test func cursorsAndFiltersAreRNs() throws {
    let root = try Self.root()
    let cases = Self.array(root["cursors"])
    #expect(cases.count == 40)
    for c in cases {
      let page = Self.array(c["page"]).map { (createdAt: $0["created_at"]?.stringValue ?? "", id: $0["id"]?.stringValue ?? "") }
      let size = Int(Self.num(c["size"]) ?? 0)
      #expect(CommunityPayloads.nextCursor(page, size: size) == Self.cursor(c["next"]), "\(c)")
      #expect(CommunityPayloads.prevCursor(page, param: Self.cursor(c["param"]), size: size) == Self.cursor(c["prev"]), "\(c)")
    }
    for f in Self.array(root["filters"]) {
      let c = CommunityPayloads.Cursor(at: f["at"]?.stringValue ?? "", id: f["id"]?.stringValue ?? "")
      #expect(CommunityPayloads.olderThan(c) == f["older"]?.stringValue)
      #expect(CommunityPayloads.newerThan(c) == f["newer"]?.stringValue)
    }
  }

  /// Chuỗi của golden: `now`, `{n}m`, `{n}h`, `{n}d`; quá 7 ngày in ngày theo
  /// locale (golden chạy `en`, UTC).
  @Test func timeAgoIsRNs() throws {
    let root = try Self.root()
    let now = EpochMillis(Int64(Self.num(root["now"]) ?? 0))
    let fmt = DateFormatter()
    fmt.locale = Locale(identifier: "en_US_POSIX")
    fmt.timeZone = TimeZone(identifier: "UTC")
    fmt.dateFormat = "MMM d"
    let cases = Self.array(root["ago"])
    #expect(cases.count == 15)
    for c in cases {
      let text: String =
        switch CommunityPayloads.ago(c["iso"]?.stringValue ?? "", now: now) {
        case .justNow: "now"
        case .minutes(let n): "\(n)m"
        case .hours(let n): "\(n)h"
        case .days(let n): "\(n)d"
        case .date(let d): fmt.string(from: d)
        case .invalid: ""
        }
      #expect(text == c["out"]?.stringValue, "\(c)")
    }
  }
}

@MainActor
struct CommunityFeedBookTests {
  struct Clock: WallClock {
    func now() -> Date { Date(timeIntervalSince1970: 1_791_633_600) }  // 2026-10-10T12:00Z
  }

  struct Boom: Error {}

  final class Remote: CommunityFeedRemote, @unchecked Sendable {
    var follows: [String: [String]] = [:]
    var settingsRow: [String: JSONValue] = [:]
    /// Mới → cũ theo `(created_at, id)`.
    var table: [JSONValue] = []
    var usefulRows: [JSONValue] = []
    var likes: [String: Set<String>] = [:]
    var saves: [String: Set<String>] = [:]
    var arts: [JSONValue] = []
    var restrictionRow: JSONValue?
    var profileRow: JSONValue?
    var failPosts = false
    var failRestriction = false
    var failProfile = false
    var failUseful = false
    var queries: [CommunityPostQuery] = []

    func followees(me: String) async throws -> [String] { follows[me] ?? [] }
    func settings(me: String) async throws -> JSONValue? { settingsRow[me] }

    func posts(_ q: CommunityPostQuery) async throws -> [JSONValue] {
      queries.append(q)
      if q.usefulSince != nil {
        if failUseful { throw Boom() }
        return usefulRows.filter { $0["author_id"]?.stringValue != q.excludeAuthor }
      }
      if failPosts { throw Boom() }
      var rows = table
      if let a = q.authors { rows = rows.filter { a.contains($0["author_id"]?.stringValue ?? "") } }
      if let k = q.kinds { rows = rows.filter { k.contains($0["kind"]?.stringValue ?? "") } }
      if let f = q.cursorFilter {
        // Con trỏ = hàng có đúng bộ lọc `olderThan` ấy; trả các hàng sau nó.
        guard
          let i = rows.firstIndex(where: {
            CommunityPayloads.olderThan(
              .init(at: $0["created_at"]?.stringValue ?? "", id: $0["id"]?.stringValue ?? "")) == f
          })
        else { return [] }
        rows = Array(rows.dropFirst(i + 1))
      }
      return Array(rows.prefix(q.limit))
    }

    func profiles(ids: [String]) async throws -> [JSONValue] {
      ids.map { .object(["user_id": .string($0), "handle": .string("h-\($0)"), "display_name": .string("N \($0)")]) }
    }
    func likedPostIds(me: String, postIds: [String]) async throws -> [String] {
      postIds.filter { likes[me]?.contains($0) == true }
    }
    func savedPostIds(me: String, postIds: [String]) async throws -> [String] {
      postIds.filter { saves[me]?.contains($0) == true }
    }
    func art(ids: [String]) async throws -> [JSONValue] { arts.filter { ids.contains($0["id"]?.stringValue ?? "") } }
    func restriction(me: String, nowISO: String) async throws -> JSONValue? {
      if failRestriction { throw Boom() }
      return restrictionRow
    }
    func myProfile(me: String) async throws -> JSONValue? {
      if failProfile { throw Boom() }
      return profileRow
    }
    func artURL(path: String) -> URL? { URL(string: "https://art/\(path)") }

    static func post(_ i: Int, author: String, kind: String = "workout", art: String? = nil) -> JSONValue {
      var o: [String: JSONValue] = [
        "id": .string(String(format: "p%03d", i)), "author_id": .string(author), "kind": .string(kind),
        "payload": .object(["title": .string("T\(i)"), "volumeKg": .number(100)]), "caption": .string(""),
        "visibility": .string("public"), "like_count": .number(1), "comment_count": .number(0),
        "save_count": .number(0), "hidden": .bool(false),
        "created_at": .string(String(format: "2026-10-%02dT10:00:00+00:00", 1 + (500 - i) / 60)),
      ]
      if let art { o["art_id"] = .string(art) }
      return .object(o)
    }
  }

  static func book(_ r: Remote, user: String = "me") -> CommunityFeedBook {
    CommunityFeedBook(userId: user, remote: r, clock: Clock())
  }

  /// Mới → cũ, khoá giảm dần như server sắp.
  static func seed(_ r: Remote, count: Int, author: (Int) -> String) {
    r.table = (0..<count).map { Remote.post(500 - $0, author: author($0)) }
      .sorted { ($0["created_at"]?.stringValue ?? "", $0["id"]?.stringValue ?? "") > ($1["created_at"]?.stringValue ?? "", $1["id"]?.stringValue ?? "") }
  }

  @Test func followingIsMineAndFolloweesPagedBy30() async {
    let r = Remote()
    r.follows["me"] = ["a"]
    Self.seed(r, count: 80) { ["me", "a", "stranger"][$0 % 3] }
    let b = Self.book(r)
    #expect(b.tab == .discover)  // mặc định như RN
    await b.select(.following)
    #expect(b.phase == .ready)
    #expect(r.queries.first?.authors == ["me", "a"])
    #expect(!r.queries.contains { $0.usefulSince != nil })  // Hữu ích chỉ ở Khám phá
    #expect(b.posts.count == 30)
    #expect(b.posts.allSatisfy { ["me", "a"].contains($0.author?.userId ?? "") })
    #expect(b.canLoadMore)
    await b.loadMore()
    await b.loadMore()
    let mineOrFollowed = r.table.filter { ["me", "a"].contains($0["author_id"]?.stringValue ?? "") }.count
    #expect(b.posts.count == mineOrFollowed)  // 54: trang 2 có 24 < 30 → hết
    #expect(!b.canLoadMore)
    #expect(Set(b.posts.map(\.id)).count == b.posts.count)
    #expect(b.posts.map(\.id) == r.table.compactMap { row in
      ["me", "a"].contains(row["author_id"]?.stringValue ?? "") ? row["id"]?.stringValue : nil
    })
  }

  @Test func firstFailureIsAnErrorNotAnEmptyFeed() async {
    let r = Remote()
    r.failPosts = true
    let b = Self.book(r)
    await b.load()
    #expect(b.phase == .failed)
    #expect(b.posts.isEmpty)
    r.failPosts = false
    await b.load()
    #expect(b.phase == .ready)  // trống thật: sẵn sàng, không phải lỗi
    #expect(b.posts.isEmpty)
    Self.seed(r, count: 3) { _ in "me" }
    await b.load()
    #expect(b.posts.count == 3)
    r.failPosts = true
    await b.load()
    #expect(b.phase == .ready)
    #expect(b.posts.count == 3)  // làm mới hỏng: giữ bài đang có
  }

  @Test func failedLoadMoreKeepsThePostsAndCanRetry() async {
    let r = Remote()
    Self.seed(r, count: 40) { _ in "me" }
    let b = Self.book(r)
    await b.load()
    r.failPosts = true
    await b.loadMore()
    #expect(b.moreFailed)
    #expect(b.posts.count == 30)
    #expect(b.canLoadMore)
    r.failPosts = false
    await b.loadMore()
    #expect(!b.moreFailed)
    #expect(b.posts.count == 40)
  }

  @Test func discoverFiltersByTheChosenKinds() async {
    let r = Remote()
    r.table = [
      Remote.post(3, author: "x", kind: "recipe"), Remote.post(2, author: "y", kind: "workout"),
      Remote.post(1, author: "z", kind: "progress"),
    ]
    r.settingsRow["me"] = .object(["discover_kinds": .array([.string("recipe")])])
    let b = Self.book(r)
    await b.load()
    #expect(r.queries.first?.kinds == ["recipe"])
    #expect(b.posts.map(\.kind) == [.recipe])
    #expect(b.posts.first?.recipe != nil)
    await b.select(.following)
    #expect(b.tab == .following)
    #expect(b.posts.isEmpty)  // không theo dõi ai
    // Chọn đủ ba = không lọc (không gửi `kind in (...)`).
    r.settingsRow["me"] = .object(["discover_kinds": .array([.string("workout"), .string("progress"), .string("recipe")])])
    await b.select(.discover)
    #expect(r.queries.last(where: { $0.usefulSince == nil })?.kinds == nil)
    #expect(b.posts.count == 3)
  }

  @Test func hydrationMarksOnlyMyLikesAndSavesAndKeepsRetiredArt() async {
    let r = Remote()
    r.table = [Remote.post(2, author: "me", art: "art-1"), Remote.post(1, author: "me")]
    r.likes = ["me": ["p002"], "other": ["p001"]]
    r.saves = ["me": ["p001"]]
    r.arts = [.object(["id": .string("art-1"), "path": .string("w/1.png"), "active": .bool(false)])]
    let b = Self.book(r)
    await b.load()
    #expect(b.posts.map(\.liked) == [true, false])
    #expect(b.posts.map(\.saved) == [false, true])
    #expect(b.posts.allSatisfy(\.mine))
    #expect(b.posts[0].author?.handle == "h-me")
    #expect(b.posts[0].art?.path == "w/1.png")  // ảnh đã tắt vẫn vẽ bài cũ
    #expect(b.artURL(b.posts[0].art!)?.absoluteString == "https://art/w/1.png")
    #expect(b.posts[1].art == nil)
  }

  @Test func usefulThisWeekExcludesMeAndAsksTheLast168Hours() async {
    let r = Remote()
    var mine = Remote.post(9, author: "me")
    var other = Remote.post(8, author: "x")
    if case .object(var o) = other {
      o["try_count"] = .number(4)
      other = .object(o)
    }
    if case .object(var o) = mine {
      o["try_count"] = .number(9)
      mine = .object(o)
    }
    r.usefulRows = [mine, other]
    let b = Self.book(r)
    await b.load()
    let q = r.queries.first { $0.usefulSince != nil }
    #expect(q?.usefulSince == "2026-10-03T12:00:00.000Z")
    #expect(q?.limit == 3)
    #expect(q?.excludeAuthor == "me")
    #expect(b.useful.map(\.id) == ["p008"])
    #expect(b.useful.first?.tries == 4)
    #expect(b.posts.first?.tries == nil)
  }

  @Test func extrasFailingNeverBreakTheFeed() async {
    let r = Remote()
    Self.seed(r, count: 2) { _ in "me" }
    r.failUseful = true
    r.failRestriction = true
    r.failProfile = true
    let b = Self.book(r)
    await b.load()
    #expect(b.phase == .ready)
    #expect(b.posts.count == 2)
    #expect(b.useful.isEmpty)
    #expect(b.restriction == nil)
    #expect(b.hasProfile == nil)  // chưa biết ≠ chưa có hồ sơ
    r.failRestriction = false
    r.failProfile = false
    r.restrictionRow = .object(["until": .string("2026-10-12T00:00:00+00:00"), "reason": .string("spam")])
    await b.load()
    #expect(b.restriction?.reason == "spam")
    #expect(b.hasProfile == false)
    r.profileRow = .object(["user_id": .string("me")])
    await b.load()
    #expect(b.hasProfile == true)
  }

  /// Đổi tài khoản = book mới; book cũ đã đóng không ghi đè gì nữa.
  @Test func anotherAccountSeesOnlyItsOwnMarks() async {
    let r = Remote()
    r.table = [Remote.post(1, author: "a")]
    r.follows = ["me": ["a"], "you": ["a"]]
    r.likes = ["me": ["p001"]]
    let mine = Self.book(r, user: "me")
    await mine.load()
    #expect(mine.posts.first?.liked == true)
    mine.close()
    let yours = Self.book(r, user: "you")
    await yours.load()
    #expect(yours.posts.first?.liked == false)
    #expect(yours.posts.first?.mine == false)
    r.table = []
    await mine.load()
    #expect(mine.posts.count == 1)  // đã đóng: không ghi đè
  }
}

/// Chữ trên thẻ như các thẻ RN in.
struct CommunityCardTests {
  static func post(_ kind: CommunityFeed.Kind, payload: JSONValue, caption: String = "", counts: (Int?, Int, Int, Int) = (nil, 0, 0, 0)) -> CommunityFeed.Post {
    var row: [String: JSONValue] = [
      "id": .string("p"), "kind": .string(kind.rawValue), "payload": payload, "caption": .string(caption),
      "like_count": .number(Double(counts.3)), "comment_count": .number(Double(counts.2)),
      "save_count": .number(Double(counts.1)), "created_at": .string("2026-10-10T00:00:00Z"),
    ]
    if let t = counts.0 { row["try_count"] = .number(Double(t)) }
    return CommunityFeed.hydrate([.object(row)], me: "me", authors: [], liked: [], saved: [], arts: [])[0]
  }

  @Test func workoutLinesAndVolume() {
    let w = CommunityPayloads.workout(
      .object([
        "volumeKg": .number(12840.4),
        "exercises": .array([
          .object(["exerciseName": .string("Squat"), "sets": .number(3), "weight": .number(60), "reps": .number(8)]),
          .object(["exerciseName": .string("Plank"), "sets": .number(3), "weight": .number(0), "reps": .number(12)]),
        ]),
      ]))
    #expect(CommunityCard.setText(w.exercises[0], unit: .kg) == "60 kg × 8")
    #expect(CommunityCard.setText(w.exercises[0], unit: .lbs) == "132.3 lb × 8")
    #expect(CommunityCard.setText(w.exercises[1], unit: .kg) == "3 × 12")
    let en = Locale(identifier: "en_US")
    #expect(CommunityCard.volumeText(w.volumeKg, unit: .kg, locale: en) == "12,840 kg")
    #expect(CommunityCard.volumeText(0, unit: .kg, locale: en) == nil)
  }

  @Test func progressTilesFollowWeightLiftOrder() {
    let p = CommunityPayloads.progress(
      .object([
        "weeks": .number(8),
        "lift": .object(["name": .string("Bench"), "start": .number(60), "end": .number(70)]),
        "weight": .object(["start": .number(80), "end": .number(77.96), "series": .array([.number(80), .number(77.96)])]),
      ]))
    let tiles = CommunityCard.tiles(p, unit: .kg)
    #expect(tiles.map(\.kind) == [.weight, .lift])
    #expect(tiles[0].startText == "80 kg")
    #expect(tiles[0].endText == "78 kg")  // displayWeight làm tròn một chữ số lẻ
    #expect(tiles[0].deltaText == "-2 kg")
    #expect(tiles[1].deltaText == "+10 kg")
    #expect(tiles[1].liftName == "Bench")
  }

  @Test func usefulTitleAndReasons() {
    let w = Self.post(.workout, payload: .object(["title": .string("  Push  ")]), counts: (4, 6, 0, 9))
    #expect(CommunityCard.usefulTitle(w) == "Push")
    #expect(CommunityCard.reasons(w) == [.tries(4), .saves(6)])
    let r = Self.post(.recipe, payload: .object([:]), caption: " Bún bò \nngon", counts: (nil, 0, 2, 3))
    #expect(CommunityCard.usefulTitle(r) == "Bún bò")
    #expect(CommunityCard.reasons(r) == [.comments(2), .likes(3)])
    let g = Self.post(.progress, payload: .object([:]))
    #expect(CommunityCard.usefulTitle(g) == nil)
    #expect(CommunityCard.reasons(g).isEmpty)
  }
}
