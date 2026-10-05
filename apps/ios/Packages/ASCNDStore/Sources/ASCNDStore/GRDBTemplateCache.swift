public import ASCNDCore
import Foundation
import GRDB

/// `TemplateCache` trên SQLite: bản chụp `routine_days` + `workout_templates`
/// mới nhất của từng người dùng (#270).
public final class GRDBTemplateCache: TemplateCache {
  static let kind = ReadCacheNamespace.templates
  private let table: ReadCacheTable
  private let cleanup: ReadCacheCleanup

  public init(_ database: ASCNDDatabase) {
    table = ReadCacheTable(database)
    cleanup = ReadCacheCleanup(database)
  }

  public func load(userId: String) async throws -> TemplateSnapshot? {
    try await table.load(TemplateSnapshot.self, userId: userId, kind: Self.kind)
  }

  public func save(userId: String, _ snapshot: TemplateSnapshot) async throws {
    try await table.save(snapshot, userId: userId, kind: Self.kind)
  }

  /// Đăng xuất: bỏ cache của mọi người dùng trên máy (`ReadCacheCleanup`).
  public func clearAll() async throws {
    try await cleanup.forgetEveryone()
  }

  /// Đăng nhập: bỏ cache của MỌI người khác. Lượt làm mới của người vừa rời
  /// đi có thể về SAU lượt dọn lúc đăng xuất và ghi lại cache của họ (#335);
  /// lần này dọn nốt. Trả về số hàng bỏ.
  @discardableResult
  public func clearAll(except userId: String) async throws -> Int {
    try await cleanup.forgetEveryone(except: userId)
  }
}
