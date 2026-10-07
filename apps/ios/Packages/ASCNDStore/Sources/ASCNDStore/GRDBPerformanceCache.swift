public import ASCNDCore
import Foundation
import GRDB

/// `PerformanceCache` trên SQLite — "lần trước" theo người dùng (#331), cùng
/// bảng `read_cache` (đăng xuất xoá cùng).
public final class GRDBPerformanceCache: PerformanceCache {
  static let kind = ReadCacheNamespace.lastPerformance
  private let table: ReadCacheTable

  public init(_ database: ASCNDDatabase) {
    table = ReadCacheTable(database)
  }

  public func load(userId: String) async throws -> [String: LastPerformance]? {
    try await table.load([String: LastPerformance].self, userId: userId, kind: Self.kind)
  }

  public func save(userId: String, _ table: [String: LastPerformance]) async throws {
    try await self.table.save(table, userId: userId, kind: Self.kind)
  }
}
