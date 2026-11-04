import ASCNDCore
import Foundation

/// Bộ nhớ đệm bền của "Insight hôm nay" (RN: persister của React Query).
///
/// MỘT ô duy nhất (khoá + kết quả): khoá mang người dùng · ngày · ngôn ngữ ·
/// dấu dữ liệu, nên kết quả của người trước / hôm qua không bao giờ khớp và bị
/// ghi đè ở lượt sau — trên máy không tích lại lịch sử insight của ai.
struct SmartNudgesDefaultsCache: SmartNudgesCache {
  private struct Slot: Codable {
    let key: String
    let entry: SmartNudges.Entry
  }

  static let defaultsKey = "assistant.smartNudges.v1"

  func entry(_ key: String) -> SmartNudges.Entry? {
    guard let data = UserDefaults.standard.data(forKey: Self.defaultsKey),
      let slot = try? JSONDecoder().decode(Slot.self, from: data), slot.key == key
    else { return nil }
    return slot.entry
  }

  func store(_ entry: SmartNudges.Entry, for key: String) {
    guard let data = try? JSONEncoder().encode(Slot(key: key, entry: entry)) else { return }
    UserDefaults.standard.set(data, forKey: Self.defaultsKey)
  }

  /// Đăng xuất: insight của người vừa rời đi không ở lại trên máy (RN: `clearPersistedCache`
  /// trong `forgetPreviousAccount`). Khoá có người dùng nên người sau không thấy được, nhưng chữ
  /// insight — viết từ giấc ngủ, ăn uống, buổi tập của họ — vẫn nằm trên máy tới khi bị ghi đè.
  static func clear() {
    UserDefaults.standard.removeObject(forKey: defaultsKey)
  }
}
