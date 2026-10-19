import ASCNDDesignSystem
import SwiftUI

/// Thang độ gắng sức (RPE) dùng chung cho màn ghi tay và builder (18/10).
///
/// RPE nói còn CÁCH THẤT BẠI bao xa — 10 là không thêm được rep nào với form
/// đúng, 9 là còn 1, 8 còn ~2, 7 còn ~3. Không phải mức đau: đau khớp / nhói
/// là tín hiệu dừng, không phải "RPE cao" (chủ dự án hỏi 18/10).
enum EffortScale {
  /// Nghĩa của một mức, một dòng.
  static func meaning(_ v: Int) -> String {
    switch v {
    case ...5: String(localized: "effort.5")
    case 6: String(localized: "manualLog.rpe.6")
    case 7: String(localized: "manualLog.rpe.7")
    case 8: String(localized: "manualLog.rpe.8")
    case 9: String(localized: "manualLog.rpe.9")
    default: String(localized: "manualLog.rpe.10")
    }
  }

  static let rose = DS.Color.metricRose.swiftUI
}

/// Hàng chip 5…10 (hoặc 6…10) + nghĩa của mức đang chọn.
struct EffortPicker: View {
  let values: ClosedRange<Int>
  let value: Int
  let pick: (Int) -> Void

  var body: some View {
    VStack(alignment: .leading, spacing: DS.Spacing.sm) {
      HStack(spacing: DS.Spacing.xs) {
        ForEach(Array(values), id: \.self) { v in
          let on = value == v
          Button {
            pick(v)
          } label: {
            Text(verbatim: "\(v)")
              .font(DS.TextStyle.body.weight(on ? .bold : .medium).monospacedDigit())
              .foregroundStyle(on ? Color.white : DS.Color.foreground.swiftUI)
              .frame(maxWidth: .infinity, minHeight: 44)
              .background(
                on ? AnyShapeStyle(EffortScale.rose) : AnyShapeStyle(DS.Color.secondary.swiftUI),
                in: RoundedRectangle(cornerRadius: DS.Radius.md, style: .continuous))
          }
          .buttonStyle(.plain)
          .accessibilityLabel(Text(verbatim: "RPE \(v), \(EffortScale.meaning(v))"))
          .accessibilityAddTraits(on ? [.isButton, .isSelected] : .isButton)
        }
      }
      Text(verbatim: EffortScale.meaning(value))
        .font(DS.TextStyle.footnote.weight(.medium))
        .foregroundStyle(EffortScale.rose)
    }
  }
}
