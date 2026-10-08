// Màn Hôm nay production — C sở hữu UI (#310).
//
// Binding `TodayController` (A7) → `TodayView` qua dependency injection:
//  - map 5 trạng thái (DayStatus → TodayStatus);
//  - loading/error/refresh/offline;
//  - Start Workout là callback cho A8;
//  - KHÔNG duplicate `dayStateOf`, KHÔNG domain logic mới trong View.
import ASCNDCore
import ASCNDDesignSystem
import SwiftUI

/// Container production: nối TodayController thật vào TodayView.
///
/// A8b (#364): WorkoutFlow dựng một lần mỗi phiên và đã gọi `today.load()`,
/// nên TodayScreen KHÔNG tự load. Refresh qua `onRefresh` để flow làm mới
/// cả buổi tập, bảng kỷ lục và "lần trước".
public struct TodayScreen: View {
  @Bindable var controller: TodayController
  /// Bắt đầu buổi tập — A8b mở WorkoutView với flow.session.
  var onStartWorkout: () -> Void
  /// Chọn plan khác — `nil` khi bản này chưa có màn kế hoạch (nút ẩn).
  var onChoosePlan: (() -> Void)?
  /// Mở Cài đặt — `nil` thì không hiện nút.
  var onOpenSettings: (() -> Void)?
  /// Làm mới — A8b truyền `{ await flow.refresh() }`.
  var onRefresh: () async -> Void

  public init(
    controller: TodayController,
    onStartWorkout: @escaping () -> Void = {},
    onChoosePlan: (() -> Void)? = nil,
    onOpenSettings: (() -> Void)? = nil,
    onRefresh: @escaping () async -> Void = {}
  ) {
    self.controller = controller
    self.onStartWorkout = onStartWorkout
    self.onChoosePlan = onChoosePlan
    self.onOpenSettings = onOpenSettings
    self.onRefresh = onRefresh
  }

  public var body: some View {
    Group {
      if controller.plan == nil && controller.failure == nil {
        // Đang tải lần đầu.
        DSLoadingView(message: String(localized: "today.loading"))
      } else if let failure = controller.failure, controller.plan == nil {
        // Lỗi và chưa có cache. Chỉ nói theo `failure` có kiểu (#334) —
        // `failureDetail` là chi tiết thô cho Lab/log, không hiện ra đây.
        switch failure {
        case .offline:
          DSOfflineView { Task { await onRefresh() } }
        case .unavailable:
          DSErrorView(message: String(localized: "async.error.generic")) {
            Task { await onRefresh() }
          }
        }
      } else if let display = todayDisplay {
        // Có dữ liệu (cache hoặc server).
        VStack(spacing: 0) {
          // Offline: hiện cache + banner.
          if case .cache = controller.source {
            offlineBanner
          }
          TodayView(
            state: display,
            onStart: onStartWorkout,
            onChoosePlan: onChoosePlan,
            onOpenSettings: onOpenSettings
          )
        }
        .refreshable {
          await onRefresh()
        }
      } else {
        DSErrorView(message: String(localized: "async.error.generic")) {
          Task { await onRefresh() }
        }
      }
    }
    // KHÔNG .task { await controller.load() } — WorkoutFlow đã gọi (#364).
  }

  /// Map TodayController → TodayDisplay (không duplicate dayStateOf).
  private var todayDisplay: TodayDisplay? {
    guard let plan = controller.plan else { return nil }
    // Dựng Date từ components theo Calendar.current — không lệch múi giờ (#364).
    let calendar = Calendar.current
    // LocalDate không expose year/month/day trực tiếp; dùng daysSinceEpoch
    // quy về Date rồi lấy components. (A có thể thêm helper LocalDate→Date.)
    let utcDate = Date(timeIntervalSince1970: TimeInterval(plan.date.daysSinceEpoch) * 86_400)
    let comps = calendar.dateComponents([.year, .month, .day], from: utcDate)
    let date = calendar.date(from: comps) ?? utcDate
    return TodayDisplay(
      date: date,
      status: mapStatus(plan.status),
      templateName: plan.template?.name,
      exercises: plan.template?.exercises.map {
        TodayExercise(
          name: $0.exerciseName,
          sets: $0.sets,
          reps: $0.reps,
          weightKg: $0.weightKg
        )
      } ?? [],
      isDeload: plan.isDeload
    )
  }

  private func mapStatus(_ status: DayStatus) -> TodayStatus {
    switch status {
    case .todo: .todo
    case .done: .done
    case .missed: .missed
    case .rest: .rest
    case .unplanned: .unplanned
    }
  }

  private var offlineBanner: some View {
    HStack(spacing: DS.Spacing.xs) {
      Image(systemName: "wifi.slash")
        .accessibilityHidden(true)
      Text(String(localized: "today.offline.cache"))
        .font(DS.TextStyle.caption)
    }
    .foregroundStyle(DS.Color.mutedForeground.swiftUI)
    .padding(.vertical, DS.Spacing.xs)
    .frame(maxWidth: .infinity)
    .background(DS.Color.secondary.swiftUI)
    .accessibilityElement(children: .combine)
  }
}

// MARK: - Preview (dùng fixture, không cần controller thật)

#Preview("TodayScreen — Light") {
  TodayView(
    state: .fixture(status: .todo),
    onStart: {},
    onChoosePlan: {}
  )
  .preferredColorScheme(.light)
}
