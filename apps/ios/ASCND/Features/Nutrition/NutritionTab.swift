import ASCNDCore
import ASCNDDesignSystem
import SwiftUI

/// Tab Dinh dưỡng (#527 Phase 3) — `(tabs)/nutrition.tsx`, đúng thứ tự khối
/// của RN (đối chiếu: `docs/design/nutrition/RN-PARITY.md`):
/// - "Hôm nay": thẻ calo + macro (`NutritionCard`) với lối xu hướng 7 ngày
///   ngay dưới, "Ghi bữa" (`MealLogActions`: Tìm món / Nhập tay — ảnh và mã
///   vạch chưa port), Nước (`WaterWidget`), Thực phẩm bổ sung, "Bữa ăn hôm
///   nay" với lối "Ngày khác";
/// - "Kế hoạch ăn": kế hoạch rồi thư viện Thực phẩm (tìm / Của tôi / Gần đây).
///
/// Chất liệu chung với Hôm nay: kính trên nền giấy, một vầng sáng rất nhạt
/// màu bữa ăn ở đầu trang.
///
/// Sổ thuộc PHIÊN (`NutritionBooks`, dựng và đóng ở `SignedInScope`): thẻ, màn
/// và kế hoạch nhắc nhở cùng đọc một bản.
struct NutritionTab: View {
  /// Sổ của phiên (`SignedInScope`) — cùng sổ mà kế hoạch nhắc nhở đọc.
  @Environment(NutritionBooks.self) private var books: NutritionBooks?
  @Environment(AppServices.self) private var services: AppServices?
  /// Số hôm nay của thẻ calo; dựng khi biết người dùng, đọc lại mỗi lần tab hiện.
  @State private var today: NutritionTodayBook?
  /// Bữa của hôm nay (`DayMeals` của RN) — cùng sổ / cùng thẻ với màn Nhật ký.
  @State private var meals: MealDiaryBook?
  /// Kế hoạch ăn của phân đoạn thứ hai; dựng khi phân đoạn ấy mở lần đầu.
  @State private var plans: MealPlansBook?
  /// Khối Thực phẩm của phân đoạn Hôm nay: thư viện (Của tôi / Gần đây) + ô tìm.
  @State private var foods: FoodLibraryBook?
  @State private var foodSearch: FoodSearchBook?
  /// Hai phân đoạn của RN: "Hôm nay" (mặc định) và "Kế hoạch ăn".
  @State private var segment: Segment = .today

  enum Segment: Hashable { case today, plan }

  var body: some View {
    NavigationStack {
      ScrollView {
        VStack(spacing: DS.Spacing.md) {
          Picker(String(localized: "tab.nutrition"), selection: $segment) {
            Text(String(localized: "nc.seg.today")).tag(Segment.today)
            Text(String(localized: "nc.seg.plan")).tag(Segment.plan)
          }
          .pickerStyle(.segmented)
          .sensoryFeedback(.selection, trigger: segment)
          if segment == .plan {
            planSegment
          } else {
            todaySegment
          }
        }
        .padding(DS.Spacing.md)
        .padding(.bottom, DS.Spacing.lg)
        .animation(.smooth(duration: 0.3), value: segment)
      }
      .refreshable {
        await books?.refresh()
        if segment == .plan { await plans?.load() } else { await reload() }
      }
      // Gốc của stack: chạy cả khi quay lại từ Nhật ký / Ghi bữa, không chỉ khi
      // đổi tab — số của hôm nay đổi ở những màn ấy.
      .onAppear { Task { await reload() } }
      .navigationTitle(Text("tab.nutrition"))
      .scrollContentBackground(.hidden)
      .background { TodayAmbient(accent: .meal) }
      .navigationDestination(for: WaterRoute.self) { _ in
        if let water = books?.water { WaterView(book: water) }
      }
      .navigationDestination(for: SupplementsRoute.self) { _ in
        if let supplements = books?.supplements { SupplementsView(book: supplements) }
      }
      .navigationDestination(for: DiaryRoute.self) { route in
        DiaryScreen(userId: route.userId)
      }
      .navigationDestination(for: FoodsRoute.self) { route in
        FoodsScreen(userId: route.userId, recent: route.recent)
      }
      .navigationDestination(for: InsightsRoute.self) { route in
        InsightsScreen(userId: route.userId)
      }
      .navigationDestination(for: MealPlansRoute.self) { route in
        MealPlansScreen(userId: route.userId)
      }
      .navigationDestination(for: MealPlanRoute.self) { route in MealPlanScreen(route: route) }
    }
    .task { await books?.loadOnce() }
    .task(id: userId) {
      guard let userId else { return }
      if today?.userId != userId {
        today?.close()
        today = services?.makeNutritionToday(userId: userId)
        meals?.close()
        meals = services?.makeMealDiary(userId: userId)
        plans = nil
        foods?.close()
        foods = services?.makeFoodLibrary(userId: userId)
        foodSearch?.close()
        foodSearch = services?.makeFoodSearch()
      }
      if segment == .plan, plans == nil { plans = services?.makeMealPlans(userId: userId) }
    }
    .onChange(of: today?.userId) { Task { await reload() } }
    .onChange(of: segment) { _, s in
      if s == .plan, plans == nil, let userId { plans = services?.makeMealPlans(userId: userId) }
    }
  }

  /// Phân đoạn "Hôm nay" theo thứ tự RN: thẻ calo + lối xu hướng, Ghi bữa,
  /// Nước, Thực phẩm bổ sung, các bữa hôm nay.
  @ViewBuilder private var todaySegment: some View {
    if let today { NutritionTodayCard(book: today) }
    if let userId {
      // Ngay dưới thẻ (RN): xu hướng là phần tiếp của con số hôm nay.
      InsightsRow(userId: userId)
      // `MealLogActions`: cách ghi bữa, cách đầu là cách chính.
      MealLogWays(userId: userId) { Task { await reload() } }
    }
    if let water = books?.water { WaterCard(book: water) }
    // Cạnh Nước, trên nhật ký (`(tabs)/nutrition.tsx`: "supplements belong
    // beside water") — hàng mang sẵn "2/4 hôm nay".
    if let supplements = books?.supplements { SupplementsRow(book: supplements) }
    if let userId, let meals {
      // "Bữa ăn hôm nay" + "Ngày khác" trên cùng hàng tiêu đề (RN): tab
      // này là HÔM NAY, ngày khác là màn riêng (`/diary`).
      mealsHeader(userId: userId)
      DayMealsSection(book: meals) { Task { await today?.load() } }
    }
  }

  /// Phân đoạn "Kế hoạch ăn" (RN): kế hoạch, rồi thư viện Thực phẩm. Gợi ý AI
  /// và danh sách đi chợ chưa port.
  @ViewBuilder private var planSegment: some View {
    if let plans { MealPlansPreview(book: plans) }
    if let userId, let foods, let foodSearch {
      FoodsSection(userId: userId, library: foods, search: foodSearch)
    }
  }

  private var userId: String? { books?.water?.userId ?? books?.supplements?.userId }

  /// Thẻ calo và các bữa của hôm nay cùng đọc lại.
  private func reload() async {
    async let card: Void = loadToday()
    await meals?.load()
    await foods?.load()
    await card
  }

  private func loadToday() async { await today?.load() }

  private func mealsHeader(userId: String) -> some View {
    HStack(alignment: .firstTextBaseline) {
      Text(String(localized: "nc.meals"))
        .font(DS.TextStyle.title)
        .accessibilityAddTraits(.isHeader)
      Spacer()
      NavigationLink(value: DiaryRoute(userId: userId)) {
        HStack(spacing: 2) {
          Text(String(localized: "nc.otherDays"))
          Image(systemName: "chevron.right").font(.caption).accessibilityHidden(true)
        }
        .font(DS.TextStyle.footnote.weight(.semibold))
        .foregroundStyle(DS.Color.primary.swiftUI)
        .frame(minHeight: 44)
        .contentShape(Rectangle())
      }
      .buttonStyle(.plain)
    }
    .padding(.top, DS.Spacing.sm)
  }
}

/// Đích điều hướng của thẻ → màn Nước.
struct WaterRoute: Hashable {}

/// Đích điều hướng của hàng → màn Thực phẩm bổ sung.
struct SupplementsRoute: Hashable {}

/// Đích điều hướng của hàng → màn Nhật ký bữa ăn (của đúng người đang đăng nhập).
struct DiaryRoute: Hashable {
  let userId: String
}

/// Đích điều hướng của hàng → màn Thực phẩm (của đúng người đang đăng nhập).
struct FoodsRoute: Hashable {
  let userId: String
  /// Mở thẳng đoạn "Gần đây" ("Xem thêm" dưới Gần đây của tab).
  var recent = false
}

/// Sổ thư viện thuộc MÀN: rời màn / đổi tài khoản thì đóng.
struct FoodsScreen: View {
  let userId: String
  var recent = false
  @Environment(AppServices.self) private var services
  @State private var book: FoodLibraryBook?

  var body: some View {
    Group {
      if let book {
        FoodListView(book: book, segment: recent ? .recent : .mine)
      } else {
        DSLoadingView()
      }
    }
    .task {
      if book == nil { book = services.makeFoodLibrary(userId: userId) }
    }
    .onDisappear { book?.close() }
  }
}

/// "Ghi bữa" — `MealLogActions` của RN: các cách ghi một bữa, cách đầu nổi
/// bật. RN có bốn (Ảnh, Mã vạch, Tìm món, Nhập tay); ảnh và mã vạch cần
/// camera (`scan-*`) chưa port nên không có ô — không vẽ một ô không làm gì.
/// "Tìm món" mở màn ghi với con trỏ trong ô tìm; "Nhập tay" mở sẵn phần món
/// tự nhập — hai việc khác nhau, cùng kết thúc bằng một bữa đã ghi.
struct MealLogWays: View {
  let userId: String
  /// Sheet ghi bữa đóng lại — thẻ calo đọc lại số của hôm nay.
  var onClose: () -> Void = {}
  @State private var open: LogMealView.Start?

  var body: some View {
    VStack(alignment: .leading, spacing: DS.Spacing.sm) {
      Text(String(localized: "logMeal.title"))
        .font(DS.TextStyle.headline)
        .foregroundStyle(DS.Color.foreground.swiftUI)
        .accessibilityAddTraits(.isHeader)
      HStack(spacing: DS.Spacing.sm) {
        way(.search, symbol: "magnifyingglass", label: "nc.way.search", spoken: "nc.way.search.a11y", lead: true)
        way(.manual, symbol: "square.and.pencil", label: "nc.way.manual", spoken: "nc.way.manual.a11y", lead: false)
      }
    }
    .padding(DS.Spacing.md)
    .frame(maxWidth: .infinity, alignment: .leading)
    .todayCard(radius: DS.Radius.lg)
    .sheet(item: $open, onDismiss: onClose) { start in
      LogMealView(userId: userId, start: start)
    }
  }

  private func way(_ start: LogMealView.Start, symbol: String, label: String.LocalizationValue, spoken: String.LocalizationValue, lead: Bool) -> some View {
    let meal = MascotRoomView.signalColor(.meal)
    return Button { open = start } label: {
      HStack(spacing: DS.Spacing.sm) {
        Image(systemName: symbol)
          .font(.system(size: 15, weight: .semibold))
        Text(String(localized: label))
          .font(.system(size: 16, weight: .semibold))
          .lineLimit(1)
      }
      .foregroundStyle(lead ? Color.white : DS.Color.foreground.swiftUI)
      .frame(maxWidth: .infinity, minHeight: 48)
      .background {
        if lead {
          Capsule().fill(meal)
        } else {
          Capsule().fill(.thinMaterial)
          Capsule().strokeBorder(DS.Color.foreground.swiftUI.opacity(0.12), lineWidth: 0.75)
        }
      }
      .contentShape(Capsule())
    }
    .buttonStyle(TodayPressStyle())
    .accessibilityLabel(Text(String(localized: spoken)))
  }
}

extension LogMealView.Start: Identifiable {
  var id: Self { self }
}

/// Sổ nhật ký thuộc MÀN: mở là một sổ mới (ngày hôm nay), rời màn / đổi tài
/// khoản thì đóng — lượt đọc về muộn không đổi gì nữa.
struct DiaryScreen: View {
  let userId: String
  /// Ngày đầu (`diary?date=`, deep link) — kẹp về hôm nay như RN.
  var date: LocalDate?
  @Environment(AppServices.self) private var services
  @State private var book: MealDiaryBook?

  var body: some View {
    Group {
      if let book {
        DiaryView(book: book)
      } else {
        DSLoadingView()
      }
    }
    .task {
      if book == nil { book = services.makeMealDiary(userId: userId, date: date) }
    }
    .onDisappear { book?.close() }
  }
}

/// Hàng Thực phẩm bổ sung (`ShortcutRow` của RN): nhãn + "2/4 hôm nay" khi có
/// mục. Lần đọc đầu hỏng / đang tải thì không có số — không bao giờ "0/4" giả.
struct SupplementsRow: View {
  let book: SupplementBook

  var body: some View {
    NavigationLink(value: SupplementsRoute()) {
      HStack {
        Label(String(localized: "supplements.title"), systemImage: "pills")
          .font(DS.TextStyle.headline)
          .foregroundStyle(DS.Color.foreground.swiftUI)
          .lineLimit(1)
        Spacer()
        if !book.items.isEmpty {
          Text(String(localized: "supplements.row.value \(book.takenCount) \(book.items.count)"))
            .font(DS.TextStyle.footnote.monospacedDigit())
            .foregroundStyle(DS.Color.mutedForeground.swiftUI)
        }
        Image(systemName: "chevron.right")
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)
          .accessibilityHidden(true)
      }
      .padding(DS.Spacing.md)
      .frame(minHeight: 56)
      .todayCard(radius: DS.Radius.lg)
      .contentShape(Rectangle())
    }
    .buttonStyle(TodayPressStyle(scale: 0.98))
  }
}

/// Thẻ Nước uống trên tab Dinh dưỡng (`WaterWidget` + `WaterQuickAdd` của RN).
/// Lần đọc đầu hỏng thì không hiện thẻ (`waterFailed ? null`) — không bao giờ
/// một thẻ nói "0" thay cho "không đọc được".
struct WaterCard: View {
  let book: WaterBook
  @Environment(AppServices.self) private var services
  @Environment(ProfileBook.self) private var profile: ProfileBook?
  @State private var feedback = WaterFeedback()

  private var unit: Water.Unit { services.preferences.volumeUnit }

  var body: some View {
    if book.loaded {
      let target = Water.target(profile?.profile?.waterTargetMl)
      let pct = Water.percent(totalMl: book.totalMl, targetMl: target)
      DSCard {
        VStack(alignment: .leading, spacing: DS.Spacing.sm) {
          NavigationLink(value: WaterRoute()) {
            HStack(alignment: .firstTextBaseline) {
              VStack(alignment: .leading, spacing: 2) {
                Label(String(localized: "water.card.title"), systemImage: "drop.fill")
                  .font(DS.TextStyle.headline)
                  .foregroundStyle(DS.Color.foreground.swiftUI)
                Text(verbatim: Water.bigValue(totalMl: book.totalMl, unit))
                  .font(DS.TextStyle.mono(.title).weight(.bold))
                  .foregroundStyle(DS.Color.foreground.swiftUI)
                Text(String(localized: "water.ofTarget \(Water.targetLabel(target, unit))"))
                  .font(DS.TextStyle.footnote)
                  .foregroundStyle(DS.Color.mutedForeground.swiftUI)
              }
              Spacer()
              Image(systemName: "chevron.right")
                .foregroundStyle(DS.Color.mutedForeground.swiftUI)
                .accessibilityHidden(true)
            }
            .frame(minHeight: 44)
            .contentShape(Rectangle())
          }
          .buttonStyle(.plain)
          .accessibilityElement(children: .ignore)
          .accessibilityLabel(Text(String(localized: "water.card.title")))
          .accessibilityValue(Text(verbatim: WaterView.summaryValue(book.totalMl, target: target, pct: pct, unit: unit)))
          .accessibilityAddTraits(.isButton)

          WaterProgressBar(fraction: pct / 100)

          Text(String(localized: "water.quickAdd.unit \(Water.unitLabel(unit))"))
            .font(DS.TextStyle.caption.weight(.semibold))
            .foregroundStyle(DS.Color.mutedForeground.swiftUI)
            .padding(.top, DS.Spacing.xs)
          WaterQuickAddRow(book: book, unit: unit, feedback: feedback)
          WaterFeedbackLine(feedback: feedback)
        }
      }
    }
  }
}
