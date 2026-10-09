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
/// Khác RN / chưa có: gợi ý bữa bằng AI, quét ảnh / mã vạch, món yêu thích,
/// "Ăn lại bữa trước", sửa macro của một món đã thêm.
struct LogMealView: View {
  let userId: String
  var date: LocalDate?
  var mealType: String?
  var onDone: () -> Void = {}

  @Environment(AppServices.self) private var services
  @Environment(\.dismiss) private var dismiss
  @State private var logger: MealLogger?
  @State private var query = ""
  @State private var customOpen = false
  @State private var cName = ""
  @State private var cKcal = ""
  @State private var cProtein = ""
  @State private var cCarbs = ""
  @State private var cFat = ""
  @State private var error: String?

  var body: some View {
    NavigationStack {
      Group {
        if let logger {
          content(logger)
        } else {
          DSLoadingView()
        }
      }
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
      let l = services.makeMealLogger(userId: userId, date: date, mealType: mealType)
      logger = l
      await l?.loadRecents()
    }
    .task(id: query) {
      // `debounced`: tìm sau 250 ms đứng yên.
      try? await Task.sleep(for: .milliseconds(250))
      guard !Task.isCancelled else { return }
      await logger?.search(query)
    }
    .onDisappear { logger?.close() }
    .alert(error ?? "", isPresented: Binding(get: { error != nil }, set: { if !$0 { error = nil } })) {
      Button(String(localized: "common.cancel"), role: .cancel) {}
    }
  }

  private func content(_ logger: MealLogger) -> some View {
    VStack(spacing: 0) {
      ScrollView {
        VStack(alignment: .leading, spacing: DS.Spacing.md) {
          mealPicker(logger)
          searchField
          searchResults(logger)
          if !logger.recents.isEmpty && query.trimmingCharacters(in: .whitespaces).count < MealLog.searchMinLength {
            recents(logger)
          }
          customCard(logger)
          itemsSection(logger)
          if !logger.items.isEmpty { totalsCard(logger) }
        }
        .padding(DS.Spacing.md)
      }
      .scrollDismissesKeyboard(.interactively)
      DSButton(String(localized: "logMeal.save")) { Task { await save(logger) } }
        .disabled(!logger.canSave)
        .opacity(logger.canSave ? 1 : 0.5)
        .padding(DS.Spacing.md)
    }
  }

  // MARK: - Bữa

  private func mealPicker(_ logger: MealLogger) -> some View {
    ScrollView(.horizontal, showsIndicators: false) {
      HStack(spacing: DS.Spacing.sm) {
        ForEach(MealDiary.order, id: \.self) { key in
          let on = logger.mealType == key
          Button {
            logger.mealType = key
          } label: {
            Text(verbatim: DiaryView.mealName(key))
              .font(DS.TextStyle.footnote.weight(on ? .semibold : .regular))
              .foregroundStyle(on ? DS.Color.background.swiftUI : DS.Color.foreground.swiftUI)
              .padding(.horizontal, DS.Spacing.md)
              .frame(minHeight: 44)
              .background(on ? DS.Color.foreground.swiftUI : DS.Color.muted.swiftUI, in: Capsule())
          }
          .buttonStyle(.plain)
          .accessibilityAddTraits(on ? .isSelected : [])
          .sensoryFeedback(.selection, trigger: on)
        }
      }
    }
  }

  // MARK: - Tìm

  private var searchField: some View {
    HStack {
      Image(systemName: "magnifyingglass")
        .foregroundStyle(DS.Color.mutedForeground.swiftUI)
        .accessibilityHidden(true)
      TextField(text: $query, prompt: Text(String(localized: "logMeal.search"))) {
        Text(String(localized: "logMeal.search"))
      }
      .textInputAutocapitalization(.never)
      .autocorrectionDisabled()
      .submitLabel(.search)
    }
    .padding(DS.Spacing.sm)
    .frame(minHeight: 44)
    .background(DS.Color.input.swiftUI, in: RoundedRectangle(cornerRadius: DS.Radius.sm))
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
        VStack(spacing: DS.Spacing.xs) {
          ForEach(results) { food in
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
      Text(String(localized: "logMeal.quickAdd"))
        .font(DS.TextStyle.caption.weight(.semibold))
        .foregroundStyle(DS.Color.mutedForeground.swiftUI)
        .accessibilityAddTraits(.isHeader)
      ForEach(logger.recents) { food in
        foodRow(food) { logger.add(food) }
      }
    }
  }

  private func foodRow(_ food: MealLog.Food, add: @escaping () -> Void) -> some View {
    Button(action: add) {
      HStack {
        VStack(alignment: .leading, spacing: 2) {
          Text(verbatim: food.name).font(DS.TextStyle.body).lineLimit(1)
          Text(verbatim: "\(DiaryView.whole(food.kcal)) kcal · " + DiaryView.macros(food.protein, food.carbs, food.fat))
            .font(DS.TextStyle.caption.monospacedDigit())
            .foregroundStyle(DS.Color.mutedForeground.swiftUI)
        }
        Spacer()
        Image(systemName: "plus.circle.fill")
          .font(.title3)
          .foregroundStyle(DS.Color.primary.swiftUI)
          .accessibilityHidden(true)
      }
      .padding(.horizontal, DS.Spacing.md)
      .frame(minHeight: 52)
      .background(DS.Color.card.swiftUI, in: RoundedRectangle(cornerRadius: DS.Radius.md))
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
          withAnimation(.easeOut(duration: 0.2)) { customOpen.toggle() }
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

  @ViewBuilder private func itemsSection(_ logger: MealLogger) -> some View {
    if logger.items.isEmpty {
      Text(String(localized: "logMeal.noItems"))
        .font(DS.TextStyle.footnote)
        .foregroundStyle(DS.Color.mutedForeground.swiftUI)
        .frame(maxWidth: .infinity)
        .padding(.vertical, DS.Spacing.md)
    } else {
      Text(String(localized: "logMeal.items"))
        .font(DS.TextStyle.caption.weight(.semibold))
        .foregroundStyle(DS.Color.mutedForeground.swiftUI)
        .accessibilityAddTraits(.isHeader)
      ForEach(logger.items) { it in itemRow(logger, it) }
    }
  }

  private func itemRow(_ logger: MealLogger, _ it: MealLog.Item) -> some View {
    HStack(spacing: DS.Spacing.sm) {
      VStack(alignment: .leading, spacing: 2) {
        Text(verbatim: it.name).font(DS.TextStyle.body).lineLimit(1)
        Text(verbatim: "\(DiaryView.whole(it.kcal * it.servings)) kcal · "
          + DiaryView.macros(it.protein * it.servings, it.carbs * it.servings, it.fat * it.servings))
          .font(DS.TextStyle.caption.monospacedDigit())
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)
      }
      .accessibilityElement(children: .combine)
      Spacer(minLength: 0)
      stepper(logger, it)
      Button {
        logger.remove(it.id)
      } label: {
        Image(systemName: "xmark")
          .foregroundStyle(DS.Color.foreground.swiftUI)
          .frame(width: 44, height: 44)
          .contentShape(Rectangle())
      }
      .buttonStyle(.plain)
      .accessibilityLabel(Text(String(localized: "logMeal.a11y.remove \(it.name)")))
    }
    .padding(.horizontal, DS.Spacing.sm)
    .background(DS.Color.card.swiftUI, in: RoundedRectangle(cornerRadius: DS.Radius.md))
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
  }

  private func totalsCard(_ logger: MealLogger) -> some View {
    let t = logger.totals
    return DSCard {
      VStack(alignment: .leading, spacing: DS.Spacing.xs) {
        Text(String(localized: "logMeal.total"))
          .font(DS.TextStyle.caption.weight(.semibold))
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)
        Text(verbatim: "\(DiaryView.whole(t.kcal)) kcal")
          .font(DS.TextStyle.title.monospacedDigit())
        HStack(spacing: DS.Spacing.md) {
          macro(String(localized: "logMeal.protein"), t.protein)
          macro(String(localized: "logMeal.carbs"), t.carbs)
          macro(String(localized: "logMeal.fat"), t.fat)
        }
      }
      .accessibilityElement(children: .combine)
    }
  }

  private func macro(_ label: String, _ grams: Double) -> some View {
    VStack(alignment: .leading, spacing: 0) {
      Text(verbatim: "\(DiaryView.whole(grams)) g").font(DS.TextStyle.headline.monospacedDigit())
      Text(verbatim: label)
        .font(DS.TextStyle.caption)
        .foregroundStyle(DS.Color.mutedForeground.swiftUI)
    }
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
