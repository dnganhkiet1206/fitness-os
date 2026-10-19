import ASCNDCore
import ASCNDDesignSystem
import SwiftUI

/// Màn ghi bữa ăn (#527 Phase 3 · 3.2) — `app/log-meal.tsx` trên `MealLogger`.
///
/// Như RN:
/// - hàng chọn bữa (sáu loại); vào từ thẻ bữa của nhật ký thì đúng bữa ấy, còn
///   lại "Bữa trưa"; ghi cho ngày đang xem ở nhật ký;
/// - ô tìm món (từ 2 ký tự, trễ 250 ms, 8 kết quả); "Thêm nhanh" = món ghi gần
///   đây; khung "Tự nhập món ăn" với tên + kcal / đạm / tinh bột / béo — ô ngoài
///   dải tô đỏ và khoá nút;
/// - danh sách món với khẩu phần 0,5–20 và nút bỏ; "Tổng dinh dưỡng";
/// - Lưu: luôn vào hàng đợi trên máy (gửi ngay khi có mạng), rồi đóng màn —
///   có mạng nói "Đã lưu bữa ăn!", mất mạng nói "Đã lưu — sẽ đồng bộ khi có mạng".
///
/// - "Ăn lại bữa này" (chỉ khi chưa có món): sáu bữa gần nhất khác nhau, chạm
///   là điền loại bữa + món + khẩu phần — xem lại rồi lưu;
/// - "Thêm nhanh" = món yêu thích (có sao) rồi món gần đây, tối đa 14;
/// - chạm vào một món đã thêm để sửa kcal / đạm / tinh bột / béo của MỘT khẩu
///   phần (cùng dải với món tự nhập).
///
/// Khác RN: chưa đánh / bỏ sao một món ở màn này. Mã vạch: nút cạnh ô tìm mở
/// `ScanBarcodeView`, món tìm được vào bữa (`consumePendingScan` của RN, không
/// cần kênh trung gian vì là cùng màn). AI (13/10): nút camera cạnh ô tìm mở
/// `ScanFoodView` (món xem lại rồi vào bữa); "Chưa biết ăn gì?" (`MealSuggestCard`)
/// gợi ý ba món cho bữa đang chọn, thêm thẳng vào bữa.
struct LogMealView: View {
  let userId: String
  var date: LocalDate?
  var mealType: String?
  /// Cách mở (`MealLogActions` của RN): ô tìm đã có con trỏ, hay mở sẵn phần
  /// "Món tự nhập".
  var start: Start = .plain
  /// Món có sẵn khi mở (14/10: "Thêm vào bữa" từ bài công thức Cộng đồng).
  var prefill: [MealLog.Food] = []
  /// Chữ có sẵn trong ô tìm (18/10, "Kể cho Koa": món người dùng kể mà app chưa
  /// khớp chắc — tìm sẵn để người dùng chỉ việc chọn).
  var initialQuery = ""
  var onDone: () -> Void = {}

  enum Start: Hashable { case plain, search, manual, scan, photo }

  @FocusState private var searchFocused: Bool

  @Environment(AppServices.self) private var services
  @Environment(\.dismiss) private var dismiss
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  @State private var logger: MealLogger?
  @State private var query = ""
  @State private var customOpen = false
  @State private var cName = ""
  @State private var cKcal = ""
  @State private var cProtein = ""
  @State private var cCarbs = ""
  @State private var cFat = ""
  @State private var error: String?
  @State private var editingId: String?
  @State private var draft = Draft()
  /// Máy quét mã vạch (`/scan-barcode`): mở từ nút cạnh ô tìm, hoặc ngay khi
  /// màn mở bằng `.scan` (nút mã vạch của tab — RN `nav.replace('/log-meal')`).
  @State private var scanning = false
  /// Chụp ảnh món (AI): nút camera cạnh ô tìm, hoặc mở bằng `.photo`.
  @State private var photographing = false

  /// Bốn ô của khung sửa một món (`draft` của RN).
  struct Draft: Equatable {
    var kcal = ""
    var protein = ""
    var carbs = ""
    var fat = ""
  }

  var body: some View {
    NavigationStack {
      Group {
        if let logger {
          content(logger)
        } else {
          DSLoadingView()
        }
      }
      .ascndPage()
      .navigationTitle(String(localized: "logMeal.title"))
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button(String(localized: "common.cancel")) { dismiss() }
        }
      }
    }
    .task {
      guard logger == nil else { return }
      // Cách mở của `MealLogActions`: "Tìm món" đặt con trỏ vào ô tìm,
      // "Nhập tay" mở sẵn phần món tự nhập.
      switch start {
      case .manual: customOpen = true
      case .scan: scanning = true
      case .photo: photographing = true
      case .search, .plain: break
      }
      let l = services.makeMealLogger(userId: userId, date: date, mealType: mealType)
      logger = l
      for f in prefill { l?.add(f) }
      if !initialQuery.isEmpty { query = initialQuery }
      // Con trỏ chỉ vào được ô tìm khi ô đã có trên màn — tức là sau khi có
      // sổ (trước đó màn là vòng chờ, đặt tiêu điểm lúc ấy không làm gì).
      if start == .search {
        try? await Task.sleep(for: .milliseconds(350))
        searchFocused = true
      }
      await l?.loadRecents()
    }
    .task(id: query) {
      // `debounced`: tìm sau 250 ms đứng yên.
      try? await Task.sleep(for: .milliseconds(250))
      guard !Task.isCancelled else { return }
      await logger?.search(query)
    }
    .onDisappear { logger?.close() }
    .fullScreenCover(isPresented: $scanning) {
      ScanBarcodeView { food in
        logger?.add(food.mealFood(id: UUID().uuidString.lowercased()))
      }
    }
    .fullScreenCover(isPresented: $photographing) {
      ScanFoodView { foods in
        for f in foods { logger?.add(f) }
      }
    }
    .alert(error ?? "", isPresented: Binding(get: { error != nil }, set: { if !$0 { error = nil } })) {
      Button(String(localized: "common.cancel"), role: .cancel) {}
    }
  }

  private func content(_ logger: MealLogger) -> some View {
    VStack(spacing: 0) {
      ScrollView {
        // Vẽ lại 19/10 (chủ dự án): chọn bữa trước — việc đầu tiên; ô tìm; món
        // đã thêm hiện NGAY dưới ô tìm (trước nằm cuối trang, khuất sau nút
        // Lưu: thêm món mà không thấy gì đổi); rồi ăn lại / thêm nhanh / gợi ý.
        VStack(alignment: .leading, spacing: DS.Spacing.md) {
          mealPicker(logger)
          searchField
          searchResults(logger)
          itemsSection(logger)
          let browsing = query.trimmingCharacters(in: .whitespaces).count < MealLog.searchMinLength
          if browsing, logger.showsRepeat { repeatBlock(logger) }
          if browsing, !logger.quickAdds.isEmpty { recents(logger) }
          // Gợi ý bữa cần edge function AI — ẩn khi chưa deploy.
          if browsing, services.aiDeployed == true {
            MealSuggestCard(logger: logger)
          }
          customCard(logger)
        }
        .padding(DS.Spacing.md)
      }
      .scrollDismissesKeyboard(.interactively)
      saveBar(logger)
    }
  }

  /// "Lưu bữa" mang luôn tổng kcal, macro ngay trên (thiết kế lại 13/10) —
  /// thay thẻ "Tổng dinh dưỡng" nằm lệch trái giữa trang.
  private func saveBar(_ logger: MealLogger) -> some View {
    let t = logger.totals
    return VStack(spacing: 6) {
      if logger.items.isEmpty {
        // Nút tắt phải nói vì sao (19/10).
        Text(String(localized: "logMeal.noItems"))
          .font(DS.TextStyle.caption)
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)
      } else {
        Text(verbatim: DiaryView.macros(t.protein, t.carbs, t.fat))
          .font(DS.TextStyle.caption.monospacedDigit())
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)
      }
      Button { Task { await save(logger) } } label: {
        HStack {
          Text(String(localized: "logMeal.save"))
          if !logger.items.isEmpty {
            Spacer()
            Text(verbatim: "\(DiaryView.whole(t.kcal)) kcal")
              .font(.system(.body, design: .rounded).weight(.bold).monospacedDigit())
          }
        }
        .font(DS.TextStyle.headline)
        .foregroundStyle(DS.Color.background.swiftUI)
        .padding(.horizontal, 22)
        .frame(maxWidth: .infinity, minHeight: 52)
        .background(Capsule().fill(DS.Color.foreground.swiftUI))
        .opacity(logger.canSave ? 1 : 0.4)
      }
      .buttonStyle(TodayPressStyle())
      .disabled(!logger.canSave)
      .accessibilityValue(Text(verbatim: logger.items.isEmpty ? "" : "\(DiaryView.whole(t.kcal)) kcal"))
    }
    .padding(.horizontal, DS.Spacing.md)
    .padding(.top, DS.Spacing.sm)
    .padding(.bottom, DS.Spacing.xs)
    .background(.regularMaterial)
  }

  // MARK: - Bữa

  /// Bữa: MỘT nút menu thay cho hàng sáu chip (19/10, chủ dự án: "chọn bữa
  /// phức tạp, thao tác quá nhiều"). Bữa đã đúng theo giờ (`MealLog.mealForHour`)
  /// hoặc theo thẻ bữa đã bấm — thường không cần chạm; muốn đổi thì một chạm mở
  /// danh sách.
  private func mealPicker(_ logger: MealLogger) -> some View {
    let meal = MascotRoomView.signalColor(.meal)
    return HStack(spacing: DS.Spacing.sm) {
      Text(String(localized: "logMeal.for"))
        .font(DS.TextStyle.footnote)
        .foregroundStyle(DS.Color.mutedForeground.swiftUI)
      Menu {
        Picker(selection: Binding(get: { logger.mealType }, set: { logger.mealType = $0 })) {
          ForEach(MealDiary.order, id: \.self) { key in
            Label(DiaryView.mealName(key), systemImage: MealSlotGlyph.symbol(key)).tag(key)
          }
        } label: {
          EmptyView()
        }
      } label: {
        HStack(spacing: 6) {
          Image(systemName: MealSlotGlyph.symbol(logger.mealType)).font(.footnote.weight(.semibold))
          Text(verbatim: DiaryView.mealName(logger.mealType)).font(DS.TextStyle.footnote.weight(.bold))
          Image(systemName: "chevron.down").font(.caption2.weight(.bold))
        }
        .foregroundStyle(meal)
        .padding(.horizontal, 14)
        .frame(minHeight: 36)
        .background(meal.opacity(0.12), in: Capsule())
        .frame(minHeight: 44)
        .contentShape(Rectangle())
      }
      .accessibilityLabel(Text(String(localized: "logMeal.for")))
      .accessibilityValue(Text(verbatim: DiaryView.mealName(logger.mealType)))
      .sensoryFeedback(.selection, trigger: logger.mealType)
      Spacer(minLength: 0)
    }
  }

  // MARK: - Tìm

  private var searchField: some View {
    HStack(spacing: 10) {
      Image(systemName: "magnifyingglass")
        .font(.system(size: 16, weight: .semibold))
        .foregroundStyle(MascotRoomView.signalColor(.meal))
        .accessibilityHidden(true)
      TextField(text: $query, prompt: Text(String(localized: "logMeal.search"))) {
        Text(String(localized: "logMeal.search"))
      }
      .focused($searchFocused)
      .textInputAutocapitalization(.never)
      .autocorrectionDisabled()
      .submitLabel(.search)
      // Chụp ảnh / quét là cách tìm (RN đặt nút mã vạch cạnh ô tìm). Chụp ảnh cần AI.
      if services.aiDeployed == true {
        Button { photographing = true } label: {
          Image(systemName: "camera")
            .font(.body.weight(.semibold))
            .foregroundStyle(DS.Color.foreground.swiftUI)
            .frame(minWidth: 40, minHeight: 44)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(Text(String(localized: "sf.a11y")))
      }
      Button { scanning = true } label: {
        Image(systemName: "barcode.viewfinder")
          .font(.body.weight(.semibold))
          .foregroundStyle(DS.Color.foreground.swiftUI)
          .frame(minWidth: 44, minHeight: 44)
          .contentShape(Rectangle())
      }
      .buttonStyle(.plain)
      .accessibilityLabel(Text(String(localized: "scan.a11y")))
    }
    .padding(.leading, 18)
    .padding(.trailing, 6)
    .frame(minHeight: 52)
    .background(Capsule().fill(.regularMaterial))
    .overlay(Capsule().strokeBorder(MascotRoomView.signalColor(.meal).opacity(0.55), lineWidth: 1.5))
  }

  @ViewBuilder private func searchResults(_ logger: MealLogger) -> some View {
    if let results = logger.results {
      if logger.searchFailed {
        Text(String(localized: "async.error.generic"))
          .font(DS.TextStyle.footnote)
          .foregroundStyle(DS.Color.destructive.swiftUI)
      } else if results.isEmpty {
        Text(String(localized: "logMeal.noResults"))
          .font(DS.TextStyle.footnote)
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)
      } else {
        listCard {
          ForEach(Array(results.enumerated()), id: \.element.id) { i, food in
            if i > 0 { Divider().padding(.leading, DS.Spacing.md).opacity(0.6) }
            foodRow(food) {
              logger.add(food)
              query = ""
            }
          }
        }
      }
    }
  }

  private func recents(_ logger: MealLogger) -> some View {
    VStack(alignment: .leading, spacing: DS.Spacing.xs) {
      sectionTitle(String(localized: "logMeal.quickAdd"))
      listCard {
        ForEach(Array(logger.quickAdds.enumerated()), id: \.element.id) { i, q in
          if i > 0 { Divider().padding(.leading, DS.Spacing.md).opacity(0.6) }
          foodRow(q.food, favorite: q.favorite) { logger.add(q.food) }
        }
      }
    }
  }

  private func sectionTitle(_ text: String) -> some View {
    Text(verbatim: text)
      .font(DS.TextStyle.footnote.weight(.semibold))
      .textCase(.uppercase)
      .tracking(0.5)
      .foregroundStyle(DS.Color.mutedForeground.swiftUI)
      .padding(.horizontal, DS.Spacing.xs)
      .accessibilityAddTraits(.isHeader)
  }

  /// Thẻ danh sách chung của màn (cùng kiểu thẻ với tab Dinh dưỡng).
  private func listCard<Content: View>(@ViewBuilder _ content: () -> Content) -> some View {
    VStack(spacing: 0) { content() }
      .clipShape(RoundedRectangle(cornerRadius: DS.Radius.xl, style: .continuous))
      .todayCard()
  }

  // MARK: - Ăn lại bữa này

  private func repeatBlock(_ logger: MealLogger) -> some View {
    let today = LocalDate(SystemWallClock().nowMillis(), in: .current)
    return VStack(alignment: .leading, spacing: DS.Spacing.xs) {
      sectionTitle(String(localized: "logMeal.repeat.title"))
      Text(String(localized: "logMeal.repeat.hint"))
        .font(DS.TextStyle.caption)
        .foregroundStyle(DS.Color.mutedForeground.swiftUI)
      ScrollView(.horizontal, showsIndicators: false) {
        HStack(spacing: DS.Spacing.sm) {
          ForEach(logger.recentMeals) { m in
            let when = Self.whenLabel(MealLog.daysAgo(m.at, today: today, in: .current))
            Button { logger.repeatMeal(m) } label: {
              VStack(alignment: .leading, spacing: 4) {
                HStack(spacing: 6) {
                  Image(systemName: MealSlotGlyph.symbol(m.mealType))
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(MascotRoomView.signalColor(.meal))
                    .accessibilityHidden(true)
                  Text(verbatim: DiaryView.mealName(m.mealType)).font(DS.TextStyle.footnote.weight(.bold))
                  Spacer(minLength: DS.Spacing.sm)
                  Text(verbatim: when)
                    .font(DS.TextStyle.caption)
                    .foregroundStyle(DS.Color.mutedForeground.swiftUI)
                }
                Text(verbatim: m.foods.map { $0.food.name }.joined(separator: ", "))
                  .font(DS.TextStyle.caption)
                  .lineLimit(2)
                  .multilineTextAlignment(.leading)
                Text(verbatim: "\(DiaryView.whole(m.kcal)) kcal · " + Self.foodsCount(m.foods.count))
                  .font(DS.TextStyle.caption.monospacedDigit())
                  .foregroundStyle(DS.Color.mutedForeground.swiftUI)
              }
              .padding(DS.Spacing.sm + 2)
              .frame(width: 210, alignment: .leading)
              .frame(minHeight: 44)
              .background(
                MascotRoomView.signalColor(.meal).opacity(0.10),
                in: RoundedRectangle(cornerRadius: DS.Radius.lg, style: .continuous))
              .overlay(
                RoundedRectangle(cornerRadius: DS.Radius.lg, style: .continuous)
                  .strokeBorder(MascotRoomView.signalColor(.meal).opacity(0.25), lineWidth: 1))
            }
            .buttonStyle(.plain)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(Text(verbatim: "\(DiaryView.mealName(m.mealType)), \(when), \(DiaryView.whole(m.kcal)) kcal"))
            .accessibilityAddTraits(.isButton)
          }
        }
      }
    }
  }

  /// "hôm nay" / "hôm qua" / "3 ngày trước".
  static func whenLabel(_ days: Int) -> String {
    if days <= 0 { return String(localized: "logMeal.repeat.today") }
    if days == 1 { return String(localized: "logMeal.repeat.yesterday") }
    return String(localized: "logMeal.repeat.daysAgo \(days)")
  }

  /// "1 món" / "3 món" — catalog không dùng plural, số 1 là khoá riêng.
  static func foodsCount(_ n: Int) -> String {
    n == 1 ? String(localized: "logMeal.repeat.oneFood") : String(localized: "logMeal.repeat.foods \(n)")
  }

  /// Một món để thêm: tên (sao nếu yêu thích), phần ăn + macro theo ngôn ngữ;
  /// kcal đậm bên phải ("≈" khi là ước tính); nút + tô màu bữa.
  private func foodRow(_ food: MealLog.Food, favorite: Bool = false, add: @escaping () -> Void) -> some View {
    let meal = MascotRoomView.signalColor(.meal)
    return Button(action: add) {
      HStack(spacing: DS.Spacing.sm) {
        VStack(alignment: .leading, spacing: 3) {
          HStack(spacing: 4) {
            if favorite {
              Image(systemName: "star.fill")
                .font(.caption)
                .foregroundStyle(DS.Color.metricOrange.swiftUI)
                .accessibilityLabel(Text(String(localized: "logMeal.a11y.favorite")))
            }
            Text(verbatim: food.name).font(DS.TextStyle.body.weight(.medium)).lineLimit(2)
          }
          Text(verbatim: Self.rowDetail(food))
            .font(DS.TextStyle.caption.monospacedDigit())
            .foregroundStyle(DS.Color.mutedForeground.swiftUI)
            .lineLimit(1)
            .minimumScaleFactor(0.8)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        VStack(alignment: .trailing, spacing: 0) {
          Text(verbatim: (food.isEstimate ? "≈" : "") + DiaryView.whole(food.kcal))
            .font(.system(.body, design: .rounded).weight(.bold).monospacedDigit())
          Text(String(localized: "nc.kcal"))
            .font(DS.TextStyle.caption)
            .foregroundStyle(DS.Color.mutedForeground.swiftUI)
        }
        Image(systemName: "plus")
          .font(.system(size: 14, weight: .bold))
          .foregroundStyle(.white)
          .frame(width: 32, height: 32)
          .background(meal, in: Circle())
          .accessibilityHidden(true)
      }
      .padding(.horizontal, DS.Spacing.md)
      .padding(.vertical, DS.Spacing.sm)
      .frame(minHeight: 60)
      .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
    .accessibilityElement(children: .combine)
    .accessibilityHint(Text(String(localized: "logMeal.a11y.add")))
    .sensoryFeedback(.selection, trigger: logger?.items.count ?? 0)
  }

  // MARK: - Tự nhập

  private func customCard(_ logger: MealLogger) -> some View {
    let bad = MealLog.customBad(kcal: cKcal, protein: cProtein, carbs: cCarbs, fat: cFat)
    let ready = MealLog.customItem(id: "_", name: cName, kcal: cKcal, protein: cProtein, carbs: cCarbs, fat: cFat) != nil
    return DSCard {
      VStack(alignment: .leading, spacing: DS.Spacing.sm) {
        Button {
          withAnimation(reduceMotion ? nil : .easeOut(duration: 0.2)) { customOpen.toggle() }
        } label: {
          HStack {
            Label(String(localized: "logMeal.custom"), systemImage: "square.and.pencil")
              .font(DS.TextStyle.headline)
              .foregroundStyle(DS.Color.foreground.swiftUI)
            Spacer()
            Image(systemName: "chevron.down")
              .rotationEffect(.degrees(customOpen ? 180 : 0))
              .foregroundStyle(DS.Color.mutedForeground.swiftUI)
              .accessibilityHidden(true)
          }
          .frame(minHeight: 44)
          .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityValue(Text(customOpen ? String(localized: "diary.a11y.expanded") : String(localized: "diary.a11y.collapsed")))

        if customOpen {
          TextField(text: $cName, prompt: Text(String(localized: "logMeal.custom.namePlaceholder"))) {
            Text(String(localized: "logMeal.custom.name"))
          }
          .padding(DS.Spacing.sm)
          .frame(minHeight: 44)
          .background(DS.Color.input.swiftUI, in: RoundedRectangle(cornerRadius: DS.Radius.sm))
          HStack(spacing: DS.Spacing.sm) {
            numberField("kcal", $cKcal, bounds: MealLog.kcalBounds)
            numberField(String(localized: "logMeal.protein") + " (g)", $cProtein, bounds: MealLog.macroBounds)
          }
          HStack(spacing: DS.Spacing.sm) {
            numberField(String(localized: "logMeal.carbs") + " (g)", $cCarbs, bounds: MealLog.macroBounds)
            numberField(String(localized: "logMeal.fat") + " (g)", $cFat, bounds: MealLog.macroBounds)
          }
          if bad {
            Text(String(localized: "logMeal.custom.outOfRange"))
              .font(DS.TextStyle.footnote)
              .foregroundStyle(DS.Color.destructive.swiftUI)
          }
          Button {
            if logger.addCustom(name: cName, kcal: cKcal, protein: cProtein, carbs: cCarbs, fat: cFat) {
              cName = ""
              cKcal = ""
              cProtein = ""
              cCarbs = ""
              cFat = ""
            }
          } label: {
            Text(String(localized: "logMeal.custom.add"))
              .font(DS.TextStyle.footnote.weight(.semibold))
              .frame(maxWidth: .infinity, minHeight: 44)
              .background(DS.Color.muted.swiftUI, in: RoundedRectangle(cornerRadius: DS.Radius.sm))
          }
          .buttonStyle(.plain)
          .disabled(!ready)
          .opacity(ready ? 1 : 0.5)
        }
      }
    }
  }

  private func numberField(_ label: String, _ text: Binding<String>, bounds: ClosedRange<Double>) -> some View {
    let bad = MealLog.field(text.wrappedValue, bounds) == .bad
    return VStack(alignment: .leading, spacing: 2) {
      Text(verbatim: label)
        .font(DS.TextStyle.caption)
        .foregroundStyle(DS.Color.mutedForeground.swiftUI)
        .accessibilityHidden(true)
      TextField(text: text, prompt: Text(verbatim: "0")) { Text(verbatim: label) }
        .keyboardType(.decimalPad)
        .padding(DS.Spacing.sm)
        .frame(minHeight: 44)
        .background(DS.Color.input.swiftUI, in: RoundedRectangle(cornerRadius: DS.Radius.sm))
        .overlay(
          RoundedRectangle(cornerRadius: DS.Radius.sm)
            .stroke(bad ? DS.Color.destructive.swiftUI : .clear, lineWidth: 1.5))
    }
  }

  // MARK: - Các món

  /// Khay "Trong bữa này": các món đã thêm, ngay dưới ô tìm. Trống thì không
  /// hiện — dòng dưới nút Lưu đã nói cần làm gì.
  @ViewBuilder private func itemsSection(_ logger: MealLogger) -> some View {
    if !logger.items.isEmpty {
      VStack(alignment: .leading, spacing: DS.Spacing.xs) {
        HStack {
          sectionTitle(String(localized: "logMeal.tray \(logger.items.count)"))
          Spacer()
          Text(verbatim: "\(DiaryView.whole(logger.totals.kcal)) kcal")
            .font(DS.TextStyle.footnote.weight(.semibold).monospacedDigit())
            .foregroundStyle(MascotRoomView.signalColor(.meal))
        }
        VStack(spacing: 0) {
          ForEach(Array(logger.items.enumerated()), id: \.element.id) { i, it in
            if i > 0 { Divider().padding(.leading, DS.Spacing.md).opacity(0.6) }
            itemRow(logger, it)
          }
        }
        .background(
          MascotRoomView.signalColor(.meal).opacity(0.08),
          in: RoundedRectangle(cornerRadius: DS.Radius.xl, style: .continuous))
        .overlay(
          RoundedRectangle(cornerRadius: DS.Radius.xl, style: .continuous)
            .strokeBorder(MascotRoomView.signalColor(.meal).opacity(0.35), lineWidth: 1.5))
      }
      .transition(.opacity.combined(with: .move(edge: .top)))
    }
  }

  private func itemRow(_ logger: MealLogger, _ it: MealLog.Item) -> some View {
    VStack(alignment: .leading, spacing: 0) {
      itemLine(logger, it)
      if editingId == it.id { editPanel(logger, it) }
    }
    .padding(.leading, DS.Spacing.md)
    .padding(.trailing, DS.Spacing.xs)
    .padding(.vertical, 6)
  }

  /// Chạm phần chữ để mở / đóng khung sửa macro của món (`openEdit`).
  private func toggleEdit(_ it: MealLog.Item) {
    if editingId == it.id {
      editingId = nil
      return
    }
    draft = Draft(
      kcal: MealLog.draftText(it.kcal), protein: MealLog.draftText(it.protein),
      carbs: MealLog.draftText(it.carbs), fat: MealLog.draftText(it.fat))
    editingId = it.id
  }

  private func editPanel(_ logger: MealLogger, _ it: MealLog.Item) -> some View {
    let bad = MealLog.customBad(kcal: draft.kcal, protein: draft.protein, carbs: draft.carbs, fat: draft.fat)
    return VStack(alignment: .leading, spacing: DS.Spacing.sm) {
      HStack(spacing: DS.Spacing.sm) {
        numberField("kcal", $draft.kcal, bounds: MealLog.kcalBounds)
        numberField(String(localized: "logMeal.protein") + " (g)", $draft.protein, bounds: MealLog.macroBounds)
      }
      HStack(spacing: DS.Spacing.sm) {
        numberField(String(localized: "logMeal.carbs") + " (g)", $draft.carbs, bounds: MealLog.macroBounds)
        numberField(String(localized: "logMeal.fat") + " (g)", $draft.fat, bounds: MealLog.macroBounds)
      }
      if bad {
        Text(String(localized: "logMeal.custom.outOfRange"))
          .font(DS.TextStyle.footnote)
          .foregroundStyle(DS.Color.destructive.swiftUI)
      }
      Button {
        if logger.edit(it.id, kcal: draft.kcal, protein: draft.protein, carbs: draft.carbs, fat: draft.fat) {
          editingId = nil
        }
      } label: {
        Text(String(localized: "logMeal.edit.done"))
          .font(DS.TextStyle.footnote.weight(.semibold))
          .frame(maxWidth: .infinity, minHeight: 44)
          .background(DS.Color.muted.swiftUI, in: RoundedRectangle(cornerRadius: DS.Radius.sm))
      }
      .buttonStyle(.plain)
      .disabled(bad)
      .opacity(bad ? 0.5 : 1)
    }
    .padding(.bottom, DS.Spacing.sm)
  }

  private func itemLine(_ logger: MealLogger, _ it: MealLog.Item) -> some View {
    HStack(spacing: DS.Spacing.sm) {
      Button { toggleEdit(it) } label: {
        VStack(alignment: .leading, spacing: 2) {
          Text(verbatim: it.name).font(DS.TextStyle.body).lineLimit(1)
          Text(verbatim: "\(DiaryView.whole(it.kcal * it.servings)) kcal · "
            + DiaryView.macros(it.protein * it.servings, it.carbs * it.servings, it.fat * it.servings))
            .lineLimit(1)
            .minimumScaleFactor(0.8)
            .font(DS.TextStyle.caption.monospacedDigit())
            .foregroundStyle(DS.Color.mutedForeground.swiftUI)
        }
        .frame(minHeight: 44)
        .contentShape(Rectangle())
      }
      .buttonStyle(.plain)
      .accessibilityElement(children: .combine)
      .accessibilityHint(Text(String(localized: "logMeal.a11y.edit")))
      .accessibilityValue(Text(editingId == it.id ? String(localized: "diary.a11y.expanded") : String(localized: "diary.a11y.collapsed")))
      Spacer(minLength: 0)
      stepper(logger, it)
      Button {
        logger.remove(it.id)
        if editingId == it.id { editingId = nil }
      } label: {
        Image(systemName: "xmark")
          .foregroundStyle(DS.Color.foreground.swiftUI)
          .frame(width: 44, height: 44)
          .contentShape(Rectangle())
      }
      .buttonStyle(.plain)
      .accessibilityLabel(Text(String(localized: "logMeal.a11y.remove \(it.name)")))
    }
  }

  private func stepper(_ logger: MealLogger, _ it: MealLog.Item) -> some View {
    HStack(spacing: 2) {
      stepButton("minus", next: MealDiary.step(it.servings, by: -1), current: it.servings) {
        logger.setServings(it.id, $0)
      }
      Text(verbatim: MealDiary.servingsText(it.servings))
        .font(DS.TextStyle.footnote.monospacedDigit())
        .frame(minWidth: 28)
      stepButton("plus", next: MealDiary.step(it.servings, by: 1), current: it.servings) {
        logger.setServings(it.id, $0)
      }
    }
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(Text(String(localized: "diary.servings")))
    .accessibilityValue(Text(verbatim: MealDiary.servingsText(it.servings)))
    .accessibilityAdjustableAction { dir in
      logger.setServings(it.id, MealDiary.step(it.servings, by: dir == .increment ? 1 : -1))
    }
  }

  private func stepButton(
    _ icon: String, next: Double, current: Double, set: @escaping (Double) -> Void
  ) -> some View {
    Button { set(next) } label: {
      Image(systemName: icon)
        .font(.footnote.weight(.semibold))
        .frame(width: 36, height: 44)
        .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
    .disabled(next == current)
    .sensoryFeedback(.selection, trigger: current)
    .accessibilityLabel(Text(String(localized: icon.contains("minus") ? "a11y.decrease" : "a11y.increase")))
  }

  // MARK: - Lưu

  private func save(_ logger: MealLogger) async {
    switch await logger.save(online: services.sync.online) {
    case .queued(let online):
      let text = online ? String(localized: "logMeal.saved") : String(localized: "logMeal.queued")
      AccessibilityNotification.Announcement(text).post()
      onDone()
      dismiss()
    case .unavailable:
      break
    case .failed:
      error = String(localized: "async.error.generic")
      AccessibilityNotification.Announcement(String(localized: "async.error.generic")).post()
    }
  }
}

extension LogMealView {
  /// Dòng phụ của hàng món: phần ăn (nếu có) + macro — kcal đứng riêng bên phải.
  static func rowDetail(_ food: MealLog.Food) -> String {
    ([food.portion].compactMap { $0 } + [DiaryView.macros(food.protein, food.carbs, food.fat)]).joined(separator: " · ")
  }


}
