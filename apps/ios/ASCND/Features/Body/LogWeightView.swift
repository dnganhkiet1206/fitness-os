import ASCNDCore
import ASCNDDesignSystem
import SwiftUI

/// Màn ghi cân nặng (#527 Phase 4) — `app/log-weight.tsx` trên `WeightLogger`.
///
/// Như RN:
/// - thước 0,1 theo đơn vị của tài khoản (kg / lb), thang 20–400 kg đổi sang
///   đơn vị ấy (`OnboardingRuler.scale(.weight)` — cùng thang onboarding);
/// - hạt giống: cân hôm nay ?? hồ sơ ?? 70;
/// - số to một chữ số lẻ + đơn vị; "Kéo để điều chỉnh"; ngoài dải thì nói và
///   khoá nút;
/// - có mạng: lưu rồi đóng; mất mạng: xếp hàng, nói "đã lưu — sẽ đồng bộ",
///   đóng; lỗi: báo, ở lại màn.
///
/// Khác RN: không vẽ hình chiếc cân (`BodyScaleFigure`) và hai nhãn mép cửa sổ
/// thước — chỉ là trang trí, số đang chọn hiện ở số to. Chưa ghi ngược Apple
/// Health (RN có; #527 guardrail).
struct LogWeightView: View {
  /// Mỗi lần mở màn một sổ mới — như mỗi lần RN mở màn một `useMutation` mới
  /// (sau khi xếp hàng, nút chết tới khi màn đóng).
  let makeLogger: () -> WeightLogger?
  var onDone: () -> Void = {}

  @Environment(AppServices.self) private var services
  @Environment(ProfileBook.self) private var profile: ProfileBook?
  @Environment(\.weightUnit) private var unit
  @Environment(\.dismiss) private var dismiss
  @State private var logger: WeightLogger?
  @State private var index: Int?
  @State private var message: String?

  private var scale: OnboardingRuler.Scale { OnboardingRuler.scale(.weight, unit: unit.rawValue) }

  /// Vạch hạt giống: `round(displayWeight(seedKg) × 10) − min10`, kẹp vào thang.
  private var seedIndex: Int {
    let kg = WeightLog.seedKg(today: logger?.todayKg, profile: profile?.profile?.weightKg)
    return scale.seed(Units.text(kg))
  }

  private var shown: Int { index ?? seedIndex }
  private var value: Double { scale.value(at: shown) }
  private var kg: Double { Units.weightToKg(value, unit: unit.rawValue) }
  private var outOfRange: Bool { !WeightLog.plausible(kg) }

  var body: some View {
    NavigationStack {
      VStack(spacing: DS.Spacing.lg) {
        VStack(spacing: DS.Spacing.xs) {
          Text(String(localized: "weight.title"))
            .font(DS.TextStyle.largeTitle)
            .multilineTextAlignment(.center)
            .accessibilityAddTraits(.isHeader)
          Text(String(localized: "weight.sub"))
            .font(DS.TextStyle.body)
            .foregroundStyle(DS.Color.mutedForeground.swiftUI)
            .multilineTextAlignment(.center)
        }
        Spacer(minLength: DS.Spacing.md)
        HStack(alignment: .firstTextBaseline, spacing: DS.Spacing.xs) {
          Text(verbatim: OnboardingRuler.fixed1(value))
            .font(DS.TextStyle.hero)
            .monospacedDigit()
          Text(verbatim: unit.label)
            .font(DS.TextStyle.headline)
            .foregroundStyle(DS.Color.mutedForeground.swiftUI)
        }
        .accessibilityHidden(true)
        Spacer(minLength: DS.Spacing.md)
        if logger?.loaded == true {
          RulerStrip(
            scale: scale, seed: seedIndex, haptics: true, label: String(localized: "weight.title"),
            readout: "\(OnboardingRuler.fixed1(value)) \(unit.label)"
          ) { i in index = i }
          .id(seedIndex)
          .padding(.horizontal, -DS.Spacing.lg)
        } else {
          ProgressView().frame(height: RulerStrip.height)
        }
        Text(String(localized: "weight.hint"))
          .font(DS.TextStyle.caption)
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)
          .accessibilityHidden(true)
        Spacer(minLength: DS.Spacing.md)
        if outOfRange {
          let b = WeightLog.boundsText(unit)
          Text(String(localized: "weight.outOfRange \(b.min) \(b.max) \(unit.label)"))
            .font(DS.TextStyle.footnote)
            .foregroundStyle(DS.Color.destructive.swiftUI)
        }
        if let message {
          Text(verbatim: message)
            .font(DS.TextStyle.footnote)
            .foregroundStyle(DS.Color.destructive.swiftUI)
        }
        DSButton(String(localized: "weight.save")) { Task { await save() } }
          .disabled(logger == nil || logger?.pending == true || outOfRange)
          .opacity(logger == nil || logger?.pending == true || outOfRange ? 0.5 : 1)
      }
      .padding(DS.Spacing.lg)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button(String(localized: "common.cancel")) { dismiss() }
        }
      }
    }
    .task {
      guard logger == nil else { return }
      let l = makeLogger()
      logger = l
      await l?.load()
    }
    .onDisappear { logger?.close() }
  }

  private func save() async {
    guard let logger else { return }
    message = nil
    switch await logger.submit(kg: kg, online: services.sync.online) {
    case .saved:
      // Hồ sơ đã theo lần cân này (`invalidateQueries(['profile'])`).
      await profile?.refresh()
      onDone()
      dismiss()
    case .queued:
      AccessibilityNotification.Announcement(String(localized: "weight.queued")).post()
      onDone()
      dismiss()
    case .outOfRange, .unavailable:
      break
    case .offline:
      show(String(localized: "async.offline"))
    case .failed:
      show(String(localized: "async.error.generic"))
    }
  }

  private func show(_ text: String) {
    message = text
    AccessibilityNotification.Announcement(text).post()
  }
}
