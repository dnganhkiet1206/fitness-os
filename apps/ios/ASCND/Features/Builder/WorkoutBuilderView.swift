import ASCNDCore
import SwiftUI

/// Cửa vào builder (#527 Phase 2): danh sách buổi tập đã lưu → builder.
/// Nhận `WorkoutFlow` của phiên (đọc `today.library`, ghi qua `plan`).
///
/// Chưa có lối vào ở tab Release: RN mở từ tab Tập luyện → Plan
/// (`/templates`, `/workout-builder`); tab ấy là phần nối của #528.
struct WorkoutBuilderView: View {
  let flow: WorkoutFlow

  var body: some View {
    TemplateListView(flow: flow)
  }
}
