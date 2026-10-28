import ASCNDCore
import ASCNDDesignSystem
import SwiftUI

/// "Cơ thể" — thẻ Cân nặng (`WeightTrendCard`, phần cân nặng của RN `BodyPanel`)
/// + số đo, ảnh tiến trình, mục tiêu.
///
/// GĐ3 (Kiệt duyệt 21/10, mock `gd3-four-areas.html`): chuyển từ phân đoạn
/// "Cơ thể" của Tập luyện sang tab Tiến bộ. Màn và dữ liệu giữ nguyên.
struct BodySection: View {
  let userId: String
  let today: LocalDate
  /// Trạng thái Cơ thể ở Tiến bộ (nếu mở từ đó) — số thay đổi cân theo màu này.
  var status: ProgressStatus.Level? = nil

  @Environment(AppServices.self) private var services
  @State private var showsWeight = false
  @State private var measure: MeasurementsBook?
  @State private var photos: ProgressPhotosBook?
  @State private var goals: SmartGoalsBook?
  @State private var weight: WeightTrendBook?

  /// Màu của Cơ thể = màu cân nặng ở Hôm nay (14/10).
  static let tint = DS.Color.metricSteel.swiftUI

  var body: some View {
    VStack(alignment: .leading, spacing: DS.Spacing.md) {
      if let weight {
        WeightTrendCard(book: weight, status: status) { showsWeight = true }
      }
      VStack(spacing: 0) {
        if let measure {
          NavigationLink { MeasurementsView(book: measure) } label: {
            WorkoutsHomeView.toolRow("ruler", String(localized: "assistant.tool.measure"), sub: nil, tint: Self.tint)
          }
          .buttonStyle(.plain)
        }
        if let photos {
          Divider().padding(.leading, 58).opacity(0.6)
          NavigationLink { ProgressPhotosView(book: photos) } label: {
            WorkoutsHomeView.toolRow(
              "photo.on.rectangle", String(localized: "assistant.tool.photos"), sub: nil, tint: Self.tint)
          }
          .buttonStyle(.plain)
        }
        if let goals {
          Divider().padding(.leading, 58).opacity(0.6)
          NavigationLink { SmartGoalsView(book: goals) } label: {
            WorkoutsHomeView.toolRow("target", String(localized: "assistant.tool.goals"), sub: nil, tint: Self.tint)
          }
          .buttonStyle(.plain)
        }
      }
      .clipShape(RoundedRectangle(cornerRadius: DS.Radius.xl, style: .continuous))
      .todayCard()
    }
    .sheet(isPresented: $showsWeight) {
      LogWeightView(makeLogger: { services.makeWeightLogger(userId: userId) }) { showsWeight = false }
    }
    .onChange(of: showsWeight) { _, open in
      if !open { Task { await weight?.load() } }
    }
    .task { makeBooks() }
  }

  private func makeBooks() {
    if weight == nil {
      weight = services.makeWeightTrend(userId: userId)
      Task { await weight?.load() }
    }
    if measure == nil { measure = services.makeMeasurements(userId: userId) }
    if photos == nil { photos = services.makeProgressPhotos(userId: userId) }
    if goals == nil { goals = services.makeSmartGoals(userId: userId, today: today) }
  }
}
