import ASCNDDesignSystem
import SwiftUI

/// Chú thích đường mục tiêu của một biểu đồ: đoạn nét đứt mẫu + "Mục tiêu 10.000".
///
/// Đặt ở đầu thẻ, không trên biểu đồ: nhãn treo trên đường mục tiêu bị cột cao hơn mục
/// tiêu che mất (29/10, Hồi phục: "Mục tiêu 60" nằm đè cột Thứ 4). `value` đã định dạng
/// sẵn kèm đơn vị ("8h", "130 g").
struct ChartGoalKey: View {
  let value: String
  var tint: Color = DS.Color.mutedForeground.swiftUI

  var body: some View {
    HStack(spacing: 4) {
      Path { p in
        p.move(to: .init(x: 0, y: 1))
        p.addLine(to: .init(x: 14, y: 1))
      }
      .stroke(tint, style: StrokeStyle(lineWidth: 1.5, dash: [3, 2]))
      .frame(width: 14, height: 2)
      Text(String(localized: "chart.goal \(value)"))
        .foregroundStyle(DS.Color.mutedForeground.swiftUI)
    }
    .font(DS.TextStyle.caption.monospacedDigit())
    .accessibilityElement(children: .combine)
  }
}

/// Hàng đầu thẻ biểu đồ: tiêu đề bên trái, chú thích mục tiêu bên phải; không vừa một
/// hàng (cỡ chữ trợ năng) thì xếp dọc thay vì ép hai cột hẹp.
struct ChartHeader<Title: View>: View {
  let goal: ChartGoalKey?
  @ViewBuilder var title: () -> Title

  var body: some View {
    ViewThatFits(in: .horizontal) {
      HStack(alignment: .firstTextBaseline) {
        title()
        Spacer(minLength: DS.Spacing.sm)
        goal
      }
      VStack(alignment: .leading, spacing: 4) {
        title()
        goal
      }
    }
  }
}
