@testable import ASCNDCore
import Foundation
import Testing

/// Bữa `meal` còn trong outbox hiện ở Nhật ký / "Có trong hôm nay" (#527, chỉ
/// thị 6091878507 · A2). Chỉ ĐỌC hàng đợi: không đổi Outbox / SyncWorker /
/// RemoteWriter. Test viết tay (luật native — RN không hiện bữa chưa gửi).
struct PendingMealsRuleTests {
  static let utc = TimeZone(identifier: "UTC")!
  static let day = DailyLog.dayRange(LocalDate("2026-10-09")!, in: utc)

  static func entry(_ id: String, user: String = "u1", at: String, kcal: Double = 450.4) -> OutboxEntry {
    MealLog.entry(
      id: id, itemIds: ["\(id)-a", "\(id)-b"], userId: user, mealType: "lunch", dateTime: at,
      items: [
        MealLog.Item(id: "x", foodItemId: "f1", name: "Phở", servings: 2, kcal: kcal, protein: 20, carbs: 60, fat: 12),
        MealLog.Item(id: "y", foodItemId: nil, name: "Trà đá", kcal: 0, protein: 0, carbs: 0, fat: 0),
      ],
      createdAt: EpochMillis(0))
  }

  /// Dựng đúng hai hàng server sẽ nhận rồi đi qua `MealDiary.meals`: số trùng số sau khi gửi.
  @Test func pendingMealMatchesWhatTheServerWillShow() throws {
    let e = Self.entry("m1", at: "2026-10-09T05:00:00.000Z")
    let m = try #require(MealLog.pendingMeals([e], userId: "u1", window: Self.day).first)
    let server = MealDiary.meals(entries: [MealLog.entryRow(e.payload)], items: MealLog.itemRows(e.payload))
    #expect(m.id == "m1")
    #expect(m.pending)
    #expect(m.items.allSatisfy { $0.pending })
    #expect(m.kcal == server[0].kcal)
    #expect(m.kcal == 901)
    #expect(m.items.map { $0.foodName } == ["Phở", "Trà đá"])
    #expect(m.items.map { $0.kcal } == server[0].items.map { $0.kcal })
    #expect(m.items.first?.servings == 2)
  }

  /// Chỉ kind `meal`, chỉ của `userId` (cả `entry.userId` lẫn `user_id` của hàng), chỉ trong cửa sổ `[start, end)`.
  @Test func filtersKindUserAndWindow() {
    let other = OutboxEntry(id: "w", userId: "u1", kind: Water.addKind, payload: .object([:]), createdAt: EpochMillis(0))
    let entries = [
      Self.entry("in", at: "2026-10-09T00:00:00.000Z"),
      Self.entry("end", at: "2026-10-10T00:00:00.000Z"),
      Self.entry("before", at: "2026-10-08T23:59:59.999Z"),
      Self.entry("someoneElse", user: "u2", at: "2026-10-09T05:00:00.000Z"),
      other,
    ]
    #expect(MealLog.pendingMeals(entries, userId: "u1", window: Self.day).map { $0.id } == ["in"])
  }

  /// Hàng đã gửi mà outbox chưa kịp bỏ: server đã có cùng id → hiện một lần, bản server.
  @Test func mergeKeepsServerCopy() {
    let e = Self.entry("m1", at: "2026-10-09T05:00:00.000Z")
    let pending = MealLog.pendingMeals([e, Self.entry("m2", at: "2026-10-09T06:00:00.000Z")], userId: "u1", window: Self.day)
    let server = [MealDiary.Meal(id: "m1", type: "lunch", kcal: 901, protein: 0, carbs: 0, fat: 0, items: [])]
    let merged = MealDiary.merge(server: server, pending: pending)
    #expect(merged.map { $0.id } == ["m1", "m2"])
    #expect(merged.map { $0.pending } == [false, true])
  }
}

@MainActor
struct PendingMealsBookTests {
  actor Queue: PendingWrites {
    var entries: [OutboxEntry]
    var fail = false
    init(_ entries: [OutboxEntry]) { self.entries = entries }
    func pending(userId: String) async throws -> [OutboxEntry] {
      if fail { throw URLError(.cannotOpenFile) }
      return entries.filter { $0.userId == userId }
    }
    func setFail() { fail = true }
  }

  /// Nhật ký: server ⊕ outbox; món đang chờ không sửa / xoá được và không chạm server.
  @Test func diaryShowsQueuedMealsReadOnly() async throws {
    let s = MealDiaryBookTests.FakeSource(), store = MealDiaryBookTests.FakeStore()
    s.entryRows = [MealDiaryRuleTests.entry("e1", type: "breakfast", kcal: 100)]
    let q = Queue([PendingMealsRuleTests.entry("m1", at: "2026-10-09T05:00:00.000Z")])
    let b = MealDiaryBook(
      userId: "u1", source: s, store: store, pending: q, clock: MealDiaryBookTests.Clock(at: MealDiaryBookTests.noon),
      timeZone: MealDiaryBookTests.utc)
    await b.load()
    #expect(b.meals.map { $0.id } == ["e1", "m1"])
    let queued = try #require(b.meals.last?.items.first)
    #expect(queued.pending)
    #expect(await b.delete([queued], online: true) == .pendingSync)
    #expect(await b.setServings(queued, to: 3, online: true) == .pendingSync)
    #expect(s.calls.isEmpty)
    // Đọc hàng đợi hỏng: vẫn hiện phần server.
    await q.setFail()
    await b.load()
    #expect(b.meals.map { $0.id } == ["e1"])
  }

  /// Kế hoạch ăn: "Ghi vào hôm nay" lúc mất mạng → ngay lập tức "Có trong hôm nay";
  /// đọc lại khi server chưa có / server hỏng vẫn thấy qua outbox.
  @Test func plannedMealCountsOnceQueued() async {
    let s = MealPlansBookTests.FakeSource(), o = MealPlansBookTests.Outbox()
    let b = MealPlansBookTests.book(s, o)
    await b.load()
    #expect(!b.isLoggedToday("lunch", day: 0))
    #expect(await b.eat(meal: "lunch", day: 0, online: false) == .queued(online: false))
    #expect(b.isLoggedToday("lunch", day: 0))
    await b.load()
    #expect(b.isLoggedToday("lunch", day: 0))
    s.failToday = true
    await b.load()
    #expect(b.isLoggedToday("lunch", day: 0))
  }
}
