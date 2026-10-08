public import ASCNDCore
import Foundation
import GRDB

/// `ExerciseGuideCache` trên SQLite — sheet hướng dẫn đã đọc (#422), theo người
/// dùng × bài × ngôn ngữ, cùng bảng `read_cache` (đăng xuất xoá cùng; đăng
/// nhập dọn của người khác, #397).
public final class GRDBExerciseGuideCache: ExerciseGuideCache {
  static let prefix = ReadCacheNamespace.exerciseGuide
  private let table: ReadCacheTable

  public init(_ database: ASCNDDatabase) {
    table = ReadCacheTable(database)
  }

  public func load(userId: String, key: String) async throws -> ExerciseGuide? {
    try await table.load(ExerciseGuide.self, userId: userId, kind: Self.prefix + key, lenient: true)
  }

  public func save(userId: String, key: String, _ guide: ExerciseGuide) async throws {
    try await table.save(guide, userId: userId, kind: Self.prefix + key)
  }
}
