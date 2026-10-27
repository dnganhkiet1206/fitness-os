@testable import ASCNDCore
import Foundation
import Testing

/// Danh sách đi chợ (#527, N1) — `app/grocery.tsx` + `useGroceryItems` /
/// `useGroceryMutations` @ fac9ac2: gợi ý từ thực đơn (gộp theo tên, cộng gam,
/// bỏ món đã có), thêm / xoá chỉ online, tick qua lớp Trạng thái #161 (tick →
/// bỏ → tick khi mất mạng = MỘT lệnh `true`; món đã xoá → bỏ ý và báo).
private actor FakeGroceryServer: GrocerySource {
  var rows: [GroceryItem] = []
  var plan: [(name: String?, grams: Double?)] = []
  var writes: [Bool] = []
  var failItems = false

  func put(_ item: GroceryItem) { rows.append(item) }
  func setPlan(_ p: [(name: String?, grams: Double?)]) { plan = p }
  func drop(_ id: String) { rows.removeAll { $0.id == id } }
  func breakItems() { failItems = true }

  func items(userId: String) async throws -> [GroceryItem] {
    if failItems { throw URLError(.badServerResponse) }
    return rows
  }

  func insert(userId: String, name: String, quantity: String?) async throws {
    rows.insert(GroceryItem(id: "n\(rows.count)", name: name, quantity: quantity, checked: false), at: 0)
  }

  func setChecked(id: String, userId: String, checked: Bool) async throws -> Int {
    writes.append(checked)
    guard let i = rows.firstIndex(where: { $0.id == id }) else { return 0 }
    let r = rows[i]
    rows[i] = GroceryItem(id: r.id, name: r.name, quantity: r.quantity, checked: checked, category: r.category)
    return 1
  }

  func delete(id: String, userId: String) async throws -> Int {
    let n = rows.count
    rows.removeAll { $0.id == id }
    return n - rows.count
  }

  func latestPlanRows(userId: String) async throws -> [(name: String?, grams: Double?)] { plan }
}

@MainActor
struct GroceryTests {
  private func drain() async { for _ in 0..<40 { await Task.yield() } }

  @Test func suggestionsMergeByNameAndSkipWhatIsListed() {
    let rows: [(name: String?, grams: Double?)] = [
      ("Oats", 80), ("  oats ", 40), ("Banana", nil), ("banana", 0), ("", 100), (nil, 50), ("Eggs", 120.4), ("Rice", 150),
    ]
    let have = [GroceryItem(id: "1", name: "RICE", quantity: nil, checked: false)]
    let s = Grocery.suggestions(planRows: rows, existing: have)
    #expect(s.map(\.name) == ["Banana", "Eggs", "Oats"])
    #expect(s.map(\.amount) == ["×2", "120g", "120g"])
    #expect(s.first { $0.name == "Oats" }?.times == 2)
  }

  /// Audit vòng 3 (26/10): "Cơm 21000g" → nhóm chữ số, từ 1000 g ra kg; chữ khác giữ nguyên
  /// (hàng danh sách từng thêm "×" trước "×3" thành "××3").
  @Test func quantityLabelGroupsDigitsAndUsesKg() {
    let vi = Locale(identifier: "vi_VN"), en = Locale(identifier: "en_US")
    #expect(Grocery.quantityLabel("21000g", locale: vi) == "21 kg")
    #expect(Grocery.quantityLabel("1250g", locale: vi) == "1,3 kg")
    #expect(Grocery.quantityLabel("1250g", locale: en) == "1.3 kg")
    #expect(Grocery.quantityLabel("1000g", locale: en) == "1 kg")
    #expect(Grocery.quantityLabel("12345678g", locale: en) == "12,345.7 kg")
    #expect(Grocery.quantityLabel("12345678g", locale: vi) == "12.345,7 kg")
    #expect(Grocery.quantityLabel("400g", locale: vi) == "400 g")
    #expect(Grocery.quantityLabel("999g", locale: en) == "999 g")
    #expect(Grocery.quantityLabel("×3", locale: vi) == "×3")
    #expect(Grocery.quantityLabel("1 L", locale: vi) == "1 L")
    #expect(Grocery.quantityLabel("big bag", locale: en) == "big bag")
    // Chữ LƯU không đổi (không theo ngôn ngữ).
    let s = Grocery.Suggestion(name: "Cơm", grams: 21000, times: 7)
    #expect(s.amount == "21000g")
  }

  @Test func addIsOnlineOnlyAndTrims() async {
    let server = FakeGroceryServer()
    let book = GroceryBook(userId: "u1", source: server)
    await book.refresh()
    #expect(await book.add("   ", online: true) == .emptyName)
    #expect(await book.add("Milk", online: false) == .onlineOnly)
    #expect(book.items.isEmpty)
    #expect(await book.add("  Milk ", quantity: "1 L", online: true) == .done)
    #expect(book.items.map(\.name) == ["Milk"])
    #expect(book.items.first?.quantity == "1 L")
  }

  @Test func addFromPlanRemovesTheSuggestion() async {
    let server = FakeGroceryServer()
    await server.setPlan([("Oats", 80)])
    let book = GroceryBook(userId: "u1", source: server)
    await book.refresh()
    #expect(book.suggestions.map(\.name) == ["Oats"])
    let s = book.suggestions[0]
    #expect(await book.add(s.name, quantity: s.amount, online: true) == .done)
    #expect(book.suggestions.isEmpty)
  }

  @Test func failedReadIsAnErrorNotAnEmptyList() async {
    let server = FakeGroceryServer()
    await server.breakItems()
    let book = GroceryBook(userId: "u1", source: server)
    await book.refresh()
    if case .failed = book.phase {} else { Issue.record("expected failed, got \(book.phase)") }
  }

  @Test func offlineTicksMergeToOneWrite() async {
    let server = FakeGroceryServer()
    await server.put(GroceryItem(id: "a", name: "Milk", quantity: nil, checked: false))
    let book = GroceryBook(userId: "u1", source: server)
    await book.refresh()
    var online = false
    let w = StateWriter(environment: .init(online: { online }, isOffline: { NetworkFailure.isOffline($0) }))
    let item = book.items[0]
    #expect(book.setChecked(item, checked: true, writer: w) == .queued)
    #expect(book.setChecked(item, checked: false, writer: w) == .unchanged)
    #expect(book.setChecked(item, checked: true, writer: w) == .queued)
    #expect(book.shownChecked(item, writer: w))
    #expect(book.isPending(item, writer: w))
    #expect(book.remaining(writer: w) == 0)
    online = true
    w.flush()
    await drain()
    #expect(await server.writes == [true])
    #expect(!book.isPending(item, writer: w))
  }

  @Test func onlineTickStaysTickedAfterTheWrite() async {
    let server = FakeGroceryServer()
    await server.put(GroceryItem(id: "a", name: "Milk", quantity: nil, checked: false))
    let book = GroceryBook(userId: "u1", source: server)
    await book.refresh()
    let w = StateWriter(environment: .init(online: { true }, isOffline: { NetworkFailure.isOffline($0) }))
    #expect(book.setChecked(book.items[0], checked: true, writer: w) == .sending)
    await drain()
    #expect(!book.isPending(book.items[0], writer: w))
    #expect(book.shownChecked(book.items[0], writer: w))
    #expect(book.remaining(writer: w) == 0)
    #expect(await server.writes == [true])
  }

  @Test func deletedElsewhereIsGone() async {
    let server = FakeGroceryServer()
    await server.put(GroceryItem(id: "a", name: "Milk", quantity: nil, checked: false))
    let book = GroceryBook(userId: "u1", source: server)
    await book.refresh()
    await server.drop("a")
    let w = StateWriter(environment: .init(online: { true }, isOffline: { NetworkFailure.isOffline($0) }))
    book.setChecked(book.items[0], checked: true, writer: w)
    await drain()
    #expect(w.notice == .gone)
    #expect(w.size == 0)
  }

  @Test func removeReportsNothingWritten() async {
    let server = FakeGroceryServer()
    await server.put(GroceryItem(id: "a", name: "Milk", quantity: nil, checked: false))
    let book = GroceryBook(userId: "u1", source: server)
    await book.refresh()
    #expect(await book.remove(id: "a", online: false) == .onlineOnly)
    #expect(await book.remove(id: "a", online: true) == .done)
    #expect(await book.remove(id: "a", online: true) == .nothingWritten)
    #expect(book.items.isEmpty)
  }

  @Test func checkedKeyIsPerItem() {
    #expect(Grocery.checkedKey("ABC-1") == "grocery:checked:abc-1")
  }
}
