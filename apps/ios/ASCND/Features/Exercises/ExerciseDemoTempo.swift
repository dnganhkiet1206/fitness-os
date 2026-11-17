#if DEBUG
  import ASCNDDesignSystem
  import RealityKit
  import SwiftUI

  /// Nhịp từng rep trong trình xem 3D (C1, Kiệt 17/11): pha đang chạy (Nâng / Giữ / Hạ), nhịp thở,
  /// số rep và thanh tiến độ của rep, đồng bộ với chuyển động. Dữ liệu từ `tempo.json` của Motion
  /// Lab (`<bài>_demo.json` → `tempo`, `pipeline/export_app_demos.py`), cùng dòng thời gian với
  /// clip. Chạm dải để xem chậm 0,5×.
  struct ExerciseTempo {
    struct Phase {
      let rep: Int
      let kind: String
      let startMs: Double
      let endMs: Double
      let breath: String?
    }
    let durationMs: Double
    let reps: Int
    let phases: [Phase]

    /// Pha tại thời điểm `ms` của clip; nil = đoạn chuẩn bị đầu / cuối clip.
    func phase(at ms: Double) -> Phase? {
      phases.first { ms >= $0.startMs && ms < $0.endMs }
    }

    /// Pha dài hơn ngưỡng này mới đổi chữ trên dải (Kiệt 17/11: chữ nháy nhanh quá, đọc không kịp).
    static let minimumLabelMs: Double = 700

    /// Pha hiện trên dải: các pha ngắn (giữ 0,3–0,4 s, chuẩn bị 0,6 s) giữ nguyên chữ của pha dài
    /// vừa qua (đầu clip: pha dài sắp tới), nên chữ chỉ đổi giữa Nâng và Hạ.
    func labelPhase(at ms: Double) -> Phase? {
      let long = phases.filter { $0.endMs - $0.startMs >= Self.minimumLabelMs }
      if let p = phase(at: ms), p.endMs - p.startMs >= Self.minimumLabelMs { return p }
      return long.last { $0.startMs <= ms } ?? long.first
    }
  }

  /// Bộ điều khiển phát của nhân vật, file chuyển động và quần (cùng một clip): đọc thời điểm
  /// hiện tại và đổi tốc độ cho cả ba.
  @MainActor final class DemoPlayback {
    var controllers: [AnimationPlaybackController] = []
    var duration: TimeInterval = 0

    /// Thời điểm trong clip (giây, 0..duration), nil khi chưa phát.
    var time: TimeInterval? {
      guard let c = controllers.first, duration > 0 else { return nil }
      let t = c.time.truncatingRemainder(dividingBy: duration)
      return t < 0 ? t + duration : t
    }

    func setSpeed(_ speed: Float) {
      for c in controllers { c.speed = speed }
    }
  }

  struct ExerciseTempoStrip: View {
    let tempo: ExerciseTempo
    /// Thời điểm trong clip, mili giây theo dòng thời gian của `tempo`.
    let ms: Double?
    let slow: Bool
    var onToggleSpeed: () -> Void

    private let lift = Color(red: 0.91, green: 0.33, blue: 0.17)
    private let lower = Color(red: 0.44, green: 0.65, blue: 0.79)

    private func tint(_ kind: String) -> Color {
      switch kind {
      case "concentric": lift
      case "eccentric": lower
      default: DS.Color.mutedForeground.swiftUI
      }
    }

    private func label(_ kind: String) -> LocalizedStringKey {
      switch kind {
      case "concentric": "eg.demo3d.tempo.concentric"
      case "eccentric": "eg.demo3d.tempo.eccentric"
      case "top_hold": "eg.demo3d.tempo.topHold"
      case "bottom_hold": "eg.demo3d.tempo.bottomHold"
      default: "eg.demo3d.tempo.ready"
      }
    }

    private func breath(_ b: String?) -> LocalizedStringKey? {
      switch b {
      case "exhale": "eg.demo3d.tempo.exhale"
      case "inhale": "eg.demo3d.tempo.inhale"
      case "hold": "eg.demo3d.tempo.holdBreath"
      default: nil
      }
    }

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
      let phase = ms.flatMap { tempo.labelPhase(at: $0) }
      // Đoạn nghỉ giữa / sau các rep: giữ rep vừa xong.
      let rep = phase?.rep ?? ms.flatMap { m in tempo.phases.last { $0.startMs <= m }?.rep } ?? 1
      let repPhases = tempo.phases.filter { $0.rep == rep }
      Button(action: onToggleSpeed) {
        VStack(spacing: 4) {
          HStack(spacing: 6) {
            Text("eg.demo3d.tempo.rep \(rep) \(tempo.reps)")
              .font(DS.TextStyle.caption.weight(.semibold))
              .foregroundStyle(DS.Color.mutedForeground.swiftUI)
              .monospacedDigit()
            Text(phase.map { label($0.kind) } ?? "eg.demo3d.tempo.ready")
              .font(DS.TextStyle.footnote.weight(.bold))
              .textCase(.uppercase)
              .foregroundStyle(phase.map { tint($0.kind) } ?? DS.Color.foreground.swiftUI)
              .contentTransition(.opacity)
              // Chữ mờ dần sang pha mới thay vì nhảy; Giảm chuyển động thì đổi ngay.
              .animation(reduceMotion ? nil : .easeInOut(duration: 0.25), value: phase?.kind)
            if let key = breath(phase?.breath) {
              Text(verbatim: "·").foregroundStyle(DS.Color.mutedForeground.swiftUI)
              Text(key)
                .font(DS.TextStyle.caption)
                .foregroundStyle(DS.Color.foreground.swiftUI)
            }
            Text(slow ? "eg.demo3d.tempo.slow" : "eg.demo3d.tempo.normal")
              .font(DS.TextStyle.caption.weight(.bold))
              .monospacedDigit()
              .padding(.horizontal, 6)
              .padding(.vertical, 2)
              .background(Capsule().fill(slow ? AnyShapeStyle(lift) : AnyShapeStyle(.quaternary)))
              .foregroundStyle(slow ? Color.white : DS.Color.foreground.swiftUI)
          }
          .lineLimit(1)
          .minimumScaleFactor(0.75)
          progress(repPhases)
            .frame(height: 3)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 6)
        .background(Capsule().fill(.ultraThinMaterial))
      }
      .buttonStyle(.plain)
      .accessibilityElement(children: .ignore)
      .accessibilityLabel(accessibilityText(phase: phase, rep: rep))
      .accessibilityHint(Text("eg.demo3d.tempo.hint"))
    }

    /// Một vạch cho mỗi pha của rep, dài theo thời lượng; phần đã qua tô màu pha.
    private func progress(_ phases: [ExerciseTempo.Phase]) -> some View {
      GeometryReader { geo in
        let total = phases.reduce(0) { $0 + ($1.endMs - $1.startMs) }
        HStack(spacing: 2) {
          ForEach(Array(phases.enumerated()), id: \.offset) { _, p in
            let w = total > 0 ? (p.endMs - p.startMs) / total : 0
            let done = ms.map { min(max(($0 - p.startMs) / max(p.endMs - p.startMs, 1), 0), 1) } ?? 0
            ZStack(alignment: .leading) {
              Capsule().fill(DS.Color.foreground.swiftUI.opacity(0.15))
              Capsule().fill(tint(p.kind)).frame(width: max(0, geo.size.width * w - 2) * done)
            }
            .frame(width: max(0, geo.size.width * w - 2))
          }
        }
      }
    }

    private func accessibilityText(phase: ExerciseTempo.Phase?, rep: Int) -> Text {
      var t = Text("eg.demo3d.tempo.rep \(rep) \(tempo.reps)") + Text(verbatim: ", ")
        + Text(phase.map { label($0.kind) } ?? "eg.demo3d.tempo.ready")
      if let key = breath(phase?.breath) { t = t + Text(verbatim: ", ") + Text(key) }
      return t + Text(verbatim: ", ") + Text(slow ? "eg.demo3d.tempo.slow" : "eg.demo3d.tempo.normal")
    }
  }
#endif
