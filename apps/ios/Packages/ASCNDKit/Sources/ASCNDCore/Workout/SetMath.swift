import Foundation

/// Một set đã ghi, đủ cho volume và kỷ lục.
public struct LoggedSet: Sendable, Hashable {
  public var reps: Int
  /// kg. `nil` = chưa nhập tạ (bài bodyweight, hoặc bỏ trống).
  public var weight: Double?
  public var warmup: Bool
  public var durationSec: Int?

  public init(reps: Int, weight: Double?, warmup: Bool = false, durationSec: Int? = nil) {
    self.reps = reps
    self.weight = weight
    self.warmup = warmup
    self.durationSec = durationSec
  }
}

public enum WorkoutMath {
  /// Làm tròn 2 chữ số như `round2` của RN (`Math.round(w * 100) / 100`).
  public static func round2(_ w: Double) -> Double { (w * 100).rounded() / 100 }

  /// Volume = Σ kg × reps, BỎ set khởi động (WS-5): volume nuôi cửa sổ tải và
  /// từ đó là điểm sẵn sàng, và một set khởi động 60 kg không phải tải tập.
  /// Set giữ (reps 0) góp 0. Theo `exercise-performance.ts`: round2 từng mức
  /// tạ, tổng làm tròn 2 chữ số.
  public static func volume(of sets: [LoggedSet]) -> Double {
    let total = sets.reduce(0.0) { sum, s in
      guard !s.warmup, s.reps > 0 else { return sum }
      return sum + round2(s.weight ?? 0) * Double(s.reps)
    }
    return round2(total)
  }

  /// Số set "đã làm" của một bài, khởi động bị loại; set giữ được tính dù góp
  /// 0 volume (LT-6).
  public static func performedSetCount(_ sets: [LoggedSet]) -> Int {
    sets.filter { !$0.warmup && ($0.reps > 0 || ($0.durationSec ?? 0) > 0) }.count
  }
}

/// Kỷ lục cá nhân — theo `native/src/lib/personal-record.ts` @ fac9ac2.
public enum PersonalRecords {
  /// Biên chống "kỷ lục ma" khi đổi kg ↔ lb khứ hồi.
  public static let weightEpsilonKg = 0.05

  public struct Best: Sendable, Hashable, Codable {
    public var topWeight: Double
    /// Khoá là `weightKey(w)`, ví dụ "100.00".
    public var repsAt: [String: Int]
    public init(topWeight: Double, repsAt: [String: Int]) {
      self.topWeight = topWeight
      self.repsAt = repsAt
    }
  }

  public enum Kind: String, Sendable, Hashable, Codable { case weight, reps }

  /// Ô 0,05 kg của một mức tạ, cùng chuỗi với `weightKey` bên RN để lịch sử
  /// dựng ở hai app đọc được của nhau.
  public static func weightKey(_ w: Double) -> String {
    String(format: "%.2f", (w / weightEpsilonKg).rounded() * weightEpsilonKg)
  }

  /// Set có đủ tư cách so kỷ lục: không khởi động, reps ≥ 1, tạ ≥ 0.
  public static func counts(_ s: LoggedSet) -> Bool {
    guard !s.warmup, s.reps >= 1 else { return false }
    let w = s.weight ?? 0
    return w.isFinite && w >= 0
  }

  /// `nil` khi không phải kỷ lục. Không có lịch sử (`best == nil`) thì không
  /// bao giờ là kỷ lục — buổi đầu tiên không nổ kỷ lục cho mọi bài.
  public static func check(_ s: LoggedSet, best: Best?) -> Kind? {
    guard counts(s), let best else { return nil }
    let w = WorkoutMath.round2(s.weight ?? 0)
    if w > 0 && w > best.topWeight + weightEpsilonKg { return .weight }
    // Mức tạ chưa từng dùng thì chưa có gì để vượt.
    guard let prev = best.repsAt[weightKey(w)], s.reps > prev else { return nil }
    return .reps
  }
}
