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
        CreatePlanSheet(book: book) { id in
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
            .font(DS.TextStyle.headline)
            .accessibilityAddTraits(.isHeader)
          Spacer()
          if plans.count > Self.preview {
            NavigationLink(value: MealPlansRoute(userId: book.userId)) {
              HStack(spacing: 2) {
                Text(String(localized: "nc.seeAll"))
                Image(systemName: "chevron.right").font(.caption).accessibilityHidden(true)
              }
              .font(DS.TextStyle.footnote.weight(.semibold))
              .foregroundStyle(DS.Color.primary.swiftUI)
              .padding(.horizontal, DS.Spacing.sm)
              .frame(minHeight: 44)
              .overlay(Capsule().stroke(DS.Color.border.swiftUI, lineWidth: 1).padding(.vertical, 8))
              .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
          }
        }
        ForEach(plans.prefix(Self.preview)) { p in
          NavigationLink(value: MealPlanRoute(userId: book.userId, planId: p.id, plan: p)) {
            PlanRowView(plan: p, fill: book.fill[p.id] ?? [:])
          }
          .buttonStyle(.plain)
        }
        Button { creating = true } label: {
          Label(String(localized: "plans.create"), systemImage: "plus")
            .font(DS.TextStyle.footnote.weight(.semibold))
            .foregroundStyle(DS.Color.primary.swiftUI)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, DS.Spacing.md)
            .frame(minHeight: 44)
            .background(DS.Color.card.swiftUI, in: RoundedRectangle(cornerRadius: DS.Radius.md))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
      }
    }
  }
}
