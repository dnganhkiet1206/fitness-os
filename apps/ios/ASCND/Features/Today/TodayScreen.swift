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
public struct TodayScreen: View {
  @Bindable var controller: TodayController
  /// Bắt đầu buổi tập — A8 (#272) nối navigation thật.
  var onStartWorkout: () -> Void
  /// Chọn plan khác.
  var onChoosePlan: () -> Void

  public init(
    controller: TodayController,
    onStartWorkout: @escaping () -> Void = {},
    onChoosePlan: @escaping () -> Void = {}
  ) {
    self.controller = controller
    self.onStartWorkout = onStartWorkout
    self.onChoosePlan = onChoosePlan
  }

  public var body: some View {
    Group {
      if controller.plan == nil && controller.refreshError == nil {
        // Đang tải lần đầu.
        DSLoadingView(message: String(localized: "today.loading"))
      } else if let error = controller.refreshError, controller.plan == nil {
        // Lỗi và chưa có cache.
        DSErrorView(message: error) {
          Task { await controller.refresh() }
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
            onChoosePlan: onChoosePlan
          )
        }
        .refreshable {
          await controller.refresh()
        }
      } else {
        DSErrorView(message: String(localized: "async.error.generic")) {
          Task { await controller.refresh() }
        }
      }
    }
    .task {
      await controller.load()
    }
  }

  /// Map TodayController → TodayDisplay (không duplicate dayStateOf).
  private var todayDisplay: TodayDisplay? {
    guard let plan = controller.plan else { return nil }
    let date = Date(
      timeIntervalSince1970: TimeInterval(plan.date.daysSinceEpoch) * 86_400
    )
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
