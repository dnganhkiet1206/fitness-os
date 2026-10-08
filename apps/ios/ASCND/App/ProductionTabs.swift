import ASCNDCore
import ASCNDDesignSystem
import SwiftUI

// Nối những màn ĐÃ có (#527) vào tab của bản Release: Today, màn tập, lịch sử
// buổi tập, Cài đặt. Chỉ là nối dây — không hành vi mới. Màn nào chưa đủ hành
// vi thì không hiện nút dẫn tới nó (chọn kế hoạch, builder: #527
// IMPLEMENTED_NOT_WIRED), thay vì một nút không làm gì.

/// Tab Hôm nay: `TodayScreen` trên `flow.today` của phiên.
struct TodayTab: View {
  @Environment(WorkoutFlow.self) private var flow
  /// Bấm "Bắt đầu" — đưa người dùng sang tab Tập luyện, nơi màn tập sống.
  var onStartWorkout: () -> Void
  @State private var showsSettings = false

  var body: some View {
    TodayScreen(
      controller: flow.today,
      onStartWorkout: onStartWorkout,
      // Chưa có màn kế hoạch nối vào bản này (#527): ẩn nút.
      onChoosePlan: nil,
      onOpenSettings: { showsSettings = true },
      onRefresh: { await flow.refresh() }
    )
    .sheet(isPresented: $showsSettings) { SettingsSheet() }
  }
}

/// Tab Tập luyện: màn tập của hôm nay, lịch sử qua nút trên thanh điều hướng.
struct WorkoutsTab: View {
  @Environment(WorkoutFlow.self) private var flow
  @Environment(AppServices.self) private var services
  @Environment(RestTimerController.self) private var rest
  @State private var showsHistory = false

  var body: some View {
    Group {
      if let session = flow.session {
        WorkoutView(
          controller: session,
          // Hàng "đang nghỉ" cần biết set nào vừa tick; `RestTimerController`
          // chỉ giữ set KẾ TIẾP. Chưa nối (#527 PARTIAL) — thẻ nghỉ vẫn hiện.
          restingRowKey: nil,
          restTimer: rest.timer,
          onAdjustRest: { rest.adjust(by: $0) },
          onSkipRest: { rest.handle(.cancel) },
          outboxStatus: outboxStatus,
          onFinish: { _ = try await flow.finish() },
          onAppend: { _ = try await flow.append() },
          onOpenHistory: openHistory
        )
      } else {
        NavigationStack {
          ScrollView {
            DSEmptyState(
              systemImage: "dumbbell",
              title: String(localized: "workouts.noSession.title"),
              message: String(localized: "workouts.noSession.message")
            )
            .padding(.top, 80)
          }
          .refreshable { await flow.refresh() }
          .navigationTitle(Text("tab.workouts"))
          .toolbar {
            if let openHistory {
              ToolbarItem(placement: .topBarTrailing) {
                Button(action: openHistory) {
                  Image(systemName: "clock.arrow.circlepath")
                    .frame(minWidth: 44, minHeight: 44)
                }
                .accessibilityLabel(Text("history.title"))
              }
            }
          }
        }
      }
    }
    .sheet(isPresented: $showsHistory) {
      if let history = flow.history {
        NavigationStack { WorkoutHistoryView(book: history) }
      }
    }
  }

  /// Không có `HistoryBook` (app không đưa chỗ đọc) thì không có nút.
  private var openHistory: (() -> Void)? {
    flow.history == nil ? nil : { showsHistory = true }
  }

  private var outboxStatus: OutboxStatus {
    if services.sync.deadCount > 0 { return .dead(services.sync.deadCount) }
    if services.sync.pendingCount > 0 { return .pending(services.sync.pendingCount) }
    return .ok
  }
}

/// Cài đặt của phiên: tài khoản, phiên bản, đăng xuất.
private struct SettingsSheet: View {
  @Environment(AppServices.self) private var services

  var body: some View {
    SettingsView(
      account: account,
      onSignOut: { Task { await services.session.signOut() } },
      // Đổi ngay trong app, mọi chữ theo (`AppLanguage`, #527 · 1.7).
      onLanguageChange: { code in
        if let choice = AppPreferences.LangChoice(rawValue: code) { services.setLanguage(choice) }
      },
      language: services.preferences.lang.rawValue,
      theme: services.preferences.theme.rawValue,
      onThemeChange: { code in
        if let t = AppPreferences.Theme(rawValue: code) { services.preferences.setTheme(t) }
      }
    )
    .presentationDragIndicator(.visible)
  }

  private var account: AccountSummary? {
    guard case .signedIn(let s) = services.session.phase else { return nil }
    return AccountSummary(email: s.email)
  }
}
