public import Foundation

/// "Tiến bộ từng bài" theo MỨC TẠ: set đỉnh của buổi gần nhất so với buổi trước
/// (Kiệt duyệt mock 28/10 — điều người tập quan tâm nhất, không phải tổng khối
/// lượng hay "tốt nhất 90 ngày").
///
/// - Set đỉnh: tạ nặng nhất của buổi, kèm reps của CHÍNH set ấy
///   (`ExercisePerformance.topSetReps`). Set khởi động đã bị bỏ từ trước.
/// - Bài không tạ (mọi buổi 0 kg, hay khai báo `bodyweight`): so số reps.
/// - Bài giữ (`timed`): so số giây.
/// - Tạ lệch dưới 0,05 kg coi là bằng nhau (tạ ghi bằng lb lưu thành kg lẻ).
public enum ExerciseCompare {
  /// Một buổi của một bài, ở dạng so được.
  public struct Top: Sendable, Hashable {
    public let date: LocalDate
    public let kg: Double
    public let reps: Int
    public let seconds: Int?
    public let sets: Int
  }

  public enum Metric: Sendable, Hashable { case weight, reps, time }

  /// Thay đổi so với buổi trước. `weight` / `reps` / `seconds` mang dấu.
  public enum Delta: Sendable, Hashable {
    case first
    /// Bài có tạ mà buổi này ghi 0 kg (thường là quên nhập tạ): không so, không
    /// gọi là giảm (dữ liệu thật 28/10: 25 kg × 5 → 0 kg × 10 hiện "−25 kg").
    case noWeight
    case same
    case weight(Double)
    case reps(Int)
    case seconds(Int)

    public var isUp: Bool {
      switch self {
      case .weight(let d): d > 0
      case .reps(let d): d > 0
      case .seconds(let d): d > 0
      case .first, .same, .noWeight: false
      }
    }

    public var isDown: Bool {
      switch self {
      case .weight(let d): d < 0
      case .reps(let d): d < 0
      case .seconds(let d): d < 0
      case .first, .same, .noWeight: false
      }
    }
  }

  public struct Item: Sendable, Hashable, Identifiable {
    public let key: String
    public let name: String
    public let metric: Metric
    /// Mọi buổi, cũ → mới (cho biểu đồ chi tiết).
    public let sessions: [Top]
    public var id: String { key }
    public var last: Top { sessions[sessions.count - 1] }
    public var previous: Top? { sessions.count > 1 ? sessions[sessions.count - 2] : nil }
    public var delta: Delta { ExerciseCompare.delta(last, previous, metric) }
  }

  public static let sameKgTolerance = 0.05

  public static func top(_ p: ExercisePerformance) -> Top? {
    if let reps = p.topSetReps ?? p.bestReps, reps > 0 {
      return Top(date: p.date, kg: p.bestWeightKg ?? 0, reps: reps, seconds: p.bestDurationSec, sets: p.setCount)
    }
    if let s = p.bestDurationSec, s > 0 {
      return Top(date: p.date, kg: p.bestWeightKg ?? 0, reps: 0, seconds: s, sets: p.setCount)
    }
    return nil
  }

  /// Một bài từ lịch sử của nó (cũ → mới, như `InsightBook.history`). `nil` khi
  /// chưa có buổi nào so được.
  public static func item(_ history: [ExercisePerformance]) -> Item? {
    let tops = history.compactMap(top)
    guard let lastPerf = history.last, !tops.isEmpty else { return nil }
    let metric: Metric =
      if lastPerf.kind == .timed || tops.allSatisfy({ $0.reps == 0 }) { .time }
      else if lastPerf.kind == .bodyweight || tops.allSatisfy({ $0.kg == 0 }) { .reps }
      else { .weight }
    return Item(key: lastPerf.exerciseKey, name: lastPerf.exerciseName, metric: metric, sessions: tops)
  }

  public static func delta(_ last: Top, _ previous: Top?, _ metric: Metric) -> Delta {
    if metric == .weight, last.kg == 0 { return .noWeight }
    guard let previous else { return .first }
    switch metric {
    case .weight:
      if last.kg == 0 { return .noWeight }
      let dk = last.kg - previous.kg
      if abs(dk) >= sameKgTolerance { return .weight((dk * 100).rounded() / 100) }
      let dr = last.reps - previous.reps
      return dr == 0 ? .same : .reps(dr)
    case .reps:
      let dr = last.reps - previous.reps
      return dr == 0 ? .same : .reps(dr)
    case .time:
      let ds = (last.seconds ?? 0) - (previous.seconds ?? 0)
      return ds == 0 ? .same : .seconds(ds)
    }
  }

  /// Đầu trang: bao nhiêu bài tăng tạ / thêm reps / giữ / giảm (bài lần đầu không tính).
  public struct Summary: Sendable, Hashable {
    public var weightUp = 0
    public var repsUp = 0
    public var same = 0
    public var down = 0
  }

  public static func summary(_ items: [Item]) -> Summary {
    var s = Summary()
    for i in items {
      switch i.delta {
      case .weight(let d) where d > 0: s.weightUp += 1
      case .reps(let d) where d > 0, .seconds(let d) where d > 0: s.repsUp += 1
      case .same: s.same += 1
      case .first, .noWeight: break
      default: s.down += 1
      }
    }
    return s
  }

  /// Gợi ý lần tới — tăng tiến kép: giữ tạ tới khi đủ `topReps` reps rồi lên tạ.
  public enum Next: Sendable, Hashable {
    /// Giữ tạ này, nhắm `low`–`high` reps.
    case holdWeight(kg: Double, low: Int, high: Int)
    /// Đã đủ reps: thử lên tạ một nấc.
    case addWeight(kg: Double)
    /// Không tạ: nhắm thêm reps.
    case moreReps(low: Int, high: Int)
  }

  public static let topReps = 12

  public static func next(_ item: Item) -> Next? {
    let last = item.last
    switch item.metric {
    case .weight:
      if last.kg == 0 { return nil }
      if last.reps >= topReps { return .addWeight(kg: last.kg) }
      return .holdWeight(kg: last.kg, low: last.reps + 1, high: min(topReps, last.reps + 2))
    case .reps:
      return .moreReps(low: last.reps + 1, high: last.reps + 2)
    case .time:
      return nil
    }
  }
}
