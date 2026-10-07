public import ASCNDCore
import Foundation
import GRDB

/// `InsightCache` trên SQLite — hàng buổi tập + lần cân của phân tích bài tập
/// (#419), theo người dùng, cùng
/// bảng `read_cache` (đăng xuất xoá cùng; đăng nhập dọn của người khác, #397).
public final class GRDBInsightCache: InsightCache {
  static let kind = ReadCacheNamespace.exerciseInsights
  private let table: ReadCacheTable

  public init(_ database: ASCNDDatabase) {
    table = ReadCacheTable(database)
  }

  public func load(userId: String) async throws -> InsightSnapshot? {
    try await table.load(InsightSnapshot.self, userId: userId, kind: Self.kind)
  }

  public func save(userId: String, _ snapshot: InsightSnapshot) async throws {
    try await table.save(snapshot, userId: userId, kind: Self.kind)
  }
}
