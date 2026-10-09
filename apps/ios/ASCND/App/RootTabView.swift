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
        PlaceholderScreen(title: "tab.community", systemImage: "person.2")
      }
      .accessibilityHint(Text(String(localized: "tab.community.hint")))
      Tab("tab.assistant", systemImage: "heart.text.square", value: AppTab.assistant, role: .search) {
        PlaceholderScreen(title: "tab.assistant", systemImage: "heart.text.square")
      }
      .accessibilityHint(Text(String(localized: "tab.assistant.hint")))
    }
    // Ăn mừng huy chương / thử thách (#527, `CelebrationHost` ở layout gốc của
    // RN): trên mọi tab, phủ cả thanh tab.
    .overlay { CelebrationHost(queue: services.celebrations) }
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

/// Chỗ giữ màn cho tới khi slice của nó tới (docs/MIGRATION_STATUS.md).
/// Có NavigationStack thật để tiêu đề lớn, cuộn và chuyển cảnh đã đúng kiểu
/// iOS ngay từ đầu — slice sau chỉ thay phần thân.
private struct PlaceholderScreen: View {
  let title: LocalizedStringKey
  let systemImage: String

  var body: some View {
    NavigationStack {
      ScrollView {
        ContentUnavailableView {
          Label(title, systemImage: systemImage)
        } description: {
          Text("placeholder.building")
        }
        .padding(.top, 80)
      }
      .navigationTitle(title)
    }
  }
}

