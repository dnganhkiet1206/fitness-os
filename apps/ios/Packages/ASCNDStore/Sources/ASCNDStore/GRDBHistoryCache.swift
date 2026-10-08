public import ASCNDCore
import Foundation
import GRDB

/// `HistoryCache` trên SQLite — lịch sử buổi tập theo người dùng (#400), cùng
/// bảng `read_cache` (đăng xuất xoá cùng; đăng nhập dọn của người khác, #397).
public final class GRDBHistoryCache: HistoryCache {
  static let kind = ReadCacheNamespace.workoutHistory
  private let table: ReadCacheTable

  public init(_ database: ASCNDDatabase) {
    table = ReadCacheTable(database)
  }

  public func load(userId: String) async throws -> [HistoryEntry]? {
    try await table.load([HistoryEntry].self, userId: userId, kind: Self.kind)
  }

  public func save(userId: String, _ entries: [HistoryEntry]) async throws {
    try await table.save(entries, userId: userId, kind: Self.kind)
  }
}
