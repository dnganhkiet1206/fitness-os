import ASCNDCore
import Foundation

/// Sao yêu thích của bài tập lưu trên máy theo tài khoản (`ex.favorites.<uid>`), đồng bộ lên
/// `exercise_favorites` qua `AppServices.syncExerciseFavorites` (bảng deploy 16/11). Mất mạng
/// thì chỉ có bản trên máy; lần mở tab Tập luyện / bấm sao sau gửi bù.
struct DefaultsExerciseFavoriteStore: ExerciseFavoriteStore {
  /// `.local` giữ khoá cũ (`ex.favorites.<uid>`) — sao đánh trước khi có đồng bộ không mất.
  static func key(_ userId: String, _ slot: ExerciseFavoriteSlot) -> String {
    let base = "ex.favorites.\(userId.lowercased())"
    return slot == .local ? base : base + ".\(slot.rawValue)"
  }

  func load(userId: String, slot: ExerciseFavoriteSlot) -> Set<String> {
    Set(UserDefaults.standard.stringArray(forKey: Self.key(userId, slot)) ?? [])
  }

  func save(userId: String, slot: ExerciseFavoriteSlot, _ ids: Set<String>) {
    UserDefaults.standard.set(ids.sorted(), forKey: Self.key(userId, slot))
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
