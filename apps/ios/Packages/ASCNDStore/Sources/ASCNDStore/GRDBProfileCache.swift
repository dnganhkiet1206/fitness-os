public import ASCNDCore
import Foundation
import GRDB

/// `ProfileCache` trên SQLite — hồ sơ theo người dùng (#425), cùng
/// bảng `read_cache` (đăng xuất xoá cùng; đăng nhập dọn của người khác, #397).
public final class GRDBProfileCache: ProfileCache {
  static let kind = ReadCacheNamespace.profile
  private let table: ReadCacheTable

  public init(_ database: ASCNDDatabase) {
    table = ReadCacheTable(database)
  }

  public func load(userId: String) async throws -> Profile? {
    try await table.load(Profile.self, userId: userId, kind: Self.kind, lenient: true)
  }

  public func save(userId: String, _ profile: Profile) async throws {
    try await table.save(profile, userId: userId, kind: Self.kind)
  }
}
