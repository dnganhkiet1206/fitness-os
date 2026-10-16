import ASCNDCore
import ASCNDDesignSystem
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
  /// "Bắt đầu" ở Hôm nay → tab Tập luyện mở thẳng màn tập.
  @State private var launchWorkout = false
  /// Màn có ô nhập riêng (Koa Coach, nhắn tin) ẩn dải Ghi nhanh khi đang mở.
  @State private var quickLog = QuickLogVisibility()
  /// "Hỏi Koa Coach" trong Ghi nhanh → tab Trợ lý mở thẳng màn chat.
  @State private var openCoach = false

  var body: some View {
    TabView(selection: $selection) {
      Tab("tab.today", systemImage: "house", value: AppTab.today) {
        TodayTab(onStartWorkout: {
          selection = .workouts
          launchWorkout = true
        })
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
          DebugWorkoutsTab(launch: $launchWorkout)
        #else
          WorkoutsTab(launch: $launchWorkout)
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
        AssistantTab(openCoach: $openCoach)
      }
      .accessibilityHint(Text(String(localized: "tab.assistant.hint")))
    }
    // Ghi nhanh (15/10, chủ dự án chọn "thanh phụ trên tab bar"): một dải kính
    // trên thanh tab ở mọi tab, thu gọn khi cuộn; mở các màn ghi qua cùng đường
    // với deep link (`DeepLinkScreen`) nên dữ liệu không tách đôi.
    .modifier(QuickLogBar(
      hidden: quickLog.hidden,
      // Chỉ khi các function AI có trên máy chủ (`probeAI`), như mọi lối vào AI khác.
      askCoach: services.aiDeployed == true
        ? {
          selection = .assistant
          openCoach = true
        } : nil
    ) { linked = $0 })
    .environment(quickLog)
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
    @Binding var launch: Bool
    @AppStorage("lab.showsLab") private var showsLab = false

    /// Công tắc App / Lab là một nút nhỏ ở góc (14/10): dải chọn trên cùng che
    /// mất đầu trang của tab khi soát giao diện.
    var body: some View {
      Group {
        if showsLab { LabsView() } else { WorkoutsTab(launch: $launch) }
      }
      .overlay(alignment: .bottomTrailing) {
        Button {
          showsLab.toggle()
        } label: {
          Text(verbatim: showsLab ? "App" : "Lab")
            .font(.caption2.weight(.bold).monospaced())
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(.ultraThinMaterial, in: Capsule())
        }
        .opacity(0.7)
        .padding(.trailing, 12)
        .padding(.bottom, 92)
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

/// Chỉ iOS 26 có thanh phụ trên tab bar; máy cũ hơn không có dải này (các lối ghi
/// trong từng tab vẫn đủ).
private struct QuickLogBar: ViewModifier {
  /// Một màn có ô nhập riêng đang mở (`hidesQuickLog()`).
  var hidden = false
  /// Mở Koa Coach (ASCND Intelligence); `nil` khi AI chưa có trên máy chủ.
  var askCoach: (() -> Void)?
  let open: (DeepLink.Screen) -> Void
  @State private var picking = false
  /// Màn chọn trong bảng — mở sau khi bảng đóng hẳn (hai sheet không chồng nhau).
  @State private var chosen: DeepLink.Screen?

  func body(content: Content) -> some View {
    if #available(iOS 26, *) {
      // 26.1+ tắt được thanh phụ mà không dựng lại TabView (đổi nhánh modifier
      // thì mất vị trí điều hướng của các tab); 26.0 giữ thanh như cũ.
      Group {
        if #available(iOS 26.1, *) {
          content.tabViewBottomAccessory(isEnabled: !hidden) { QuickLogAccessory(askCoach: askCoach) { picking = true } }
        } else {
          content.tabViewBottomAccessory { QuickLogAccessory(askCoach: askCoach) { picking = true } }
        }
      }
      .tabBarMinimizeBehavior(.onScrollDown)
      .modifier(sheet)
    } else {
      // iOS 18–25 (15/10, chủ dự án: "làm nút + cho máy cũ luôn"): không có thanh
      // phụ — một nút "+" tròn nổi ở góc phải, ngay trên thanh tab, mở cùng bảng.
      content
        .overlay(alignment: .bottomTrailing) {
          if !hidden { plusButton }
        }
        .modifier(sheet)
    }
  }

  private var plusButton: some View {
    Button { picking = true } label: {
      Image(systemName: "plus")
        .font(.system(size: 22, weight: .bold))
        .foregroundStyle(DS.Color.background.swiftUI)
        .frame(width: 56, height: 56)
        .background(DS.Color.foreground.swiftUI, in: Circle())
        .shadow(color: .black.opacity(0.2), radius: 10, y: 4)
    }
    .buttonStyle(.plain)
    .padding(.trailing, DS.Spacing.md)
    .padding(.bottom, 64)
    .accessibilityLabel(Text("quicklog.title"))
  }

  private var sheet: QuickLogSheetHost {
    QuickLogSheetHost(picking: $picking, chosen: $chosen, askCoach: askCoach, open: open)
  }
}

/// Đếm các màn đang ẩn dải Ghi nhanh (15/10, chủ dự án: không để Ghi nhanh trong
/// chat AI — hai ô nhập chồng nhau ở đáy). Đếm, không cờ: màn nhắn tin đẩy lên
/// trên Koa Coach vẫn giữ thanh ẩn khi một trong hai rời đi.
@MainActor @Observable
final class QuickLogVisibility {
  fileprivate(set) var hiders = 0
  var hidden: Bool { hiders > 0 }
}

private struct HidesQuickLog: ViewModifier {
  @Environment(QuickLogVisibility.self) private var visibility: QuickLogVisibility?
  @State private var counted = false

  func body(content: Content) -> some View {
    content
      .onAppear {
        guard let visibility, !counted else { return }
        counted = true
        visibility.hiders += 1
      }
      .onDisappear {
        guard let visibility, counted else { return }
        counted = false
        visibility.hiders = max(0, visibility.hiders - 1)
      }
  }
}

extension View {
  /// Ẩn dải Ghi nhanh khi màn này đang trên màn — cho màn có ô nhập riêng ở đáy.
  func hidesQuickLog() -> some View { modifier(HidesQuickLog()) }
}

/// Bảng 5 ô của "Ghi nhanh" — chung cho thanh phụ (iOS 26) và nút nổi (máy cũ).
private struct QuickLogSheetHost: ViewModifier {
  @Binding var picking: Bool
  @Binding var chosen: DeepLink.Screen?
  let askCoach: (() -> Void)?
  let open: (DeepLink.Screen) -> Void
  /// "Hỏi Koa Coach" đã chạm — mở sau khi bảng đóng hẳn, như `chosen`.
  @State private var coachChosen = false

  func body(content: Content) -> some View {
    content.sheet(isPresented: $picking, onDismiss: {
      if let chosen { open(chosen) }
      if coachChosen { askCoach?() }
      chosen = nil
      coachChosen = false
    }) {
      QuickLogSheet(
        pick: {
          chosen = $0
          picking = false
          Telemetry.capture(.quickLogPick, ["target": QuickLogSheet.telemetryName($0)])
        },
        askCoach: askCoach.map { _ in
          {
            coachChosen = true
            picking = false
            Telemetry.capture(.quickLogPick, ["target": "coach"])
          }
        },
        close: { picking = false }
      )
      .onAppear { Telemetry.capture(.quickLogOpened) }
        .presentationDragIndicator(.visible)
    }
  }
}

/// Dải "Ghi nhanh" trên thanh tab: chạm mở bảng Bữa ăn · Nước · Giấc ngủ · Cân nặng ·
/// Buổi tập. (Một `Menu` trong thanh phụ không mở được bằng chạm — dùng nút + bảng.)
@available(iOS 26, *)
private struct QuickLogAccessory: View {
  /// Nút ASCND Intelligence ở đầu phải: chạm thẳng vào Koa Coach (15/10, chủ dự
  /// án: "thêm nút AI vào ô ghi nhanh để người dùng đỡ phải đi tìm").
  var askCoach: (() -> Void)?
  let tap: () -> Void
  @Environment(\.tabViewBottomAccessoryPlacement) private var placement

  var body: some View {
    HStack(spacing: 0) {
      log
      if let askCoach {
        Button {
          Telemetry.capture(.quickLogPick, ["target": "coach"])
          askCoach()
        } label: {
          IntelligenceMark(size: 18)
            .frame(width: 34, height: 34)
            .background(Intelligence.wash, in: Circle())
            .padding(.trailing, placement == .inline ? 6 : 10)
            .padding(.leading, 4)
            .frame(maxHeight: .infinity)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(Text("quicklog.coach"))
      }
    }
  }

  private var log: some View {
    Button(action: tap) {
      HStack(spacing: 8) {
        // Nút đặc tương phản cao — nền kính của thanh phụ lộ nội dung phía sau.
        Image(systemName: "plus")
          .font(.system(size: 13, weight: .bold))
          .foregroundStyle(DS.Color.background.swiftUI)
          .frame(width: 26, height: 26)
          .background(DS.Color.foreground.swiftUI, in: Circle())
        if placement != .inline {
          Text("quicklog.title").font(.system(size: 15, weight: .bold))
            .foregroundStyle(DS.Color.foreground.swiftUI)
          Spacer(minLength: 0)
          Text("quicklog.hint").font(.system(size: 13))
            .foregroundStyle(DS.Color.mutedForeground.swiftUI)
            .lineLimit(1)
        }
      }
      .padding(.leading, 16)
      .padding(.trailing, askCoach == nil ? 16 : 6)
      // Thu gọn (inline) thanh hẹp: không giãn hết bề ngang, để nút AI còn chỗ.
      .frame(maxWidth: placement == .inline ? nil : .infinity, maxHeight: .infinity, alignment: .leading)
      .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
    .accessibilityLabel(Text("quicklog.title"))
  }
}

/// Bảng chọn của "Ghi nhanh": năm ô lớn, chạm là mở đúng màn ghi.
private struct QuickLogSheet: View {
  let pick: (DeepLink.Screen) -> Void
  /// "Hỏi Koa Coach" — `nil` khi AI chưa có trên máy chủ (hàng ẩn).
  var askCoach: (() -> Void)?
  /// Đóng bảng (sau khi "Ăn lại" đã ghi xong).
  let close: () -> Void
  @Environment(AppServices.self) private var services
  /// "Ăn lại" (15/10, audit giữ chân — ghi bữa quá nhiều bước): sổ ghi bữa của bữa
  /// hiện tại, chỉ để đọc bữa gần đây và ghi lại một bữa bằng một chạm.
  @State private var logger: MealLogger?
  @State private var logged: String?

  private var items: [(LocalizedStringKey, String, Color, DeepLink.Screen)] {
    [
      ("quicklog.meal", "fork.knife", DS.Color.metricOrangeGraphic.swiftUI, .logMeal(date: nil, meal: nil)),
      ("quicklog.water", "drop.fill", DS.Color.metricCyan.swiftUI, .water),
      ("quicklog.sleep", "moon.fill", DS.Color.metricPurple.swiftUI, .logSleep),
      ("quicklog.weight", "scalemass.fill", DS.Color.foreground.swiftUI, .logWeight),
      ("quicklog.workout", "dumbbell.fill", DS.Color.metricRose.swiftUI, .logWorkout),
    ]
  }

  /// Tên màn cho sự kiện `quick_log_pick` — chỉ loại màn, không dữ liệu.
  static func telemetryName(_ s: DeepLink.Screen) -> String {
    switch s {
    case .logMeal: "meal"
    case .water: "water"
    case .logSleep: "sleep"
    case .logWeight: "weight"
    case .logWorkout: "workout"
    default: "other"
    }
  }

  private var recentMeals: [MealLog.RecentMeal] { Array((logger?.recentMeals ?? []).prefix(3)) }

  var body: some View {
    VStack(alignment: .leading, spacing: DS.Spacing.md) {
      Text("quicklog.title").font(.system(size: 20, weight: .bold))
        .accessibilityAddTraits(.isHeader)
      if !recentMeals.isEmpty {
        again
      }
      HStack(spacing: 8) {
        ForEach(items.indices, id: \.self) { i in
          let item = items[i]
          Button { pick(item.3) } label: {
            VStack(spacing: 8) {
              Image(systemName: item.1)
                .font(.system(size: 20, weight: .semibold))
                .foregroundStyle(item.2)
                .frame(width: 48, height: 48)
                .background(item.2.opacity(0.14), in: Circle())
              Text(item.0).font(.system(size: 12, weight: .semibold))
                .foregroundStyle(DS.Color.foreground.swiftUI)
                .lineLimit(1).minimumScaleFactor(0.8)
            }
            .frame(maxWidth: .infinity, minHeight: 88)
            .contentShape(Rectangle())
          }
          .buttonStyle(.plain)
        }
      }
      if let askCoach { coachRow(askCoach) }
    }
    .padding(.horizontal, DS.Spacing.lg)
    .padding(.top, DS.Spacing.lg)
    .frame(maxHeight: .infinity, alignment: .top)
    .presentationDetents([.height((recentMeals.isEmpty ? 250 : 400) + (askCoach == nil ? 0 : 76))])
    .sensoryFeedback(.success, trigger: logged)
    .task {
      guard logger == nil, let userId = services.session.session?.userId else { return }
      let l = services.makeMealLogger(userId: userId, date: nil, mealType: nil)
      logger = l
      await l?.loadRecents()
    }
  }

  /// Hàng "Hỏi Koa Coach": cùng một bảng với các lối ghi — máy cũ (không có thanh
  /// phụ) cũng tới được coach từ nút "+".
  private func coachRow(_ ask: @escaping () -> Void) -> some View {
    Button(action: ask) {
      HStack(spacing: 12) {
        IntelligenceMark(size: 22)
          .frame(width: 44, height: 44)
          .background(Intelligence.wash, in: Circle())
        VStack(alignment: .leading, spacing: 3) {
          Text("quicklog.coach").font(.system(size: 15, weight: .bold))
            .foregroundStyle(DS.Color.foreground.swiftUI)
          IntelligenceBadge(size: 11, mark: false)
        }
        Spacer(minLength: 0)
        Image(systemName: "chevron.right").font(.system(size: 13, weight: .semibold))
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)
      }
      .padding(12)
      .dsCard(radius: 18)
      .contentShape(Rectangle())
    }
    .buttonStyle(TodayPressStyle())
    .accessibilityElement(children: .combine)
  }

  /// "Ăn lại": bữa gần đây — một chạm ghi đúng các món và khẩu phần ấy cho hôm nay.
  private var again: some View {
    VStack(alignment: .leading, spacing: DS.Spacing.xs) {
      Text("quicklog.again")
        .font(.system(size: 13, weight: .semibold))
        .foregroundStyle(DS.Color.mutedForeground.swiftUI)
        .accessibilityAddTraits(.isHeader)
      ScrollView(.horizontal, showsIndicators: false) {
        HStack(spacing: DS.Spacing.sm) {
          ForEach(recentMeals) { m in
            Button { Task { await relog(m) } } label: {
              VStack(alignment: .leading, spacing: 4) {
                HStack(spacing: 6) {
                  Text(verbatim: DiaryView.mealName(m.mealType)).font(.system(size: 14, weight: .bold))
                  Spacer(minLength: 0)
                  if logged == m.id {
                    Image(systemName: "checkmark.circle.fill").foregroundStyle(DS.Color.readinessGreen.swiftUI)
                  } else {
                    Image(systemName: "arrow.counterclockwise").font(.system(size: 12, weight: .bold))
                      .foregroundStyle(DS.Color.mutedForeground.swiftUI)
                  }
                }
                Text(verbatim: m.foods.map { $0.food.name }.joined(separator: ", "))
                  .font(.system(size: 13))
                  .foregroundStyle(DS.Color.foreground.swiftUI)
                  .lineLimit(2, reservesSpace: true)
                  .multilineTextAlignment(.leading)
                Text(verbatim: "\(DiaryView.whole(m.kcal)) kcal")
                  .font(.system(size: 12, weight: .semibold).monospacedDigit())
                  .foregroundStyle(DS.Color.metricOrangeGraphic.swiftUI)
              }
              .padding(12)
              .frame(width: 210, alignment: .leading)
              .dsCard(radius: 18)
              .contentShape(Rectangle())
            }
            .buttonStyle(TodayPressStyle())
            .disabled(logged != nil || (logger?.saving ?? false))
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(
              Text("quicklog.again.a11y \(DiaryView.mealName(m.mealType)) \(DiaryView.whole(m.kcal))"))
            .accessibilityAddTraits(.isButton)
          }
        }
        .padding(.vertical, 6)
        .padding(.horizontal, 2)
      }
    }
  }

  private func relog(_ m: MealLog.RecentMeal) async {
    guard let logger else { return }
    logger.repeatMeal(m)
    if case .queued = await logger.save(online: services.sync.online) {
      logged = m.id
      Telemetry.capture(.eatAgainUsed)
      AccessibilityNotification.Announcement(String(localized: "quicklog.again.done")).post()
      try? await Task.sleep(for: .milliseconds(700))
      close()
    }
  }
}
