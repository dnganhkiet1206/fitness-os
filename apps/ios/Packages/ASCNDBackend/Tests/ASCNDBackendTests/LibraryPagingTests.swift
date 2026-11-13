@testable import ASCNDBackend
import Testing

/// AUD-05 (round 3): thư viện bài tập đọc theo trang tới hết; không bao giờ trả
/// nửa thư viện khi vượt trần.
struct LibraryPagingTests {
  /// Giả một bảng `n` dòng phục vụ theo `[from, to]`.
  static func table(_ n: Int) -> @Sendable (Int, Int) async throws -> [Int] {
    { from, to in from < n ? Array(from...min(to, n - 1)) : [] }
  }

  @Test func readsEveryRowAcrossPages() async throws {
    for n in [0, 1, 499, 500, 501, 873, 1000, 1001, 2500] {
      let rows = try await SupabaseExerciseSource.allPages(pageSize: 500, maxPages: 20, Self.table(n))
      #expect(rows == Array(0..<n), "n = \(n)")
    }
  }

  @Test func refusesToReturnAPartialLibrary() async {
    await #expect(throws: SupabaseExerciseSource.LibraryTooLarge.self) {
      _ = try await SupabaseExerciseSource.allPages(pageSize: 10, maxPages: 3, Self.table(31))
    }
  }

  @Test func exactMultipleStopsOnTheEmptyNextPage() async throws {
    let rows = try await SupabaseExerciseSource.allPages(pageSize: 10, maxPages: 3, Self.table(20))
    #expect(rows.count == 20)
  }
}
