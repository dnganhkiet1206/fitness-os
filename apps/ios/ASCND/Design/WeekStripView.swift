// Dải tuần — C sở hữu presentation (#299).
//
// Port presentation của `week-strip.tsx` @ fac9ac2 sang SwiftUI.
// View-only: controller cung cấp [DayCellDisplay]. KHÔNG tự tính ngày,
// KHÔNG copy domain logic (`dayStateOf` là việc của controller).
import ASCNDDesignSystem
import SwiftUI

/// Một ô ngày trong dải tuần — dữ liệu HIỂN THỊ, do controller cung cấp.
struct DayCellDisplay: Hashable {
  /// Tên ngắn (M/T/W… hoặc T2/T3…/CN — controller đã bản địa hoá).
  let shortName: String
  /// Tên dài cho VoiceOver (Monday / Thứ 2…).
  let longName: String
  /// Số ngày trong tháng.
  let dayNumber: Int
  /// Trạng thái: rest/done/todo/missed/unplanned (5 trạng thái baseline).
  let state: WeekDayState
  /// Có phải hôm nay không.
  let isToday: Bool
}

/// Tên riêng cho trạng thái HIỂN THỊ của một ô: `DayState` trần sẽ che
/// `ASCNDCore.DayState` (điểm quay lại của ngày) trong cả target app.
enum WeekDayState: Hashable {
  case rest, done, todo, missed, unplanned
}

struct WeekStripView: View {
  /// 7 ô Mon–Sun, controller cung cấp.
  let cells: [DayCellDisplay]
  /// Index ô đang chọn (`nil` = không chọn — card tóm tắt).
  let selected: Int?
  /// Chạm vào ô.
  let onPick: (Int) -> Void

  var body: some View {
    HStack(spacing: DS.Spacing.xs) {
      ForEach(Array(cells.enumerated()), id: \.offset) { idx, cell in
        dayCell(cell, index: idx)
      }
    }
    .accessibilityElement(children: .contain)
  }

  private func dayCell(_ cell: DayCellDisplay, index: Int) -> some View {
    Button {
      onPick(index)
    } label: {
      VStack(spacing: DS.Spacing.xs) {
        Text(cell.shortName)
          .font(DS.TextStyle.caption)
          .foregroundStyle(
            index == selected
              ? DS.Color.primaryForeground.swiftUI
              : DS.Color.mutedForeground.swiftUI
          )
        Text("\(cell.dayNumber)")
          .font(DS.TextStyle.body)
          .foregroundStyle(
            index == selected
              ? DS.Color.primaryForeground.swiftUI
              : DS.Color.foreground.swiftUI
          )
        Circle()
          .fill(stateColor(cell.state).swiftUI)
          .frame(width: 8, height: 8)
      }
      .frame(maxWidth: .infinity, minHeight: 64)
      .padding(.vertical, DS.Spacing.xs)
      .background(
        RoundedRectangle(cornerRadius: DS.Radius.sm)
          .fill(
            index == selected
              ? DS.Color.primary.swiftUI
              : stateWash(cell.state).swiftUI
          )
      )
      .overlay {
        if cell.isToday {
          RoundedRectangle(cornerRadius: DS.Radius.sm)
            .stroke(DS.Color.primary.swiftUI, lineWidth: 2)
        }
      }
    }
    .frame(minHeight: 44)
    .accessibilityLabel(Text(a11yLabel(cell)))
    .accessibilityAddTraits(index == selected ? .isSelected : [])
    .accessibilityHint(Text(String(localized: "weekstrip.hint")))
  }

  private func stateColor(_ state: WeekDayState) -> DSColor {
    switch state {
    case .done: DS.Color.readinessGreen
    case .todo: DS.Color.primary
    case .missed: DS.Color.mutedForeground
    case .rest: DS.Color.metricPurple
    case .unplanned: DS.Color.mutedForeground
    }
  }

  private func stateWash(_ state: WeekDayState) -> DSColor {
    // Nền nhạt theo trạng thái — RN dùng alpha() trên palette; ở đây dùng
    // secondary cho đơn giản (DS chưa có wash token).
    DS.Color.secondary
  }

  /// Tách khỏi `dayCell`: một chuỗi nội suy lồng ternary trong modifier làm
  /// trình kiểm kiểu của Swift quá thời gian ("unable to type-check").
  private func a11yLabel(_ cell: DayCellDisplay) -> String {
    let base = "\(cell.longName), \(stateLabel(cell.state))"
    return cell.isToday ? base + ", " + String(localized: "weekstrip.today") : base
  }

  private func stateLabel(_ state: WeekDayState) -> String {
    switch state {
    case .rest: String(localized: "day.rest")
    case .done: String(localized: "day.done")
    case .todo: String(localized: "day.todo")
    case .missed: String(localized: "day.missed")
    case .unplanned: String(localized: "day.unplanned")
    }
  }
}

// MARK: - Preview

#Preview("WeekStrip — Light") {
  WeekStripView(
    cells: DayCellDisplay.previewCells,
    selected: 2,
    onPick: { _ in }
  )
  .padding()
  .preferredColorScheme(.light)
}

#Preview("WeekStrip — Dark") {
  WeekStripView(
    cells: DayCellDisplay.previewCells,
    selected: 2,
    onPick: { _ in }
  )
  .padding()
  .preferredColorScheme(.dark)
}

#Preview("WeekStrip — XXXL") {
  WeekStripView(
    cells: DayCellDisplay.previewCells,
    selected: nil,
    onPick: { _ in }
  )
  .padding()
  .dynamicTypeSize(.accessibility3)
}

extension DayCellDisplay {
  static var previewCells: [DayCellDisplay] {
    [
      .init(shortName: "T2", longName: "Thứ 2", dayNumber: 29, state: .done, isToday: false),
      .init(shortName: "T3", longName: "Thứ 3", dayNumber: 30, state: .done, isToday: false),
      .init(shortName: "T4", longName: "Thứ 4", dayNumber: 1, state: .todo, isToday: true),
      .init(shortName: "T5", longName: "Thứ 5", dayNumber: 2, state: .todo, isToday: false),
      .init(shortName: "T6", longName: "Thứ 6", dayNumber: 3, state: .rest, isToday: false),
      .init(shortName: "T7", longName: "Thứ 7", dayNumber: 4, state: .unplanned, isToday: false),
      .init(shortName: "CN", longName: "Chủ nhật", dayNumber: 5, state: .missed, isToday: false),
    ]
  }
}
