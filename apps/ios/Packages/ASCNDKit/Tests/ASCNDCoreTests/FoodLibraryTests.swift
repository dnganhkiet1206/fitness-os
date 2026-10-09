@testable import ASCNDCore
import Foundation
import Testing

/// Thư viện thực phẩm (#527 Phase 3 · 3.3) — luật của `food-list.tsx` /
/// `food-editor.tsx` / `food-cards.tsx` / `use-nutrition.ts` @ fac9ac2, viết tay theo mã RN.
struct FoodLibraryRuleTests {
  static func food(_ name: String, brand: String? = nil, fav: Bool = false, kcal: Double = 100) -> FoodLibrary.Food {
    FoodLibrary.Food(
      id: name, userId: "u1", name: name, brand: brand, kcal: kcal, protein: 10.4, carbs: 0, fat: 0, fiber: 0,
      servingG: 0, isFavorite: fav)
  }

  /// `useMyFoodsSorted`: yêu thích trước, rồi theo tên.
  @Test func favoritesFirstThenName() {
    let s = FoodLibrary.sorted([Self.food("Táo"), Self.food("Bánh", fav: true), Self.food("Cơm"), Self.food("Ăn vặt", fav: true)])
    #expect(s.map(\.name) == ["Ăn vặt", "Bánh", "Cơm", "Táo"])
  }

  /// Lọc: tên hoặc thương hiệu, không phân biệt hoa thường; trống = tất cả.
  @Test func filterByNameOrBrand() {
    let all = [Self.food("Sữa chua", brand: "Vinamilk"), Self.food("Ức gà", brand: "CP"), Self.food("Cơm")]
    #expect(FoodLibrary.filter(all, "  VINA ").map(\.name) == ["Sữa chua"])
    #expect(FoodLibrary.filter(all, "gà").map(\.name) == ["Ức gà"])
    #expect(FoodLibrary.filter(all, "").count == 3)
    #expect(FoodLibrary.savedNames(all).contains("ức gà"))
  }

  /// `digits`: chỉ chữ số, bỏ số 0 đầu nhưng giữ một số 0.
  @Test func digitsOnly() {
    #expect(FoodLibrary.digits("0012a.5") == "125")
    #expect(FoodLibrary.digits("000") == "0")
    #expect(FoodLibrary.digits("-50") == "50")
    #expect(FoodLibrary.digits("") == "")
  }

  /// `useFormSeed`: số làm tròn, 0 → trống; khẩu phần 0 → 100.
  @Test func formSeedsFromFood() {
    let f = FoodLibrary.Form(Self.food("Ức gà", brand: "CP", kcal: 165.5))
    #expect(f.name == "Ức gà")
    #expect(f.brand == "CP")
    #expect(f.serving == "100")
    #expect(f.kcal == "166")
    #expect(f.protein == "10")
    #expect(f.carbs == "")
  }

  /// "Tự tính", tỉ lệ ba chất, dải, tên bắt buộc, hàng ghi.
  @Test func formRules() {
    var f = FoodLibrary.Form()
    f.protein = "31"
    f.carbs = "0"
    f.fat = "4"
    #expect(f.calcKcal == 160)
    let p = f.macroPercents
    #expect(p.protein == 89)
    #expect(p.carbs == 0)
    #expect(p.fat == 11)
    #expect(!f.canSave)
    f.name = "  Ức gà  "
    #expect(f.canSave)
    f.kcal = "10001"
    #expect(f.hasFieldErrors)
    #expect(!f.canSave)
    f.kcal = ""
    f.fiber = "2001"
    #expect(f.hasFieldErrors)
    f.fiber = ""
    f.serving = ""
    let row = f.row
    #expect(row["name"] == .string("Ức gà"))
    #expect(row["serving_g"] == .number(100))
    #expect(row["kcal"] == .number(0))
    #expect(row["protein_g"] == .number(31))
    #expect(FoodLibrary.Form().macroPercents.fat == 0)
  }

  /// "+" trên món gần đây: khẩu phần 100 g, thương hiệu trống.
  @Test func recentToRow() {
    let r = MealLog.Food(id: "rec-0", foodItemId: nil, name: "Phở", kcal: 450, protein: 20, carbs: 60, fat: 12, fiber: 2)
    let row = FoodLibrary.row(fromRecent: r)
    #expect(row["serving_g"] == .number(100))
    #expect(row["brand"] == .string(""))
    #expect(row["fiber_g"] == .number(2))
  }
}

@MainActor
struct FoodLibraryBookTests {
  final class FakeSource: FoodLibrarySource, @unchecked Sendable {
    let lock = NSLock()
    var total = 0
    var failRead = false
    var touched = 1
    var writeError: (any Error)?
    var pages: [(Int, Int)] = []
    var writes: [String] = []

    func myFoods(userId: String, from: Int, to: Int) async throws -> [JSONValue] {
      lock.withLock { pages.append((from, to)) }
      if failRead { throw URLError(.badServerResponse) }
      let end = min(to, total - 1)
      guard from <= end else { return [] }
      return (from...end).map { .object(["id": .string("f\($0)"), "name": .string("Món \($0)")]) }
    }
    func recentItems(userId: String, limit: Int) async throws -> [JSONValue] {
      [.object(["food_name": .string("Phở"), "servings": .number(1), "kcal": .number(450)])]
    }
    func insert(userId: String, _ row: [String: JSONValue]) async throws {
      lock.withLock { writes.append("insert \(row["name"]?.stringValue ?? "")") }
      if let writeError { throw writeError }
    }
    func update(id: String, _ row: [String: JSONValue]) async throws -> Int {
      lock.withLock { writes.append("update \(id)") }
      if let writeError { throw writeError }
      return touched
    }
    func delete(id: String, userId: String) async throws -> Int {
      lock.withLock { writes.append("delete \(id) \(userId)") }
      return touched
    }
  }

  /// Đọc theo trang 500 tới HẾT (#180): 1001 món = 3 trang.
  @Test func readsAllPages() async {
    let s = FakeSource()
    s.total = 1001
    let b = FoodLibraryBook(userId: "u1", source: s)
    await b.load()
    #expect(s.pages.map { $0.0 } == [0, 500, 1000])
    #expect(s.pages.first?.1 == 499)
    #expect(b.mine.count == 1001)
    #expect(b.recents.map(\.name) == ["Phở"])
  }

  /// Đọc hỏng là lỗi, không phải "chưa có gì".
  @Test func failedReadIsAnError() async {
    let s = FakeSource()
    s.failRead = true
    let b = FoodLibraryBook(userId: "u1", source: s)
    await b.load()
    #expect(b.phase == .failed(.unavailable))
  }

  /// Ghi chỉ khi có mạng; form hỏng không gửi; không chạm hàng nào → nói thật.
  @Test func writesAreOnlineOnlyAndConfirmed() async {
    let s = FakeSource()
    s.total = 2
    let b = FoodLibraryBook(userId: "u1", source: s)
    var form = FoodLibrary.Form()
    #expect(await b.create(form, online: true) == .invalid)
    form.name = "Ức gà"
    #expect(await b.create(form, online: false) == .onlineOnly)
    #expect(s.writes.isEmpty)
    #expect(await b.create(form, online: true) == .done)
    #expect(await b.update(id: "f1", form, online: true) == .done)
    #expect(await b.delete(id: "f1", online: true) == .done)
    s.touched = 0
    #expect(await b.delete(id: "f9", online: true) == .nothingWritten)
    #expect(s.writes == ["insert Ức gà", "update f1", "delete f1 u1", "delete f9 u1"])
    s.writeError = URLError(.notConnectedToInternet)
    #expect(await b.update(id: "f1", form, online: true) == .onlineOnly)
  }

  @Test func closedBookWritesNothing() async {
    let s = FakeSource()
    let b = FoodLibraryBook(userId: "u1", source: s)
    b.close()
    let r = MealLog.Food(id: "rec-0", foodItemId: nil, name: "Phở", kcal: 450, protein: 0, carbs: 0, fat: 0, fiber: 0)
    #expect(await b.save(recent: r, online: true) == .failed)
    #expect(s.writes.isEmpty)
  }
}
