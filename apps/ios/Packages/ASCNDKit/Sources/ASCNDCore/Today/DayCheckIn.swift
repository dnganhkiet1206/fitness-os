public import Foundation

/// "Hôm nay của bạn" — ghi cả ngày một lần (18/10, chủ dự án duyệt mock A
/// `today-one-log.html`): Ngủ · Bữa · Nước · Tập trong MỘT thẻ; một nút mở MỘT
/// form điền sẵn theo thói quen, bấm Lưu là xong. Thay danh sách "Ngày của bạn".
/// Khác RN (RN ghi từng việc ở màn riêng) — NATIVE_IMPROVEMENTS.
///
/// Ở đây chỉ là luật thuần: việc nào còn phải hỏi, điền sẵn số gì. Việc ghi
/// thật đi qua đúng các sổ đã có (bữa, nước, giấc ngủ, buổi tập ghi tay).
public enum DayCheckIn {
  public enum Item: String, Sendable, Hashable, CaseIterable {
    case sleep, meal, water, workout
  }

  /// Trạng thái một ô của thẻ.
  public enum State: Sendable, Hashable {
    /// Đã có (ghi tay hay Apple Health điền).
    case done
    /// Chưa có — form sẽ hỏi.
    case todo
    /// Hôm nay là ngày nghỉ (chỉ cho buổi tập): không phải việc.
    case rest
  }

  /// Một nấc nước trong form (ml).
  public static let waterStepMl = 250
  /// Nước điền sẵn khi hôm qua không có số: hai ly.
  public static let waterFallbackMl = 500
  /// Sàn một lần ghi nước trong form (nấc nhỏ nhất của ô chỉnh).
  public static let waterMinMl = 50
  /// Trần một lần ghi nước trong form (5 L — như một ly nhập nhầm ở Health).
  public static let waterMaxMl = 5_000

  /// Ô nào của thẻ ở trạng thái nào. `workoutPlanned`: hôm nay có buổi theo kế
  /// hoạch (`false` = ngày nghỉ → không hỏi tập).
  public static func states(
    sleepDone: Bool, mealDone: Bool, waterMl: Double, waterTargetMl: Double, workoutDone: Bool, workoutPlanned: Bool
  ) -> [Item: State] {
    [
      .sleep: sleepDone ? .done : .todo,
      .meal: mealDone ? .done : .todo,
      // Nước: có ghi là xong việc của thẻ (mục tiêu vẫn ở ống của khối ngày).
      .water: waterMl > 0 ? .done : .todo,
      .workout: workoutDone ? .done : (workoutPlanned ? .todo : .rest),
    ]
  }

  /// Những việc form sẽ hỏi, theo thứ tự thẻ.
  public static func pending(_ states: [Item: State]) -> [Item] {
    Item.allCases.filter { states[$0] == .todo }
  }

  /// Số đã xong / số việc của ngày (ngày nghỉ không tính buổi tập).
  public static func progress(_ states: [Item: State]) -> (done: Int, total: Int) {
    let counted = Item.allCases.filter { states[$0] != .rest }
    return (counted.filter { states[$0] == .done }.count, counted.count)
  }

  /// Nước điền sẵn: ĐÚNG lượng hôm qua (chỉ chặn trong 50…5000); hôm qua không
  /// ghi thì hai ly. Không làm tròn (audit vòng 5, 27/10): nút ghi "Nước như hôm qua
  /// (68 oz)" trong khi thẻ Nước ghi "Hôm qua 71 oz" — 2.100 ml làm tròn nấc 250 ml.
  public static func waterPrefillMl(yesterdayMl: Int?) -> Int {
    guard let y = yesterdayMl, y > 0 else { return waterFallbackMl }
    return min(max(y, waterMinMl), waterMaxMl)
  }

  /// Tổng nước của hôm qua trong bảng 7 ngày; `nil` khi không có (0 ml cũng là
  /// không có — không gợi ý "Hôm qua 0 oz").
  public static func yesterdayWaterMl(_ week: [WaterDay], today: LocalDate) -> Int? {
    guard let ml = week.first(where: { $0.date == today.adding(days: -1) })?.totalMl, ml > 0 else { return nil }
    return ml
  }
}
