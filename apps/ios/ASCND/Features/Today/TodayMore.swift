import ASCNDDesignSystem
import SwiftUI

/// "More about today" (#527, bản thiết kế Today đã duyệt): các thẻ nhóm lớn của
/// RN (`TodayGroups` — sinh trắc, xu hướng sẵn sàng, tổng kết tuần…) thành MỘT
/// danh sách dòng một hàng, mỗi dòng một số đo Menlo và mũi tên. Thẻ đầy đủ
/// vẫn ở màn riêng, cách một chạm — Today chỉ trả lời "có gì đáng xem".
/// Chưa đo được thì "—", không bao giờ "0".
struct TodayMore: View {
  struct Row: Identifiable {
    let id: String
    let title: String
    /// Số đo bên phải; `nil` = dòng không có số (tổng kết tuần).
    let value: String?
    let action: () -> Void
  }

  let rows: [Row]
  /// Nguồn của chuyển cảnh zoom sang màn chi tiết (id = `Row.id`).
  let zoom: Namespace.ID
  @Environment(\.dynamicTypeSize) private var typeSize
  @Environment(\.colorScheme) private var scheme

  var body: some View {
    VStack(alignment: .leading, spacing: DS.Spacing.sm) {
      Text(String(localized: "today.more.title"))
        .font(DS.TextStyle.title)
        .foregroundStyle(DS.Color.foreground.swiftUI)
        .accessibilityAddTraits(.isHeader)
        .padding(.horizontal, 4)
      VStack(spacing: 0) {
        ForEach(Array(rows.enumerated()), id: \.element.id) { i, row in
          if i > 0 { Divider().padding(.leading, DS.Spacing.md).opacity(0.6) }
          Button(action: row.action) {
            HStack(spacing: DS.Spacing.sm) {
              // Tiêu đề theo `.body` (17 ở cỡ mặc định) để lớn cùng số đo Menlo;
              // cỡ chữ trợ năng thì số đo xuống dưới tiêu đề thay vì chen ngang.
              (typeSize.isAccessibilitySize
                ? AnyLayout(VStackLayout(alignment: .leading, spacing: 2))
                : AnyLayout(HStackLayout(spacing: DS.Spacing.sm))) {
                Text(verbatim: row.title)
                  .font(.body)
                  .foregroundStyle(DS.Color.foreground.swiftUI)
                  .frame(maxWidth: .infinity, alignment: .leading)
                if let value = row.value {
                  Text(verbatim: value)
                    .font(DS.TextStyle.number(15, .body))
                    .foregroundStyle(DS.Color.mutedForeground.swiftUI)
                    .lineLimit(1)
                }
              }
              Image(systemName: "chevron.right")
                .font(.footnote.weight(.semibold))
                .foregroundStyle(DS.Color.mutedForeground.swiftUI.opacity(0.7))
                .accessibilityHidden(true)
            }
            .padding(.horizontal, DS.Spacing.md)
            .frame(minHeight: 56)
            .contentShape(Rectangle())
          }
          .buttonStyle(TodayPressStyle(scale: 0.98))
          .matchedTransitionSource(id: row.id, in: zoom)
          .accessibilityElement(children: .ignore)
          .accessibilityLabel(Text(verbatim: row.title))
          .accessibilityValue(Text(verbatim: row.value ?? ""))
          .accessibilityAddTraits(.isButton)
        }
      }
      .clipShape(RoundedRectangle(cornerRadius: 26, style: .continuous))
      .todayCard()
      // `matchedTransitionSource` giữ ảnh của dòng qua lần đổi sáng / tối
      // (chủ dự án 20/10: "bị giữ màu cũ") — dựng lại thẻ khi giao diện đổi.
      .id(scheme)
    }
  }
}
