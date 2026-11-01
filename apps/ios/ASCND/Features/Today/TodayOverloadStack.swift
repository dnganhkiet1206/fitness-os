import ASCNDCore
import ASCNDDesignSystem
import SwiftUI

/// Việc chính + "Tăng tải hôm nay" chồng lên nhau (Kiệt duyệt mock 28/10): thẻ trên
/// che thẻ dưới nhưng chừa một dải `peek` có thông tin dùng được — bài nên tăng
/// nhất, hay "Chest day · Bắt đầu ›" khi đã vuốt sang. Vuốt ngang (hoặc chạm dải)
/// để đổi; VoiceOver đổi bằng hành động có tên.
struct TodayOverloadStack<Hero: View>: View {
  let items: [OverloadPlan.Item]
  /// Dải của việc chính khi nó nằm dưới: "Chest day · ~12 phút".
  let mainPeek: String
  /// Nút trên dải ấy ("Bắt đầu") — làm luôn việc chính, không cần đổi thẻ.
  let mainAction: String
  let onMainAction: () -> Void
  /// Chạm thẻ tăng tải → trang Tiến bộ từng bài (Kiệt 01/11). `nil` = thẻ chỉ để xem.
  var onOpenLoad: (() -> Void)? = nil
  /// Thẻ việc chính; `true` = kèm dòng "vuốt để xem" (chỉ để đo khung cũ).
  @ViewBuilder var hero: (_ withHint: Bool) -> Hero

  @State private var showsLoad = false
  @State private var frontHeight: CGFloat = 0
  @State private var frontWidth: CGFloat = 360
  /// Thẻ trên đang theo ngón tay (pt).
  @State private var dragX: CGFloat = 0
  /// Thẻ vừa từ phía sau tiến lên: bắt đầu nhỏ và thấp như thẻ sau rồi bật về chỗ.
  @State private var entering = false
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  @Environment(\.weightUnit) private var unit
  @Environment(\.locale) private var locale
  @Environment(\.dynamicTypeSize) private var typeSize

  /// Dải tối thiểu khi chữ lớn làm thẻ trên cao gần bằng khung.
  static var minPeek: CGFloat { 28 }

  /// Cả chồng nằm GỌN trong khung cũ của thẻ việc chính (Kiệt 28/10): khung = thẻ
  /// việc chính kèm dòng "vuốt để xem"; thẻ trên bỏ dòng ấy, dải của thẻ sau nằm đúng
  /// vào khoảng trống — trang bên dưới không xê dịch.
  var body: some View {
    if typeSize.isAccessibilitySize { accessibleBody } else { stackedBody }
  }

  /// Chữ trợ năng (soát 01/11): chồng bài ép cả hai thẻ vào khung của việc chính, chữ
  /// lớn bị cắt ("Tập Ngực ·…", "Xem c…"). Ở cỡ này hai thẻ xếp dọc, cao theo chữ;
  /// thẻ trên vẫn đổi việc chính ↔ tăng tải, dải dưới là nút đổi.
  private var accessibleBody: some View {
    VStack(spacing: DS.Spacing.sm) {
      front
      Group {
        if showsLoad { mainStrip } else { loadStrip }
      }
      .padding(.vertical, DS.Spacing.sm)
      .padding(.horizontal, DS.Spacing.md)
      .frame(maxWidth: .infinity, alignment: .leading)
      .todayCard()
    }
    .sensoryFeedback(.selection, trigger: showsLoad)
    .accessibilityAction(named: Text(showsLoad ? "ov.a11y.back" : "ov.a11y.show")) { swap() }
  }

  private var stackedBody: some View {
    hero(true)
      .hidden()
      .accessibilityHidden(true)
      .overlay(alignment: .top) {
        ZStack(alignment: .top) {
          back
            .padding(.horizontal, DS.Spacing.sm)
            // Kéo thẻ trên ra thì thẻ sau nhô lên theo.
            .scaleEffect(1 + min(abs(dragX) / max(frontWidth, 1), 1) * 0.03, anchor: .bottom)
          front
            .background(
              RoundedRectangle(cornerRadius: DS.Radius.xl, style: .continuous).fill(DS.Color.background.swiftUI)
            )
            .onGeometryChange(for: CGSize.self) { $0.size } action: {
              frontHeight = $0.height
              frontWidth = $0.width
            }
            .scaleEffect(entering ? 0.94 : 1, anchor: .bottom)
            .offset(x: dragX, y: entering ? Self.minPeek : 0)
            .rotationEffect(.degrees(Double(dragX / max(frontWidth, 1)) * 6), anchor: .bottom)
            .opacity(entering ? 0.6 : 1)
        }
      }
    // `DragGesture` bị thanh cuộn dọc của Today nuốt mất — bộ nhận của UIKit chỉ bắt đầu
    // khi vuốt NGANG, nên cuộn dọc và các nút trong thẻ vẫn như cũ.
    .gesture(
      HorizontalSwipe(
        onChanged: { dx in if !reduceMotion { dragX = dx } },
        onEnded: { dx, vx in
          if abs(dx) > 60 || abs(vx) > 500 { swap(direction: dx < 0 ? -1 : 1) } else { settle() }
        }))
    .sensoryFeedback(.selection, trigger: showsLoad)
    // Rời màn giữa lúc kéo / bay: lần sau quay lại thẻ nằm đúng chỗ.
    .onDisappear {
      dragX = 0
      entering = false
    }
    .accessibilityAction(named: Text(showsLoad ? "ov.a11y.back" : "ov.a11y.show")) { swap() }
  }

  /// Kéo chưa đủ xa: thẻ bật về chỗ.
  private func settle() {
    withAnimation(reduceMotion ? nil : .spring(response: 0.35, dampingFraction: 0.7)) { dragX = 0 }
  }

  /// Đổi thẻ như chồng bài: thẻ trên bay ra theo chiều vuốt, thẻ sau tiến lên phía trước
  /// (từ vị trí thấp, nhỏ của nó). Giảm chuyển động: chỉ mờ chéo.
  private func swap(direction: CGFloat = -1) {
    guard !reduceMotion else {
      dragX = 0
      withAnimation(.easeInOut(duration: 0.2)) { showsLoad.toggle() }
      return
    }
    withAnimation(.easeIn(duration: 0.18)) {
      dragX = direction * (frontWidth + 40)
    } completion: {
      var t = Transaction()
      t.disablesAnimations = true
      withTransaction(t) {
        showsLoad.toggle()
        dragX = 0
        entering = true
      }
      withAnimation(reduceMotion ? nil : .spring(response: 0.42, dampingFraction: 0.78)) { entering = false }
    }
  }

  /// Hai thẻ CÙNG một khung (Kiệt 28/10: "thẻ phải cùng kích thước và không làm thay
  /// đổi kích thước ban đầu"): việc chính luôn được dựng để giữ chiều cao, thẻ tăng tải
  /// phủ đúng khung ấy và cuộn bên trong khi nhiều bài.
  private var front: some View {
    hero(false)
      .opacity(showsLoad ? 0 : 1)
      .allowsHitTesting(!showsLoad)
      .accessibilityHidden(showsLoad)
      .overlay {
        if showsLoad { TodayOverloadCard(items: items, onOpen: onOpenLoad) }
      }
  }

  /// Thẻ phía sau: chỉ dải dưới cùng lộ ra.
  private var back: some View {
    VStack(spacing: 0) {
      Color.clear.frame(height: frontHeight)
      Group {
        if showsLoad { mainStrip } else { loadStrip }
      }
      .transition(.opacity)
      .frame(minHeight: Self.minPeek, maxHeight: .infinity)
    }
    .padding(.horizontal, DS.Spacing.md)
    .frame(maxWidth: .infinity)
    .todayCard()
  }

  private var mainStrip: some View {
    Button(action: onMainAction) {
      stripLayout {
        Text(verbatim: mainPeek)
          .font(DS.TextStyle.footnote.weight(.semibold))
          .foregroundStyle(DS.Color.foreground.swiftUI)
          .lineLimit(typeSize.isAccessibilitySize ? nil : 1)
        if !typeSize.isAccessibilitySize { Spacer(minLength: 4) }
        Text(verbatim: "\(mainAction) ›")
          .font(DS.TextStyle.footnote.weight(.semibold))
          .foregroundStyle(DS.Color.primary.swiftUI)
          .lineLimit(typeSize.isAccessibilitySize ? nil : 1)
      }
      .frame(maxHeight: .infinity)
      .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
  }

  private var loadStrip: some View {
    Button { swap() } label: {
      stripLayout {
        if let top = ups.first {
          Text(verbatim: "↑ \(top.name) \(TodayOverloadCard.target(top.advice, unit: unit, locale: locale) ?? "")")
            .font(DS.TextStyle.footnote.weight(.semibold))
            .foregroundStyle(DS.Color.readinessGreen.swiftUI)
            .lineLimit(typeSize.isAccessibilitySize ? nil : 1)
        } else {
          Text("ov.eyebrow")
            .font(DS.TextStyle.footnote.weight(.semibold))
            .foregroundStyle(DS.Color.foreground.swiftUI)
        }
        if !typeSize.isAccessibilitySize { Spacer(minLength: 4) }
        Text(verbatim: "\(ups.count > 1 ? String(localized: "ov.peek.more \(ups.count - 1)") : String(localized: "ov.peek.open")) ›")
          .font(DS.TextStyle.footnote)
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)
          .lineLimit(typeSize.isAccessibilitySize ? nil : 1)
      }
      .frame(maxHeight: .infinity)
      .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
  }

  private var ups: [OverloadPlan.Item] { items.filter(\.advice.isUp) }

  /// Dải: ngang; chữ trợ năng thì dọc (chữ ở trên, nút ở dưới).
  @ViewBuilder private func stripLayout<C: View>(@ViewBuilder _ content: () -> C) -> some View {
    if typeSize.isAccessibilitySize {
      VStack(alignment: .leading, spacing: 4) { content() }
    } else {
      HStack(spacing: DS.Spacing.sm) { content() }
    }
  }
}

/// Vuốt ngang (≥ 50 pt, ngang hơn dọc): chỉ nhận khi bắt đầu theo chiều ngang.
private struct HorizontalSwipe: UIGestureRecognizerRepresentable {
  /// Độ dời ngang trong lúc kéo.
  let onChanged: (CGFloat) -> Void
  /// Độ dời và vận tốc ngang lúc thả (huỷ / hỏng: 0, 0).
  let onEnded: (CGFloat, CGFloat) -> Void

  func makeCoordinator(converter: CoordinateSpaceConverter) -> Coordinator { Coordinator() }

  func makeUIGestureRecognizer(context: Context) -> UIPanGestureRecognizer {
    let pan = UIPanGestureRecognizer()
    pan.delegate = context.coordinator
    return pan
  }

  func handleUIGestureRecognizerAction(_ pan: UIPanGestureRecognizer, context: Context) {
    let t = pan.translation(in: pan.view)
    switch pan.state {
    case .changed: onChanged(t.x)
    case .ended: onEnded(t.x, pan.velocity(in: pan.view).x)
    case .cancelled, .failed: onEnded(0, 0)
    default: break
    }
  }

  final class Coordinator: NSObject, UIGestureRecognizerDelegate {
    func gestureRecognizerShouldBegin(_ g: UIGestureRecognizer) -> Bool {
      guard let pan = g as? UIPanGestureRecognizer else { return false }
      let v = pan.velocity(in: pan.view)
      return abs(v.x) >= abs(v.y)
    }

    func gestureRecognizer(
      _ g: UIGestureRecognizer, shouldRecognizeSimultaneouslyWith other: UIGestureRecognizer
    ) -> Bool { true }
  }
}

/// Thẻ "Tăng tải hôm nay": mỗi bài của buổi một dòng — lần trước → hôm nay, và nhãn.
struct TodayOverloadCard: View {
  let items: [OverloadPlan.Item]
  /// Mở trang Tiến bộ từng bài (Kiệt 01/11: chạm thẻ là vào thẳng).
  var onOpen: (() -> Void)? = nil

  @Environment(\.weightUnit) private var unit
  @Environment(\.locale) private var locale

  var body: some View {
    VStack(alignment: .leading, spacing: DS.Spacing.sm) {
      HStack(alignment: .firstTextBaseline) {
        Text("ov.eyebrow")
          .font(.system(size: 11, weight: .semibold))
          .tracking(1.2)
          .textCase(.uppercase)
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)
          .accessibilityAddTraits(.isHeader)
        Spacer(minLength: 4)
        Text("ov.vsLast")
          .font(DS.TextStyle.caption)
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)
        if onOpen != nil {
          Image(systemName: "chevron.right")
            .font(.system(size: 12, weight: .semibold))
            .foregroundStyle(DS.Color.mutedForeground.swiftUI.opacity(0.7))
            .accessibilityHidden(true)
        }
      }
      ScrollView {
        VStack(spacing: 0) {
          ForEach(items) { item in
            row(item)
            if item.id != items.last?.id { Divider().opacity(0.5) }
          }
        }
      }
      .scrollBounceBehavior(.basedOnSize)
      .scrollIndicators(.hidden)
    }
    .padding(DS.Spacing.card)
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    .todayCard()
    .contentShape(Rectangle())
    .onTapGesture { onOpen?() }
    .accessibilityElement(children: .contain)
    .accessibilityAction(named: Text("workoutshome.insight")) { onOpen?() }
  }

  private func row(_ item: OverloadPlan.Item) -> some View {
    HStack(spacing: DS.Spacing.sm) {
      VStack(alignment: .leading, spacing: 2) {
        Text(verbatim: item.name)
          .font(DS.TextStyle.body)
          .foregroundStyle(DS.Color.foreground.swiftUI)
          .lineLimit(2)
        Text(verbatim: line(item.advice))
          .font(DS.TextStyle.footnote.monospacedDigit())
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)
          .fixedSize(horizontal: false, vertical: true)
      }
      Spacer(minLength: DS.Spacing.sm)
      badge(item.advice)
    }
    .padding(.vertical, 8)
    .frame(minHeight: 44)
    .accessibilityElement(children: .combine)
  }

  private func badge(_ a: OverloadPlan.Advice) -> some View {
    let (text, tint): (String, Color) =
      switch a {
      case .addWeight(let from, let to, _):
        ("↑ +\(Self.load(to - from, unit: unit, locale: locale))", DS.Color.readinessGreen.swiftUI)
      case .addRep: ("↑ \(String(localized: "ov.badge.rep"))", DS.Color.readinessGreen.swiftUI)
      case .hold: (String(localized: "ov.badge.hold"), DS.Color.readinessYellow.swiftUI)
      case .notEnough: (String(localized: "ov.badge.notEnough"), DS.Color.mutedForeground.swiftUI)
      }
    return Text(verbatim: text)
      .font(DS.TextStyle.caption.weight(.semibold))
      .foregroundStyle(tint)
      .padding(.horizontal, 8)
      .padding(.vertical, 4)
      .background(tint.opacity(0.14), in: Capsule())
      .fixedSize()
  }

  private func line(_ a: OverloadPlan.Advice) -> String {
    let set = { (w: Double?, r: Int) in Self.set(w, r, unit: unit, locale: locale) }
    switch a {
    case .addWeight(let from, let to, let reps):
      return "\(set(from, reps)) → \(set(to, reps))"
    case .addRep(let w, let from, let to):
      return "\(set(w, from)) → \(set(w, to))"
    case .hold(let w, let reps):
      guard let reps else { return String(localized: "ov.badge.hold") }
      return String(localized: "ov.line.hold \(set(w, reps))")
    case .notEnough(let n):
      return n == 0 ? String(localized: "ov.line.none") : String(localized: "ov.line.sessions \(n)")
    }
  }

  /// Mức của hôm nay — chữ của dải phía sau.
  static func target(_ a: OverloadPlan.Advice, unit: WeightUnit, locale: Locale) -> String? {
    switch a {
    case .addWeight(_, let to, let reps): set(to, reps, unit: unit, locale: locale)
    case .addRep(let w, _, let to): set(w, to, unit: unit, locale: locale)
    case .hold, .notEnough: nil
    }
  }

  /// "62,5 kg × 8"; không tạ → "10 reps".
  static func set(_ kg: Double?, _ reps: Int, unit: WeightUnit, locale: Locale) -> String {
    guard let kg, let load = unit.localizedLoad(kg, locale: locale) else {
      return reps == 1 ? String(localized: "xi.reps.one") : String(localized: "xi.reps.other \(reps)")
    }
    return "\(load) × \(reps)"
  }

  static func load(_ kg: Double, unit: WeightUnit, locale: Locale) -> String {
    unit.localizedLoad(kg, locale: locale) ?? unit.load(kg)
  }
}
