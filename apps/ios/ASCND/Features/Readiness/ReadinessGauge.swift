import ASCNDCore
import ASCNDDesignSystem
import SwiftUI

/// Vòng điểm sẵn sàng dùng chung cho Hôm nay và Trợ lý (15/10, audit toàn app):
/// cùng thang 0–100, cùng màu theo `AssistantSummary.Readiness`. `nil` → "—".
struct ReadinessGauge: View {
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  let shown: AssistantSummary.Shown?
  var size: CGFloat = 64

  var body: some View {
    let tint = AssistantText.tint(shown?.level)
    let line = max(4, size / 9)
    ZStack {
      Circle().stroke(DS.Color.foreground.swiftUI.opacity(0.08), lineWidth: line)
      Circle()
        .trim(from: 0, to: CGFloat(shown?.score ?? 0) / 100)
        .stroke(tint, style: StrokeStyle(lineWidth: line, lineCap: .round))
        .rotationEffect(.degrees(-90))
        .animation(DSMotion.animation(.smooth(duration: 0.5), reduceMotion: reduceMotion), value: shown?.score)
      Text(verbatim: shown.map { "\($0.score)" } ?? "—")
        .font(.system(size: size * 0.32, weight: .bold).monospacedDigit())
        .foregroundStyle(DS.Color.foreground.swiftUI)
        .contentTransition(.numericText(value: Double(shown?.score ?? 0)))
    }
    .frame(width: size, height: size)
    .accessibilityHidden(true)
  }

  /// Dòng phụ cho điểm không phải của hôm nay: "Điểm gần nhất · hôm qua".
  static func staleNote(_ shown: AssistantSummary.Shown?) -> String? {
    shown?.asOf.map { String(localized: "assistant.latest \(SummaryCard.dayText($0))") }
  }
}
