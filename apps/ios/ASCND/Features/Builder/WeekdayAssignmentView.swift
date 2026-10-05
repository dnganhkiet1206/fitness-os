// Chọn ngày trong tuần — C sở hữu (#407).
#if canImport(SwiftUI)
@_exported import SwiftUI
#endif

/// Chọn ngày tập trong tuần (1=CN, 2=T2, ..., 7=T7).
public struct WeekdayAssignmentView: View {
  @Binding var selected: Set<Int>

  public init(selected: Binding<Set<Int>>) {
    self._selected = selected
  }

  public var body: some View {
    // Scroll ngang: 7 nút × 44pt không vừa màn hình hẹp (SE) ở mọi cỡ chữ.
    ScrollView(.horizontal, showsIndicators: false) {
      HStack(spacing: 4) {
        ForEach(1...7, id: \.self) { day in
          WeekdayButton(
            day: day,
            isSelected: selected.contains(day)
          ) {
            if selected.contains(day) {
              selected.remove(day)
            } else {
              selected.insert(day)
            }
          }
        }
      }
    }
    .accessibilityElement(children: .contain)
    .accessibilityLabel(String(localized: "builder.weekdays.label"))
  }
}

/// Nút tròn cho một ngày.
private struct WeekdayButton: View {
  let day: Int
  let isSelected: Bool
  let action: () -> Void

  var body: some View {
    Button(action: action) {
      Text(shortName)
        .font(.caption)
        .fontWeight(.medium)
        .lineLimit(1)
        .minimumScaleFactor(0.75)
        .frame(width: 36, height: 36)
        .background(isSelected ? Color.accentColor : Color.secondary.opacity(0.2))
        .foregroundStyle(isSelected ? .white : .primary)
        .clipShape(Circle())
    }
    // Hit target 44×44 theo HIG; vòng tròn hiển thị giữ 36pt.
    .frame(width: 44, height: 44)
    .accessibilityLabel(fullName)
    .accessibilityValue(
      isSelected
        ? String(localized: "common.selected")
        : String(localized: "common.not.selected")
    )
    .accessibilityAddTraits(isSelected ? .isSelected : [])
  }

  private var shortName: String {
    switch day {
    case 1: return String(localized: "weekday.short.1") // CN
    case 2: return String(localized: "weekday.short.2") // T2
    case 3: return String(localized: "weekday.short.3") // T3
    case 4: return String(localized: "weekday.short.4") // T4
    case 5: return String(localized: "weekday.short.5") // T5
    case 6: return String(localized: "weekday.short.6") // T6
    case 7: return String(localized: "weekday.short.7") // T7
    default: return ""
    }
  }

  private var fullName: String {
    String(localized: "weekday.\(day)")
  }
}

// MARK: - Previews

#Preview("WeekdayAssignment — None") {
  WeekdayAssignmentView(selected: .constant([]))
    .padding()
}

#Preview("WeekdayAssignment — Some") {
  WeekdayAssignmentView(selected: .constant([2, 4, 6]))
    .padding()
}
