import ASCNDCore
import ASCNDDesignSystem
import SwiftUI

/// Koa ló lên ở mọi tab (#527, đợt 2A — chiến lược Kiệt duyệt 19/10). Ghi bữa ở
/// Dinh dưỡng, xong buổi ở Tập luyện, uống nước từ Ghi nhanh… → khi xu của việc
/// ấy tự về (`AppServices.koaReward`), Koa trồi lên ở mép dưới của tab đang mở với
/// nét mặt hợp việc, một câu ngắn và "+N" xu, rồi tự lặn.
///
/// - Chỉ việc app THẤY vừa xong (`seen`) — không diễn lại việc đã xong lúc app đóng.
/// - Không ở tab Hôm nay: Koa ở đó đã mừng tại chỗ (`TodayDayBlock`).
/// - Hạn mức `KoaPeek` (nghỉ 90 giây, tối đa 4 lần/ngày; xong hết luôn hiện).
/// - Tắt được trong Cài đặt ("Koa ló lên", `mascotCompanion`, mặc định bật).
struct KoaPeekHost: View {
  let tab: AppTab

  @Environment(AppServices.self) private var services
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  @State private var showing: AppServices.KoaReward?

  static let holdFor: Duration = .milliseconds(3200)

  var body: some View {
    ZStack(alignment: .bottomLeading) {
      if let showing {
        card(showing)
          .transition(reduceMotion ? .opacity : .move(edge: .bottom).combined(with: .opacity))
          .id(showing.id)
      }
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottomLeading)
    // Trên thanh tab + dải Ghi nhanh.
    .padding(.horizontal, DS.Spacing.md)
    .padding(.bottom, 132)
    .allowsHitTesting(showing != nil)
    .onChange(of: services.koaReward?.id) { _, _ in present() }
    .sensoryFeedback(.success, trigger: showing?.id)
  }

  private func card(_ r: AppServices.KoaReward) -> some View {
    HStack(alignment: .bottom, spacing: DS.Spacing.sm) {
      MascotFigureView(
        mascotId: services.preferences.mascotSelected, emotion: KoaPeek.emotion(r.quest, allDone: r.allDone),
        equipped: services.koaEquipped, size: 64, animated: !reduceMotion
      )
      .frame(width: 70, height: 72, alignment: .bottom)
      .offset(y: 10)
      VStack(alignment: .leading, spacing: 4) {
        Text(verbatim: Self.line(r))
          .font(.system(size: 15, weight: .semibold))
          .foregroundStyle(DS.Color.foreground.swiftUI)
          .fixedSize(horizontal: false, vertical: true)
        HStack(spacing: 3) {
          Image(systemName: "circle.circle.fill").font(.system(size: 11, weight: .bold))
          Text(verbatim: "+\(r.amount)").font(.system(size: 13, weight: .heavy).monospacedDigit())
        }
        .foregroundStyle(DS.Color.readinessYellow.swiftUI)
      }
      .padding(.bottom, 10)
      Spacer(minLength: 0)
    }
    .padding(.leading, 6)
    .padding(.trailing, DS.Spacing.md)
    .padding(.top, 8)
    .frame(maxWidth: 360, minHeight: 72, alignment: .leading)
    // Nền đặc, không kính: thẻ nổi trên nội dung đang cuộn — kính để chữ phía sau
    // nhoè xuyên qua, khó đọc (soát trên simulator 19/10).
    .background(DS.Color.card.swiftUI, in: RoundedRectangle(cornerRadius: 24, style: .continuous))
    .clipShape(RoundedRectangle(cornerRadius: 24, style: .continuous))
    .overlay {
      RoundedRectangle(cornerRadius: 24, style: .continuous)
        .strokeBorder(DS.Color.foreground.swiftUI.opacity(0.08), lineWidth: 0.75)
    }
    .shadow(color: .black.opacity(0.12), radius: 16, y: 6)
    .contentShape(Rectangle())
    .onTapGesture { dismiss(r) }
    .accessibilityElement(children: .combine)
    .accessibilityAddTraits(.isButton)
    .accessibilityHint(Text(String(localized: "koa.peek.dismiss")))
  }

  private func present() {
    guard let r = services.koaReward, r.seen, tab != .today, services.preferences.mascotCompanion,
      services.session.session?.userId == r.userId
    else { return }
    let now = SystemWallClock().nowMillis()
    let day = LocalDate(now, in: .current)
    let key = "ascnd-koa-peek.\(r.userId)"
    let ledger = (UserDefaults.standard.data(forKey: key)).flatMap { try? JSONDecoder().decode(KoaPeek.Ledger.self, from: $0) }
    let nowMs = Double(now.millis)
    guard KoaPeek.allow(ledger, nowMs: nowMs, day: day, allDone: r.allDone) else { return }
    if let data = try? JSONEncoder().encode(KoaPeek.record(ledger, nowMs: nowMs, day: day)) {
      UserDefaults.standard.set(data, forKey: key)
    }
    AccessibilityNotification.Announcement("\(Self.line(r)) · \(String(localized: "koa.say.coins \(r.amount)"))").post()
    withAnimation(reduceMotion ? .easeInOut(duration: 0.2) : .spring(duration: 0.5, bounce: 0.3)) { showing = r }
    Task {
      try? await Task.sleep(for: Self.holdFor)
      dismiss(r)
    }
  }

  private func dismiss(_ r: AppServices.KoaReward) {
    guard showing == r else { return }
    withAnimation(reduceMotion ? .easeInOut(duration: 0.2) : .easeIn(duration: 0.3)) { showing = nil }
  }

  /// Câu của Koa cho việc vừa xong.
  static func line(_ r: AppServices.KoaReward) -> String {
    if r.allDone { return String(localized: "koa.peek.allDone") }
    switch r.quest {
    case .meal: return String(localized: "koa.peek.meal")
    case .workout: return String(localized: "koa.peek.workout")
    case .water: return String(localized: "koa.peek.water")
    case .sleep: return String(localized: "koa.peek.sleep")
    case .steps: return String(localized: "koa.peek.steps")
    case nil: return String(localized: "koa.peek.streak")
    }
  }
}
