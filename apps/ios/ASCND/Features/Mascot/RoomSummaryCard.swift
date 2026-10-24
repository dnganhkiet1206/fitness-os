import ASCNDCore
import ASCNDDesignSystem
import SwiftUI

/// Thẻ tóm tắt của phòng linh vật theo kiểu Apple Health (Kiệt duyệt 24/10): nhãn
/// màu + biểu tượng ở góc trái, chữ phụ + mũi tên ở góc phải; dưới là MỘT số lớn
/// với đơn vị nhỏ, một dòng phụ, và một hình nhỏ bên phải. Chi tiết (luật, danh
/// sách, nút mua) nằm ở màn con khi chạm thẻ.
struct RoomSummaryCard<Trailing: View>: View {
  let symbol: String
  let tint: Color
  let title: String
  var corner: String?
  let value: String
  var unit: String?
  var detail: String?
  @ViewBuilder var trailing: () -> Trailing

  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      HStack(spacing: 6) {
        Label {
          Text(verbatim: title).lineLimit(1)
        } icon: {
          Image(systemName: symbol)
        }
        .font(Font.subheadline.weight(.semibold))
        .foregroundStyle(tint)
        Spacer(minLength: 4)
        if let corner {
          Text(verbatim: corner)
            .font(Font.subheadline)
            .foregroundStyle(DS.Color.mutedForeground.swiftUI)
            .lineLimit(1)
        }
        Image(systemName: "chevron.right")
          .font(.system(size: 13, weight: .semibold))
          .foregroundStyle(DS.Color.mutedForeground.swiftUI.opacity(0.7))
          .accessibilityHidden(true)
      }
      HStack(alignment: .bottom, spacing: DS.Spacing.sm) {
        VStack(alignment: .leading, spacing: 2) {
          (Text(verbatim: value)
            .font(.system(size: 30, weight: .bold, design: .rounded).monospacedDigit())
            .foregroundStyle(DS.Color.foreground.swiftUI)
            + Text(verbatim: unit.map { " \($0)" } ?? "")
            .font(Font.subheadline.weight(.semibold))
            .foregroundStyle(DS.Color.mutedForeground.swiftUI))
            .lineLimit(1)
            .minimumScaleFactor(0.7)
          if let detail {
            Text(verbatim: detail)
              .font(DS.TextStyle.footnote)
              .foregroundStyle(DS.Color.mutedForeground.swiftUI)
              .fixedSize(horizontal: false, vertical: true)
          }
        }
        Spacer(minLength: 0)
        trailing()
      }
    }
    .padding(DS.Spacing.md)
    .frame(maxWidth: .infinity, alignment: .leading)
    .dsCard(radius: 22)
    .contentShape(Rectangle())
    .accessibilityElement(children: .combine)
    .accessibilityAddTraits(.isButton)
  }
}

extension RoomSummaryCard where Trailing == EmptyView {
  init(
    symbol: String, tint: Color, title: String, corner: String? = nil, value: String, unit: String? = nil,
    detail: String? = nil
  ) {
    self.init(
      symbol: symbol, tint: tint, title: title, corner: corner, value: value, unit: unit, detail: detail
    ) { EmptyView() }
  }
}

/// Bảy cột của tuần (như cột bước chân của Health): đã tập = cao, màu; hôm nay =
/// viền; còn lại thấp, xám.
struct RoomWeekBars: View {
  let days: [KoaWeek.Day]
  let today: LocalDate
  let tint: Color

  var body: some View {
    HStack(alignment: .bottom, spacing: 4) {
      ForEach(days, id: \.date) { d in
        RoundedRectangle(cornerRadius: 3, style: .continuous)
          .fill(d.trained ? tint : DS.Color.foreground.swiftUI.opacity(d.date == today ? 0.55 : 0.14))
          .frame(width: 8, height: d.trained ? 34 : 9)
      }
    }
    .frame(height: 34, alignment: .bottom)
    .accessibilityHidden(true)
  }
}

/// Màn con của một thẻ: tiêu đề lớn + nội dung cũ của thẻ ấy.
struct RoomDetailPage<Content: View>: View {
  let title: String
  @ViewBuilder var content: () -> Content

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: DS.Spacing.md) {
        Text(verbatim: title)
          .font(.largeTitle.bold())
          .foregroundStyle(DS.Color.foreground.swiftUI)
          .accessibilityAddTraits(.isHeader)
        content()
      }
      .padding(DS.Spacing.md)
    }
    .navigationTitle(Text(verbatim: ""))
    .navigationBarTitleDisplayMode(.inline)
    .background { TodayAmbient(accent: nil) }
  }
}

/// Một hàng "Khám phá thêm" kiểu danh sách của Health: biểu tượng màu, tên, số, mũi tên.
struct RoomLinkRow: View {
  let symbol: String
  let tint: Color
  let label: String
  var value: String?

  var body: some View {
    HStack(spacing: DS.Spacing.md) {
      Image(systemName: symbol)
        .font(.system(size: 15, weight: .semibold))
        .foregroundStyle(tint)
        .frame(width: 32, height: 32)
        .background(tint.opacity(0.14), in: RoundedRectangle(cornerRadius: 9, style: .continuous))
        .accessibilityHidden(true)
      Text(verbatim: label)
        .font(DS.TextStyle.body)
        .foregroundStyle(DS.Color.foreground.swiftUI)
      Spacer(minLength: DS.Spacing.sm)
      if let value {
        Text(verbatim: value)
          .font(DS.TextStyle.body.monospacedDigit())
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)
      }
      Image(systemName: "chevron.right")
        .font(.system(size: 13, weight: .semibold))
        .foregroundStyle(DS.Color.mutedForeground.swiftUI.opacity(0.7))
        .accessibilityHidden(true)
    }
    .padding(.horizontal, DS.Spacing.md)
    .frame(minHeight: 52)
    .contentShape(Rectangle())
    .accessibilityElement(children: .combine)
    .accessibilityAddTraits(.isButton)
  }
}
