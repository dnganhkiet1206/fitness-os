@testable import ASCNDCore
import Foundation
import Testing

/// Ngôi sao yêu thích (#527 N2) — `useToggleFavoriteFood` (`hooks/use-nutrition.ts`)
/// @ fac9ac2: món của mình → `update is_favorite`; món mẫu chung → chép vào
/// thư viện theo tên (đã có bản chép thì đánh dấu bản ấy); qua lớp Trạng thái
/// #161 (mất mạng: chạm hai lần = không gửi gì; ghi xong: sao không nháy về).
private actor FakeFoods: FoodLibrarySource, FoodFavoriteSource {
  var rows: [String: [String: JSONValue]] = [:]
  var log: [String] = []

  func put(_ id: String, owner: String?, name: String, favorite: Bool = false) {
    rows[id] = [
      "id": .string(id), "user_id": owner.map { .string($0) } ?? .null, "name": .string(name),
      "kcal": .number(100), "is_favorite": .bool(favorite),
    ]
  }

  func drop(_ id: String) { rows[id] = nil }

  // FoodLibrarySource
  func myFoods(userId: String, from: Int, to: Int) async throws -> [JSONValue] {
    guard from == 0 else { return [] }
    return rows.values.filter { $0["user_id"]?.stringValue == userId }.map { .object($0) }
  }
  func recentItems(userId: String, limit: Int) async throws -> [JSONValue] { [] }
  func insert(userId: String, _ row: [String: JSONValue]) async throws {
    log.append("insert \(row["name"]?.stringValue ?? "") fav=\(row["is_favorite"] == .bool(true))")
    let id = "c\(rows.count)"
    var r = row
    r["id"] = .string(id)
    r["user_id"] = .string(userId)
    rows[id] = r
  }
  func update(id: String, _ row: [String: JSONValue]) async throws -> Int { 0 }
  func delete(id: String, userId: String) async throws -> Int { 0 }

  // FoodFavoriteSource
  func food(id: String) async throws -> JSONValue? { rows[id].map { .object($0) } }
  func setFavorite(id: String, userId: String?, value: Bool) async throws -> Int {
    log.append("fav \(id)=\(value)")
    guard var r = rows[id], userId == nil || r["user_id"]?.stringValue == userId else { return 0 }
    r["is_favorite"] = .bool(value)
    rows[id] = r
    return 1
  }
  func myFoodId(userId: String, name: String) async throws -> String? {
    rows.values.first { $0["user_id"]?.stringValue == userId && $0["name"]?.stringValue == name }?["id"]?.stringValue
  }
}

@MainActor
struct FoodFavoriteTests {
  private func drain() async { for _ in 0..<60 { await Task.yield() } }

  @Test func keyIsPerFood() {
    #expect(FoodFavorite.key("f1") == "food:favorite:f1")
  }

  @Test func ownFoodIsUpdated() async throws {
    let s = FakeFoods()
    await s.put("f1", owner: "u1", name: "Oats")
    #expect(try await FoodFavorite.send(id: "f1", value: true, userId: "u1", source: s) == .ok)
    #expect(await s.log == ["fav f1=true"])
  }

  @Test func missingFoodIsGone() async throws {
    let s = FakeFoods()
    #expect(try await FoodFavorite.send(id: "nope", value: true, userId: "u1", source: s) == .gone)
  }

  @Test func seedIsCopiedOnceThenMarked() async throws {
    let s = FakeFoods()
    await s.put("seed", owner: nil, name: "Rice")
    #expect(try await FoodFavorite.send(id: "seed", value: true, userId: "u1", source: s) == .ok)
    #expect(await s.log == ["insert Rice fav=true"])
    // Gửi lại (vd. lượt trước thật ra đã tới server): đánh dấu bản chép, không chèn bản thứ hai.
    #expect(try await FoodFavorite.send(id: "seed", value: true, userId: "u1", source: s) == .ok)
    #expect(await s.log.filter { $0.hasPrefix("insert") }.count == 1)
  }

  @Test func unfavoritingASeedDoesNothing() async throws {
    let s = FakeFoods()
    await s.put("seed", owner: nil, name: "Rice")
    #expect(try await FoodFavorite.send(id: "seed", value: false, userId: "u1", source: s) == .ok)
    #expect(await s.log.isEmpty)
  }

  @Test func offlineDoubleTapSendsNothing() async {
    let s = FakeFoods()
    await s.put("f1", owner: "u1", name: "Oats")
    let book = FoodLibraryBook(userId: "u1", source: s, favorites: s)
    await book.load()
    var online = false
    let w = StateWriter(environment: .init(online: { online }, isOffline: { NetworkFailure.isOffline($0) }))
    let f = book.mine[0]
    #expect(book.setFavorite(f, value: true, writer: w) == .queued)
    #expect(book.shownFavorite(f, writer: w))
    #expect(book.favoritePending(f, writer: w))
    #expect(book.setFavorite(f, value: false, writer: w) == .unchanged)
    online = true
    w.flush()
    await drain()
    #expect(await s.log.isEmpty)
  }

  @Test func confirmedStarStaysOn() async {
    let s = FakeFoods()
    await s.put("f1", owner: "u1", name: "Oats")
    let book = FoodLibraryBook(userId: "u1", source: s, favorites: s)
    await book.load()
    let w = StateWriter(environment: .init(online: { true }, isOffline: { NetworkFailure.isOffline($0) }))
    let before = book.revision
    book.setFavorite(book.mine[0], value: true, writer: w)
    await drain()
    #expect(!book.favoritePending(book.mine[0], writer: w))
    #expect(book.shownFavorite(book.mine[0], writer: w))
    #expect(book.mine[0].isFavorite)
    #expect(book.revision > before)
  }

  @Test func deletedElsewhereIsGone() async {
    let s = FakeFoods()
    await s.put("f1", owner: "u1", name: "Oats")
    let book = FoodLibraryBook(userId: "u1", source: s, favorites: s)
    await book.load()
    await s.drop("f1")
    let w = StateWriter(environment: .init(online: { true }, isOffline: { NetworkFailure.isOffline($0) }))
    book.setFavorite(book.mine[0], value: true, writer: w)
    await drain()
    #expect(w.notice == .gone)
  }

  @Test func noFavoriteSourceMeansNoStar() async {
    let s = FakeFoods()
    let book = FoodLibraryBook(userId: "u1", source: s)
    #expect(!book.canFavorite)
  }
}
