import ASCNDCore
import ASCNDDesignSystem
import SwiftUI

/// Thẻ "Đang tạm nghỉ" ở Hôm nay: Koa nói rõ những gì đang tắt, và nút quay lại sớm.
struct KoaPauseCard: View {
  let pause: KoaPause
  let today: LocalDate
  let build: Int
  let endEarly: () -> Void

  var body: some View {
    VStack(alignment: .leading, spacing: DS.Spacing.sm) {
      Text(String(localized: "pause.card.eyebrow \(pause.daysLeft(from: today))"))
        .font(DS.TextStyle.caption.weight(.semibold))
        .textCase(.uppercase)
        .tracking(0.8)
        .foregroundStyle(DS.Color.mutedForeground.swiftUI)
      HStack(alignment: .center, spacing: DS.Spacing.sm) {
        MascotFigureView(emotion: .sleep, size: 64, animated: false, build: build)
          .accessibilityHidden(true)
        Text("pause.card.line")
          .font(DS.TextStyle.body.weight(.semibold))
          .foregroundStyle(DS.Color.foreground.swiftUI)
          .fixedSize(horizontal: false, vertical: true)
      }
      Text("pause.card.what")
        .font(DS.TextStyle.footnote)
        .foregroundStyle(DS.Color.mutedForeground.swiftUI)
        .fixedSize(horizontal: false, vertical: true)
      DSButton(String(localized: "pause.card.end"), style: .secondary, action: endEarly)
        .accessibilityIdentifier("today.pause.end")
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .padding(DS.Spacing.md)
    .todayCard()
  }
}

/// Chọn số ngày tạm nghỉ (1…14). Không hỏi lý do: nghỉ là việc của người dùng.
struct KoaPauseSheet: View {
  let today: LocalDate
  let start: (Int) -> Void
  @Environment(\.dismiss) private var dismiss
  @Environment(\.locale) private var locale
  @State private var days = 3

  var body: some View {
    VStack(alignment: .leading, spacing: DS.Spacing.md) {
      Text("pause.sheet.title")
        .font(DS.TextStyle.title2.weight(.bold))
      Text("pause.sheet.body")
        .font(DS.TextStyle.body)
        .foregroundStyle(DS.Color.mutedForeground.swiftUI)
        .fixedSize(horizontal: false, vertical: true)
      Stepper(value: $days, in: 1...KoaPause.maxDays) {
        Text(String(localized: "pause.sheet.days \(days)"))
          .font(DS.TextStyle.headline.monospacedDigit())
      }
      .accessibilityIdentifier("pause.days")
      Text(String(localized: "pause.sheet.back \(returnDay)"))
        .font(DS.TextStyle.footnote)
        .foregroundStyle(DS.Color.mutedForeground.swiftUI)
      Spacer(minLength: 0)
      DSButton(String(localized: "pause.sheet.start"), style: .primary) {
        start(days)
        dismiss()
      }
      .accessibilityIdentifier("pause.start")
    }
    .padding(DS.Spacing.lg)
    .mediumSheet()
    .presentationDragIndicator(.visible)
  }

  private var returnDay: String {
    let d = KoaPause(from: today, days: days).returnDay
    let date = Calendar.current.date(from: DateComponents(year: d.year, month: d.month, day: d.day)) ?? .now
    return date.formatted(.dateTime.weekday(.wide).day().month(.abbreviated).locale(locale))
  }
}

/// Từ lần đổi buổi sang nghỉ thứ hai trong tuần (Kiệt duyệt 03/11): Koa gợi ý Tạm nghỉ, trạng thái
/// trung thực cho tuần bận hay mệt. Không trách, không trừ gì; bỏ qua được.
struct KoaSwapNudge: View {
  let build: Int
  let pause: () -> Void
  let dismiss: () -> Void

  var body: some View {
    VStack(alignment: .leading, spacing: DS.Spacing.sm) {
      HStack(alignment: .top, spacing: DS.Spacing.sm) {
        MascotFigureView(emotion: .idle, size: 48, animated: false, build: build)
          .accessibilityHidden(true)
        Text("swap.nudge.line")
          .font(DS.TextStyle.body.weight(.semibold))
          .foregroundStyle(DS.Color.foreground.swiftUI)
          .fixedSize(horizontal: false, vertical: true)
      }
      Text("swap.nudge.why")
        .font(DS.TextStyle.footnote)
        .foregroundStyle(DS.Color.mutedForeground.swiftUI)
        .fixedSize(horizontal: false, vertical: true)
      DSButton(String(localized: "swap.nudge.pause"), style: .secondary, action: pause)
        .accessibilityIdentifier("today.swap.pause")
      Button(action: dismiss) {
        // cả dải 44 điểm nhận chạm, không chỉ phần chữ (nút `.plain`, xem `TodayPlanHero.minTap`)
        Text("swap.nudge.no")
          .font(DS.TextStyle.footnote.weight(.semibold))
          .frame(maxWidth: .infinity, minHeight: 44)
          .contentShape(Rectangle())
      }
      .buttonStyle(.plain)
      .foregroundStyle(DS.Color.primary.swiftUI)
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .padding(DS.Spacing.md)
    .todayCard()
  }
}
