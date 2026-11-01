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
  @Environment(\.dynamicTypeSize) private var typeSize
  /// Số lớn phóng theo cỡ chữ như đơn vị cạnh nó — cỡ cố định 30 làm "160" nhỏ hơn
  /// chữ "Gains" ở cỡ trợ năng (soát 01/11).
  @ScaledMetric(relativeTo: .largeTitle) private var valueSize: CGFloat = 30

  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      // Chữ trợ năng (soát 01/11): tiêu đề và chữ góc chung một hàng thì tiêu đề còn
      // "N…" — xếp dọc, tiêu đề xuống dòng được.
      if typeSize.isAccessibilitySize {
        VStack(alignment: .leading, spacing: 4) {
          titleLabel
          cornerRow
        }
      } else {
        HStack(spacing: 6) {
          titleLabel.lineLimit(1)
          Spacer(minLength: 4)
          cornerRow
        }
      }
      // Chữ trợ năng: hình nhỏ xuống dưới, chữ phụ dùng hết bề ngang.
      AnyLayout(
        typeSize.isAccessibilitySize
          ? AnyLayout(VStackLayout(alignment: .leading, spacing: DS.Spacing.sm))
          : AnyLayout(HStackLayout(alignment: .bottom, spacing: DS.Spacing.sm))
      ) {
        VStack(alignment: .leading, spacing: 2) {
          (Text(verbatim: value)
            .font(.system(size: valueSize, weight: .bold, design: .rounded).monospacedDigit())
            .foregroundStyle(DS.Color.foreground.swiftUI)
            + Text(verbatim: unit.map { " \($0)" } ?? "")
            .font(Font.subheadline.weight(.semibold))
            .foregroundStyle(DS.Color.mutedForeground.swiftUI))
            .lineLimit(typeSize.isAccessibilitySize ? nil : 1)
            .minimumScaleFactor(typeSize.isAccessibilitySize ? 1 : 0.7)
          if let detail {
            Text(verbatim: detail)
              .font(DS.TextStyle.footnote)
              .foregroundStyle(DS.Color.mutedForeground.swiftUI)
              .fixedSize(horizontal: false, vertical: true)
          }
        }
        if !typeSize.isAccessibilitySize { Spacer(minLength: 0) }
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

extension RoomSummaryCard {
  fileprivate var titleLabel: some View {
    Label {
      Text(verbatim: title)
    } icon: {
      Image(systemName: symbol)
    }
    .font(Font.subheadline.weight(.semibold))
    .foregroundStyle(tint)
  }

  fileprivate var cornerRow: some View {
    HStack(spacing: 6) {
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
