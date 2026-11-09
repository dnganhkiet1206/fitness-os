import ASCNDCore
import ASCNDDesignSystem
import SwiftUI

/// Dòng "Koa có gợi ý chỉnh mục tiêu calo · Xem" dưới vòng calo (09/11, Kiệt duyệt
/// mock "Áp dụng gợi ý calo" bản 2, màn ①). Chỉ hiện khi `CalorieAdvice` là
/// `.change` (ăn sát mục tiêu hiện tại mà cân vẫn lệch dải) và người dùng chưa
/// "Để sau" trong 7 ngày. Chạm mở Hiệu chỉnh mục tiêu, nơi có nút Áp dụng.
struct CalorieHintRow: View {
  let book: SmartGoalsBook

  var body: some View {
    if case .ready(let s) = book.phase, let memory = book.memory, memory.showsHint(s.shownAdvice, today: book.today) {
      NavigationLink {
        SmartGoalsView(book: book)
      } label: {
        HStack(spacing: DS.Spacing.sm) {
          Circle().fill(DS.Color.readinessYellow.swiftUI).frame(width: 8, height: 8)
          Text("nutrition.caloriehint")
            .font(DS.TextStyle.footnote)
            .foregroundStyle(DS.Color.foreground.swiftUI)
            .multilineTextAlignment(.leading)
          Spacer(minLength: 0)
          Text("nutrition.caloriehint.open")
            .font(DS.TextStyle.footnote.weight(.bold))
            .foregroundStyle(DS.Color.primary.swiftUI)
        }
        .padding(.horizontal, DS.Spacing.md)
        .frame(minHeight: 44)
        .background(DS.Color.card.swiftUI, in: RoundedRectangle(cornerRadius: DS.Radius.md))
        .overlay(RoundedRectangle(cornerRadius: DS.Radius.md).strokeBorder(DS.Color.border.swiftUI, lineWidth: 0.5))
      }
      .buttonStyle(.plain)
    }
  }
}

extension SmartGoalsBook.Snapshot {
  /// Lời khuyên để vẽ. Bản Debug: `SIMCTL_CHILD_ASCND_DEBUG_CALORIE_ADVICE=change|eat|need|trial`
  /// ép một trạng thái (dữ liệu test của simulator đang đúng dải nên không có gợi ý).
  var shownAdvice: CalorieAdvice {
    #if DEBUG
      if let name = ProcessInfo.processInfo.environment["ASCND_DEBUG_CALORIE_ADVICE"] {
        let today = LocalDate(SystemWallClock().nowMillis(), in: .current)
        let target = analysis?.currentCal ?? 2600
        switch name {
        case "change": return .change(from: target, to: target + 150, avgKcal: target - 40, measuredDays: 14)
        case "eat": return .eatToTarget(avgKcal: 1750, target: target, loggedDays: 14)
        case "need": return .needIntake(loggedDays: 6)
        case "trial": return .trial(since: today.adding(days: -3), until: today.adding(days: 11))
        default: break
        }
      }
    #endif
    return advice
  }
}
