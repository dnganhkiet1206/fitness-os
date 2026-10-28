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
  @ViewBuilder var hero: () -> Hero

  @State private var showsLoad = false
  @State private var frontHeight: CGFloat = 0
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  @Environment(\.weightUnit) private var unit
  @Environment(\.locale) private var locale

  static var peek: CGFloat { 54 }

  var body: some View {
    ZStack(alignment: .top) {
      back
        .frame(height: frontHeight + Self.peek)
        .padding(.horizontal, DS.Spacing.sm)
      front
        .background(
          RoundedRectangle(cornerRadius: DS.Radius.xl, style: .continuous).fill(DS.Color.background.swiftUI)
        )
        .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { frontHeight = $0 }
    }
    // `DragGesture` bị thanh cuộn dọc của Today nuốt mất — bộ nhận của UIKit chỉ bắt đầu
    // khi vuốt NGANG, nên cuộn dọc và các nút trong thẻ vẫn như cũ.
    .gesture(HorizontalSwipe { swap() })
    .sensoryFeedback(.selection, trigger: showsLoad)
    .accessibilityAction(named: Text(showsLoad ? "ov.a11y.back" : "ov.a11y.show")) { swap() }
  }

  private func swap() {
    withAnimation(reduceMotion ? .easeInOut(duration: 0.2) : .spring(response: 0.38, dampingFraction: 0.86)) {
      showsLoad.toggle()
    }
  }

  /// Hai thẻ CÙNG một khung (Kiệt 28/10: "thẻ phải cùng kích thước và không làm thay
  /// đổi kích thước ban đầu"): việc chính luôn được dựng để giữ chiều cao, thẻ tăng tải
  /// phủ đúng khung ấy và cuộn bên trong khi nhiều bài.
  private var front: some View {
    hero()
      .opacity(showsLoad ? 0 : 1)
      .allowsHitTesting(!showsLoad)
      .accessibilityHidden(showsLoad)
      .overlay {
        if showsLoad {
          TodayOverloadCard(items: items)
            .transition(.opacity.combined(with: .scale(scale: 0.98)))
        }
      }
  }

  /// Thẻ phía sau: chỉ dải dưới cùng lộ ra.
  private var back: some View {
    VStack(spacing: 0) {
      Spacer(minLength: 0)
      Group {
        if showsLoad { mainStrip } else { loadStrip }
      }
      .frame(height: Self.peek - 6)
    }
    .padding(.horizontal, DS.Spacing.md)
    .frame(maxWidth: .infinity)
    .todayCard()
  }

  private var mainStrip: some View {
    Button(action: onMainAction) {
      HStack(spacing: DS.Spacing.sm) {
        Text(verbatim: mainPeek)
          .font(DS.TextStyle.footnote.weight(.semibold))
          .foregroundStyle(DS.Color.foreground.swiftUI)
          .lineLimit(1)
        Spacer(minLength: 4)
        Text(verbatim: "\(mainAction) ›")
          .font(DS.TextStyle.footnote.weight(.semibold))
          .foregroundStyle(DS.Color.primary.swiftUI)
          .lineLimit(1)
      }
      .frame(maxHeight: .infinity)
      .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
  }

  private var loadStrip: some View {
    Button(action: swap) {
      HStack(spacing: DS.Spacing.sm) {
        if let top = ups.first {
          Text(verbatim: "↑ \(top.name) \(TodayOverloadCard.target(top.advice, unit: unit, locale: locale) ?? "")")
            .font(DS.TextStyle.footnote.weight(.semibold))
            .foregroundStyle(DS.Color.readinessGreen.swiftUI)
            .lineLimit(1)
        } else {
          Text("ov.eyebrow")
            .font(DS.TextStyle.footnote.weight(.semibold))
            .foregroundStyle(DS.Color.foreground.swiftUI)
        }
        Spacer(minLength: 4)
        Text(verbatim: "\(ups.count > 1 ? String(localized: "ov.peek.more \(ups.count - 1)") : String(localized: "ov.peek.open")) ›")
          .font(DS.TextStyle.footnote)
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)
          .lineLimit(1)
      }
      .frame(maxHeight: .infinity)
      .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
  }

  private var ups: [OverloadPlan.Item] { items.filter(\.advice.isUp) }
}

/// Vuốt ngang (≥ 50 pt, ngang hơn dọc): chỉ nhận khi bắt đầu theo chiều ngang.
private struct HorizontalSwipe: UIGestureRecognizerRepresentable {
  let onSwipe: () -> Void

  func makeCoordinator(converter: CoordinateSpaceConverter) -> Coordinator { Coordinator() }

  func makeUIGestureRecognizer(context: Context) -> UIPanGestureRecognizer {
    let pan = UIPanGestureRecognizer()
    pan.delegate = context.coordinator
    return pan
  }

  func handleUIGestureRecognizerAction(_ pan: UIPanGestureRecognizer, context: Context) {
    guard pan.state == .ended else { return }
    let t = pan.translation(in: pan.view)
    if abs(t.x) > 50, abs(t.x) > abs(t.y) * 1.5 { onSwipe() }
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
    .accessibilityElement(children: .contain)
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
