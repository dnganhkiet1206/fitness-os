import ASCNDCore
import ASCNDDesignSystem
import SwiftUI

/// Bốn khu vực (GĐ3, Kiệt duyệt 21/10, mock `gd3-four-areas.html`; PRODUCT_DECISION_V1):
/// Hôm nay · Tập luyện · Dinh dưỡng · Tiến bộ — theo vòng lõi, khác 5 tab của RN
/// (`app-tabs.tsx`). Cộng đồng bỏ khỏi thanh tab (mở từ Tiến bộ); vòng "Trợ lý"
/// (vai `.search`) gộp vào Tiến bộ.
///
/// `progress` giữ giá trị lưu `"assistant"`: tab đã lưu của bản cũ mở đúng chỗ.
/// Giá trị lưu `"community"` không còn → `@SceneStorage` về mặc định (Hôm nay).
enum AppTab: String, Hashable {
  case today, workouts, nutrition
  case progress = "assistant"
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
  /// "Hỏi Koa Coach" trong Ghi nhanh → tab Tiến bộ mở thẳng màn chat.
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
      Tab("tab.workouts", systemImage: "dumbbell", value: AppTab.workouts) {
        #if DEBUG
          // Bản Debug: màn thật + các màn thử (Lab) cho Kiệt kiểm trên máy.
          DebugWorkoutsTab(launch: $launchWorkout)
        #else
          WorkoutsTab(launch: $launchWorkout)
        #endif
      }
      .accessibilityHint(Text(String(localized: "tab.workouts.hint")))
      Tab("tab.nutrition", systemImage: "fork.knife", value: AppTab.nutrition) {
        NutritionTab()
      }
      .accessibilityHint(Text(String(localized: "tab.nutrition.hint")))
      Tab("tab.progress", systemImage: "chart.line.uptrend.xyaxis", value: AppTab.progress) {
        // Tiến bộ = Trợ lý cũ + Koa / Gains + Cơ thể + huy chương (GĐ3).
        AssistantTab(openCoach: $openCoach)
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
          selection = .progress
          openCoach = true
        } : nil
    ) { linked = $0 })
    .environment(quickLog)
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
  /// "Kể cho Koa" (18/10): nút ASCND Intelligence của thanh mở màn ghi bằng lời.
  @State private var telling = false
  @Environment(AppServices.self) private var services
  /// Màn chọn trong bảng — mở sau khi bảng đóng hẳn (hai sheet không chồng nhau).
  @State private var chosen: DeepLink.Screen?

  func body(content: Content) -> some View {
    if #available(iOS 26, *) {
      // 26.1+ tắt được thanh phụ mà không dựng lại TabView (đổi nhánh modifier
      // thì mất vị trí điều hướng của các tab); 26.0 giữ thanh như cũ.
      Group {
        if #available(iOS 26.1, *) {
          content.tabViewBottomAccessory(isEnabled: !hidden) { QuickLogAccessory(tell: askCoach ?? { telling = true }, coach: askCoach != nil) { picking = true } }
        } else {
          content.tabViewBottomAccessory { QuickLogAccessory(tell: askCoach ?? { telling = true }, coach: askCoach != nil) { picking = true } }
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
          Text("quicklog.title").font(.system(size: 15, weight: .bold))
            .foregroundStyle(DS.Color.foreground.swiftUI)
          Spacer(minLength: 0)
          Text("quicklog.hint").font(.system(size: 13))
            .foregroundStyle(DS.Color.mutedForeground.swiftUI)
            .lineLimit(1)
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
  }
}

/// Bảng chọn của "Ghi nhanh": năm ô lớn, chạm là mở đúng màn ghi.
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

  /// Bữa có năng lượng thật — bữa chỉ có nước / đồ uống 0 kcal ("Purified Water ·
  /// 0 kcal") không phải "bữa để ăn lại" (16/10, ảnh chủ dự án gửi).
  private var recentMeals: [MealLog.RecentMeal] {
    Array((logger?.recentMeals ?? []).filter { $0.kcal > 0 }.prefix(3))
  }

  var body: some View {
    VStack(alignment: .leading, spacing: DS.Spacing.md) {
      Text("quicklog.title").font(.system(size: 20, weight: .bold))
        .accessibilityAddTraits(.isHeader)
      // "Ghi hôm nay" đứng đầu bảng (19/10): một chạm ghi cả ngày, nói hoặc gõ.
      tellRow
      if !yesterday.isEmpty || copiedYesterday {
        YesterdayMealsCard(meals: yesterday, done: copiedYesterday, busy: logger?.saving ?? false) {
          Task { await copyYesterday() }
        }
      }
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
    .presentationDetents([.height(
      (recentMeals.isEmpty ? 250 : 400) + 76 + (askCoach == nil ? 0 : 76) + (yesterday.isEmpty && !copiedYesterday ? 0 : 84))])
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
              .quickLogCard()
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
        .padding(.horizontal, DS.Spacing.lg)
      }
      // Dải cuộn chạy tràn tới mép bảng và không cắt bóng thẻ (16/10: thẻ thứ hai bị
      // cắt cứng ở lề, lộ một khối xám sau thẻ).
      .scrollClipDisabled()
      .padding(.horizontal, -DS.Spacing.lg)
    }
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
