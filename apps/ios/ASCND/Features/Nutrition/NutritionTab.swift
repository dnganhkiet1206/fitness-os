import ASCNDCore
import ASCNDDesignSystem
import SwiftUI

/// Tab Dinh dưỡng (#527 Phase 3). Lát đầu: thẻ Nước uống — như `WaterWidget`
/// trên tab Dinh dưỡng của RN (`(tabs)/nutrition.tsx`): số hôm nay / mục tiêu,
/// thêm nhanh, chạm để mở màn Nước. Phần còn lại của Dinh dưỡng (nhật ký bữa
/// ăn, thực phẩm, kế hoạch) chưa port — dòng "đang dựng" nói thật điều đó
/// thay vì một nút không làm gì.
///
/// Sổ dựng MỘT lần mỗi phiên (cây của tab dựng lại theo `.id(userId)`), thẻ
/// và màn dùng chung; đóng khi phiên không còn là của người này.
struct NutritionTab: View {
  @Environment(WorkoutFlow.self) private var flow
  @Environment(AppServices.self) private var services
  @Environment(\.scenePhase) private var scenePhase
  @State private var water: WaterBook?
  @State private var built = false

  private var userId: String { flow.today.userId }

  var body: some View {
    NavigationStack {
      ScrollView {
        VStack(spacing: DS.Spacing.md) {
          if let water { WaterCard(book: water) }
          Text(String(localized: "placeholder.building"))
            .font(DS.TextStyle.footnote)
            .foregroundStyle(DS.Color.mutedForeground.swiftUI)
            .multilineTextAlignment(.center)
            .frame(maxWidth: .infinity)
            .padding(.top, DS.Spacing.lg)
        }
        .padding(DS.Spacing.md)
      }
      .refreshable { await water?.refresh() }
      .navigationTitle(Text("tab.nutrition"))
      .navigationDestination(for: WaterRoute.self) { _ in
        if let water { WaterView(book: water) }
      }
    }
    .task {
      guard !built else { return }
      built = true
      water = services.makeWaterBook(userId: userId)
      await water?.load()
    }
    .onChange(of: scenePhase) { _, phase in
      // Ra tiền cảnh: qua nửa đêm thì "hôm nay" đổi.
      guard phase == .active, let water else { return }
      Task { await water.clockTick() }
    }
    // KHÔNG ở `onDisappear` (chạy cả khi đổi tab): sổ đóng thì không mở lại.
    .onChange(of: isCurrentSession) { _, current in
      if !current { water?.close() }
    }
  }

  private var isCurrentSession: Bool { services.session.session?.userId == userId }
}

/// Đích điều hướng của thẻ → màn Nước.
struct WaterRoute: Hashable {}

/// Thẻ Nước uống trên tab Dinh dưỡng (`WaterWidget` + `WaterQuickAdd` của RN).
/// Lần đọc đầu hỏng thì không hiện thẻ (`waterFailed ? null`) — không bao giờ
/// một thẻ nói "0" thay cho "không đọc được".
struct WaterCard: View {
  let book: WaterBook
  @Environment(AppServices.self) private var services
  @Environment(ProfileBook.self) private var profile: ProfileBook?
  @State private var feedback = WaterFeedback()

  private var unit: Water.Unit { services.preferences.volumeUnit }

  var body: some View {
    if book.loaded {
      let target = Water.target(profile?.profile?.waterTargetMl)
      let pct = Water.percent(totalMl: book.totalMl, targetMl: target)
      DSCard {
        VStack(alignment: .leading, spacing: DS.Spacing.sm) {
          NavigationLink(value: WaterRoute()) {
            HStack(alignment: .firstTextBaseline) {
              VStack(alignment: .leading, spacing: 2) {
                Label(String(localized: "water.card.title"), systemImage: "drop.fill")
                  .font(DS.TextStyle.headline)
                  .foregroundStyle(DS.Color.foreground.swiftUI)
                Text(verbatim: Water.bigValue(totalMl: book.totalMl, unit))
                  .font(DS.TextStyle.mono(.title).weight(.bold))
                  .foregroundStyle(DS.Color.foreground.swiftUI)
                Text(String(localized: "water.ofTarget \(Water.targetLabel(target, unit))"))
                  .font(DS.TextStyle.footnote)
                  .foregroundStyle(DS.Color.mutedForeground.swiftUI)
              }
              Spacer()
              Image(systemName: "chevron.right")
                .foregroundStyle(DS.Color.mutedForeground.swiftUI)
                .accessibilityHidden(true)
            }
            .frame(minHeight: 44)
            .contentShape(Rectangle())
          }
          .buttonStyle(.plain)
          .accessibilityElement(children: .ignore)
          .accessibilityLabel(Text(String(localized: "water.card.title")))
          .accessibilityValue(Text(verbatim: WaterView.summaryValue(book.totalMl, target: target, pct: pct, unit: unit)))
          .accessibilityAddTraits(.isButton)

          WaterProgressBar(fraction: pct / 100)

          Text(String(localized: "water.quickAdd.unit \(Water.unitLabel(unit))"))
            .font(DS.TextStyle.caption.weight(.semibold))
            .foregroundStyle(DS.Color.mutedForeground.swiftUI)
            .padding(.top, DS.Spacing.xs)
          WaterQuickAddRow(book: book, unit: unit, feedback: feedback)
          WaterFeedbackLine(feedback: feedback)
        }
      }
    }
  }
}
