@testable import ASCNDCore
import Foundation
import Testing

/// Ô tìm thực phẩm trên tab Dinh dưỡng (#527).
@MainActor
struct FoodSearchBookTests {
  /// Ghi lại các lượt gọi; trả theo chữ.
  final class Calls: @unchecked Sendable {
    private let lock = NSLock()
    private var _q: [(String, Int)] = []
    var queries: [(String, Int)] { lock.withLock { _q } }
    func add(_ q: String, _ n: Int) { lock.withLock { _q.append((q, n)) } }
  }

  static func row(_ id: String, _ name: String, user: String? = nil) -> JSONValue {
    .object([
      "id": .string(id), "name": .string(name), "user_id": user.map(JSONValue.string) ?? .null,
      "kcal": .number(100), "protein_g": .number(5), "is_favorite": .bool(false),
    ])
  }

  /// Dưới 2 ký tự (sau khi cắt): không gọi, `.idle` — không phải "không có".
  @Test func shortQueryDoesNotSearch() async {
    let calls = Calls()
    let b = FoodSearchBook { q, n in
      calls.add(q, n)
      return []
    }
    await b.search(" a ")
    #expect(b.phase == .idle)
    #expect(calls.queries.isEmpty)
  }

  /// Chữ đã cắt, 20 hàng; món mẫu bị bỏ khi đã có món riêng cùng tên.
  @Test func searchesTrimmedAndDedupesSeeds() async {
    let calls = Calls()
    let b = FoodSearchBook { q, n in
      calls.add(q, n)
      return [Self.row("1", "Phở", user: "u1"), Self.row("2", "phở"), Self.row("3", "Phở cuốn")]
    }
    await b.search("  phở ")
    #expect(calls.queries.first?.0 == "phở")
    #expect(calls.queries.first?.1 == FoodSearch.limit)
    guard case .results(let foods) = b.phase else {
      Issue.record("\(b.phase)")
      return
    }
    #expect(foods.map(\.id) == ["1", "3"])
  }

  /// Rỗng là "không có kết quả", khác với hỏng.
  @Test func emptyAndFailureAreDifferent() async {
    let empty = FoodSearchBook { _, _ in [] }
    await empty.search("xyz")
    #expect(empty.phase == .results([]))
    let broken = FoodSearchBook { _, _ in throw RowStoreError(code: "500", message: "boom") }
    await broken.search("xyz")
    #expect(broken.phase == .failed)
  }

  /// Lượt về muộn (chữ đã đổi) không ghi đè kết quả mới.
  @Test func lateResultIsDropped() async {
    let gate = AsyncStream<Void>.makeStream()
    let b = FoodSearchBook { q, _ in
      if q == "cũ" {
        for await _ in gate.stream { break }
        return [Self.row("old", "cũ")]
      }
      return [Self.row("new", "mới")]
    }
    async let slow: Void = b.search("cũ")
    // Chờ lượt cũ bắt đầu rồi mới tìm chữ mới.
    while b.phase != .searching { await Task.yield() }
    await b.search("mới")
    gate.continuation.yield()
    gate.continuation.finish()
    await slow
    #expect(b.phase == .results([FoodLibrary.Food(row: Self.row("new", "mới"))!]))
  }

  /// Rút về dưới 2 ký tự thì trở lại `.idle`.
  @Test func clearingReturnsToIdle() async {
    let b = FoodSearchBook { _, _ in [Self.row("1", "Gà")] }
    await b.search("gà")
    #expect(b.phase != .idle)
    await b.search("")
    #expect(b.phase == .idle)
  }

  @Test func closedBookIgnoresResults() async {
    let b = FoodSearchBook { _, _ in [Self.row("1", "Gà")] }
    b.close()
    await b.search("gà")
    #expect(b.phase == .idle)
  }
}
