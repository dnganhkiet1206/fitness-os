import ASCNDCore
import ASCNDDesignSystem
import SwiftUI

/// Dải "Lần trước" của một bài (#527 Phase 2) — `components/ascnd/
/// exercise-progress.tsx` @ fac9ac2. Dùng ở thẻ bài của màn tập (`day-plan.tsx:
/// 1876`) và hàng mở bài của màn ghi tay (`log-workout.tsx:836`); chạm để mở
/// "Tiến bộ từng bài" chỉ với bài ấy.
///
/// RN behavior (giữ nguyên):
/// - nguồn là phân tích 90 ngày: buổi GẦN NHẤT của bài và xu hướng của nó;
/// - chưa có buổi nào (hay buổi không có rep) thì KHÔNG hiện gì;
/// - icon xu hướng (màu readiness), "Lần trước 60 kg × 8 reps" (hai dòng, để
///   chữ lớn không cắt mất số lần), "+3%" khi khác 0, chevron;
/// - một HÀNG cao 44 điểm, không mặt nền — không phải thẻ trong thẻ;
/// - chưa có phân tích (không có khoá bài) thì không bấm được.
struct ExerciseProgressRow: View {
  let insights: InsightBook
  let today: TodayController
  let name: String

  @Environment(\.weightUnit) private var unit
  @Environment(\.locale) private var locale
  @State private var opening = false

  private var insight: ExerciseInsight? { insights.insight(for: name) }
  private var last: ExercisePerformance? { insights.history(for: name).last }

  private var text: String? {
    guard let last else { return nil }
    return InsightScreen.lastSetText(
      last,
      load: { unit.localizedLoad($0, locale: locale) ?? unit.load($0) },
      reps: { $0 == 1 ? String(localized: "xi.reps.one") : String(localized: "xi.reps.other \($0)") },
      bodyweight: String(localized: "xi.bodyweight").lowercased(with: locale))
  }

  private var trend: ExerciseTrend.Trend { insight?.trend ?? .insufficientData }

  private var tint: Color {
    switch trend {
    case .improving: DS.Color.readinessGreen.swiftUI
    case .declining: DS.Color.readinessRed.swiftUI
    case .plateau: DS.Color.readinessYellow.swiftUI
    case .stable, .insufficientData: DS.Color.mutedForeground.swiftUI
    }
  }

  private var icon: String {
    switch trend {
    case .improving: "arrow.up.right"
    case .declining: "arrow.down.right"
    case .plateau, .stable, .insufficientData: "minus"
    }
  }

  var body: some View {
    if let text {
      Button {
        opening = true
      } label: {
        HStack(spacing: 6) {
          Image(systemName: icon)
            .font(.caption)
            .foregroundStyle(tint)
            .accessibilityHidden(true)
          Text(String(localized: "xi.lastTime \(text)"))
            .font(DS.TextStyle.footnote.monospacedDigit())
            .foregroundStyle(DS.Color.foreground.swiftUI)
            .lineLimit(2)
            .multilineTextAlignment(.leading)
          if let pct = InsightScreen.stripPercent(insight) {
            Text(verbatim: "\(pct > 0 ? "+" : "")\(pct)%")
              .font(DS.TextStyle.footnote.weight(.bold).monospacedDigit())
              .foregroundStyle(tint)
          }
          Spacer(minLength: 0)
          if insight != nil {
            Image(systemName: "chevron.right")
              .font(.caption)
              .foregroundStyle(DS.Color.mutedForeground.swiftUI)
              .accessibilityHidden(true)
          }
        }
        .frame(minHeight: 44)
        .contentShape(Rectangle())
      }
      .buttonStyle(.plain)
      .disabled(insight == nil)
      .accessibilityLabel(Text(String(localized: "xi.open.a11y \(name)")))
      .accessibilityValue(Text(String(localized: "xi.lastTime \(text)")))
      .sheet(isPresented: $opening) {
        if let key = insight?.exerciseKey {
          NavigationStack {
            ExerciseInsightView(insights: insights, today: today, single: key)
              .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                  Button {
                    opening = false
                  } label: {
                    Image(systemName: "xmark")
                  }
                  .accessibilityLabel(Text("eg.close"))
                }
              }
          }
        }
      }
    }
  }
}
