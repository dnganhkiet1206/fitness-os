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
  /// Danh sách đi chợ của phân đoạn Kế hoạch ăn (#527, N1).
  @State private var grocery: GroceryBook?
  /// Hai phân đoạn của RN: "Hôm nay" (mặc định) và "Kế hoạch ăn".
  @State private var segment: Segment = .today
  @Environment(\.dynamicTypeSize) private var typeSize

  enum Segment: Hashable { case today, plan }

  var body: some View {
    NavigationStack {
      ScrollView {
        VStack(spacing: DS.Spacing.md) {
          header
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
      if segment == .plan, plans == nil { plans = services?.makeMealPlans(userId: userId) }
      if segment == .plan, grocery == nil { grocery = services?.makeGrocery(userId: userId) }
    }
    .onChange(of: today?.userId) { Task { await reload() } }
    .onChange(of: segment) { _, s in
      if s == .plan, plans == nil, let userId { plans = services?.makeMealPlans(userId: userId) }
      if s == .plan, grocery == nil, let userId { grocery = services?.makeGrocery(userId: userId) }
    }
  }

  /// Phân đoạn "Hôm nay" (thiết kế lại 13/10, `docs/design/nutrition/REDESIGN.md`):
  /// thẻ ngân sách (còn lại + macro + "7 ngày"), ô ghi bữa, các khung bữa của
  /// hôm nay, rồi Nước + Thực phẩm bổ sung trong một thẻ danh sách.
  @ViewBuilder private var todaySegment: some View {
    if let today { NutritionTodayCard(book: today) }
    if let userId {
      MealLogBar(userId: userId) { Task { await reload() } }
    }
    if let meals {
      sectionTitle(String(localized: "nc.meals"))
      DayMealsSection(book: meals, slots: true) { Task { await today?.load() } }
    }
    if books?.water != nil || books?.supplements != nil {
      sectionTitle(String(localized: "nc.inDay"))
      DayExtrasList(water: books?.water, supplements: books?.supplements)
    }
  }

  /// Phân đoạn "Kế hoạch ăn": kế hoạch, rồi một thẻ danh sách lối tắt (đi chợ,
  /// thực phẩm của tôi). Thư viện đầy đủ — ô tìm, Của tôi / Gần đây — ở màn
  /// Thực phẩm, một chạm. Gợi ý AI chưa port.
  @ViewBuilder private var planSegment: some View {
    if let plans { MealPlansPreview(book: plans) }
    if let userId {
      PlanShortcuts(userId: userId, grocery: grocery)
    }
  }

  /// Đầu trang trong nội dung (như Hôm nay): tiêu đề lớn; phải là "Ngày khác"
  /// (Nhật ký). Không có dòng thứ / ngày (chủ dự án, 13/10).
  private var header: some View {
    HStack(alignment: .center, spacing: DS.Spacing.sm) {
      Text(String(localized: "tab.nutrition"))
        .font(.largeTitle.bold())
        .foregroundStyle(DS.Color.foreground.swiftUI)
        .accessibilityAddTraits(.isHeader)
      Spacer(minLength: 0)
      if let userId {
        NavigationLink(value: DiaryRoute(userId: userId)) {
          // Cỡ chữ trợ năng: chỉ biểu tượng (chữ bị bẻ từng âm tiết bên cạnh
          // tiêu đề lớn); VoiceOver vẫn đọc nhãn.
          Label(String(localized: "nc.otherDays"), systemImage: "calendar")
            .labelStyle(AdaptiveLabelStyle(iconOnly: typeSize.isAccessibilitySize))
            .font(DS.TextStyle.footnote.weight(.semibold))
            .foregroundStyle(DS.Color.foreground.swiftUI)
            .padding(.horizontal, 12)
            .frame(minHeight: 36)
            .background(Capsule().fill(.thinMaterial))
            .overlay(Capsule().strokeBorder(DS.Color.foreground.swiftUI.opacity(0.12), lineWidth: 0.75))
            .frame(minHeight: 44)
            .contentShape(Rectangle())
        }
        .buttonStyle(TodayPressStyle())
        .accessibilityLabel(Text(String(localized: "nc.otherDays")))
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
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
/// mã vạch → màn ghi mở thẳng máy quét; bút → mở sẵn phần món tự nhập. Ảnh
/// (AI) chưa port — không vẽ một nút không làm gì.
struct MealLogBar: View {
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
      Button { open = .scan } label: {
        Image(systemName: "barcode.viewfinder")
          .font(.system(size: 17, weight: .semibold))
          .foregroundStyle(DS.Color.foreground.swiftUI)
          .frame(width: 50, height: 52)
          .contentShape(Rectangle())
      }
      .buttonStyle(.plain)
      .accessibilityLabel(Text(String(localized: "scan.a11y")))
      Button { open = .manual } label: {
        Image(systemName: "square.and.pencil")
          .font(.system(size: 17, weight: .semibold))
          .foregroundStyle(DS.Color.foreground.swiftUI)
          .frame(width: 56, height: 52)
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

  var body: some View {
    VStack(spacing: DS.Spacing.xs) {
      VStack(spacing: 0) {
        if let water { waterRow(water) }
        if water != nil, supplements != nil { Divider().padding(.leading, 58).opacity(0.6) }
        if let supplements { supplementsRow(supplements) }
      }
      .clipShape(RoundedRectangle(cornerRadius: DS.Radius.xl, style: .continuous))
      .todayCard(radius: DS.Radius.xl)
      WaterFeedbackLine(feedback: feedback)
    }
    .sensoryFeedback(.impact(weight: .light), trigger: taps)
  }

  private func waterRow(_ book: WaterBook) -> some View {
    let tint = MascotRoomView.signalColor(.water)
    let target = Water.target(profile?.profile?.waterTargetMl)
    let step = Water.quickAmounts(unit).first ?? 250
    return HStack(spacing: 12) {
      NavigationLink(value: WaterRoute()) {
        HStack(spacing: 12) {
          glyph("drop.fill", tint: tint, filled: book.loaded && book.totalMl > 0)
          VStack(alignment: .leading, spacing: 2) {
            Text(String(localized: "water.card.title"))
              .font(.system(size: 17, weight: .semibold))
              .foregroundStyle(DS.Color.foreground.swiftUI)
            Text(verbatim: book.loaded
              ? "\(Water.bigValue(totalMl: book.totalMl, unit)) / \(Water.targetLabel(target, unit))" : "—")
              .font(.custom("Menlo", size: 13, relativeTo: .footnote))
              .foregroundStyle(DS.Color.mutedForeground.swiftUI)
              .lineLimit(1)
              .minimumScaleFactor(0.8)
          }
          Spacer(minLength: 0)
        }
        .contentShape(Rectangle())
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
            .font(.system(size: 15, weight: .semibold).monospacedDigit())
            .foregroundStyle(DS.Color.foreground.swiftUI)
            .padding(.horizontal, 14)
            .frame(minHeight: 34)
            .background(Capsule().strokeBorder(DS.Color.foreground.swiftUI.opacity(0.18), lineWidth: 1))
            .frame(minHeight: 44)
            .contentShape(Rectangle())
        }
        .buttonStyle(TodayPressStyle())
        .accessibilityLabel(Text(String(localized: "water.a11y.add \(String(step)) \(Water.unitLabel(unit))")))
      }
    }
    .padding(.horizontal, DS.Spacing.md)
    .padding(.vertical, 8)
    .frame(minHeight: 60)
  }

  private func supplementsRow(_ book: SupplementBook) -> some View {
    let tint = MascotRoomView.signalColor(.steps)
    let done = !book.items.isEmpty && book.takenCount >= book.items.count
    return NavigationLink(value: SupplementsRoute()) {
      HStack(spacing: 12) {
        glyph("pills.fill", tint: tint, filled: done)
        VStack(alignment: .leading, spacing: 2) {
          Text(String(localized: "supplements.title"))
            .font(.system(size: 17, weight: .semibold))
            .foregroundStyle(DS.Color.foreground.swiftUI)
          if !book.items.isEmpty {
            Text(String(localized: "supplements.row.value \(book.takenCount) \(book.items.count)"))
              .font(DS.TextStyle.caption.monospacedDigit())
              .foregroundStyle(DS.Color.mutedForeground.swiftUI)
          }
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
    }
    .clipShape(RoundedRectangle(cornerRadius: DS.Radius.xl, style: .continuous))
    .todayCard(radius: DS.Radius.xl)
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
