import ASCNDCore
import ASCNDDesignSystem
import SwiftUI

/// Tab Dinh dưỡng (#527 Phase 3) — `(tabs)/nutrition.tsx`. Trên cùng là thẻ
/// calo + macro hôm nay (`NutritionTodayCard`, như `NutritionCard` của RN),
/// rồi thẻ Nước uống (`WaterWidget`), Thực phẩm bổ sung, nút ghi bữa, "Bữa ăn
/// hôm nay" (cùng thẻ bữa với màn Nhật ký — `DayMealsSection`) với lối "Ngày
/// khác", rồi thực phẩm / kế hoạch / xu hướng. Phần còn lại (hai phân đoạn Hôm
/// nay / Kế hoạch ăn, tìm món, gợi ý AI) chưa port — dòng "đang dựng" nói thật
/// điều đó thay vì một nút không làm gì.
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

  var body: some View {
    NavigationStack {
      ScrollView {
        VStack(spacing: DS.Spacing.md) {
          if let today { NutritionTodayCard(book: today) }
          if let water = books?.water { WaterCard(book: water) }
          // Cạnh Nước, trên nhật ký (`(tabs)/nutrition.tsx`: "supplements belong
          // beside water") — hàng mang sẵn "2/4 hôm nay".
          if let supplements = books?.supplements { SupplementsRow(book: supplements) }
          if let userId = books?.water?.userId ?? books?.supplements?.userId {
            // Lối ghi bữa (`LogMealFab` ⊕ của RN): hôm nay, "Bữa trưa".
            LogMealButton(userId: userId) { Task { await reload() } }
            // "Bữa ăn hôm nay" + "Ngày khác" trên cùng hàng tiêu đề (RN): tab
            // này là HÔM NAY, ngày khác là màn riêng (`/diary`).
            if let meals {
              mealsHeader(userId: userId)
              DayMealsSection(book: meals) { Task { await today?.load() } }
            }
            FoodsRow(userId: userId)
            MealPlansRow(userId: userId)
            InsightsRow(userId: userId)
          }
          Text(String(localized: "placeholder.building"))
            .font(DS.TextStyle.footnote)
            .foregroundStyle(DS.Color.mutedForeground.swiftUI)
            .multilineTextAlignment(.center)
            .frame(maxWidth: .infinity)
            .padding(.top, DS.Spacing.lg)
        }
        .padding(DS.Spacing.md)
      }
      .refreshable {
        await books?.refresh()
        await reload()
      }
      // Gốc của stack: chạy cả khi quay lại từ Nhật ký / Ghi bữa, không chỉ khi
      // đổi tab — số của hôm nay đổi ở những màn ấy.
      .onAppear { Task { await reload() } }
      .navigationTitle(Text("tab.nutrition"))
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
        FoodsScreen(userId: route.userId)
      }
      .navigationDestination(for: InsightsRoute.self) { route in
        InsightsScreen(userId: route.userId)
      }
      .navigationDestination(for: MealPlansRoute.self) { route in
        MealPlansScreen(userId: route.userId)
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
      }
    }
    .onChange(of: today?.userId) { Task { await reload() } }
  }

  private var userId: String? { books?.water?.userId ?? books?.supplements?.userId }

  /// Thẻ calo và các bữa của hôm nay cùng đọc lại.
  private func reload() async {
    async let card: Void = loadToday()
    await meals?.load()
    await card
  }

  private func loadToday() async { await today?.load() }

  private func mealsHeader(userId: String) -> some View {
    HStack(alignment: .firstTextBaseline) {
      Text(String(localized: "nc.meals"))
        .font(DS.TextStyle.headline)
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
}

/// Hàng "Thực phẩm" — thư viện món của tôi + món gần đây.
struct FoodsRow: View {
  let userId: String

  var body: some View {
    NavigationLink(value: FoodsRoute(userId: userId)) {
      HStack {
        Label(String(localized: "foods.title"), systemImage: "carrot")
          .font(DS.TextStyle.headline)
          .foregroundStyle(DS.Color.foreground.swiftUI)
          .lineLimit(1)
        Spacer()
        Image(systemName: "chevron.right")
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)
          .accessibilityHidden(true)
      }
      .padding(DS.Spacing.md)
      .frame(minHeight: 44)
      .background(DS.Color.card.swiftUI, in: RoundedRectangle(cornerRadius: DS.Radius.md))
      .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
  }
}

/// Sổ thư viện thuộc MÀN: rời màn / đổi tài khoản thì đóng.
struct FoodsScreen: View {
  let userId: String
  @Environment(AppServices.self) private var services
  @State private var book: FoodLibraryBook?

  var body: some View {
    Group {
      if let book {
        FoodListView(book: book)
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

/// Nút "Ghi bữa ăn" — mở `LogMealView` cho hôm nay.
struct LogMealButton: View {
  let userId: String
  /// Sheet ghi bữa đóng lại — thẻ calo đọc lại số của hôm nay.
  var onClose: () -> Void = {}
  @State private var open = false

  var body: some View {
    DSButton(String(localized: "logMeal.title")) { open = true }
      .sheet(isPresented: $open, onDismiss: onClose) { LogMealView(userId: userId) }
  }
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
      .frame(minHeight: 44)
      .background(DS.Color.card.swiftUI, in: RoundedRectangle(cornerRadius: DS.Radius.md))
      .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
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
