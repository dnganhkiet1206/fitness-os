import ASCNDCore
import ASCNDDesignSystem
import SwiftUI

/// Một lần quay lại sau ≥ 3 ngày lỡ lịch (đợt 2).
struct KoaComeback: Identifiable, Equatable {
  /// Ngày tập cuối — mỗi đợt nghỉ hiện đúng một lần.
  let id: String
  let missedDays: Int
  /// Gains đang dưới mức cao nhất từng đạt → muscle memory ×2.
  let rebuilding: Bool
  let peakRank: Int
  let toRegain: Int
}

/// Màn quay lại của Koa (#527 đợt 2, Kiệt duyệt mock `koa-wave2-schedule.html`):
/// Koa mừng vì bạn quay lại, nói về muscle memory, một nút bắt đầu buổi tập.
/// Không trách, không đếm ngày lỡ. Buổi ngắn tự động (3 bài × 2 hiệp) chưa có —
/// thay bằng câu gợi ý: chốt buổi lúc nào cũng được.
struct KoaComebackView: View {
  let comeback: KoaComeback
  var planName: String?
  let onStart: () -> Void
  @Environment(AppServices.self) private var services: AppServices?
  @Environment(\.dismiss) private var dismiss

  var body: some View {
    let lang = services?.preferences.lang ?? .vi
    VStack(spacing: DS.Spacing.md) {
      MascotFigureView(emotion: .happy, size: 150, interactive: true, stage: true)
        .frame(height: 180)
        .accessibilityHidden(true)
      Text("koa.comeback.title")
        .font(.system(size: 24, weight: .heavy))
        .foregroundStyle(DS.Color.foreground.swiftUI)
        .multilineTextAlignment(.center)
      Text(verbatim: message(lang))
        .font(DS.TextStyle.body)
        .foregroundStyle(DS.Color.mutedForeground.swiftUI)
        .multilineTextAlignment(.center)
        .fixedSize(horizontal: false, vertical: true)
      Text("koa.comeback.short")
        .font(DS.TextStyle.footnote)
        .foregroundStyle(DS.Color.mutedForeground.swiftUI)
        .multilineTextAlignment(.center)
      DSButton(
        planName.map { String(localized: "koa.comeback.start \($0)") } ?? String(localized: "today.start"),
        style: .primary, action: onStart)
      Button(String(localized: "koa.comeback.later")) { dismiss() }
        .font(DS.TextStyle.footnote.weight(.semibold))
        .foregroundStyle(DS.Color.mutedForeground.swiftUI)
    }
    .padding(DS.Spacing.lg)
    .frame(maxWidth: .infinity)
  }

  private func message(_ lang: AppPreferences.Lang) -> String {
    guard comeback.rebuilding, comeback.toRegain > 0 else { return String(localized: "koa.comeback.body") }
    let rank = MascotRules.ranks[min(comeback.peakRank, MascotRules.ranks.count - 1)].name(lang)
    return String(localized: "koa.comeback.memory \(rank)")
  }
}
