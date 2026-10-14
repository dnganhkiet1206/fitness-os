public import Foundation

/// Màn tập "từng set một" (#527, thiết kế lại 14/10 — chủ dự án duyệt mock v2).
///
/// RN (`day-plan.tsx`) chỉ có dạng bảng: mọi set của mọi bài, gõ tay từng ô.
/// Native (tốt hơn): mặc định một thẻ lớn cho SET KẾ TIẾP — ± thay vì bàn
/// phím, một nút "Xong set" — và dạng bảng vẫn còn (menu ⋯). Phần thuần ở đây:
/// set nào kế tiếp, tiến độ từng bài, bước ± của tạ / reps, dòng xem trước.
/// Không đổi gì ở cách ghi: View vẫn gọi `setWeightText` / `setRepsText` /
/// `toggle` của `WorkoutSessionController` như dạng bảng.
public enum WorkoutFocus {
  /// Một bài trên màn: khoá (id bài, thiếu thì tên — như cách dạng bảng gom),
  /// các hàng theo thứ tự kế hoạch.
  public struct Exercise: Sendable, Hashable, Identifiable {
    public let key: String
    public let name: String
    public let rows: [PlannedSet]
    public let done: Int
    public var total: Int { rows.count }
    public var isComplete: Bool { done >= rows.count }
    public var id: String { key }
  }

  public static func exerciseKey(_ row: PlannedSet) -> String { row.exerciseId ?? row.exerciseName }

  /// Gom hàng theo bài, giữ thứ tự xuất hiện đầu tiên.
  public static func exercises(_ rows: [PlannedSet], _ progress: DayProgress) -> [Exercise] {
    var order: [String] = []
    var groups: [String: [PlannedSet]] = [:]
    for row in rows {
      let k = exerciseKey(row)
      if groups[k] == nil { order.append(k) }
      groups[k, default: []].append(row)
    }
    return order.compactMap { k in
      guard let rs = groups[k], let first = rs.first else { return nil }
      return Exercise(key: k, name: first.exerciseName, rows: rs, done: rs.filter { progress.done[$0.key] == true }.count)
    }
  }

  /// Set kế tiếp: set chưa xong đầu tiên của bài đang chọn (`pinned`), không
  /// thì của cả buổi. Mọi set xong → `nil`.
  public static func next(_ rows: [PlannedSet], _ progress: DayProgress, pinned: String? = nil) -> PlannedSet? {
    let open = rows.filter { progress.done[$0.key] != true }
    if let pinned, let r = open.first(where: { exerciseKey($0) == pinned }) { return r }
    return open.first
  }

  /// Set đã xong đứng NGAY TRƯỚC set kế tiếp — thứ vừa làm, để sửa nhanh khi
  /// đang nghỉ. Hết buổi thì là set xong cuối cùng.
  public static func lastDone(_ rows: [PlannedSet], _ progress: DayProgress, before next: PlannedSet?) -> PlannedSet? {
    let end = next.flatMap { n in rows.firstIndex { $0.key == n.key } } ?? rows.count
    return rows[..<end].last { progress.done[$0.key] == true }
  }

  // MARK: - Bước ±

  /// Bước tạ: 2,5 kg (bánh tạ nhỏ nhất thường gặp) hay 5 lb.
  public static func weightStep(_ unit: WeightUnit) -> Double { unit == .lbs ? 5 : 2.5 }

  /// Ô tạ ± một bước, theo ĐƠN VỊ HIỂN THỊ (ô gõ cũng theo đơn vị ấy). Ô
  /// trống (bodyweight) bắt đầu từ 0; không xuống dưới 0 — về 0 thì ô trống,
  /// như hạt giống của bài không tạ (`WeightUnit.seed`).
  ///
  /// `hint` = mức tạ lần trước (chữ ô gõ): ô trống mà có gợi ý thì lần bấm
  /// đầu lấy đúng mức ấy — bấm + từ trống ra "17.5" khi lần trước là 15 thì
  /// người dùng phải bấm lùi.
  public static func stepWeight(_ text: String, by steps: Int, unit: WeightUnit, hint: String = "") -> String {
    if NumberInput.decimal(text).isEmpty, !hint.isEmpty { return hint }
    let current = Double(NumberInput.decimal(text)) ?? 0
    let v = max(0, current + Double(steps) * weightStep(unit))
    return v > 0 ? NumberInput.plannedLoad(v) : ""
  }

  /// Ô reps ± 1; bài giữ ("45s") thì ± 5 giây và giữ dạng "Ns". Không xuống
  /// dưới 1 (rep) / 5 giây — set 0 rep không tick được.
  public static func stepReps(_ text: String, by steps: Int) -> String {
    let entry = RepEntry.parse(text)
    if let secs = entry.durationSec {
      return "\(min(RepEntry.maxHoldSeconds, max(5, secs + steps * 5)))s"
    }
    return String(min(RepEntry.maxReps, max(1, entry.reps + steps)))
  }

  // MARK: - Xem trước (ngày chưa tới)

  /// Một dòng xem trước của bài: "3 × 10 · 15 kg · nghỉ 90s".
  public struct Preview: Sendable, Hashable, Identifiable {
    public let key: String
    public let name: String
    public let sets: Int
    /// Reps của set đầu ("10" hay "45s").
    public let reps: String
    /// `nil` = bài không tạ.
    public let weightKg: Double?
    public let restSeconds: Int
    public var id: String { key }
  }

  public static func preview(_ rows: [PlannedSet], _ progress: DayProgress) -> [Preview] {
    exercises(rows, progress).compactMap { ex in
      guard let first = ex.rows.first else { return nil }
      let p = WorkoutDay.performed(first, progress)
      let reps = p.durationSec.map { "\($0)s" } ?? String(p.reps)
      return Preview(
        key: ex.key, name: ex.name, sets: ex.total, reps: reps,
        weightKg: first.weightKg > 0 ? first.weightKg : nil, restSeconds: WorkoutDay.restSeconds(first, progress))
    }
  }

  /// Phút ước tính của buổi, cùng công thức builder (`TemplateDraft.estimatedMinutes`).
  public static func minutes(_ rows: [PlannedSet], _ progress: DayProgress) -> Int {
    TemplateDraft.estimatedMinutes(exercises(rows, progress).map { ex -> (sets: Int?, reps: Int?, restSeconds: Int?) in
      let first = ex.rows.first
      return (ex.total, first?.reps, first.map { WorkoutDay.restSeconds($0, progress) })
    })
  }
}
