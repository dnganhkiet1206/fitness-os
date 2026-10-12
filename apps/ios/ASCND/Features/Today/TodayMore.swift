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

  var body: some View {
    VStack(alignment: .leading, spacing: DS.Spacing.sm) {
      Text(String(localized: "today.more.title"))
        .font(DS.TextStyle.title)
        .foregroundStyle(DS.Color.foreground.swiftUI)
        .accessibilityAddTraits(.isHeader)
        .padding(.horizontal, 4)
      VStack(spacing: 0) {
        ForEach(Array(rows.enumerated()), id: \.element.id) { i, row in
          if i > 0 { Divider().padding(.leading, DS.Spacing.md) }
          Button(action: row.action) {
            HStack(spacing: DS.Spacing.sm) {
              Text(verbatim: row.title)
                .font(.system(size: 17))
                .foregroundStyle(DS.Color.foreground.swiftUI)
                .frame(maxWidth: .infinity, alignment: .leading)
              if let value = row.value {
                Text(verbatim: value)
                  .font(.custom("Menlo", size: 15, relativeTo: .body))
                  .foregroundStyle(DS.Color.mutedForeground.swiftUI)
                  .lineLimit(1)
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
          .buttonStyle(.plain)
          .accessibilityElement(children: .ignore)
          .accessibilityLabel(Text(verbatim: row.title))
          .accessibilityValue(Text(verbatim: row.value ?? ""))
          .accessibilityAddTraits(.isButton)
        }
      }
      .background(DS.Color.card.swiftUI, in: RoundedRectangle(cornerRadius: DS.Radius.lg))
      .overlay(RoundedRectangle(cornerRadius: DS.Radius.lg).strokeBorder(DS.Color.border.swiftUI.opacity(0.7)))
      .clipShape(RoundedRectangle(cornerRadius: DS.Radius.lg))
    }
  }
}
