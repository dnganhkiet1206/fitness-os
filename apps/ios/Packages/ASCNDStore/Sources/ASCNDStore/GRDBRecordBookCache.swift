public import ASCNDCore
import Foundation
import GRDB

/// `RecordBookCache` trên SQLite — bảng tốt-nhất theo người dùng (#295), cùng
/// bảng `read_cache` với kế hoạch tuần.
public final class GRDBRecordBookCache: RecordBookCache {
  static let kind = ReadCacheNamespace.recordBests
  private let table: ReadCacheTable

  public init(_ database: ASCNDDatabase) {
    table = ReadCacheTable(database)
  }

  public func load(userId: String) async throws -> PersonalRecords.Bests? {
    try await table.load(PersonalRecords.Bests.self, userId: userId, kind: Self.kind)
  }

  public func save(userId: String, _ bests: PersonalRecords.Bests) async throws {
    try await table.save(bests, userId: userId, kind: Self.kind)
  }
}
