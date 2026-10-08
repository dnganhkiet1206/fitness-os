public import ASCNDCore
import Foundation
import GRDB

/// `ExerciseCache` trên SQLite — thư viện bài tập theo người dùng (#420), cùng
/// bảng `read_cache` (đăng xuất xoá cùng; đăng nhập dọn của người khác, #397).
public final class GRDBExerciseCache: ExerciseCache {
  static let kind = ReadCacheNamespace.exerciseLibrary
  private let table: ReadCacheTable

  public init(_ database: ASCNDDatabase) {
    table = ReadCacheTable(database)
  }

  public func load(userId: String) async throws -> [LibraryExercise]? {
    try await table.load([LibraryExercise].self, userId: userId, kind: Self.kind)
  }

  public func save(userId: String, _ list: [LibraryExercise]) async throws {
    try await table.save(list, userId: userId, kind: Self.kind)
  }
}
