import ASCNDCore
import ASCNDDesignSystem
import SwiftUI

/// Tab Dinh dưỡng (#527 Phase 3) — `(tabs)/nutrition.tsx`, đúng thứ tự khối
/// của RN (đối chiếu: `docs/design/nutrition/RN-PARITY.md`):
/// - "Hôm nay": thẻ calo + macro (`NutritionCard`) với lối xu hướng 7 ngày
///   ngay dưới, "Ghi bữa" (`MealLogActions`: Tìm món / Nhập tay — ảnh và mã
///   vạch chưa port), Nước (`WaterWidget`), Thực phẩm bổ sung, "Bữa ăn hôm
///   nay" với lối "Ngày khác";
/// - ~~"Kế hoạch ăn" (phân đoạn thứ hai)~~ — GĐ3 (Kiệt duyệt 21/10, mock
///   `gd3-four-areas.html`; QĐ 4): bỏ bộ chọn; kế hoạch ăn, đi chợ, thực phẩm của
///   tôi và thực phẩm bổ sung xuống mục "Thêm" cuối trang. Không xoá màn nào.
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
  /// Kế hoạch ăn của mục "Thêm" (GĐ3).
  @State private var plans: MealPlansBook?
  /// Danh sách đi chợ của mục "Thêm" (#527, N1).
  @State private var grocery: GroceryBook?
  @Environment(\.dynamicTypeSize) private var typeSize
  @Environment(\.scenePhase) private var scenePhase

  var body: some View {
    NavigationStack {
      ScrollView {
        VStack(spacing: DS.Spacing.md) {
          header
          todaySegment
          moreSection
        }
        .padding(DS.Spacing.md)
        .padding(.bottom, DS.Spacing.lg)
      }
      // Không kéo để làm mới (chủ dự án, 13/10: chỉ Hôm nay có): tab tự đọc
      // lại mỗi lần hiện và sau mỗi lần ghi; nước / thực phẩm bổ sung đọc lại
      // theo phiên.
      // Gốc của stack: chạy cả khi quay lại từ Nhật ký / Ghi bữa, không chỉ khi
      // đổi tab — số của hôm nay đổi ở những màn ấy.
      .onAppear { Task { await reload() } }
      .navigationTitle(Text("tab.nutrition"))
      // Đầu trang nằm trong nội dung như Hôm nay: thanh điều hướng của trang
      // gốc để lại một hàng trống ~60pt dưới Dynamic Island (chủ dự án báo,
      // 13/10). Màn con vẫn có thanh của chúng.
      .toolbar(.hidden, for: .navigationBar)
      .statusBarScrim()
      .scrollContentBackground(.hidden)
      .background { TodayAmbient(accent: .meal) }
      .navigationDestination(for: WaterRoute.self) { _ in
        if let water = books?.water { WaterView(book: water) }
      }
      .navigationDestination(for: SupplementsRoute.self) { _ in
        if let supplements = books?.supplements { SupplementsView(book: supplements) }
      }
      .navigationDestination(for: DiaryRoute.self) { route in
        DiaryScreen(userId: route.userId, date: route.date)
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
      .navigationDestination(for: GroceryRoute.self) { _ in
        if let grocery { GroceryView(book: grocery) }
      }
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
        grocery?.close()
        grocery = nil
      }
      if plans == nil { plans = services?.makeMealPlans(userId: userId) }
      if grocery == nil { grocery = services?.makeGrocery(userId: userId) }
    }
    .onChange(of: today?.userId) { Task { await reload() } }
    // Ra tiền cảnh, hay để app mở qua nửa đêm: thẻ calo và các bữa sang ngày
    // mới (trước 24/10 thì giữ số của hôm qua tới khi đổi tài khoản).
    .onChange(of: scenePhase) { _, phase in
      if phase == .active { rollDay() }
    }
    .onNewDay { rollDay() }
  }

  private func rollDay() {
    meals?.followToday()
    Task { await reload() }
  }

  /// Phân đoạn "Hôm nay" (thiết kế lại 13/10, `docs/design/nutrition/REDESIGN.md`):
  /// thẻ ngân sách (còn lại + macro + "7 ngày"), ô ghi bữa, các khung bữa của
  /// hôm nay, rồi Nước + Thực phẩm bổ sung trong một thẻ danh sách.
  @ViewBuilder private var todaySegment: some View {
    // Dải ngày DƯỚI thanh phân đoạn (15/10, chủ dự án): trên thanh thì đổi
    // sang Kế hoạch ăn làm thanh nhảy lên / xuống — như dải tuần của Tập luyện.
    if let userId { dayStrip(userId) }
    if let today { NutritionTodayCard(book: today) }
    if let userId {
      MealLogBar(userId: userId) { Task { await reload() } }
    }
    if let meals {
      sectionTitle(String(localized: "nc.meals"))
      DayMealsSection(book: meals, slots: true) { Task { await today?.load() } }
    }
    if books?.water != nil {
      sectionTitle(String(localized: "nc.inDay"))
      // GĐ3: thực phẩm bổ sung xuống "Thêm"; ở đây chỉ còn Nước.
      DayExtrasList(water: books?.water, supplements: nil)
    }
  }

  /// "Thêm" (GĐ3, QĐ 4 — dinh dưỡng hỗ trợ tập luyện): kế hoạch ăn, rồi một thẻ
  /// danh sách lối tắt (đi chợ, thực phẩm của tôi, thực phẩm bổ sung). Thư viện
  /// đầy đủ — ô tìm, Của tôi / Gần đây — ở màn Thực phẩm, một chạm.
  @ViewBuilder private var moreSection: some View {
    sectionTitle(String(localized: "progress.more"))
    if let plans { MealPlansPreview(book: plans) }
    if let userId {
      PlanShortcuts(userId: userId, grocery: grocery, supplements: books?.supplements)
    }
  }

  /// Đầu trang trong nội dung (thiết kế lại 14/10, cùng kiểu Tập luyện /
  /// Cộng đồng): tiêu đề lớn + nút tròn Nhật ký (lịch) và 7 ngày (thống kê);
  /// dưới là dải 7 ngày gần nhất — chạm một ngày đã qua mở Nhật ký ngày ấy.
  private var header: some View {
    VStack(alignment: .leading, spacing: DS.Spacing.sm) {
      HStack(alignment: .center, spacing: DS.Spacing.sm) {
        Text(String(localized: "tab.nutrition"))
          .font(.largeTitle.bold())
          .foregroundStyle(DS.Color.foreground.swiftUI)
          .accessibilityAddTraits(.isHeader)
        Spacer(minLength: 0)
        if let userId {
          // Nhật ký bữa ăn: hình cuốn sổ, không phải lịch (19/10, chủ dự án: "icon
          // nhật ký bữa ăn đang để thành lịch dễ bị nhầm lẫn").
          NavigationLink(value: DiaryRoute(userId: userId)) { roundIcon("book.pages") }
            .buttonStyle(TodayPressStyle())
            .accessibilityLabel(Text(String(localized: "diary.title")))
          NavigationLink(value: InsightsRoute(userId: userId)) { roundIcon("chart.bar.xaxis") }
            .buttonStyle(TodayPressStyle())
            .accessibilityLabel(Text(String(localized: "nc.week")))
        }
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
  }

  private func roundIcon(_ symbol: String) -> some View {
    Image(systemName: symbol)
      .font(.body.weight(.semibold))
      .foregroundStyle(DS.Color.foreground.swiftUI)
      .frame(width: 40, height: 40)
      .background(Circle().fill(.thinMaterial))
      .overlay(Circle().strokeBorder(DS.Color.foreground.swiftUI.opacity(0.12), lineWidth: 0.75))
      .frame(minWidth: 44, minHeight: 44)
      .contentShape(Rectangle())
  }

  /// Bảy ngày tới hôm nay; hôm nay tô màu Bữa ăn (đang xem ở trang này).
  private func dayStrip(_ userId: String) -> some View {
    let today = LocalDate(SystemWallClock().nowMillis(), in: .current)
    let accent = MascotRoomView.signalColor(.meal)
    return HStack(spacing: 4) {
      ForEach(-6...0, id: \.self) { offset in
        let d = today.adding(days: offset)
        let isToday = offset == 0
        let label = VStack(spacing: 2) {
          Text(verbatim: d.calendarDate.formatted(Date.FormatStyle().weekday(.narrow).locale(.app)))
            .font(DS.TextStyle.caption)
            .foregroundStyle(isToday ? Color.white.opacity(0.85) : DS.Color.mutedForeground.swiftUI)
          Text(verbatim: "\(d.day)")
            .font(DS.TextStyle.number(15, .body).weight(.semibold))
            .foregroundStyle(isToday ? Color.white : DS.Color.foreground.swiftUI)
        }
        .frame(maxWidth: .infinity, minHeight: 50)
        .background {
          if isToday { RoundedRectangle(cornerRadius: 14, style: .continuous).fill(accent) }
        }
        .contentShape(Rectangle())
        if isToday {
          label
            .accessibilityElement(children: .combine)
            .accessibilityAddTraits(.isSelected)
        } else {
          NavigationLink(value: DiaryRoute(userId: userId, date: d)) { label }
            .buttonStyle(TodayPressStyle())
            .accessibilityLabel(Text(verbatim: d.calendarDate.formatted(
              Date.FormatStyle().weekday(.wide).day().month(.wide).locale(.app))))
        }
      }
    }
  }

  private func sectionTitle(_ text: String) -> some View {
    Text(verbatim: text)
      .font(DS.TextStyle.title)
      .foregroundStyle(DS.Color.foreground.swiftUI)
      .accessibilityAddTraits(.isHeader)
      .frame(maxWidth: .infinity, alignment: .leading)
      .padding(.horizontal, 4)
      .padding(.top, DS.Spacing.sm)
  }

  private var userId: String? { books?.water?.userId ?? books?.supplements?.userId }

  /// Thẻ calo và các bữa của hôm nay cùng đọc lại (song song).
  private func reload() async {
    async let card: Void = loadToday()
    await meals?.load()
    await card
  }

  private func loadToday() async { await today?.load() }
}

/// Đích điều hướng của thẻ → màn Nước.
struct WaterRoute: Hashable {}

/// Đích điều hướng của hàng → màn Thực phẩm bổ sung.
struct SupplementsRoute: Hashable {}

/// Đích điều hướng của hàng → màn Nhật ký bữa ăn (của đúng người đang đăng nhập).
struct DiaryRoute: Hashable {
  let userId: String
  /// Ngày mở (dải ngày đầu tab, 14/10). `nil` = hôm nay.
  var date: LocalDate? = nil
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

/// Ô ghi bữa (thiết kế lại 13/10) — `MealLogActions` của RN thu về MỘT viên
/// như ô tìm, vì tìm là cách chính: chạm → màn ghi với con trỏ trong ô tìm;
/// camera → màn ghi mở thẳng Chụp ảnh món (AI); mã vạch → máy quét; bút → mở
/// sẵn phần món tự nhập.
struct MealLogBar: View {
  /// Edge function AI đã deploy chưa — nút chụp ảnh món chỉ hiện khi có (15/10).
  @Environment(AppServices.self) private var services: AppServices?
  let userId: String
  /// Sheet ghi bữa đóng lại — thẻ ngân sách đọc lại số của hôm nay.
  var onClose: () -> Void = {}
  @State private var open: LogMealView.Start?

  var body: some View {
    let meal = MascotRoomView.signalColor(.meal)
    HStack(spacing: 0) {
      Button { open = .search } label: {
        HStack(spacing: 10) {
          Image(systemName: "magnifyingglass")
            .font(.system(size: 16, weight: .semibold))
            .foregroundStyle(meal)
          Text(String(localized: "nc.log.prompt"))
            .font(.system(size: 17))
            .foregroundStyle(DS.Color.mutedForeground.swiftUI)
            .lineLimit(1)
          Spacer(minLength: 0)
        }
        .padding(.leading, 18)
        .frame(maxWidth: .infinity, minHeight: 52)
        .contentShape(Rectangle())
      }
      .buttonStyle(.plain)
      .accessibilityLabel(Text(String(localized: "nc.way.search.a11y")))
      Divider().frame(height: 24).opacity(0.6)
      // Chụp ảnh món cần edge function AI — ẩn khi chưa deploy (`AppServices.probeAI`).
      if services?.aiDeployed == true {
        Button { open = .photo } label: {
          Image(systemName: "camera")
            .font(.system(size: 17, weight: .semibold))
            .foregroundStyle(DS.Color.foreground.swiftUI)
            .frame(width: 46, height: 52)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(Text(String(localized: "sf.a11y")))
      }
      Button { open = .scan } label: {
        Image(systemName: "barcode.viewfinder")
          .font(.system(size: 17, weight: .semibold))
          .foregroundStyle(DS.Color.foreground.swiftUI)
          .frame(width: 46, height: 52)
          .contentShape(Rectangle())
      }
      .buttonStyle(.plain)
      .accessibilityLabel(Text(String(localized: "scan.a11y")))
      Button { open = .manual } label: {
        Image(systemName: "square.and.pencil")
          .font(.system(size: 17, weight: .semibold))
          .foregroundStyle(DS.Color.foreground.swiftUI)
          .frame(width: 52, height: 52)
          .contentShape(Rectangle())
      }
      .buttonStyle(.plain)
      .accessibilityLabel(Text(String(localized: "nc.way.manual.a11y")))
    }
    .background(Capsule().fill(.regularMaterial))
    .overlay(Capsule().strokeBorder(meal.opacity(0.55), lineWidth: 1.5))
    .shadow(color: meal.opacity(0.12), radius: 10, y: 4)
    .sensoryFeedback(.selection, trigger: open)
    .sheet(item: $open, onDismiss: onClose) { start in
      LogMealView(userId: userId, start: start)
    }
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
  @State private var week: NutritionInsightsBook?

  var body: some View {
    Group {
      if let book {
        DiaryView(book: book, week: week)
      } else {
        DSLoadingView()
      }
    }
    .task {
      if book == nil { book = services.makeMealDiary(userId: userId, date: date) }
      if week == nil { week = services.makeNutritionInsights(userId: userId) }
    }
    .onDisappear {
      book?.close()
      week?.close()
    }
  }
}

/// "Trong ngày": Nước và Thực phẩm bổ sung trong MỘT thẻ danh sách, hàng kiểu
/// "Your day" của Hôm nay (thiết kế lại 13/10). Nước: một chạm thêm mức nhanh
/// đầu tiên ("+250 ml" / "+8 oz") — các mức khác và nút bớt ở màn Nước. Lần
/// đọc đầu hỏng / đang tải thì hàng không có số — không bao giờ "0" giả.
struct DayExtrasList: View {
  let water: WaterBook?
  let supplements: SupplementBook?
  @Environment(AppServices.self) private var services
  @Environment(ProfileBook.self) private var profile: ProfileBook?
  @State private var feedback = WaterFeedback()
  @State private var taps = 0

  private var unit: Water.Unit { services.preferences.volumeUnit }

  /// Hai ô cạnh nhau (thiết kế lại 14/10): tên + số lớn Menlo; Nước có nút
  /// thêm nhanh ở đáy ô. Chạm phần trên mở màn chi tiết.
  var body: some View {
    VStack(spacing: DS.Spacing.xs) {
      HStack(alignment: .top, spacing: DS.Spacing.sm) {
        if let water { waterTile(water) }
        if let supplements { supplementsTile(supplements) }
      }
      WaterFeedbackLine(feedback: feedback)
    }
    .sensoryFeedback(.impact(weight: .light), trigger: taps)
  }

  private func tileHead(_ symbol: String, tint: Color, filled: Bool, title: String, value: String) -> some View {
    VStack(alignment: .leading, spacing: 8) {
      HStack(spacing: 8) {
        glyph(symbol, tint: tint, filled: filled)
        Spacer(minLength: 0)
        Image(systemName: "chevron.right")
          .font(.caption.weight(.semibold))
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)
          .accessibilityHidden(true)
      }
      Text(verbatim: title)
        .font(DS.TextStyle.footnote.weight(.semibold))
        .foregroundStyle(DS.Color.mutedForeground.swiftUI)
        .lineLimit(1)
      Text(verbatim: value)
        .font(DS.TextStyle.number(20, .title3).weight(.bold))
        .foregroundStyle(DS.Color.foreground.swiftUI)
        .lineLimit(1)
        .minimumScaleFactor(0.6)
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .contentShape(Rectangle())
  }

  private func waterTile(_ book: WaterBook) -> some View {
    let tint = MascotRoomView.signalColor(.water)
    let target = Water.target(profile?.profile?.waterTargetMl)
    let step = Water.quickAmounts(unit).first ?? 250
    let value = book.loaded ? Water.progressLabel(ml: Double(book.totalMl), targetMl: target, unit, locale: .app) : "—"
    return VStack(alignment: .leading, spacing: DS.Spacing.sm) {
      NavigationLink(value: WaterRoute()) {
        tileHead("drop.fill", tint: tint, filled: book.loaded && book.totalMl > 0,
                 title: String(localized: "water.card.title"), value: value)
      }
      .buttonStyle(.plain)
      .accessibilityElement(children: .ignore)
      .accessibilityLabel(Text(String(localized: "water.card.title")))
      .accessibilityValue(Text(verbatim: book.loaded
        ? WaterView.summaryValue(book.totalMl, target: target,
            pct: Water.percent(totalMl: book.totalMl, targetMl: target), unit: unit) : ""))
      .accessibilityAddTraits(.isButton)
      if book.loaded {
        Button {
          taps += 1
          Task { await feedback.add(Water.toMl(Double(step), unit), to: book, online: services.sync.online) }
        } label: {
          Text(verbatim: "+\(step) \(Water.unitLabel(unit))")
            .font(.system(size: 14, weight: .semibold).monospacedDigit())
            .foregroundStyle(tint)
            .frame(maxWidth: .infinity, minHeight: 36)
            .background(Capsule().fill(tint.opacity(0.14)))
            .frame(minHeight: 44)
            .contentShape(Rectangle())
        }
        .buttonStyle(TodayPressStyle())
        .accessibilityLabel(Text(String(localized: "water.a11y.add \(String(step)) \(Water.unitLabel(unit))")))
      }
    }
    .padding(DS.Spacing.md)
    .frame(maxWidth: .infinity, alignment: .topLeading)
    .todayCard()
  }

  private func supplementsTile(_ book: SupplementBook) -> some View {
    let tint = MascotRoomView.signalColor(.steps)
    let done = !book.items.isEmpty && book.takenCount >= book.items.count
    return NavigationLink(value: SupplementsRoute()) {
      tileHead("pills.fill", tint: tint, filled: done, title: String(localized: "supplements.title"),
               value: book.items.isEmpty ? "—" : "\(book.takenCount)/\(book.items.count)")
        .padding(DS.Spacing.md)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .todayCard()
    }
    .buttonStyle(TodayPressStyle(scale: 0.98))
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(Text(String(localized: "supplements.title")))
    .accessibilityValue(Text(book.items.isEmpty ? "" : String(localized: "supplements.row.value \(book.takenCount) \(book.items.count)")))
    .accessibilityAddTraits(.isButton)
  }

  private func glyph(_ symbol: String, tint: Color, filled: Bool) -> some View {
    Image(systemName: symbol)
      .font(.system(size: 14, weight: .semibold))
      .foregroundStyle(tint)
      .frame(width: 34, height: 34)
      .background(Circle().fill(tint.opacity(filled ? 0.2 : 0.1)))
      .accessibilityHidden(true)
  }
}

/// Lối tắt của phân đoạn Kế hoạch ăn: đi chợ ("còn N món") và thư viện thực
/// phẩm — một thẻ danh sách (thiết kế lại 13/10; RN đặt cả thư viện trong tab).
struct PlanShortcuts: View {
  let userId: String
  let grocery: GroceryBook?
  /// GĐ3: thực phẩm bổ sung ở đây (bỏ khỏi Hôm nay và khỏi "Trong ngày").
  var supplements: SupplementBook? = nil
  @Environment(AppServices.self) private var services

  var body: some View {
    VStack(spacing: 0) {
      if let grocery {
        GroceryRow(book: grocery, plain: true)
        Divider().padding(.leading, 58).opacity(0.6)
      }
      NavigationLink(value: FoodsRoute(userId: userId)) {
        HStack(spacing: 12) {
          Image(systemName: "carrot.fill")
            .font(.system(size: 14, weight: .semibold))
            .foregroundStyle(MascotRoomView.signalColor(.steps))
            .frame(width: 34, height: 34)
            .background(Circle().fill(MascotRoomView.signalColor(.steps).opacity(0.12)))
            .accessibilityHidden(true)
          VStack(alignment: .leading, spacing: 2) {
            Text(String(localized: "nc.myFoods"))
              .font(.system(size: 17, weight: .semibold))
              .foregroundStyle(DS.Color.foreground.swiftUI)
            Text(String(localized: "nc.myFoods.sub"))
              .font(DS.TextStyle.caption)
              .foregroundStyle(DS.Color.mutedForeground.swiftUI)
          }
          Spacer(minLength: 0)
          Image(systemName: "chevron.right")
            .font(.caption.weight(.semibold))
            .foregroundStyle(DS.Color.mutedForeground.swiftUI)
            .accessibilityHidden(true)
        }
        .padding(.horizontal, DS.Spacing.md)
        .padding(.vertical, 8)
        .frame(minHeight: 60)
        .contentShape(Rectangle())
      }
      .buttonStyle(TodayPressStyle(scale: 0.98))
      if let supplements {
        Divider().padding(.leading, 58).opacity(0.6)
        NavigationLink(value: SupplementsRoute()) {
          shortcut(
            "pills.fill", tint: DS.Color.metricPurple.swiftUI, title: String(localized: "supplements.title"),
            sub: String(localized: "nc.supplements.today \(supplements.shownTakenCount(writer: services.stateWriter)) \(supplements.items.count)"))
        }
        .buttonStyle(TodayPressStyle(scale: 0.98))
      }
    }
    .clipShape(RoundedRectangle(cornerRadius: DS.Radius.xl, style: .continuous))
    .todayCard()
  }

  private func shortcut(_ symbol: String, tint: Color, title: String, sub: String) -> some View {
    HStack(spacing: 12) {
      Image(systemName: symbol)
        .font(.system(size: 14, weight: .semibold))
        .foregroundStyle(tint)
        .frame(width: 34, height: 34)
        .background(Circle().fill(tint.opacity(0.12)))
        .accessibilityHidden(true)
      VStack(alignment: .leading, spacing: 2) {
        Text(verbatim: title)
          .font(.system(size: 17, weight: .semibold))
          .foregroundStyle(DS.Color.foreground.swiftUI)
        Text(verbatim: sub)
          .font(DS.TextStyle.caption)
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)
      }
      Spacer(minLength: 0)
      Image(systemName: "chevron.right")
        .font(.caption.weight(.semibold))
        .foregroundStyle(DS.Color.mutedForeground.swiftUI)
        .accessibilityHidden(true)
    }
    .padding(.horizontal, DS.Spacing.md)
    .padding(.vertical, 8)
    .frame(minHeight: 60)
    .contentShape(Rectangle())
  }
}

/// Nhãn chữ + biểu tượng, hoặc chỉ biểu tượng (nút mang nhãn VoiceOver riêng).
private struct AdaptiveLabelStyle: LabelStyle {
  let iconOnly: Bool

  func makeBody(configuration: Configuration) -> some View {
    if iconOnly {
      configuration.icon
    } else {
      HStack(spacing: 6) {
        configuration.icon
        configuration.title
      }
    }
  }
}
