@testable import ASCNDCore
import Foundation
import Testing

/// Chia sẻ công thức = CHÍNH RN @ fac9ac2 —
/// `Fixtures/community-share-recipe-golden.json`
/// (`gen-community-share-recipe.mjs`: `payloadFromMeal` biên dịch + phần ghép
/// của `useShareableMeals` chép nguyên văn).
struct CommunityShareRecipeGoldenTests {
  static func golden() throws -> JSONValue {
    let url = try #require(
      Bundle.module.url(forResource: "community-share-recipe-golden", withExtension: "json", subdirectory: "Fixtures"))
    return try JSONDecoder().decode(JSONValue.self, from: Data(contentsOf: url))
  }

  static func array(_ v: JSONValue?) -> [JSONValue] { CommunityUserGoldenTests.array(v) }

  static func servings(_ v: JSONValue?) -> [String: Double] {
    guard case .object(let o)? = v else { return [:] }
    return o.compactMapValues { $0.doubleValue }
  }

  @Test func payloadIsRNs() throws {
    let cases = Self.array(try Self.golden()["payload"])
    #expect(cases.count == 160)
    for c in cases {
      let got = CommunityShareRecipe.payload(
        title: c["title"]?.stringValue ?? "", mealType: c["mealType"]?.stringValue ?? "",
        rows: Self.array(c["rows"]), servingG: Self.servings(c["servingG"]))
      #expect(got == c["out"], "\(c)")
    }
  }

  @Test func shareableMealsAreRNs() throws {
    let cases = Self.array(try Self.golden()["meals"])
    #expect(cases.count == 60)
    for c in cases {
      let got = CommunityShareRecipe.meals(
        entries: Self.array(c["entries"]), items: Self.array(c["items"]), foods: Self.array(c["foods"]), me: "me")
      let want = Self.array(c["out"])
      #expect(got.map { $0.id } == want.compactMap { $0["id"]?.stringValue }, "\(c)")
      for (m, w) in zip(got, want) {
        #expect(m.servingG == Self.servings(w["servingG"]), "\(w)")
        #expect(m.rows.compactMap { $0["id"]?.stringValue } == Self.array(w["rows"]).compactMap { $0.stringValue }, "\(w)")
        #expect(m.preview == w["preview"], "\(w)")
      }
    }
  }
}

@MainActor
struct CommunityShareRecipeBookTests {
  final class Remote: CommunityShareRecipeRemote, @unchecked Sendable {
    var failure: CommunityShareFailure?
    var shares: [(String, String)] = []

    func myProfile(me: String) async throws -> JSONValue? {
      .object(["user_id": .string("me"), "handle": .string("me"), "display_name": .string("Me")])
    }
    func privacySettings(me: String) async throws -> JSONValue? { nil }
    func artLibrary() async throws -> [JSONValue] { [] }
    func sharedSessionIds(me: String) async throws -> [String] { ["m2"] }
    func mealEntries(me: String, sinceISO: String) async throws -> [JSONValue] {
      ["m1", "m2", "m3"].map {
        .object([
          "id": .string($0), "user_id": .string("me"), "date_time": .string("2026-10-09T12:00:00Z"),
          "meal_type": .string("lunch"),
        ])
      }
    }
    func mealItems(entryIds: [String]) async throws -> [JSONValue] {
      // m3 rỗng: không được mời.
      ["m1", "m2"].map {
        .object([
          "id": .string("i-\($0)"), "meal_entry_id": .string($0), "food_item_id": .string("f1"),
          "food_name": .string("Ức gà"), "servings": .number(1.5), "kcal": .number(165),
          "created_at": .string("2026-10-09T12:00:00Z"),
        ])
      }
    }
    func foodServings(ids: [String]) async throws -> [JSONValue] {
      [.object(["id": .string("f1"), "serving_g": .number(100)])]
    }
    func shareRecipe(
      entryId: String, title: String, caption: String, visibility: CommunityShare.Visibility, artId: String?
    ) async throws {
      if let failure { throw failure }
      shares.append((entryId, title))
    }
    func artURL(path: String) -> URL? { nil }
  }

  @Test func sharedAndEmptyMealsCannotBePickedAndTheNameIsRequired() async {
    let r = Remote()
    let b = CommunityShareRecipeBook(userId: "me", picked: "m2", remote: r)
    await b.load()
    #expect(b.meals.map { $0.id } == ["m1", "m2"])
    #expect(b.meal == nil)  // `?meal=` trỏ vào bữa đã đăng → danh sách
    b.picked = "m1"
    #expect(b.preview?.recipe?.ingredients.first?.grams == 150)
    #expect(await b.post() == .failed(.nameNeeded))
    #expect(r.shares.isEmpty)
    b.title = "  Cơm gà  "
    #expect(await b.post() == .posted)
    #expect(r.shares.first?.0 == "m1")
    #expect(b.meal == nil)  // vừa đăng → đã chia sẻ
  }
}
