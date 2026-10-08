/// Luật thuần của thẻ "Hôm nay" và của bằng chứng buổi đã ghi — port nguyên
/// văn RN (`lib/today-cta.ts`, `lib/day-progress.ts`), golden
/// `spec/vectors/today-controller.json` (TC-1, TC-4).

/// Nút chính của thẻ Hôm nay (RN `TodayCta`).
public enum TodayCta: String, Sendable, Hashable {
  /// Có kế hoạch và chưa tập: nút đặc "Bắt đầu", cộng nút phụ ghi tự do.
  case start
  /// Đã tập hôm nay: chỉ còn đường cho buổi PHÁT SINH — và nói rõ thế.
  case extra
  /// Hôm nay nghỉ mà vẫn tập: ghi tự do.
  case logFree = "log-free"
  /// Hôm nay trống: chọn buổi tập đã.
  case pick
  /// Chưa đọc xong lịch: không đoán.
  case none
}

public enum TodayRules {
  /// Thứ tự là luật (RN `todayCta`): chưa biết → không đoán; ĐÃ TẬP xét trước
  /// cả kế hoạch lẫn ngày nghỉ (nó đã xảy ra, hai cái kia mới là dự định);
  /// rồi kế hoạch thắng ngày nghỉ.
  public static func cta(unknown: Bool, planned: Bool, rest: Bool, done: Bool) -> TodayCta {
    if unknown { return .none }
    if done { return .extra }
    if planned { return .start }
    if rest { return .logFree }
    return .pick
  }

  /// Nút của thẻ Hôm nay cho ngày `date` (`today-training.tsx:80–110`):
  /// - `library == nil`: lịch chưa đọc xong → không đoán (`daysPending`);
  /// - ngày trong lịch: `Map` theo `day_of_week`, hàng sau thắng;
  /// - `planned`: ngày có template TÌM THẤY trong danh sách và không phải nghỉ;
  /// - `rest`: cờ nghỉ của ngày; `done`: ngày ấy đã tập (máy này hay server).
  ///
  /// Native: lịch trên máy (cache) là lịch đã biết — RN coi truy vấn lỗi là
  /// "chưa biết" kể cả khi còn dữ liệu cũ; ở đây lịch đã có thì nút vẫn hiện
  /// (local-first, như phần còn lại của thẻ).
  public static func cta(
    on date: LocalDate, library: TemplateSnapshot?, trained: Set<LocalDate>
  ) -> TodayCta {
    guard let library else { return cta(unknown: true, planned: false, rest: false, done: false) }
    let index = WorkoutPlanning.routineIndex(date)
    let day = library.routine.last { $0.dayOfWeek == index }
    let rest = day?.isRest ?? false
    let template = day?.templateId.flatMap { id in library.templates.first { $0.id == id } }
    return cta(unknown: false, planned: template != nil && !rest, rest: rest, done: trained.contains(date))
  }

  /// Hàng kế hoạch nào một buổi ĐÃ GHI (ở máy này hay máy khác) chứng minh
  /// là đã làm (RN `sessionTicks`): mỗi set mang tên bài "trả" cho đúng một
  /// hàng cùng tên, theo thứ tự hàng. Set không tên không chứng minh gì.
  public static func sessionTicks(
    rows: [(key: String, exerciseName: String)], setNames: [String?]
  ) -> [String: Bool] {
    var remaining: [String: Int] = [:]
    for name in setNames {
      let k = PersonalRecords.exerciseKey(name ?? "")
      guard !k.isEmpty else { continue }
      remaining[k, default: 0] += 1
    }
    var ticks: [String: Bool] = [:]
    for row in rows {
      let k = PersonalRecords.exerciseKey(row.exerciseName)
      guard let left = remaining[k], left > 0 else { continue }
      ticks[row.key] = true
      remaining[k] = left - 1
    }
    return ticks
  }

  /// Như `sessionTicks`, nhưng nói hàng nào ứng với set THỨ MẤY của buổi
  /// (cùng thứ tự gán) — để nhận buổi từ máy khác với đúng tạ / reps của set.
  public static func sessionAssignment(
    rows: [(key: String, exerciseName: String)], setNames: [String?]
  ) -> [String: Int] {
    var queue: [String: [Int]] = [:]
    for (i, name) in setNames.enumerated() {
      let k = PersonalRecords.exerciseKey(name ?? "")
      guard !k.isEmpty else { continue }
      queue[k, default: []].append(i)
    }
    var out: [String: Int] = [:]
    for row in rows {
      let k = PersonalRecords.exerciseKey(row.exerciseName)
      guard var q = queue[k], !q.isEmpty else { continue }
      out[row.key] = q.removeFirst()
      queue[k] = q
    }
    return out
  }

  /// Bằng chứng chỉ LẤP CHỖ TRỐNG, không lật quyết định người dùng đã ghi
  /// trên máy (RN `mergeProgress`): hàng đã có trong `stored` — kể cả `false`
  /// (đã bỏ tích bằng tay) — giữ nguyên.
  public static func mergeProgress(
    stored: [String: Bool], rows: [(key: String, exerciseName: String)], setNames: [String?]
  ) -> [String: Bool] {
    let ticks = sessionTicks(rows: rows, setNames: setNames)
    guard !ticks.isEmpty else { return stored }
    var out = stored
    for key in ticks.keys where stored[key] == nil { out[key] = true }
    return out
  }
}
