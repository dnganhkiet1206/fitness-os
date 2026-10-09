import ASCNDCore
import ASCNDDesignSystem
import SwiftUI

/// Ăn mừng (#527) — `CelebrationHost` + `AwardCelebrationModal` của
/// `award-celebration.tsx` @ fac9ac2 trên `CelebrationQueue`.
///
/// Như RN: MỘT cái mỗi lần, cái kế lên khi cái này đóng; nền tối, pháo giấy
/// rơi, thẻ có CÙNG tấm đĩa của màn huy chương (dáng theo miền, mốc trên mặt;
/// thử thách không có trong danh mục → đĩa tròn mang icon), dòng "Huy chương
/// mới!", tên, mô tả, nhãn hạng; tự đóng sau 4 giây; chạm bất kỳ đâu hay nút
/// X (có nhãn) để đóng; rung "thành công" khi hiện.
///
/// Khác RN: Reduce Motion → không pháo giấy, đĩa không xoay-nảy, chỉ hiện
/// lên; VoiceOver đọc tên khi hiện (RN im); dòng "Huy chương mới!" và nhãn
/// hạng theo ngôn ngữ app (RN: chỉ "Huy Chương Mới!" cho vi, còn lại tiếng
/// Anh; nhãn hạng luôn tiếng Anh); Koa chưa "ăn mừng" theo.
struct CelebrationHost: View {
  let queue: CelebrationQueue

  var body: some View {
    if let head = queue.head {
      CelebrationCard(item: head) { queue.dequeue() }
        .id(head.id)
        .transition(.opacity)
    }
  }
}

private struct CelebrationCard: View {
  let item: CelebrationQueue.Item
  let onClose: () -> Void

  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  @Environment(\.colorScheme) private var scheme
  @State private var shown = false
  @State private var popped = false
  /// Lúc pháo giấy bắt đầu rơi; `nil` khi chưa (hoặc không, Reduce Motion).
  @State private var fallStart: Date?
  @State private var fallDone = false
  @State private var closing = false
  @State private var pieces = ConfettiPiece.make()

  var body: some View {
    let def = item.awardKey.flatMap(Awards.def)
    ZStack {
      Color(red: 4 / 255, green: 4 / 255, blue: 6 / 255).opacity(0.75)
        .ignoresSafeArea()
        .contentShape(Rectangle())
        .onTapGesture(perform: dismiss)
        // Nút đóng có nhãn đã làm việc này; một vùng chạm không tên phủ cả màn
        // chỉ là chỗ VoiceOver vấp vào (#120).
        .accessibilityHidden(true)
      if !reduceMotion, let fallStart {
        // `withTiming(1, { duration: 2600, easing: Easing.out(Easing.quad) })`,
        // đọc theo đồng hồ khung hình; dừng khi rơi xong.
        TimelineView(.animation(minimumInterval: nil, paused: fallDone)) { tl in
          let x = Swift.min(Swift.max(tl.date.timeIntervalSince(fallStart) / 2.6, 0), 1)
          let progress = 1 - (1 - x) * (1 - x)
          GeometryReader { geo in
            ForEach(pieces.indices, id: \.self) { i in
              pieces[i].view(in: geo.size, progress: progress)
            }
          }
        }
        .ignoresSafeArea()
        .allowsHitTesting(false)
        .accessibilityHidden(true)
      }
      card(def: def)
        .opacity(shown ? 1 : 0)
        .offset(y: shown ? 0 : 32)
        .scaleEffect(shown ? 1 : 0.9)
        .padding(DS.Spacing.xl)
    }
    .sensoryFeedback(.success, trigger: shown) { _, now in now }
    .task {
      guard !reduceMotion else { return }
      try? await Task.sleep(for: .seconds(2.8))
      fallDone = true
    }
    .task {
      if reduceMotion {
        shown = true
        popped = true
      } else {
        withAnimation(reduceMotion ? nil : .easeOut(duration: 0.26)) { shown = true }
        withAnimation(reduceMotion ? nil : .spring(response: 0.42, dampingFraction: 0.47).delay(0.14)) { popped = true }
        fallStart = Date.now.addingTimeInterval(0.12)
      }
      let spoken: String = "\(String(localized: "ce.kicker")) \(item.title)"
      AccessibilityNotification.Announcement(spoken).post()
      // RN tự đóng sau 4 giây (web cũng vậy).
      try? await Task.sleep(for: .seconds(4))
      if !Task.isCancelled { dismiss() }
    }
  }

  private func card(def: Awards.Def?) -> some View {
    VStack(spacing: DS.Spacing.xs) {
      MedalDisc(
        type: def?.type ?? "body", tier: item.tier, icon: def?.icon ?? item.icon,
        requirement: def?.requirement, earned: true
      )
      .frame(width: 88, height: 88)
      .scaleEffect(popped ? 1 : 0.01)
      .rotationEffect(.degrees(popped ? 0 : -180))
      .padding(.bottom, DS.Spacing.sm)
      .accessibilityHidden(true)
      Text(String(localized: "ce.kicker"))
        .font(.system(size: 11, weight: .bold))
        .textCase(.uppercase)
        .tracking(2.5)
        .foregroundStyle(DS.Color.mutedForeground.swiftUI)
      Text(item.title)
        .font(DS.TextStyle.title.weight(.heavy))
        .foregroundStyle(DS.Color.foreground.swiftUI)
        .multilineTextAlignment(.center)
      Text(item.description)
        .font(DS.TextStyle.footnote)
        .foregroundStyle(DS.Color.mutedForeground.swiftUI)
        .multilineTextAlignment(.center)
      Text(Self.tierLabel(item.tier))
        .font(.system(size: 11, weight: .heavy))
        .textCase(.uppercase)
        .tracking(2)
        .foregroundStyle(scheme == .dark ? Color(hex: "#1a1917") : .white)
        .padding(.horizontal, DS.Spacing.md)
        .padding(.vertical, 5)
        .background(MedalDisc.onSurface(item.tier, dark: scheme == .dark), in: Capsule())
        .padding(.top, DS.Spacing.sm)
    }
    .frame(maxWidth: .infinity)
    .padding(.vertical, DS.Spacing.xl)
    .padding(.horizontal, DS.Spacing.lg)
    .background(DS.Color.card.swiftUI, in: RoundedRectangle(cornerRadius: DS.Radius.xl))
    .overlay(RoundedRectangle(cornerRadius: DS.Radius.xl).stroke(DS.Color.border.swiftUI, lineWidth: 0.5))
    .shadow(color: MedalDisc.metal(item.tier).0.opacity(0.45), radius: 40)
    .overlay(alignment: .topTrailing) {
      Button(action: dismiss) {
        Image(systemName: "xmark")
          .font(.system(size: 14, weight: .semibold))
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)
          .frame(width: 44, height: 44)
          .contentShape(Rectangle())
      }
      .accessibilityLabel(Text(String(localized: "ce.dismiss.a11y")))
      .padding(DS.Spacing.xs)
    }
    .accessibilityElement(children: .contain)
    .accessibilityAddTraits(.isModal)
  }

  private func dismiss() {
    guard !closing else { return }
    closing = true
    onClose()
  }

  static func tierLabel(_ t: Awards.Tier) -> String {
    switch t {
    case .bronze: String(localized: "ce.tier.bronze")
    case .silver: String(localized: "ce.tier.silver")
    case .gold: String(localized: "ce.tier.gold")
    case .platinum: String(localized: "ce.tier.platinum")
    }
  }
}

/// Một mảnh pháo giấy (`makePieces`): 32 mảnh, rơi từ trên xuống 90% chiều
/// cao, trôi ngang, xoay; hiện dần ở 8% đầu và mờ đi ở 20% cuối.
private struct ConfettiPiece {
  static let colors = ["#f5c518", "#f28c33", "#10b981", "#a855f7", "#3b82f6", "#f43f5e", "#f7dc7a", "#38d4f5"]

  let x: Double
  let drift: Double
  let delay: Double
  let spin: Double
  let size: Double
  let color: String

  static func make() -> [ConfettiPiece] {
    (0..<32).map { _ in
      ConfettiPiece(
        x: .random(in: 0..<1), drift: (Double.random(in: 0..<1) - 0.5) * 140, delay: .random(in: 0..<0.35),
        spin: (Double.random(in: 0..<1) - 0.5) * 900, size: 6 + .random(in: 0..<6), color: colors.randomElement() ?? colors[0])
    }
  }

  @MainActor func view(in screen: CGSize, progress: Double) -> some View {
    let t = Swift.min(Swift.max((progress - delay) / (1 - delay), 0), 1)
    // interpolate(t, [0, 0.08, 0.8, 1], [0, 1, 1, 0])
    let opacity = t < 0.08 ? t / 0.08 : t > 0.8 ? (1 - t) / 0.2 : 1
    return RoundedRectangle(cornerRadius: 2)
      .fill(Color(hex: color))
      .frame(width: size, height: size * 1.7)
      .rotation3DEffect(.degrees(spin * 0.7 * t), axis: (x: 1, y: 0, z: 0))
      .rotationEffect(.degrees(spin * t))
      .position(x: x * screen.width + drift * t, y: -50 + t * screen.height * 0.9)
      .opacity(opacity)
  }
}
