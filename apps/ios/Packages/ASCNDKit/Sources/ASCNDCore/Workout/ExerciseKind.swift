public import Foundation

/// Loại bài — quyết định "tiến bộ" nghĩa là gì với nó (`exercise-kind.ts` @
/// fac9ac2). Ở đây dùng cho "lần trước" (#417): bài bodyweight được tải bởi
/// chính cơ thể, nên tạ hiện = cân nặng + tạ đeo.
public enum ExerciseKind: String, Sendable, Hashable, Codable, CaseIterable {
  case compound, isolation, bodyweight, timed

  /// `resolveKind`: khai báo trong thư viện (`exercises.exercise_kind`) thắng;
  /// không có thì suy từ các set của bài.
  ///
  /// - giữ: có thời gian mà không có rep → `timed` (xét TRƯỚC bodyweight: plank
  ///   cũng không mang tạ);
  /// - ít nhất NỬA số set không tạ → `bodyweight` (lịch sử hít xà 0, 0, 10, 10
  ///   — hai buổi tay không, hai buổi đeo đai — vẫn là bodyweight; một ô tạ
  ///   quên điền ở bài squat thì không);
  /// - còn lại → `compound`. Không bao giờ suy ra `isolation`: không con số nào
  ///   phân biệt được curl với row.
  public static func resolve(declared: String?, sets: [RecordSet]) -> ExerciseKind {
    if let d = declared, let k = ExerciseKind(rawValue: d) { return k }
    let real = sets.filter { $0.weightKg.isFinite && $0.weightKg >= 0 }
    guard !real.isEmpty else { return .compound }
    let timed = real.filter { ($0.durationSec ?? 0) > 0 }
    if !timed.isEmpty, timed.allSatisfy({ $0.reps <= 0 }) { return .timed }
    let unloaded = real.filter { $0.weightKg == 0 }.count
    return unloaded * 2 >= real.count ? .bodyweight : .compound
  }
}

/// Một lần cân (`weight_logs`: `date`, `weight_kg`).
public struct WeighIn: Sendable, Hashable, Codable {
  public let date: LocalDate
  public let kg: Double

  public init(date: LocalDate, kg: Double) {
    self.date = date
    self.kg = kg
  }

  /// `bodyweightOn`: lần cân gần nhất VÀO HOẶC TRƯỚC ngày ấy — không bao giờ
  /// lần cân sau (không ghi công hít xà hôm nay cho một cơ thể chưa có). Không
  /// có → `nil`, không phải 0. Lần cân cũ vẫn dùng: cũ còn hơn không đo được.
  public static func bodyweight(on date: LocalDate, _ weighIns: [WeighIn]) -> Double? {
    var best: WeighIn?
    for w in weighIns where w.kg.isFinite && w.kg > 0 && w.date <= date {
      if best.map({ w.date > $0.date }) ?? true { best = w }
    }
    return best.map { WorkoutMath.round2($0.kg) }
  }
}
