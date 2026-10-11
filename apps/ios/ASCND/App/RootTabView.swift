import ASCNDCore
import SwiftUI

/// Năm điểm đến cấp cao, đúng thứ tự và biểu tượng của app RN
/// (`native/src/components/app-tabs.tsx`). Trợ lý sức khoẻ mang vai `.search`:
/// trên iOS 26 hệ thống vẽ nó thành vòng tròn riêng cạnh thanh tab — cùng lý do
/// app RN chọn vai này.
enum AppTab: String, Hashable {
  case today, nutrition, workouts, community, assistant
}

struct RootTabView: View {
  /// Nhớ tab đang mở qua những lần hệ thống thu hồi scene.
  @SceneStorage("root.tab") private var selection: AppTab = .today
  @Environment(AppServices.self) private var services
  /// Link `ascnd://` chờ mở (#527 deep link lát 2).
  @Environment(DeepLinkInbox.self) private var links: DeepLinkInbox?
  @State private var linked: DeepLink.Screen?

  var body: some View {
    TabView(selection: $selection) {
      Tab("tab.today", systemImage: "house", value: AppTab.today) {
        TodayTab(onStartWorkout: { selection = .workouts })
      }
      .accessibilityHint(Text(String(localized: "tab.today.hint")))
      Tab("tab.nutrition", systemImage: "fork.knife", value: AppTab.nutrition) {
        // Lát đầu của Dinh dưỡng (#527 Phase 3): thẻ + màn Nước uống.
        NutritionTab()
      }
      .accessibilityHint(Text(String(localized: "tab.nutrition.hint")))
      Tab("tab.workouts", systemImage: "dumbbell", value: AppTab.workouts) {
        #if DEBUG
          // Bản Debug: màn thật + các màn thử (Lab) cho Kiệt kiểm trên máy.
          DebugWorkoutsTab()
        #else
          WorkoutsTab()
        #endif
      }
      .accessibilityHint(Text(String(localized: "tab.workouts.hint")))
      Tab("tab.community", systemImage: "person.2", value: AppTab.community) {
        // Lát đầu của Cộng đồng (#527): feed chỉ đọc.
        CommunityTab()
      }
      .accessibilityHint(Text(String(localized: "tab.community.hint")))
      Tab("tab.assistant", systemImage: "heart.text.square", value: AppTab.assistant, role: .search) {
        // Lát đầu của Trợ lý (#527 Phase 6): AI Coach.
        AssistantTab()
      }
      .accessibilityHint(Text(String(localized: "tab.assistant.hint")))
    }
    // Ăn mừng huy chương / thử thách (#527, `CelebrationHost` ở layout gốc của
    // RN): trên mọi tab, phủ cả thanh tab.
    .overlay { CelebrationHost(queue: services.celebrations) }
    // Link tới một màn: mở tab của nó, rồi màn ấy thành sheet. `initial`: link
    // đến lúc chưa đăng nhập được mở ngay khi cây của phiên dựng xong.
    .onChange(of: links?.pending, initial: true) { _, _ in
      guard let target = links?.take() else { return }
      selection = AppTab(target.tab)
      if case .screen(let screen) = target { linked = screen }
    }
    .sheet(
      isPresented: Binding(get: { linked != nil }, set: { if !$0 { linked = nil } })
    ) {
      if let linked { DeepLinkScreen(screen: linked) }
    }
  }
}

#if DEBUG
  /// Tab Tập luyện của bản Debug: màn thật (như Release) hoặc Lab. Nhớ lựa
  /// chọn qua các lần mở app.
  private struct DebugWorkoutsTab: View {
    @AppStorage("lab.showsLab") private var showsLab = false

    var body: some View {
      VStack(spacing: 0) {
        Picker(selection: $showsLab) {
          Text(verbatim: "App").tag(false)
          Text(verbatim: "Lab").tag(true)
        } label: {
          Text(verbatim: "Mode")
        }
        .pickerStyle(.segmented)
        .padding(.horizontal)
        .padding(.top, 8)
        if showsLab { LabsView() } else { WorkoutsTab() }
      }
    }
  }

  /// Chọn giữa các màn thử (chỉ bản Debug). Nhớ lựa chọn qua các lần mở app.
  private struct LabsView: View {
    @AppStorage("lab.which") private var which = 0

    var body: some View {
      VStack(spacing: 0) {
        Picker(selection: $which) {
          Text(verbatim: "Workout").tag(0)
          Text(verbatim: "Rest").tag(1)
        } label: {
          Text(verbatim: "Lab")
        }
        .pickerStyle(.segmented)
        .padding(.horizontal)
        .padding(.top, 8)
        if which == 0 { WorkoutLabView() } else { RestLabView() }
      }
    }
  }
#endif
