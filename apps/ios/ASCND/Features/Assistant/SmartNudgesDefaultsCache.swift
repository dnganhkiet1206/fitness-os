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
}
