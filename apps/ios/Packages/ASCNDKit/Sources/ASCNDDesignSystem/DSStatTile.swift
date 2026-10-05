// Ô chỉ số của ASCND — C sở hữu (#229, #247).
//
// Nhãn + số lớn + đơn vị. Dùng cho volume, số set, thời gian ở màn Summary.
// Số dùng font mono để cột số không nhảy khi giá trị đổi.
#if canImport(SwiftUI)
import SwiftUI

public struct DSStatTile: View {
  let label: String
  let value: String
  let unit: String?

  public init(label: String, value: String, unit: String? = nil) {
    self.label = label
    self.value = value
    self.unit = unit
  }

  public var body: some View {
    VStack(alignment: .leading, spacing: DS.Spacing.xs) {
      Text(label)
        .font(DS.TextStyle.caption)
        .foregroundStyle(DS.Color.mutedForeground.swiftUI)
      HStack(alignment: .firstTextBaseline, spacing: 4) {
        Text(value)
          .font(DS.TextStyle.mono(.title))
          .foregroundStyle(DS.Color.foreground.swiftUI)
        if let unit {
          Text(unit)
            .font(DS.TextStyle.footnote)
            .foregroundStyle(DS.Color.mutedForeground.swiftUI)
        }
      }
    }
    .accessibilityElement(children: .combine)
    .accessibilityLabel(Text("\(label): \(value)\(unit.map { " \($0)" } ?? "")"))
  }
}

#Preview("Light") {
  HStack(spacing: DS.Spacing.md) {
    DSStatTile(label: "Volume", value: "2.450", unit: "kg")
    DSStatTile(label: "Số set", value: "18")
    DSStatTile(label: "Thời gian", value: "52", unit: "phút")
  }
  .padding()
  .preferredColorScheme(.light)
}

#Preview("Dark") {
  HStack(spacing: DS.Spacing.md) {
    DSStatTile(label: "Volume", value: "2.450", unit: "kg")
    DSStatTile(label: "Số set", value: "18")
    DSStatTile(label: "Thời gian", value: "52", unit: "phút")
  }
  .padding()
  .preferredColorScheme(.dark)
}

#Preview("Dynamic Type XXL") {
  HStack(spacing: DS.Spacing.md) {
    DSStatTile(label: "Volume", value: "2.450", unit: "kg")
    DSStatTile(label: "Số set", value: "18")
  }
  .padding()
  .dynamicTypeSize(.accessibility3)
}
#endif
