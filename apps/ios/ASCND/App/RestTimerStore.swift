import ASCNDCore
import Foundation

/// Lưu quãng nghỉ đang chạy, để app bị hệ thống đóng giữa chừng — hoặc được
/// mở ở nền chỉ để chạy nút ±15 của Island — vẫn biết đang nghỉ tới bao giờ.
///
/// Bản RN không lưu (rest state chết theo màn hình). Ở bản native, đây là
/// điều kiện để `LiveActivityIntent` đúng: intent chạy trong process của app,
/// và process ấy có thể vừa mới được khởi động.
@MainActor
struct RestTimerStore {
  private static let key = "ascnd.rest.v1"
  private let defaults: UserDefaults

  init(defaults: UserDefaults = .standard) {
    self.defaults = defaults
  }

  private struct Saved: Codable {
    let timer: RestTimer
    let target: RestTarget?
  }

  func load() -> (RestTimer, RestTarget?)? {
    guard let data = defaults.data(forKey: Self.key),
      let saved = try? JSONDecoder().decode(Saved.self, from: data)
    else { return nil }
    return (saved.timer, saved.target)
  }

  func save(_ timer: RestTimer?, _ target: RestTarget?) {
    guard let timer, let data = try? JSONEncoder().encode(Saved(timer: timer, target: target)) else {
      defaults.removeObject(forKey: Self.key)
      return
    }
    defaults.set(data, forKey: Self.key)
  }
}
