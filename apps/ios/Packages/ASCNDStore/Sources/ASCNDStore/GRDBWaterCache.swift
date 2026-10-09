public import ASCNDCore
import Foundation
import GRDB

/// `WaterCache` trên SQLite — nước uống hôm nay + 7 ngày theo người dùng
/// (#527 Phase 3), cùng bảng `read_cache` và chốt tài khoản (#431).
public final class GRDBWaterCache: WaterCache {
  static let kind = ReadCacheNamespace.water
  private let table: ReadCacheTable

  public init(_ database: ASCNDDatabase) {
    table = ReadCacheTable(database)
  }

  /// Bản lưu của bản build khác không đọc được thì coi như không có.
  public func load(userId: String) async throws -> WaterSnapshot? {
    try await table.load(WaterSnapshot.self, userId: userId, kind: Self.kind, lenient: true)
  }

  public func save(userId: String, _ snapshot: WaterSnapshot) async throws {
    try await table.save(snapshot, userId: userId, kind: Self.kind)
  }
}
