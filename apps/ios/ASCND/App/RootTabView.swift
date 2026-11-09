import ASCNDCore
import ASCNDDesignSystem
import SwiftUI

/// Bốn khu vực (GĐ3, Kiệt duyệt 21/10, mock `gd3-four-areas.html`; PRODUCT_DECISION_V1):
/// Hôm nay · Tập luyện · Dinh dưỡng · Tiến bộ — theo vòng lõi, khác 5 tab của RN
/// (`app-tabs.tsx`). Cộng đồng bỏ khỏi thanh tab (mở từ Tiến bộ); vòng "Trợ lý"
/// (vai `.search`) gộp vào Tiến bộ.
///
/// `progress` giữ giá trị `"assistant"` (link / dữ liệu cũ).
enum AppTab: String, Hashable {
  case today, workouts, nutrition
  case progress = "assistant"
}

struct RootTabView: View {
  /// Mở app luôn ở Hôm nay (Kiệt 22/10: "app vừa mở tự chạy sang tab Tiến bộ" là lỗi) —
  /// không còn nhớ tab cuối qua các lần mở (`@SceneStorage`).
  @State private var selection: AppTab = .today
  @Environment(AppServices.self) private var services
  /// Link `ascnd://` chờ mở (#527 deep link lát 2).
  @Environment(DeepLinkInbox.self) private var links: DeepLinkInbox?
  @State private var linked: DeepLink.Screen?
  /// "Bắt đầu" ở Hôm nay → tab Tập luyện mở thẳng màn tập.
  @State private var launchWorkout = false
  /// Màn có ô nhập riêng (Koa Coach, nhắn tin) ẩn dải Ghi nhanh khi đang mở.
  @State private var quickLog = QuickLogVisibility()
  /// "Hỏi Koa Coach" trong Ghi nhanh → tab Tiến bộ mở thẳng màn chat.
  @State private var openCoach = false
  @State private var openCommunity = false
  /// Tab đã mở Koa Coach (Hôm nay, Dinh dưỡng…): đóng chat thì về lại đó, không
  /// đứng ở Tiến bộ (Kiệt 21/10). `nil` khi chat mở từ chính Tiến bộ.
  @State private var coachReturn: AppTab?

  var body: some View {
    TabView(selection: $selection) {
      Tab("tab.today", systemImage: "house", value: AppTab.today) {
        TodayTab(
          onStartWorkout: {
            selection = .workouts
            launchWorkout = true
          },
          onLogWorkout: { logWorkoutInTraining() })
      }
      .accessibilityHint(Text(String(localized: "tab.today.hint")))
      Tab("tab.workouts", systemImage: "dumbbell", value: AppTab.workouts) {
        #if DEBUG
          // Bản Debug: màn thật + các màn thử (Lab) cho Kiệt kiểm trên máy.
          DebugWorkoutsTab(launch: $launchWorkout) { selection = .today }
        #else
          WorkoutsTab(launch: $launchWorkout) { selection = .today }
        #endif
      }
      .accessibilityHint(Text(String(localized: "tab.workouts.hint")))
      Tab("tab.nutrition", systemImage: "fork.knife", value: AppTab.nutrition) {
        NutritionTab()
      }
      .accessibilityHint(Text(String(localized: "tab.nutrition.hint")))
      Tab("tab.progress", systemImage: "chart.line.uptrend.xyaxis", value: AppTab.progress) {
        // Tiến bộ = Trợ lý cũ + Koa / Gains + Cơ thể + huy chương (GĐ3).
        AssistantTab(openCoach: $openCoach, openCommunity: $openCommunity) {
          guard let back = coachReturn else { return }
          coachReturn = nil
          selection = back
        }
      }
      .accessibilityHint(Text(String(localized: "tab.progress.hint")))
    }
    // Ghi nhanh (15/10, chủ dự án chọn "thanh phụ trên tab bar"): một dải kính
    // trên thanh tab ở mọi tab, thu gọn khi cuộn; mở các màn ghi qua cùng đường
    // với deep link (`DeepLinkScreen`) nên dữ liệu không tách đôi.
    .modifier(QuickLogBar(
      hidden: quickLog.hidden,
      // Chỉ khi các function AI có trên máy chủ (`probeAI`), như mọi lối vào AI khác.
      askCoach: services.aiDeployed == true
        ? {
          openCoachFromHere()
        } : nil
    ) { screen in
      // Ô Buổi tập của Ghi nhanh = buổi theo lịch hôm nay (Kiệt 22/10), như ở Hôm nay.
      if screen == .logWorkout { openTodaysSession() } else { linked = screen }
    })
    .environment(quickLog)
    .onChange(of: services.sessionRequest) { _, _ in openTodaysSession() }
    // "Ghi món khác" trên thông báo nhắc bữa (Kiệt 01/11): mở màn ghi bữa như Ghi nhanh.
    .onChange(of: services.mealLogRequest) { _, _ in linked = .logMeal(date: nil, meal: nil) }
    .onChange(of: services.coachRequest) { _, _ in
      guard services.aiDeployed == true else { return }
      openCoachFromHere()
    }
    // Tự đổi tab khi chat đang mở → không còn "về lại" nữa.
    .onChange(of: selection) { _, tab in
      if tab != .progress { coachReturn = nil }
    }
    // Ăn mừng huy chương / thử thách (#527, `CelebrationHost` ở layout gốc của
    // RN): trên mọi tab, phủ cả thanh tab.
    .overlay { CelebrationHost(queue: services.celebrations) }
    // Koa ló lên ở mọi tab khi xu của việc vừa xong tự về (đợt 2A).
    .overlay { KoaPeekHost(tab: selection) }
    // Link tới một màn: mở tab của nó, rồi màn ấy thành sheet. `initial`: link
    // đến lúc chưa đăng nhập được mở ngay khi cây của phiên dựng xong.
    .onChange(of: links?.pending, initial: true) { _, _ in
      guard let target = links?.take() else { return }
      selection = AppTab(target.tab)
      if case .screen(let screen) = target { linked = screen }
      if target.tab == .community { openCommunity = true }
    }
    .sheet(
      isPresented: Binding(get: { linked != nil }, set: { if !$0 { linked = nil } })
    ) {
      if let linked { DeepLinkScreen(screen: linked) }
    }
  }

  /// Buổi theo lịch hôm nay: sang Tập luyện, mở buổi nếu hôm nay có (không có thì
  /// chỉ mở tab) — cùng đường với "Bắt đầu" ở Hôm nay.
  private func openTodaysSession() {
    selection = .workouts
    launchWorkout = true
  }

  /// Buổi phát sinh ngoài lịch: ghi tay, chỉ trong tab Tập luyện (Kiệt 22/10).
  /// Mở Koa Coach (ở tab Tiến bộ) và nhớ tab đang đứng để đóng chat là về lại.
  private func openCoachFromHere() {
    coachReturn = selection == .progress ? nil : selection
    selection = .progress
    openCoach = true
  }

  private func logWorkoutInTraining() {
    selection = .workouts
    linked = .logWorkout
  }
}

#if DEBUG
  /// Tab Tập luyện của bản Debug: màn thật (như Release) hoặc Lab. Nhớ lựa
  /// chọn qua các lần mở app.
  private struct DebugWorkoutsTab: View {
    @Binding var launch: Bool
    let onBackToToday: () -> Void
    @AppStorage("lab.showsLab") private var showsLab = false

    /// Công tắc App / Lab là một nút nhỏ ở góc (14/10): dải chọn trên cùng che
    /// mất đầu trang của tab khi soát giao diện.
    var body: some View {
      Group {
        if showsLab { LabsView() } else { WorkoutsTab(launch: $launch, onBackToToday: onBackToToday) }
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
  /// "Kể cho Koa" (18/10): nút ASCND Intelligence của thanh mở màn ghi bằng lời.
  @State private var telling = false
  @Environment(AppServices.self) private var services
  /// Sáng / tối của app, đọc NGOÀI thanh phụ: kính iOS 26 đổi môi trường bên trong
  /// thanh theo nội dung phía sau (ảnh tối → "tối") trong khi kính vẫn vẽ sáng — chữ
  /// trắng trên kính sáng ở giao diện sáng (soát 01/11). Ép lại đúng chế độ của app.
  @Environment(\.colorScheme) private var appScheme
  /// Màn chọn trong bảng — mở sau khi bảng đóng hẳn (hai sheet không chồng nhau).
  @State private var chosen: DeepLink.Screen?

  func body(content: Content) -> some View {
    if #available(iOS 26, *) {
      // 26.1+ tắt được thanh phụ mà không dựng lại TabView (đổi nhánh modifier
      // thì mất vị trí điều hướng của các tab); 26.0 giữ thanh như cũ.
      Group {
        if #available(iOS 26.1, *) {
          content.tabViewBottomAccessory(isEnabled: !hidden) { QuickLogAccessory(tell: askCoach ?? { telling = true }, coach: askCoach != nil) { picking = true }.environment(\.colorScheme, appScheme) }
        } else {
          content.tabViewBottomAccessory { QuickLogAccessory(tell: askCoach ?? { telling = true }, coach: askCoach != nil) { picking = true }.environment(\.colorScheme, appScheme) }
        }
      }
      .tabBarMinimizeBehavior(.onScrollDown)
      .modifier(sheet)
      .modifier(tellSheet)
    } else {
      // iOS 18–25 (15/10, chủ dự án: "làm nút + cho máy cũ luôn"): không có thanh
      // phụ — một nút "+" tròn nổi ở góc phải, ngay trên thanh tab, mở cùng bảng.
      content
        .overlay(alignment: .bottomTrailing) {
          if !hidden { plusButton }
        }
        .modifier(sheet)
        .modifier(tellSheet)
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
    QuickLogSheetHost(picking: $picking, chosen: $chosen, askCoach: askCoach, tell: { telling = true }, open: open)
  }

  private var tellSheet: TellKoaHost { TellKoaHost(telling: $telling) }
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

/// Màn "Kể cho Koa" — mở từ nút ASCND Intelligence của thanh Ghi nhanh, hay hàng
/// "Kể cho Koa" trong bảng (máy chưa có thanh phụ).
private struct TellKoaHost: ViewModifier {
  @Binding var telling: Bool
  @Environment(AppServices.self) private var services

  func body(content: Content) -> some View {
    content.sheet(isPresented: $telling) {
      if let userId = services.session.session?.userId {
        TellKoaSheet(userId: userId)
          .onAppear { Telemetry.capture(.quickLogPick, ["target": "tell_koa"]) }
      }
    }
  }
}

/// Bảng 5 ô của "Ghi nhanh" — chung cho thanh phụ (iOS 26) và nút nổi (máy cũ).
private struct QuickLogSheetHost: ViewModifier {
  @Binding var picking: Bool
  @Binding var chosen: DeepLink.Screen?
  let askCoach: (() -> Void)?
  let tell: () -> Void
  let open: (DeepLink.Screen) -> Void
  /// "Hỏi Koa Coach" đã chạm — mở sau khi bảng đóng hẳn, như `chosen`.
  @State private var coachChosen = false
  @State private var tellChosen = false

  func body(content: Content) -> some View {
    content.sheet(isPresented: $picking, onDismiss: {
      if let chosen { open(chosen) }
      if coachChosen { askCoach?() }
      if tellChosen { tell() }
      chosen = nil
      coachChosen = false
      tellChosen = false
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
        tell: {
          tellChosen = true
          picking = false
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
  /// Nút ASCND Intelligence ở đầu phải (18/10, chủ dự án): mở "Kể cho Koa" — gõ
  /// hay nói là ghi. Koa Coach vẫn ở bảng "+" và tab Trợ lý.
  /// 19/10 (chủ dự án): nút ASCND Intelligence mở chat Koa Coach; "Ghi hôm nay"
  /// nằm trong bảng Ghi nhanh. `coach == false` (AI chưa triển khai): mở "Ghi hôm nay".
  let tell: () -> Void
  var coach = false
  let tap: () -> Void
  @Environment(\.tabViewBottomAccessoryPlacement) private var placement

  var body: some View {
    HStack(spacing: 0) {
      log
      // Thu gọn: "+" ở góc trái, AI ở góc phải (16/10, chủ dự án: tách ra 2 góc).
      if placement == .inline { Spacer(minLength: 0) }
      Group {
        Button {
          tell()
        } label: {
          IntelligenceMark(size: 18)
            .frame(width: 34, height: 34)
            .background(Intelligence.wash, in: Circle())
            .padding(.trailing, placement == .inline ? 8 : 10)
            .padding(.leading, 4)
            .frame(maxHeight: .infinity)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(Text(coach ? "quicklog.coach" : "tellkoa.title"))
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
          // Chỉ "+ Quick log". Dòng "Bữa · Nước · Ngủ · Cân" trông như từng nút,
          // và trên tab Dinh dưỡng đụng ô "Bạn vừa ăn gì?". Thanh vẫn ở mọi tab.
          Text("quicklog.title").font(.system(size: 15, weight: .bold))
            .foregroundStyle(DS.Color.foreground.swiftUI)
          Spacer(minLength: 0)
        }
      }
      .padding(.leading, placement == .inline ? 8 : 16)
      .padding(.trailing, 6)
      // Thu gọn (inline) thanh hẹp: không giãn hết bề ngang, để nút AI còn chỗ.
      .frame(maxWidth: placement == .inline ? nil : .infinity, maxHeight: .infinity, alignment: .leading)
      .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
    .accessibilityLabel(Text("quicklog.title"))
    .accessibilityIdentifier("quicklog.bar")
  }
}

/// Bảng "Ghi nhanh": một danh sách hàng (Buổi tập, Bữa, Nước, Ngủ, Cân). "Ăn lại"
/// cùng kiểu hàng khi có bữa gần đây.
private struct QuickLogSheet: View {
  let pick: (DeepLink.Screen) -> Void
  /// "Hỏi Koa Coach" — `nil` khi AI chưa có trên máy chủ (hàng ẩn).
  var askCoach: (() -> Void)?
  /// "Kể cho Koa" — ghi bằng lời.
  let tell: () -> Void
  /// Đóng bảng (sau khi "Ăn lại" đã ghi xong).
  let close: () -> Void
  @Environment(AppServices.self) private var services
  /// "Ăn lại" (15/10, audit giữ chân — ghi bữa quá nhiều bước): sổ ghi bữa của bữa
  /// hiện tại, chỉ để đọc bữa gần đây và ghi lại một bữa bằng một chạm.
  @State private var logger: MealLogger?
  /// "Ăn như hôm qua" đã chép: các bữa vừa chép.
  @State private var copiedMeals: [MealLog.RecentMeal]?
  @State private var logged: String?

  /// Việc ghi chính, một kiểu hàng. Tập trước — đây là app tập.
  private var items: [(LocalizedStringKey, String, Color, DeepLink.Screen, String)] {
    [
      ("quicklog.workout", "dumbbell.fill", DS.Color.metricRose.swiftUI, .logWorkout, "workout"),
      ("quicklog.meal", "fork.knife", DS.Color.metricOrangeGraphic.swiftUI, .logMeal(date: nil, meal: nil), "meal"),
      ("quicklog.water", "drop.fill", DS.Color.metricCyan.swiftUI, .water, "water"),
      ("quicklog.sleep", "moon.fill", DS.Color.metricPurple.swiftUI, .logSleep, "sleep"),
      ("quicklog.weight", "scalemass.fill", DS.Color.foreground.swiftUI, .logWeight, "weight"),
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

  /// Bữa có năng lượng thật — bữa chỉ có nước / đồ uống 0 kcal ("Purified Water ·
  /// 0 kcal") không phải "bữa để ăn lại" (16/10, ảnh chủ dự án gửi).
  private var recentMeals: [MealLog.RecentMeal] {
    Array((logger?.recentMeals ?? []).filter { $0.kcal > 0 }.prefix(3))
  }

  var body: some View {
    VStack(alignment: .leading, spacing: 0) {
      // Tiêu đề nằm ngoài vùng cuộn để kéo từ đây đóng bảng (không chỉ cuộn danh sách).
      Text("quicklog.title").font(.system(size: 20, weight: .bold))
        .accessibilityAddTraits(.isHeader)
        .accessibilityIdentifier("quicklog.sheet")
        .padding(.horizontal, DS.Spacing.lg)
        .padding(.top, DS.Spacing.lg)
        .padding(.bottom, DS.Spacing.sm)
      ScrollView {
        VStack(alignment: .leading, spacing: DS.Spacing.md) {
          actionGroup
          if showsRepeats { repeats }
          // "Ghi hôm nay" và coach: cùng hàng icon + chữ, dưới các việc ghi.
          tellRow
          if let askCoach { coachRow(askCoach) }
        }
        .padding(.horizontal, DS.Spacing.lg)
        .padding(.bottom, DS.Spacing.lg)
      }
    }
    .presentationDetents([.medium, .large])
    // Nền đặc màu trang (16/10, chủ dự án: "thẻ khó nhìn"): bảng kính trong để lộ
    // trang Hôm nay phía sau, thẻ kính đặt lên đó chìm mất mép.
    .presentationBackground(DS.Color.background.swiftUI)
    .sensoryFeedback(.success, trigger: logged)
    .task {
      guard logger == nil, let userId = services.session.session?.userId else { return }
      let l = services.makeMealLogger(userId: userId, date: nil, mealType: nil)
      logger = l
      await l?.loadRecents()
    }
  }

  /// Năm việc ghi, một danh sách. Không trộn thẻ dọc với nút tròn.
  private var actionGroup: some View {
    VStack(spacing: 0) {
      ForEach(items.indices, id: \.self) { i in
        VStack(spacing: 0) {
          if i > 0 { Divider().padding(.leading, 60).opacity(0.6) }
          let item = items[i]
          logRow(
            symbol: item.1, tint: item.2, title: String(localized: item.0), subtitle: nil, trailing: nil,
            id: "quicklog.\(item.4)"
          ) { pick(item.3) }
        }
      }
    }
    .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
    .quickLogCard()
  }

  private var showsRepeats: Bool { !yesterday.isEmpty || copiedYesterday || !recentMeals.isEmpty }

  /// "Ăn lại" cùng kiểu hàng với việc ghi: tên bữa, món một dòng, kcal bên phải.
  private var repeats: some View {
    VStack(alignment: .leading, spacing: DS.Spacing.xs) {
      Text("quicklog.again")
        .font(DS.TextStyle.caption.weight(.semibold))
        .foregroundStyle(DS.Color.mutedForeground.swiftUI)
        .accessibilityAddTraits(.isHeader)
      VStack(spacing: 0) {
        if !yesterday.isEmpty || copiedYesterday {
          logRow(
            symbol: copiedYesterday ? "checkmark" : "arrow.uturn.backward",
            tint: copiedYesterday ? DS.Color.readinessGreen.swiftUI : DS.Color.metricOrangeGraphic.swiftUI,
            title: String(localized: "meal.yesterday.title"),
            subtitle: YesterdayMealsCard.names(yesterday),
            trailing: YesterdayMealsCard.kcal(yesterday),
            id: "quicklog.yesterday"
          ) { Task { await copyYesterday() } }
          .disabled(copiedYesterday || (logger?.saving ?? false))
        }
        ForEach(Array(recentMeals.enumerated()), id: \.element.id) { i, m in
          VStack(spacing: 0) {
            if i > 0 || !yesterday.isEmpty || copiedYesterday {
              Divider().padding(.leading, 60).opacity(0.6)
            }
            logRow(
              symbol: logged == m.id ? "checkmark" : "arrow.counterclockwise",
              tint: logged == m.id ? DS.Color.readinessGreen.swiftUI : DS.Color.metricOrangeGraphic.swiftUI,
              title: DiaryView.mealName(m.mealType),
              subtitle: m.foods.map { $0.food.name }.joined(separator: ", "),
              trailing: "\(DiaryView.whole(m.kcal)) kcal",
              id: "quicklog.again.\(m.id)",
              label: Text("quicklog.again.a11y \(DiaryView.mealName(m.mealType)) \(DiaryView.whole(m.kcal))")
            ) { Task { await relog(m) } }
            .disabled(logged != nil || (logger?.saving ?? false))
          }
        }
      }
      .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
      .quickLogCard()
    }
  }

  private func logRow(
    symbol: String, tint: Color, title: String, subtitle: String?, trailing: String?, id: String,
    label: Text? = nil, action: @escaping () -> Void
  ) -> some View {
    Button(action: action) {
      HStack(spacing: 12) {
        Image(systemName: symbol)
          .font(.system(size: 16, weight: .semibold))
          .foregroundStyle(tint)
          .frame(width: 36, height: 36)
          .background(tint.opacity(0.14), in: Circle())
          .accessibilityHidden(true)
        VStack(alignment: .leading, spacing: 2) {
          Text(verbatim: title)
            .font(DS.TextStyle.headline)
            .foregroundStyle(DS.Color.foreground.swiftUI)
            .lineLimit(1)
            .minimumScaleFactor(0.8)
          if let subtitle, !subtitle.isEmpty {
            Text(verbatim: subtitle)
              .font(DS.TextStyle.caption)
              .foregroundStyle(DS.Color.mutedForeground.swiftUI)
              .lineLimit(1)
          }
        }
        Spacer(minLength: DS.Spacing.sm)
        if let trailing {
          Text(verbatim: trailing)
            .font(DS.TextStyle.footnote.monospacedDigit())
            .foregroundStyle(DS.Color.mutedForeground.swiftUI)
            .lineLimit(1)
        }
      }
      .padding(.horizontal, DS.Spacing.md)
      .frame(maxWidth: .infinity, minHeight: 52, alignment: .leading)
      .contentShape(Rectangle())
    }
    .buttonStyle(TodayPressStyle())
    .accessibilityIdentifier(id)
    .accessibilityLabel(label ?? Text(verbatim: title))
  }

  /// Hàng "Kể cho Koa": gõ hay nói cả ngày một lần.
  private var tellRow: some View {
    Button(action: tell) {
      HStack(spacing: 12) {
        Image(systemName: "mic.fill")
          .font(.system(size: 18, weight: .semibold))
          .foregroundStyle(DS.Color.foreground.swiftUI)
          .frame(width: 44, height: 44)
          .background(Intelligence.wash, in: Circle())
        VStack(alignment: .leading, spacing: 3) {
          Text("tellkoa.title").font(.system(size: 15, weight: .bold))
            .foregroundStyle(DS.Color.foreground.swiftUI)
          Text("tellkoa.row.hint").font(.system(size: 12))
            .foregroundStyle(DS.Color.mutedForeground.swiftUI)
        }
        Spacer(minLength: 0)
        Image(systemName: "chevron.right").font(.system(size: 13, weight: .semibold))
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)
      }
      .padding(12)
      .quickLogCard()
      .contentShape(Rectangle())
    }
    .buttonStyle(TodayPressStyle())
    .accessibilityElement(children: .combine)
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
      .quickLogCard()
      .contentShape(Rectangle())
    }
    .buttonStyle(TodayPressStyle())
    .accessibilityElement(children: .combine)
  }

  /// Bữa hôm qua để chép (giữ danh sách khi đã chép để thẻ còn hiện dấu tích).
  private var yesterday: [MealLog.RecentMeal] { copiedMeals ?? logger?.yesterdayMeals ?? [] }
  private var copiedYesterday: Bool { copiedMeals != nil }

  private func copyYesterday() async {
    guard let logger else { return }
    let meals = logger.yesterdayMeals
    if case .queued = await logger.copyYesterday(online: services.sync.online) {
      copiedMeals = meals
      Telemetry.capture(.eatLikeYesterday)
      AccessibilityNotification.Announcement(String(localized: "meal.yesterday.done")).post()
      try? await Task.sleep(for: .milliseconds(700))
      close()
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

private extension View {
  /// Thẻ trong bảng Ghi nhanh: nền thẻ đặc + viền mảnh + bóng nhẹ — tách rõ khỏi nền
  /// kem của bảng (thẻ kính `dsCard` lẫn vào bảng — 16/10, chủ dự án).
  func quickLogCard() -> some View {
    let shape = RoundedRectangle(cornerRadius: 18, style: .continuous)
    return self
      .background(DS.Color.card.swiftUI, in: shape)
      .overlay { shape.strokeBorder(DS.Color.foreground.swiftUI.opacity(0.08), lineWidth: 0.75) }
      .shadow(color: .black.opacity(0.05), radius: 6, y: 2)
  }
}
