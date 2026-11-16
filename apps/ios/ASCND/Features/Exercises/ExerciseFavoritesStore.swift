import ASCNDCore
import Foundation

/// Sao yêu thích của bài tập lưu TRÊN MÁY, theo tài khoản (`ex.favorites.<uid>`).
/// Bảng `exercises` chưa có cột yêu thích; thêm là đổi schema, chưa được duyệt —
/// xem sổ hạn chế (15/11). Đổi máy / cài lại app thì mất.
struct DefaultsExerciseFavoriteStore: ExerciseFavoriteStore {
  static func key(_ userId: String) -> String { "ex.favorites.\(userId.lowercased())" }

  func load(userId: String) -> Set<String> {
    Set(UserDefaults.standard.stringArray(forKey: Self.key(userId)) ?? [])
  }

  func save(userId: String, _ ids: Set<String>) {
    UserDefaults.standard.set(ids.sorted(), forKey: Self.key(userId))
  }
}

/// Một `ExerciseFavorites` cho mỗi tài khoản, dùng chung giữa thư viện, builder và
/// màn ghi tay — đánh sao ở thư viện thì builder thấy ngay.
@MainActor
enum ExerciseFavoritesShared {
  private static var books: [String: ExerciseFavorites] = [:]

  static func book(for userId: String) -> ExerciseFavorites {
    let key = userId.lowercased()
    if let hit = books[key] { return hit }
    let book = ExerciseFavorites(userId: key, store: DefaultsExerciseFavoriteStore())
    books[key] = book
    return book
  }
}
