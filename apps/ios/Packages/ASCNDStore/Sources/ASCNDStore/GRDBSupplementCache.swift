public import ASCNDCore
import Foundation
import GRDB

/// `SupplementCache` trên SQLite — danh sách thực phẩm bổ sung theo người dùng
/// (#527 Phase 3), cùng bảng `read_cache` và chốt tài khoản (#431).
public final class GRDBSupplementCache: SupplementCache {
  static let kind = ReadCacheNamespace.supplements
  private let table: ReadCacheTable

  public init(_ database: ASCNDDatabase) {
    table = ReadCacheTable(database)
  }

  /// Bản lưu của bản build khác không đọc được thì coi như không có.
  public func load(userId: String) async throws -> SupplementSnapshot? {
    try await table.load(SupplementSnapshot.self, userId: userId, kind: Self.kind, lenient: true)
  }

  public func save(userId: String, _ snapshot: SupplementSnapshot) async throws {
    try await table.save(snapshot, userId: userId, kind: Self.kind)
  }
}
