#if DEBUG
  import ASCNDCore
  import ASCNDDesignSystem
  import RealityKit
  import SwiftUI

  /// Nhịp từng rep trong trình xem 3D (C1, Kiệt 17/11): dữ liệu và logic chọn pha là
  /// `ASCNDCore.ExerciseTempo` (có test); tệp này chỉ phát và vẽ.

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
    /// Đang xem clip lỗi sai (C2): viên đỏ tách khỏi dải, chạm để về động tác đúng.
    var mistake: Bool = false
    /// Bài có clip lỗi sai: đuôi viên có ⚠︎ mờ, chạm để xem (thay nút ở đáy, Kiệt 17/11).
    var hasMistake: Bool = false
    var onShowMistake: () -> Void = {}
    var onToggleSpeed: () -> Void
    var onExitMistake: () -> Void = {}

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
      // Thanh tiến độ: các pha của lượt đang chạy (đoạn nghỉ giữ lượt vừa xong).
      let rep = ms.map { tempo.rep(at: $0) } ?? 1
      let repPhases = tempo.phases.filter { $0.rep == rep }
      let phaseTint = phase.map { tint($0.kind) }
      let strip =
        VStack(spacing: 4) {
          HStack(spacing: 6) {
            // Kiệt 17/11: bỏ chữ "Rep" — đây là xem 3D, không phải đang tập.
            // Chữ pha cuộn lên khi đổi (chữ cũ trôi lên và mờ, chữ mới trồi lên) theo lò xo nhẹ;
            // Giảm chuyển động: chỉ mờ dần.
            // Giữ chỗ bằng chữ dài nhất (Kiệt 17/11: "thi thoảng nút bị nảy ra xa"): dải không đổi bề
            // rộng khi đổi pha, nên viên tốc độ / viên Sai bên cạnh đứng yên.
            ZStack {
              ForEach(["concentric", "eccentric", "top_hold", "bottom_hold", "ready"], id: \.self) { k in
                Text(label(k))
                  .font(DS.TextStyle.footnote.weight(.bold))
                  .textCase(.uppercase)
                  .hidden()
              }
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
              ZStack(alignment: .leading) {
                ForEach(["exhale", "inhale", "hold"], id: \.self) { b in
                  if let k = breath(b) { Text(k).font(DS.TextStyle.caption).hidden() }
                }
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
        .padding(.horizontal, 14)
      ExerciseTempoIsland(
        strip: strip, phaseKey: phase?.kind ?? "ready", phaseTint: phaseTint, slow: slow, mistake: mistake,
        hasMistake: hasMistake,
        reduceMotion: reduceMotion, stripLabel: accessibilityText(phase: phase),
        onToggleSpeed: onToggleSpeed, onShowMistake: onShowMistake, onExitMistake: onExitMistake)
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

    private func accessibilityText(phase: ExerciseTempo.Phase?) -> Text {
      var t = Text(phase.map { label($0.kind) } ?? "eg.demo3d.tempo.ready")
      if let key = breath(phase?.breath) { t = t + Text(verbatim: ", ") + Text(key) }
      return t
    }
  }

  /// Dải nhịp kiểu Dynamic Island (Kiệt 17/11: "dính với nhau phải có ý nghĩa"). Quy ước: MỖI
  /// KHỐI TÁCH RA LÀ MỘT CHẾ ĐỘ ĐANG BẬT, chạm khối đó để tắt (nó dính lại).
  /// * Một viên liền = xem bình thường; đuôi viên chỉ có con rùa (gợi ý: chạm để xem chậm).
  /// * Xem chậm: con rùa tách ra thành viên cam "🐢 0,5×".
  /// * Clip lỗi sai (C2): đuôi viên có ⚠︎ mờ (chạm để xem); đang xem thì viên đỏ "⚠︎ Sai" tách ra,
  ///   chạm để về động tác đúng. Thay nút "Sai thường gặp" ở đáy (Kiệt 17/11: đáy 3 hàng).
  /// Các khối cao bằng nhau, căn giữa. iOS 26: Liquid Glass (`GlassEffectContainer` +
  /// `glassEffectUnion`, hiệu ứng giọt nước); máy cũ hơn: nền mờ, chỉ đổi khoảng cách.
  struct ExerciseTempoIsland<Strip: View>: View {
    let strip: Strip
    /// Pha đang hiện: mỗi lần đổi, viên phồng ngang rồi co về (co giãn như Dynamic Island).
    let phaseKey: String
    let phaseTint: Color?
    let slow: Bool
    let mistake: Bool
    let hasMistake: Bool
    let reduceMotion: Bool
    let stripLabel: Text
    var onToggleSpeed: () -> Void
    var onShowMistake: () -> Void
    var onExitMistake: () -> Void
    @Namespace private var glass

    private let orange = Color(red: 0.91, green: 0.33, blue: 0.17)
    private let red = Color(red: 0.86, green: 0.18, blue: 0.16)
    private let height: CGFloat = 40
    private let gap: CGFloat = 8

    /// Đuôi viên khi dính: con rùa mờ, ngăn với dải bằng vạch mảnh. Khi tách: rùa + "0,5×".
    private var speedChip: some View {
      HStack(spacing: 4) {
        Image(systemName: "tortoise.fill")
          .font(.system(size: 13, weight: .semibold))
        if slow {
          Text("eg.demo3d.tempo.slow")
            .font(DS.TextStyle.footnote.weight(.bold))
            .monospacedDigit()
            .transition(reduceMotion ? .opacity : .scale(scale: 0.6, anchor: .leading).combined(with: .opacity))
        }
      }
      .foregroundStyle(slow ? Color.white : DS.Color.mutedForeground.swiftUI)
      .padding(.horizontal, slow ? 12 : 10)
      .frame(height: height)
      .overlay(alignment: .leading) {
        Capsule()
          .fill(DS.Color.foreground.swiftUI.opacity(0.18))
          .frame(width: 1, height: height * 0.45)
          .opacity(slow ? 0 : 1)
      }
    }

    /// Dính: ⚠︎ mờ ở đuôi viên. Tách (đang xem lỗi sai): viên đỏ "⚠︎ Sai".
    private var mistakeChip: some View {
      HStack(spacing: 4) {
        Image(systemName: "exclamationmark.triangle.fill")
          .font(.system(size: 12, weight: .bold))
        if mistake {
          Text("eg.demo3d.mistake.short")
            .font(DS.TextStyle.footnote.weight(.bold))
            .transition(reduceMotion ? .opacity : .scale(scale: 0.6, anchor: .leading).combined(with: .opacity))
        }
      }
      .foregroundStyle(mistake ? Color.white : DS.Color.mutedForeground.swiftUI)
      .padding(.horizontal, mistake ? 12 : 10)
      .frame(height: height)
      .overlay(alignment: .leading) {
        Capsule()
          .fill(DS.Color.foreground.swiftUI.opacity(0.18))
          .frame(width: 1, height: height * 0.45)
          .opacity(mistake ? 0 : 1)
      }
    }

    /// Tách / dính: lò xo đàn hồi như Dynamic Island (vươn quá một chút rồi về).
    private var motion: Animation? {
      reduceMotion ? nil : .spring(response: 0.5, dampingFraction: 0.68)
    }

    /// Nhịp phồng ngang của viên khi đổi pha: 0 → 1 → 0.
    @State private var pulse: CGFloat = 0

    private enum Chip: Hashable { case mistake, speed }

    private func on(_ c: Chip) -> Bool { c == .mistake ? mistake : slow }

    /// Khối đang tắt nằm sát dải (dính), khối đang bật ra ngoài cùng (tách) — để vùng kính gộp
    /// không bao giờ phủ lên một khối đang tách (Kiệt 17/11: viên "Sai" bị kẹp giữa dải và rùa).
    private var order: [Chip] {
      let chips: [Chip] = hasMistake ? [.mistake, .speed] : [.speed]
      return chips.filter { !on($0) } + chips.filter { on($0) }
    }

    @ViewBuilder private func chipButton(_ c: Chip) -> some View {
      switch c {
      case .mistake:
        Button(action: mistake ? onExitMistake : onShowMistake) { mistakeChip }
          .buttonStyle(.plain)
          .mistakeAccessibility(mistake)
      case .speed:
        Button(action: onToggleSpeed) { speedChip }
          .buttonStyle(.plain)
          .accessibilityHidden(true)
      }
    }

    private func tint(_ c: Chip) -> Color? {
      guard on(c) else { return nil }
      return c == .mistake ? red : orange
    }

    var body: some View {
      Group {
        if #available(iOS 26.0, *) {
          GlassEffectContainer(spacing: gap) {
            HStack(spacing: 0) {
              Button(action: onToggleSpeed) { strip.frame(height: height) }
                .buttonStyle(.plain)
                .glassEffect(.regular.tint(phaseTint?.opacity(0.18)).interactive(), in: Capsule())
                .glassEffectID("strip", in: glass)
                .glassEffectUnion(id: "island", namespace: glass)
                .stripAccessibility(stripLabel: stripLabel, slow: slow, toggle: onToggleSpeed)
              ForEach(order, id: \.self) { c in
                chipButton(c)
                  .glassEffect(.regular.tint(tint(c)?.opacity(0.9)).interactive(), in: Capsule())
                  .glassEffectID(c == .mistake ? "mistake" : "speed", in: glass)
                  .glassEffectUnion(id: on(c) ? nil : "island", namespace: glass)
                  .padding(.leading, on(c) ? gap : 0)
              }
            }
          }
        } else {
          HStack(spacing: 0) {
            HStack(spacing: 0) {
              Button(action: onToggleSpeed) { strip.frame(height: height) }
                .buttonStyle(.plain)
                .stripAccessibility(stripLabel: stripLabel, slow: slow, toggle: onToggleSpeed)
              ForEach(order.filter { !on($0) }, id: \.self) { chipButton($0) }
            }
            .background(Capsule().fill(.ultraThinMaterial))
            ForEach(order.filter { on($0) }, id: \.self) { c in
              chipButton(c)
                .background(Capsule().fill(tint(c) ?? .clear))
                .padding(.leading, gap)
            }
          }
        }
      }
      // Co giãn như Dynamic Island: đổi pha thì cả viên phồng ngang 5 %, dẹt dọc 4 % rồi co về theo
      // lò xo; tách / dính dùng lò xo đàn hồi. Giảm chuyển động: không co giãn, đổi ngay.
      .scaleEffect(x: 1 + 0.05 * pulse, y: 1 - 0.04 * pulse, anchor: .center)
      .animation(motion, value: slow)
      .animation(motion, value: mistake)
      .onChange(of: phaseKey) { _, _ in
        guard !reduceMotion else { return }
        withAnimation(.spring(response: 0.18, dampingFraction: 0.6)) { pulse = 1 }  // reduce-motion: guard ở trên
        withAnimation(.spring(response: 0.45, dampingFraction: 0.55).delay(0.12)) { pulse = 0 }  // reduce-motion: guard ở trên
      }
    }
  }

  private extension View {
    func stripAccessibility(stripLabel: Text, slow: Bool, toggle: @escaping () -> Void) -> some View {
      accessibilityElement(children: .ignore)
        .accessibilityLabel(stripLabel + Text(verbatim: ", ") + Text(slow ? "eg.demo3d.tempo.slow" : "eg.demo3d.tempo.normal"))
        .accessibilityHint(Text("eg.demo3d.tempo.hint"))
        .accessibilityAddTraits(.isButton)
        .accessibilityAction { toggle() }
    }

    func mistakeAccessibility(_ on: Bool) -> some View {
      accessibilityLabel(Text(on ? "eg.demo3d.mistake.badge" : "eg.demo3d.mistake.show"))
        .accessibilityHint(Text(on ? "eg.demo3d.mistake.hide" : "eg.demo3d.mistake.show"))
    }
  }
#endif
