/// Rung theo kịch bản Koa (KOA-T15, audit Koa 17/11): dữ liệu `Cue.haptic` đã có từ khi duyệt
/// storyboard nhưng chưa bao giờ được phát — màn nghỉ / phản ứng chỉ có tiếng, nên ai tắt tiếng
/// thì không có nhịp nào. Phần thuần (không UIKit): mốc rung của một cảnh và luật có rung hay không.
public enum KoaHaptics {
  /// Một mốc rung: thời điểm (ms trong cảnh) + kiểu.
  public struct Mark: Sendable, Hashable {
    public let t: Double
    public let haptic: KoaReaction.Haptic
  }

  /// Mốc rung của một cảnh: đầu mỗi cue có `haptic` khác `.none`, theo thời gian; một mốc mỗi
  /// thời điểm (kiểu mạnh nhất) — "một cue mỗi khoảnh khắc" (R7).
  public static func marks(_ cues: [KoaPerformance.Cue]) -> [Mark] {
    var byTime: [Double: KoaReaction.Haptic] = [:]
    for c in cues where c.haptic != .none {
      if let had = byTime[c.from], rank(had) >= rank(c.haptic) { continue }
      byTime[c.from] = c.haptic
    }
    return byTime.keys.sorted().map { Mark(t: $0, haptic: byTime[$0]!) }
  }

  static func rank(_ h: KoaReaction.Haptic) -> Int {
    switch h {
    case .none: 0
    case .soft: 1
    case .heavy: 2
    case .success: 3
    }
  }

  /// Mốc vừa đi qua ở lượt này: `t` đã tới mốc, mốc chưa phát, và chưa trễ quá `window` ms
  /// (mở lại giữa cảnh không rung bù các mốc cũ — như tiếng).
  public static func due(_ marks: [Mark], at t: Double, fired: Set<Double>, window: Double = 250) -> [Mark] {
    marks.filter { $0.t <= t && !fired.contains($0.t) && t - $0.t < window }
  }

  /// Có rung không: Giảm chuyển động bật thì không (kịch bản rung đi cùng chuyển động mạnh:
  /// lắc, pháo giấy); không liên quan tiếng — tắt tiếng vẫn rung.
  public static func allowed(reduceMotion: Bool) -> Bool { !reduceMotion }
}
