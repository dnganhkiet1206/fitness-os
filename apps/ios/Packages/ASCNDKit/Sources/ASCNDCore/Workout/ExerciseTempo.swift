import Foundation

/// Nhịp từng rep của một clip 3D (C1, Kiệt 17/11): các pha của mỗi rep trên dòng thời gian của
/// clip (mili giây), từ `tempo.json` của Motion Lab (`<bài>_demo.json` → `tempo`). Logic thuần:
/// trình xem trong app chỉ hỏi "pha nào đang chạy", "chữ nào hiện", "chấm thở cỡ nào".
public struct ExerciseTempo: Equatable, Sendable {
  public struct Phase: Equatable, Sendable {
    public let rep: Int
    /// `concentric` / `eccentric` / `top_hold` / `bottom_hold`.
    public let kind: String
    public let startMs: Double
    public let endMs: Double
    /// `exhale` / `inhale` / `hold`, nil = không ghi.
    public let breath: String?

    public init(rep: Int, kind: String, startMs: Double, endMs: Double, breath: String?) {
      self.rep = rep
      self.kind = kind
      self.startMs = startMs
      self.endMs = endMs
      self.breath = breath
    }

    public var durationMs: Double { endMs - startMs }
  }

  public let durationMs: Double
  public let reps: Int
  public let phases: [Phase]

  public init(durationMs: Double, reps: Int, phases: [Phase]) {
    self.durationMs = durationMs
    self.reps = reps
    self.phases = phases
  }

  /// Pha tại thời điểm `ms` của clip; nil = đoạn chuẩn bị đầu / nghỉ cuối clip.
  public func phase(at ms: Double) -> Phase? {
    phases.first { ms >= $0.startMs && ms < $0.endMs }
  }

  /// Pha dài hơn ngưỡng này mới đổi chữ trên dải (Kiệt 17/11: chữ nháy nhanh quá, đọc không kịp).
  public static let minimumLabelMs: Double = 700

  /// Pha hiện trên dải: các pha ngắn (giữ 0,3–0,4 s, chuẩn bị 0,6 s) giữ nguyên chữ của pha dài
  /// vừa qua (đầu clip: pha dài sắp tới), nên chữ chỉ đổi giữa Nâng và Hạ.
  public func labelPhase(at ms: Double) -> Phase? {
    let long = phases.filter { $0.durationMs >= Self.minimumLabelMs }
    if let p = phase(at: ms), p.durationMs >= Self.minimumLabelMs { return p }
    return long.last { $0.startMs <= ms } ?? long.first
  }

  /// Rep đang hiện: rep của pha đang chạy; đoạn nghỉ giữa / sau các rep giữ rep vừa xong; đầu clip là 1.
  public func rep(at ms: Double) -> Int {
    labelPhase(at: ms)?.rep ?? phases.last { $0.startMs <= ms }?.rep ?? 1
  }

  /// Cỡ chấm thở (0,55 = xẹp, 1 = phồng) tại `ms`: hít vào phồng dần, thở ra xẹp dần (smoothstep),
  /// giữ đáy = phồng, giữ đỉnh / ngoài pha = xẹp. Liền theo thời gian nên luôn mượt.
  public func breathScale(at ms: Double) -> Double {
    let low = 0.55
    guard let first = phases.first, let last = phases.last else { return low }
    // Ngoài các pha (chuẩn bị đầu / nghỉ cuối): giữ cỡ ở mép pha gần nhất, không nhảy cóc.
    let p: Phase
    if let inside = phase(at: ms) {
      p = inside
    } else if ms < first.startMs {
      return scale(of: first, x: 0, low: low)
    } else if ms >= last.endMs {
      return scale(of: last, x: 1, low: low)
    } else {
      p = phases.last { $0.endMs <= ms } ?? first
      return scale(of: p, x: 1, low: low)
    }
    return scale(of: p, x: min(max((ms - p.startMs) / max(p.durationMs, 1), 0), 1), low: low)
  }

  private func scale(of p: Phase, x: Double, low: Double) -> Double {
    let t = x * x * (3 - 2 * x)
    switch p.breath {
    case "inhale": return low + (1 - low) * t
    case "exhale": return 1 - (1 - low) * t
    default: return p.kind == "bottom_hold" ? 1 : low
    }
  }
}
