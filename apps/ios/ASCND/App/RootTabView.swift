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

  var body: some View {
    TabView(selection: $selection) {
      Tab("tab.today", systemImage: "house", value: AppTab.today) {
        PlaceholderScreen(title: "tab.today", systemImage: "house")
      }
      Tab("tab.nutrition", systemImage: "fork.knife", value: AppTab.nutrition) {
        PlaceholderScreen(title: "tab.nutrition", systemImage: "fork.knife")
      }
      Tab("tab.workouts", systemImage: "dumbbell", value: AppTab.workouts) {
        PlaceholderScreen(title: "tab.workouts", systemImage: "dumbbell")
      }
      Tab("tab.community", systemImage: "person.2", value: AppTab.community) {
        PlaceholderScreen(title: "tab.community", systemImage: "person.2")
      }
      Tab("tab.assistant", systemImage: "heart.text.square", value: AppTab.assistant, role: .search) {
        PlaceholderScreen(title: "tab.assistant", systemImage: "heart.text.square")
      }
    }
  }
}

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

#Preview("Light") { RootTabView() }
#Preview("Dark") { RootTabView().preferredColorScheme(.dark) }
#Preview("Dynamic Type XXXL") { RootTabView().dynamicTypeSize(.accessibility3) }
