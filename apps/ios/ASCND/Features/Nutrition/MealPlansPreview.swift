import ASCNDCore
import ASCNDDesignSystem
import SwiftUI

/// Phân đoạn "Kế hoạch ăn" của tab Dinh dưỡng (#527) — `MealPlanTab` của
/// `(tabs)/nutrition.tsx` @ fac9ac2 trên `MealPlansBook`.
///
/// RN behavior (giữ nguyên):
/// - chưa có kế hoạch: một thẻ giải thích + "Tạo kế hoạch ăn";
/// - có: MỘT thẻ — tiêu đề "Kế hoạch ăn (n)", ba kế hoạch mới nhất (cùng hàng với
///   màn danh sách: tên, mục tiêu · số bữa, bảy chấm ngày), hàng "+ Tạo" ở cuối
///   khối; "Xem tất cả" chỉ khi có hơn ba (một nút "xem tất cả" trên danh sách đã
///   là tất cả là một nút không làm gì);
/// - tạo xong mở thẳng kế hoạch vừa tạo.
///
/// Khác RN: đọc hỏng là lỗi có thử lại, không phải thẻ "chưa có kế hoạch nào" —
/// RN gộp hai thứ ấy (`plans` là `undefined` khi lỗi).
struct MealPlansPreview: View {
  let book: MealPlansBook
  @State private var creating = false
  @State private var opened: MealPlanRoute?

  /// `PREVIEW`.
  static let preview = 3

  var body: some View {
    content
      .task { await book.load() }
      .sheet(isPresented: $creating) {
        PlanWizardView(plans: book) { id in
          opened = MealPlanRoute(userId: book.userId, planId: id, plan: book.plans.first { $0.id == id })
        }
      }
      .navigationDestination(item: $opened) { route in MealPlanScreen(route: route) }
  }

  @ViewBuilder private var content: some View {
    switch book.phase {
    case .loading:
      DSLoadingView()
    case .failed(.offline):
      DSOfflineView { Task { await book.load() } }
    case .failed:
      DSErrorView(message: String(localized: "async.error.generic")) { Task { await book.load() } }
    case .ready(let plans) where plans.isEmpty:
      DSEmptyState(
        systemImage: "fork.knife", title: String(localized: "plans.empty"),
        message: String(localized: "plans.what"), actionTitle: String(localized: "plans.create")
      ) { creating = true }
    case .ready(let plans):
      VStack(alignment: .leading, spacing: DS.Spacing.sm) {
        HStack(alignment: .firstTextBaseline) {
          Text(String(localized: "nc.plans \(plans.count)"))
            .font(DS.TextStyle.title)
            .accessibilityAddTraits(.isHeader)
          Spacer()
          if plans.count > Self.preview {
            NavigationLink(value: MealPlansRoute(userId: book.userId)) {
              HStack(spacing: 2) {
                Text(String(localized: "nc.seeAll"))
                Image(systemName: "chevron.right").font(.caption.weight(.semibold)).accessibilityHidden(true)
              }
              .font(DS.TextStyle.footnote.weight(.semibold))
              .foregroundStyle(DS.Color.foreground.swiftUI)
              .frame(minHeight: 44)
              .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
          }
        }
        .padding(.horizontal, 4)
        // Một thẻ danh sách (thiết kế lại 13/10): mỗi kế hoạch một hàng, "+ Tạo"
        // là hàng cuối — không còn một thẻ trắng to cho mỗi tên.
        VStack(spacing: 0) {
          ForEach(plans.prefix(Self.preview)) { p in
            NavigationLink(value: MealPlanRoute(userId: book.userId, planId: p.id, plan: p)) {
              PlanRowView(plan: p, fill: book.fill[p.id] ?? [:], plain: true)
            }
            .buttonStyle(TodayPressStyle(scale: 0.98))
            Divider().padding(.leading, DS.Spacing.md).opacity(0.6)
          }
          Button { creating = true } label: {
            Label(String(localized: "plans.create"), systemImage: "plus")
              .font(.system(size: 16, weight: .semibold))
              .foregroundStyle(MascotRoomView.signalColor(.meal))
              .frame(maxWidth: .infinity, alignment: .leading)
              .padding(.horizontal, DS.Spacing.md)
              .frame(minHeight: 52)
              .contentShape(Rectangle())
          }
          .buttonStyle(TodayPressStyle(scale: 0.98))
        }
        .clipShape(RoundedRectangle(cornerRadius: DS.Radius.xl, style: .continuous))
        .todayCard()
      }
    }
  }
}
