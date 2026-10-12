import ASCNDCore
import ASCNDDesignSystem
import SwiftUI

/// Một việc của thẻ "Cần làm hôm nay" (`todo-card.tsx`), theo thứ tự của RN.
enum TodayTodo: String, CaseIterable, Identifiable {
  case meal, workout, sleep, bio, weight

  var id: String { rawValue }

  var label: String {
    switch self {
    case .meal: String(localized: "today.todo.meal")
    case .workout: String(localized: "today.todo.workout")
    case .sleep: String(localized: "today.todo.sleep")
    case .bio: String(localized: "today.todo.bio")
    case .weight: String(localized: "today.todo.weight")
    }
  }

  /// Biểu tượng lucide của RN → SF Symbol gần nghĩa (Soup, BicepsFlexed,
  /// Moon, HeartPulse, BodyScale).
  var symbol: String {
    switch self {
    case .meal: "takeoutbag.and.cup.and.straw"
    case .workout: "figure.strengthtraining.traditional"
    case .sleep: "moon"
    case .bio: "bolt.heart"
    case .weight: "scalemass"
    }
  }

  var tint: Color {
    switch self {
    case .meal: DS.Color.readinessGreen.swiftUI
    case .workout: DS.Color.champagne.swiftUI
    case .sleep: DS.Color.metricPurple.swiftUI
    case .bio: DS.Color.readinessRed.swiftUI
    case .weight: DS.Color.metricBlue.swiftUI
    }
  }
}

/// Thẻ "Cần làm hôm nay": năm dòng luôn hiện (dòng đã ghi vẫn ở lại), mỗi dòng
/// ô biểu tượng tròn 44, tên, và nút "Ghi" đen hoặc chip xanh "✓ Đã ghi";
/// góc phải "đã xong / 5". Chạm nút (ở trạng thái nào cũng vậy) mở màn ghi.
/// Chưa có: vuốt để bỏ qua hôm nay / sửa / bật tắt nhắc, giờ nhắc cạnh tên.
struct TodayTodoCard: View {
  let done: (TodayTodo) -> Bool
  let onLog: (TodayTodo) -> Void

  var body: some View {
    let count = TodayTodo.allCases.filter(done).count
    VStack(alignment: .leading, spacing: DS.Spacing.sm) {
      HStack(alignment: .firstTextBaseline) {
        Text(String(localized: "today.todo.title"))
          .font(DS.TextStyle.headline)
          .foregroundStyle(DS.Color.foreground.swiftUI)
          .accessibilityAddTraits(.isHeader)
        Spacer()
        Text(verbatim: "\(count)/\(TodayTodo.allCases.count)")
          .font(.system(size: 13, weight: .semibold).monospacedDigit())
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)
      }
      ForEach(TodayTodo.allCases) { item in
        row(item, done: done(item))
      }
    }
    .padding(DS.Spacing.card)
    .frame(maxWidth: .infinity, alignment: .leading)
    .background(DS.Color.card.swiftUI, in: RoundedRectangle(cornerRadius: DS.Radius.lg))
    .overlay(RoundedRectangle(cornerRadius: DS.Radius.lg).stroke(DS.Color.foreground.swiftUI.opacity(0.08), lineWidth: 1))
  }

  private func row(_ item: TodayTodo, done: Bool) -> some View {
    HStack(spacing: 10) {
      Image(systemName: item.symbol)
        .font(.system(size: 18))
        .foregroundStyle(item.tint.opacity(done ? 0.8 : 1))
        .frame(width: 44, height: 44)
        .background(DS.Color.background.swiftUI, in: Circle())
        .accessibilityHidden(true)
      Text(item.label)
        .font(DS.TextStyle.body)
        .foregroundStyle(done ? DS.Color.mutedForeground.swiftUI : DS.Color.foreground.swiftUI)
        .lineLimit(2)
        .frame(maxWidth: .infinity, alignment: .leading)
      Button {
        onLog(item)
      } label: {
        HStack(spacing: 6) {
          if done {
            Image(systemName: "checkmark").font(.system(size: 14, weight: .bold))
              .foregroundStyle(DS.Color.readinessGreen.swiftUI)
          }
          Text(done ? String(localized: "today.todo.done") : String(localized: "today.todo.log"))
            .font(.system(size: 15, weight: .semibold))
            .foregroundStyle(done ? DS.Color.secondaryForeground.swiftUI : DS.Color.primaryForeground.swiftUI)
        }
        .padding(.horizontal, DS.Spacing.md)
        .frame(minWidth: 72, minHeight: 44)
        .background(done ? DS.Color.readinessGreen.swiftUI.opacity(0.12) : DS.Color.primary.swiftUI, in: Capsule())
        .contentShape(Capsule())
      }
      .buttonStyle(.plain)
      .sensoryFeedback(.selection, trigger: done)
      .accessibilityLabel(
        Text(
          String(
            localized:
              "today.todo.a11y \(done ? String(localized: "today.todo.done") : String(localized: "today.todo.log")) \(item.label)"
          )))
    }
    .padding(.vertical, 4)
  }
}
