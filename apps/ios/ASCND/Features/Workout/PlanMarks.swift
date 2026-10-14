import ASCNDCore
import ASCNDDesignSystem
import SwiftUI

/// Dấu trạng thái của một ngày trong kế hoạch — TRANG TRÍ, không bấm (ô ngày
/// bọc nó mới là vùng chạm). Dùng chung cho dải ngày và chú giải của Kế hoạch
/// tuần, cùng bộ dấu với dải tuần ở trang gốc Tập luyện.
struct PlanDayMark: View {
  let status: DayStatus
  /// Màu nhấn (vòng / dấu tích).
  let tint: Color
  /// Màu của lá (nghỉ) và chấm (chưa lên lịch).
  let muted: Color
  /// Đường kính vòng; chấm "chưa lên lịch" bằng một nửa.
  var size: CGFloat = 11

  var body: some View {
    Group {
      switch status {
      case .done:
        Image(systemName: "checkmark.circle.fill").font(.system(size: size + 2)).foregroundStyle(tint)
      case .todo:
        Circle().strokeBorder(tint, lineWidth: 1.5).frame(width: size, height: size)
      case .missed:
        Circle().strokeBorder(tint.opacity(0.5), style: StrokeStyle(lineWidth: 1.2, dash: [2, 2]))
          .frame(width: size, height: size)
      case .rest:
        Image(systemName: "leaf").font(.system(size: size - 1)).foregroundStyle(muted)
      case .unplanned:
        Circle().fill(muted.opacity(0.2)).frame(width: size / 2, height: size / 2)
      }
    }
    .accessibilityHidden(true)
  }
}

/// Icon tròn có nền nhạt trước tên một buổi — trang trí, không bấm.
struct PlanIconBadge: View {
  let symbol: String
  let tint: Color
  var size: CGFloat = 36

  var body: some View {
    Image(systemName: symbol)
      .font(.footnote)
      .foregroundStyle(tint)
      .frame(width: size, height: size)
      .background(tint.opacity(0.12), in: Circle())
      .accessibilityHidden(true)
  }
}
