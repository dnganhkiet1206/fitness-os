import Foundation

/// Thứ tự thẻ "Hôm nay của bạn" theo thói quen sinh hoạt (Kiệt 17/11: "mấy thẻ này sẽ ưu tiên
/// theo thói quen sinh hoạt của người dùng"). Luật thuần:
///
/// 1. Việc chưa ghi đứng trước; việc đã xong và ngày nghỉ tập xuống cuối (giữ thứ tự gốc).
/// 2. Trong các việc chưa ghi: việc vừa tới giờ quen (trong `dueWindow` giờ vừa qua) xếp đầu,
///    vừa tới trước; tiếp theo là việc sắp tới giờ quen, gần trước xa sau.
/// 3. Giờ quen = giờ người dùng THẬT SỰ hay ghi việc đó (`HabitHours` học trên máy, cần đủ
///    quan sát); chưa có thì dùng giờ mặc định (`defaultHours`). Nước rải cả ngày nên không
///    có giờ: đứng sau mọi việc vừa tới giờ, trước việc còn xa.
public enum DayTileOrder {
  /// Giờ mặc định khi chưa đủ dữ liệu thói quen: ghi giấc ngủ buổi sáng, ba bữa, tập buổi chiều.
  public static let defaultHours: [DayCheckIn.Item: [Double]] = [
    .sleep: [7], .meal: [8, 12.5, 19], .workout: [18],
  ]
  /// Một việc "vừa tới giờ" trong bấy nhiêu giờ sau giờ quen.
  public static let dueWindow = 3.0
  /// Nước xếp như một việc sẽ tới sau bấy nhiêu giờ.
  public static let waterAheadHours = 2.0

  /// - Parameters:
  ///   - base: thứ tự gốc của thẻ.
  ///   - habitHour: giờ quen đã học của từng việc (0…24), `nil` = chưa có.
  ///   - now: giờ hiện tại (0…24).
  public static func order(
    _ base: [DayCheckIn.Item], states: [DayCheckIn.Item: DayCheckIn.State],
    habitHour: (DayCheckIn.Item) -> Double?, now: Double
  ) -> [DayCheckIn.Item] {
    let open = base.filter { (states[$0] ?? .todo) == .todo }
    let closed = base.filter { (states[$0] ?? .todo) != .todo }
    let scored = open.enumerated().map { i, item in (item, score(item, habitHour(item), now: now), i) }
    return scored.sorted { ($0.1, $0.2) < ($1.1, $1.2) }.map(\.0) + closed
  }

  /// Điểm càng nhỏ càng lên trước. Vừa tới giờ: 0…`dueWindow` (giờ đã qua). Sắp tới:
  /// `dueWindow` + số giờ còn lại.
  static func score(_ item: DayCheckIn.Item, _ habit: Double?, now: Double) -> Double {
    if item == .water && habit == nil { return dueWindow + waterAheadHours }
    let hours = habit.map { [$0] } ?? defaultHours[item] ?? []
    guard !hours.isEmpty else { return dueWindow + 24 }
    return hours.map { h -> Double in
      let since = UserRhythm.forward(h, now)  // giờ đã qua kể từ giờ quen gần nhất
      return since <= dueWindow ? since : dueWindow + UserRhythm.forward(now, h)
    }.min() ?? dueWindow + 24
  }
}
