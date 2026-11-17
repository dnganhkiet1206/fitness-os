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

    /// Cỡ chấm thở (0,55 = xẹp, 1 = phồng) tại `ms`: hít vào (pha Hạ) phồng dần, thở ra (pha Nâng)
    /// xẹp dần, pha giữ đứng yên ở cỡ cuối pha trước. Tính liền theo thời gian nên luôn mượt.
    func breathScale(at ms: Double) -> Double {
      let low = 0.55
      func eased(_ t: Double) -> Double { t * t * (3 - 2 * t) }
      guard let p = phase(at: ms) else { return low }
      let t = eased(min(max((ms - p.startMs) / max(p.endMs - p.startMs, 1), 0), 1))
      switch p.breath {
      case "inhale": return low + (1 - low) * t
      case "exhale": return 1 - (1 - low) * t
      default: return p.kind == "bottom_hold" ? 1 : low
      }
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
      let phaseTint = phase.map { tint($0.kind) }
      let strip =
        VStack(spacing: 4) {
          HStack(spacing: 6) {
            Text("eg.demo3d.tempo.rep \(rep) \(tempo.reps)")
              .font(DS.TextStyle.caption.weight(.bold))
              // Kiệt 17/11: chữ rep màu chính (trắng ở chế độ tối) cho dễ đọc trên kính.
              .foregroundStyle(DS.Color.foreground.swiftUI)
              .monospacedDigit()
              // Số rep cuộn khi đổi; Giảm chuyển động thì chỉ mờ dần.
              .contentTransition(reduceMotion ? .opacity : .numericText())
              .animation(reduceMotion ? .easeInOut(duration: 0.2) : .smooth(duration: 0.4), value: rep)
            // Chữ pha cuộn lên khi đổi (chữ cũ trôi lên và mờ, chữ mới trồi lên) theo lò xo nhẹ;
            // Giảm chuyển động: chỉ mờ dần.
            ZStack {
              Text(phase.map { label($0.kind) } ?? "eg.demo3d.tempo.ready")
                .font(DS.TextStyle.footnote.weight(.bold))
                .textCase(.uppercase)
                .foregroundStyle(phase.map { tint($0.kind) } ?? DS.Color.foreground.swiftUI)
                .id(phase?.kind ?? "ready")
                .transition(reduceMotion ? .opacity : .push(from: .bottom))
            }
            .clipped()
            .animation(reduceMotion ? .easeInOut(duration: 0.2) : .spring(duration: 0.45, bounce: 0.18), value: phase?.kind)
            if let key = breath(phase?.breath) {
              // Chấm thở: phồng khi hít vào, xẹp khi thở ra, theo đúng thời gian clip.
              // Giảm chuyển động: chấm đứng yên.
              Circle()
                .fill(phase.map { tint($0.kind) } ?? DS.Color.mutedForeground.swiftUI)
                .frame(width: 9, height: 9)
                .scaleEffect(reduceMotion ? 0.8 : (ms.map { tempo.breathScale(at: $0) } ?? 0.55))
                .accessibilityHidden(true)
              ZStack {
                Text(key)
                  .font(DS.TextStyle.caption)
                  .foregroundStyle(DS.Color.foreground.swiftUI)
                  .id(phase?.breath ?? "")
                  .transition(.opacity)
              }
              .animation(reduceMotion ? nil : .easeInOut(duration: 0.3), value: phase?.breath)
            }
          }
          .lineLimit(1)
          .minimumScaleFactor(0.75)
          progress(repPhases)
            .frame(height: 3)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 6)
      ExerciseTempoIsland(
        strip: strip, phaseTint: phaseTint, slow: slow, reduceMotion: reduceMotion,
        stripLabel: accessibilityText(phase: phase, rep: rep), onToggleSpeed: onToggleSpeed)
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
      return t
    }
  }

  /// Dải nhịp + viên tốc độ, hai khối kính tách / dính như Dynamic Island (Kiệt 17/11): 1× thì
  /// viên tốc độ áp sát dải, hai khối hút thành một; 0,5× thì viên tách ra, nhuộm cam. Chạm khối
  /// nào cũng đổi tốc độ, nên hai khối tách / dính theo nhau. iOS 26: Liquid Glass
  /// (`GlassEffectContainer`, hiệu ứng giọt nước); máy cũ hơn: nền mờ hệ thống, chỉ đổi khoảng cách.
  struct ExerciseTempoIsland<Strip: View>: View {
    let strip: Strip
    let phaseTint: Color?
    let slow: Bool
    let reduceMotion: Bool
    let stripLabel: Text
    var onToggleSpeed: () -> Void
    @Namespace private var glass

    private let orange = Color(red: 0.91, green: 0.33, blue: 0.17)
    /// Khoảng hút của hai khối kính: gần hơn thì dính thành một.
    private let mergeDistance: CGFloat = 14

    private var speedLabel: some View {
      Text(slow ? "eg.demo3d.tempo.slow" : "eg.demo3d.tempo.normal")
        .font(DS.TextStyle.footnote.weight(.bold))
        .monospacedDigit()
        .foregroundStyle(slow ? Color.white : DS.Color.foreground.swiftUI)
        .contentTransition(reduceMotion ? .opacity : .numericText())
        .padding(.horizontal, 10)
        .frame(minHeight: 36)
    }

    var body: some View {
      Group {
        if #available(iOS 26.0, *) {
          GlassEffectContainer(spacing: mergeDistance) {
            HStack(spacing: slow ? mergeDistance + 6 : 0) {
              Button(action: onToggleSpeed) { strip }
                .buttonStyle(.plain)
                .glassEffect(.regular.tint(phaseTint?.opacity(0.18)).interactive(), in: Capsule())
                .glassEffectID("strip", in: glass)
              Button(action: onToggleSpeed) { speedLabel }
                .buttonStyle(.plain)
                .glassEffect(.regular.tint(slow ? orange.opacity(0.85) : nil).interactive(), in: Capsule())
                .glassEffectID("speed", in: glass)
            }
          }
        } else {
          HStack(spacing: slow ? mergeDistance + 6 : 2) {
            Button(action: onToggleSpeed) { strip }
              .buttonStyle(.plain)
              .background(Capsule().fill(.ultraThinMaterial))
            Button(action: onToggleSpeed) { speedLabel }
              .buttonStyle(.plain)
              .background(Capsule().fill(slow ? AnyShapeStyle(orange) : AnyShapeStyle(.ultraThinMaterial)))
          }
        }
      }
      // Lò xo nảy nhẹ khi tách / dính; Giảm chuyển động: đổi ngay.
      .animation(reduceMotion ? nil : .spring(duration: 0.5, bounce: 0.3), value: slow)
      .accessibilityElement(children: .ignore)
      .accessibilityLabel(stripLabel + Text(verbatim: ", ") + Text(slow ? "eg.demo3d.tempo.slow" : "eg.demo3d.tempo.normal"))
      .accessibilityHint(Text("eg.demo3d.tempo.hint"))
      .accessibilityAddTraits(.isButton)
      .accessibilityAction { onToggleSpeed() }
    }
  }
#endif
