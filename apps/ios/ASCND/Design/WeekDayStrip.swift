import ASCNDCore
import ASCNDDesignSystem
import SwiftUI

/// MỘT dải ngày cho Tập luyện, Dinh dưỡng và Nhật ký bữa ăn (Kiệt duyệt mock "Thống nhất giao diện,
/// đợt 2", 13/11, https://claude.ai/artifact/6Lvitx1r1uzrKk75YNnDnc). Trước đây ba kiểu: vòng tròn
/// T2→CN (Tập luyện), ô số bảy ngày lùi (Dinh dưỡng), ô tô đậm nhạt theo calo (Nhật ký).
///
/// Luật chung: tuần Thứ Hai → Chủ nhật, có số ngày; ngày đang xem tô đặc màu của tab, hôm nay (khi
/// không đang xem) có vòng màu tab; chấm dưới số nói trạng thái ngày; ngày sau hôm nay mờ, không chạm.
struct WeekDay: Hashable, Identifiable {
  let date: LocalDate
  let mark: Mark
  var id: LocalDate { date }

  /// Chấm dưới số ngày.
  enum Mark: Hashable {
    /// Đã tập / đã ghi: chấm đặc màu tab.
    case done
    /// Có buổi chưa tập: vòng màu tab.
    case planned
    /// Có buổi mà đã qua: vòng nét đứt mờ.
    case missed
    /// Ngày nghỉ: gạch ngắn mờ.
    case rest
    case none
  }

  /// Bảy ngày (T2 → CN) của tuần chứa `today`.
  static func week(of today: LocalDate) -> [LocalDate] { WeekPlanning.weekDates(today: today, offset: 0) }
}

struct WeekDayStrip<Cell: View>: View {
  typealias Day = WeekDay
  let days: [Day]
  let today: LocalDate
  /// Ngày đang xem (tô đặc). `nil` = không có ngày nào đang xem.
  let selected: LocalDate?
  let accent: Color
  /// Bọc mỗi ô (nút / liên kết). Ô sau hôm nay luôn không chạm.
  @ViewBuilder let wrap: (Day, WeekDayCell) -> Cell

  var body: some View {
    HStack(spacing: 2) {
      ForEach(days) { d in
        let cell = WeekDayCell(
          day: d, isToday: d.date == today, isSelected: d.date == selected, isFuture: d.date > today, accent: accent)
        Group {
          if d.date > today { cell } else { wrap(d, cell) }
        }
        .frame(maxWidth: .infinity)
      }
    }
  }
}

extension WeekDayStrip where Cell == WeekDayCell {
  /// Dải chỉ để xem (không chạm từng ô).
  init(days: [Day], today: LocalDate, selected: LocalDate?, accent: Color) {
    self.init(days: days, today: today, selected: selected, accent: accent) { _, cell in cell }
  }
}

/// Một ô: tên thứ, số ngày trong vòng tròn, chấm trạng thái.
struct WeekDayCell: View {
  let day: WeekDay
  let isToday: Bool
  let isSelected: Bool
  let isFuture: Bool
  let accent: Color
  @ScaledMetric(relativeTo: .body) private var circle: CGFloat = 32
  @Environment(\.dynamicTypeSize) private var typeSize

  var body: some View {
    VStack(spacing: 4) {
      Text(verbatim: weekday)
        .font(DS.TextStyle.caption.weight(isToday ? .semibold : .regular))
        .foregroundStyle(isToday ? DS.Color.foreground.swiftUI : DS.Color.mutedForeground.swiftUI)
        .lineLimit(1)
        .minimumScaleFactor(0.6)
      Text(verbatim: "\(day.date.day)")
        .font(DS.TextStyle.number(15, .body).weight(.semibold))
        .monospacedDigit()
        .lineLimit(1)
        .minimumScaleFactor(0.6)
        .foregroundStyle(numberColor)
        .frame(width: circle, height: circle)
        .background {
          if isSelected {
            Circle().fill(accent)
          } else if isToday {
            Circle().strokeBorder(accent, lineWidth: 1.5)
          }
        }
      markView.frame(height: 6)
    }
    .padding(.vertical, 4)
    .frame(minHeight: 44)
    .contentShape(Rectangle())
    .opacity(isFuture ? 0.4 : 1)
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(Text(verbatim: day.date.calendarDate.formatted(
      Date.FormatStyle().weekday(.wide).day().month(.wide).locale(.app))))
    .accessibilityValue(Text(verbatim: markText))
    .accessibilityAddTraits(isSelected ? .isSelected : [])
  }

  private var weekday: String {
    let style = Date.FormatStyle().weekday(typeSize.isAccessibilitySize ? .narrow : .abbreviated).locale(.app)
    return day.date.calendarDate.formatted(style)
  }

  private var numberColor: Color {
    if isSelected { return DS.Color.background.swiftUI }
    return isToday ? DS.Color.foreground.swiftUI : DS.Color.foreground.swiftUI.opacity(0.85)
  }

  @ViewBuilder private var markView: some View {
    switch day.mark {
    case .done: Circle().fill(accent).frame(width: 6, height: 6)
    case .planned: Circle().strokeBorder(accent, lineWidth: 1.2).frame(width: 6, height: 6)
    case .missed:
      Circle().strokeBorder(accent.opacity(0.45), style: StrokeStyle(lineWidth: 1, dash: [1.5, 1.5]))
        .frame(width: 6, height: 6)
    case .rest: Capsule().fill(DS.Color.mutedForeground.swiftUI.opacity(0.5)).frame(width: 7, height: 2)
    case .none: Color.clear.frame(width: 6, height: 6)
    }
  }

  private var markText: String {
    switch day.mark {
    case .done: String(localized: "week.mark.done")
    case .planned: String(localized: "week.mark.planned")
    case .missed: String(localized: "week.mark.missed")
    case .rest: String(localized: "week.mark.rest")
    case .none: ""
    }
  }
}
