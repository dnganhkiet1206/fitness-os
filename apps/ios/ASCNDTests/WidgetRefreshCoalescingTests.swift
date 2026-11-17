import ASCNDCore
import Foundation
import Testing

@testable import ASCND

/// Một lần làm mới widget (R2-SYNC-04): đúng 4 select + đúng 1 lần nạp lại
/// timeline. Lượt gửi gọi `refresh()` MỘT lần (xem `DrainCoalescingTests` ở
/// ASCNDCoreTests), nên mỗi lượt tốn đúng chừng này — không phải 4 select và
/// 1 lần nạp lại cho MỖI entry.
@MainActor
@Suite struct WidgetRefreshCoalescingTests {
  @Test func oneRefreshReadsFourQueriesAndReloadsOnce() async {
    let store = WidgetCountingStore()
    let reloads = ReloadCounter()
    let suite = "com.ascnd.test.widget-refresh"
    defer { UserDefaults(suiteName: suite)?.removePersistentDomain(forName: suite) }
    let data = WidgetDataStore(suite: suite)
    let refresher = WidgetRefresher(store: store, data: data, reloadTimelines: { reloads.bump() })

    // `setUser` làm mới một lần qua Task: đợi nó xong rồi đếm.
    refresher.setUser("u1")
    for _ in 0..<200 where reloads.count < 1 { await Task.yield() }
    #expect(reloads.count == 1)
    #expect(await store.selects == 4)
    #expect(data.todayWorkout() != nil)

    // Làm mới trực tiếp lần nữa: thêm đúng 4 select + 1 lần nạp lại.
    await refresher.refresh()
    #expect(await store.selects == 8)
    #expect(reloads.count == 2)
  }
}

/// Kho đếm select: mọi truy vấn trả rỗng (chưa có dữ liệu).
private actor WidgetCountingStore: RowStore {
  private(set) var selects = 0

  func select(_ q: RowQuery) async throws(RowStoreError) -> [JSONValue] {
    selects += 1
    return []
  }

  func insert(_ table: String, _ row: [String: JSONValue]) async throws(RowStoreError) {}
  func update(_ table: String, _ row: [String: JSONValue], where filters: [RowQuery.Filter]) async throws(RowStoreError) -> Int { 0 }
}

/// Bộ đếm lần nạp lại timeline, gọi được từ closure `@Sendable`.
private final class ReloadCounter: @unchecked Sendable {
  private let lock = NSLock()
  private var _count = 0

  var count: Int { lock.withLock { _count } }
  func bump() { lock.withLock { _count += 1 } }
}
