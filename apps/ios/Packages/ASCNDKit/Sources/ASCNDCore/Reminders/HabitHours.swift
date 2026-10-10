public import Foundation

/// Phần `hours` của mô hình cá nhân trên máy (`lib/personal-model.ts` @ fac9ac2,
/// #527 A-NEXT-7 · S1): giờ một người THẬT SỰ làm từng nhiệm vụ ngày.
///
/// RN behavior (giữ nguyên):
/// - chỉ trên máy (`AsyncStorage` `ascnd_personal_model_v1`), không bảng / RPC;
/// - `noteDone(quest, hour)` (`:301`) chỉ ghi giờ cho `CLOCK_TRUSTED`
///   (`meal`, `water`, `workout`, `sleep` — `:291`); `steps` không, vì giờ
///   đếm bước không phải giờ đi bộ;
/// - `habitFor(quest)` (`:386`) = `habit(hours[quest] ?? emptyHours())`;
/// - đăng xuất / đổi tài khoản xoá sạch (`resetPersonalModel`, `:513`).
///
/// Nơi DUY NHẤT gọi `noteDone` ở RN là bước chuyển "chưa xong → xong" của một
/// nhiệm vụ lúc app đang mở (`use-quest-autoclaim.ts:233`) — phần ấy thuộc
/// Mascot (S2, E). Chưa có nó thì `habit` luôn `nil`, đúng như một người chưa
/// đủ 6 lần quan sát ở RN.
///
/// Thêm một rào RN không có: blob mang `userId`, và đọc của người khác là rỗng
/// — nếu lượt xoá lúc đăng xuất hỏng, giờ của người trước không lọt sang.
public final class HabitHours: @unchecked Sendable {
  /// `CLOCK_TRUSTED`.
  public static let clockTrusted: Set<MascotRules.Quest> = [.meal, .water, .workout, .sleep]
  public static let storeKey = "ascnd_habit_hours_v1"

  struct Blob: Codable {
    var user: String
    var hours: [String: UserRhythm.HourStat]
  }

  private let store: any KeyValueStore
  private let lock = NSLock()

  public init(store: any KeyValueStore) {
    self.store = store
  }

  private func read(_ userId: String) -> [String: UserRhythm.HourStat] {
    guard let raw = store.string(forKey: Self.storeKey), let data = raw.data(using: .utf8),
      let blob = try? JSONDecoder().decode(Blob.self, from: data), blob.user == userId
    else { return [:] }
    return blob.hours
  }

  /// `noteDone`: giờ địa phương (0…24) lúc nhiệm vụ vừa chuyển sang xong.
  public func noteDone(_ quest: MascotRules.Quest, hour: Double, userId: String) {
    guard Self.clockTrusted.contains(quest), !userId.isEmpty else { return }
    lock.withLock {
      var hours = read(userId)
      hours[quest.rawValue] = UserRhythm.observeHour(hours[quest.rawValue] ?? .empty, hour)
      guard let data = try? JSONEncoder().encode(Blob(user: userId, hours: hours)),
        let text = String(data: data, encoding: .utf8)
      else { return }
      store.set(text, forKey: Self.storeKey)
    }
  }

  /// `habitFor`: `nil` khi chưa đủ quan sát, giờ tản mát, dữ liệu hỏng, hay
  /// blob là của người khác.
  public func habit(_ quest: MascotRules.Quest, userId: String) -> UserRhythm.Habit? {
    lock.withLock { UserRhythm.habit(read(userId)[quest.rawValue] ?? .empty) }
  }

  /// `resetPersonalModel` (phần `hours`).
  public func clear() {
    lock.withLock { store.remove(Self.storeKey) }
  }
}
