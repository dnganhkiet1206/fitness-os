import ASCNDCore
import ASCNDDesignSystem
import SwiftUI

/// Lên kế hoạch ăn trong MỘT tấm (thiết kế lại 13/10, chủ dự án duyệt mock) —
/// thay `MealPlanWizard` 4 bước của RN (`meal-plan-wizard.tsx` @ fac9ac2) và
/// `CreatePlanSheet` cũ của native (tạo xong phải mở kế hoạch mới thêm được món).
///
/// Ba bước, một thanh tiến độ:
/// 1. **Kế hoạch:** tên (có gợi ý), mục tiêu, và CÁC BỮA — chọn từng bữa
///    (mặc định Sáng / Trưa / Tối, bật thêm Ăn vặt / Trước tập / Sau tập),
///    không phải một con số "bữa mỗi ngày" (chủ dự án). Tạo kế hoạch khi "Tiếp".
/// 2. **Lưới tuần** bữa × 7 ngày: một cái nhìn thấy ô nào đã có món; chạm một
///    ô là chọn luôn ngày + bữa (RN tách hai bước). "+ Thêm bữa" ngay trên lưới.
/// 3. **Thêm món** vào ô ấy: tìm / món của tôi, chạm để thêm; "Lặp cho cả tuần"
///    thêm cùng món vào bữa ấy cả 7 ngày (RN không có). Xong quay về lưới.
///
/// Luật và dữ liệu không đổi: `MealPlansBook.create`, `MealPlanBook.add`;
/// `meals_per_day` ghi `storedMealsPerDay` (3…6), bữa chọn thêm sống bằng món
/// của nó (`MealPlans.rows`).
struct PlanWizardView: View {
  let plans: MealPlansBook
  /// Xong: mở kế hoạch vừa tạo.
  let onFinished: (String) -> Void
  @Environment(AppServices.self) private var services
  @Environment(\.dismiss) private var dismiss
  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  @State private var step = 1
  @State private var name = ""
  @State private var goal = "maintain"
  @State private var chosen: Set<String> = ["breakfast", "lunch", "dinner"]
  @State private var planId: String?
  @State private var book: MealPlanBook?
  @State private var cell: Cell?
  @State private var extra: Set<String> = []
  @State private var message: String?
  @State private var creating = false

  struct Cell: Hashable {
    let day: Int
    let meal: String
  }

  private var meal: Color { MascotRoomView.signalColor(.meal) }

  var body: some View {
    NavigationStack {
      ScrollView {
        VStack(alignment: .leading, spacing: DS.Spacing.md) {
          progress
          switch step {
          case 1: planStep
          case 2: gridStep
          default: foodStep
          }
        }
        .padding(DS.Spacing.md)
        .animation(reduceMotion ? nil : .smooth(duration: 0.3), value: step)
      }
      .scrollDismissesKeyboard(.interactively)
      .ascndPage()
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          if step == 3 {
            Button { step = 2 } label: { Image(systemName: "chevron.left") }
              .accessibilityLabel(Text(String(localized: "pw.back")))
          } else {
            Button(String(localized: step == 2 ? "plans.done" : "common.cancel")) { close() }
          }
        }
      }
      .alert(message ?? "", isPresented: Binding(get: { message != nil }, set: { if !$0 { message = nil } })) {
        Button(String(localized: "plans.ok"), role: .cancel) {}
      }
    }
    .interactiveDismissDisabled(creating)
    .onDisappear { book?.close() }
  }

  // MARK: - Tiến độ

  private var progress: some View {
    VStack(alignment: .leading, spacing: 6) {
      HStack(spacing: 4) {
        ForEach(1...3, id: \.self) { i in
          Capsule().fill(i <= step ? meal : DS.Color.foreground.swiftUI.opacity(0.12)).frame(height: 4)
        }
      }
      .accessibilityHidden(true)
      Text(String(localized: "pw.step \(step) \(3)") + subtitle)
        .font(DS.TextStyle.footnote)
        .foregroundStyle(DS.Color.mutedForeground.swiftUI)
    }
  }

  private var subtitle: String {
    var parts: [String] = []
    if step >= 2 { parts.append(name.trimmingCharacters(in: .whitespaces)) }
    if step == 3, let cell { parts.append(cellLabel(cell)) }
    return parts.isEmpty ? "" : " · " + parts.joined(separator: " · ")
  }

  // MARK: - Bước 1

  private var planStep: some View {
    VStack(alignment: .leading, spacing: DS.Spacing.md) {
      title(String(localized: "plans.new"))
      VStack(alignment: .leading, spacing: 8) {
        TextField(text: $name, prompt: Text(String(localized: "plans.name.placeholder"))) {
          Text(String(localized: "plans.name"))
        }
        .font(.system(size: 17))
        .padding(.horizontal, DS.Spacing.md)
        .frame(minHeight: 50)
        .background(DS.Color.card.swiftUI, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).strokeBorder(DS.Color.foreground.swiftUI.opacity(0.08)))
        ScrollView(.horizontal, showsIndicators: false) {
          HStack(spacing: 6) {
            ForEach(["pw.suggest.clean", "pw.suggest.cut", "pw.suggest.bulk", "pw.suggest.busy"], id: \.self) { key in
              let text = String(localized: String.LocalizationValue(key))
              chip(text, on: name == text) { name = text }
            }
          }
        }
      }

      label(String(localized: "plans.goal"))
      Picker(selection: $goal) {
        ForEach(MealPlans.goals, id: \.self) { g in Text(verbatim: MealPlansView.goalLabel(g) ?? g).tag(g) }
      } label: {
        Text(String(localized: "plans.goal"))
      }
      .pickerStyle(.segmented)

      label(String(localized: "pw.meals"))
      FlowRows(spacing: 8, centered: false) {
        ForEach(MealDiary.order, id: \.self) { m in
          chip(DiaryView.mealName(m), on: chosen.contains(m), symbol: MealSlotGlyph.symbol(m)) {
            if chosen.contains(m) {
              if chosen.count > 1 { chosen.remove(m) }
            } else {
              chosen.insert(m)
            }
          }
        }
      }
      Text(String(localized: "pw.meals.hint"))
        .font(DS.TextStyle.caption)
        .foregroundStyle(DS.Color.mutedForeground.swiftUI)

      let ok = !name.trimmingCharacters(in: .whitespaces).isEmpty && !chosen.isEmpty
      primary(String(localized: "pw.next"), enabled: ok && !creating, busy: creating) { Task { await create() } }
    }
  }

  private func create() async {
    creating = true
    defer { creating = false }
    let (outcome, id) = await plans.create(
      name: name, goal: goal, mealsPerDay: MealPlans.storedMealsPerDay(chosen), online: services.sync.online)
    switch outcome {
    case .done:
      guard let id else { return }
      planId = id
      let b = services.makeMealPlan(userId: plans.userId, planId: id)
      book = b
      // Bữa chọn thêm ngoài `meals_per_day` (ví dụ Sau tập khi chỉ có 3 bữa).
      extra = chosen.subtracting(MealPlans.slots(MealPlans.storedMealsPerDay(chosen)))
      step = 2
      await b?.load()
      await b?.loadMyFoods()
    case .invalid: break
    case .onlineOnly: message = String(localized: "plans.error.onlineOnly")
    case .nothingWritten, .failed: message = String(localized: "async.error.generic")
    }
    if let message { AccessibilityNotification.Announcement(message).post() }
  }

  // MARK: - Bước 2: lưới tuần

  private var rows: [String] {
    let items = book?.items ?? []
    return MealPlans.rows(mealsPerDay: MealPlans.storedMealsPerDay(chosen), items: items, extra: extra)
      .filter { m in chosen.contains(m) || extra.contains(m) || items.contains { $0.mealType == m } }
  }

  private var gridStep: some View {
    VStack(alignment: .leading, spacing: DS.Spacing.md) {
      title(String(localized: "pw.grid.title"))
      VStack(spacing: 6) {
        HStack(spacing: 4) {
          Color.clear.frame(width: 72, height: 1)
          ForEach(MealPlans.days, id: \.self) { d in
            Text(verbatim: "\(d + 1)")
              .font(DS.TextStyle.caption.monospacedDigit())
              .foregroundStyle(DS.Color.mutedForeground.swiftUI)
              .frame(maxWidth: .infinity)
          }
        }
        .accessibilityHidden(true)
        ForEach(rows, id: \.self) { m in
          HStack(spacing: 4) {
            Text(verbatim: DiaryView.mealName(m))
              .font(DS.TextStyle.footnote)
              .lineLimit(1)
              .minimumScaleFactor(0.8)
              .frame(width: 72, alignment: .leading)
            ForEach(MealPlans.days, id: \.self) { d in gridCell(Cell(day: d, meal: m)) }
          }
        }
      }
      .padding(DS.Spacing.md)
      .todayCard(radius: DS.Radius.xl)

      let missing = MealDiary.order.filter { !rows.contains($0) }
      if !missing.isEmpty {
        Menu {
          ForEach(missing, id: \.self) { m in
            Button(DiaryView.mealName(m)) { extra.insert(m) }
          }
        } label: {
          Label(String(localized: "pw.addMeal"), systemImage: "plus")
            .font(DS.TextStyle.footnote.weight(.semibold))
            .foregroundStyle(meal)
            .frame(minHeight: 44)
        }
      }
      Text(String(localized: "pw.grid.hint"))
        .font(DS.TextStyle.caption)
        .foregroundStyle(DS.Color.mutedForeground.swiftUI)
      if let planId {
        primary(String(localized: "pw.finish"), enabled: true) {
          dismiss()
          onFinished(planId)
        }
      }
    }
  }

  private func count(_ c: Cell) -> Int {
    (book?.items ?? []).filter { $0.day == c.day && $0.mealType == c.meal }.count
  }

  private func gridCell(_ c: Cell) -> some View {
    let n = count(c)
    return Button {
      cell = c
      step = 3
    } label: {
      RoundedRectangle(cornerRadius: 7, style: .continuous)
        .fill(n > 0 ? meal : DS.Color.foreground.swiftUI.opacity(0.06))
        .overlay {
          if n > 1 {
            Text(verbatim: "\(n)").font(.caption2.weight(.bold).monospacedDigit()).foregroundStyle(.white)
          }
        }
        .frame(height: 30)
        .frame(maxWidth: .infinity)
        .contentShape(Rectangle())
    }
    .buttonStyle(TodayPressStyle(scale: 0.92))
    .accessibilityLabel(Text(verbatim: cellLabel(c)))
    .accessibilityValue(Text(n > 0 ? String(localized: "pw.cell.foods \(n)") : String(localized: "nc.slot.empty")))
  }

  private func cellLabel(_ c: Cell) -> String {
    String(localized: "pw.cell \(DiaryView.mealName(c.meal)) \(c.day + 1)")
  }

  // MARK: - Bước 3: thêm món

  @State private var query = ""
  @State private var repeatWeek = false

  @ViewBuilder private var foodStep: some View {
    if let book, let cell {
      VStack(alignment: .leading, spacing: DS.Spacing.md) {
        title(String(localized: "plans.addFood"))
        HStack(spacing: 10) {
          Image(systemName: "magnifyingglass").foregroundStyle(meal).accessibilityHidden(true)
          TextField(text: $query, prompt: Text(String(localized: "logMeal.search"))) {
            Text(String(localized: "logMeal.search"))
          }
          .autocorrectionDisabled()
          .textInputAutocapitalization(.never)
        }
        .padding(.horizontal, DS.Spacing.md)
        .frame(minHeight: 48)
        .background(Capsule().fill(.regularMaterial))
        .overlay(Capsule().strokeBorder(meal.opacity(0.55), lineWidth: 1.5))
        .task(id: query) {
          try? await Task.sleep(for: .milliseconds(250))
          guard !Task.isCancelled else { return }
          await book.search(query)
        }

        Toggle(isOn: $repeatWeek) {
          VStack(alignment: .leading, spacing: 2) {
            Text(String(localized: "pw.repeat")).font(DS.TextStyle.body)
            Text(String(localized: "pw.repeat.hint \(DiaryView.mealName(cell.meal).lowercased())"))
              .font(DS.TextStyle.caption)
              .foregroundStyle(DS.Color.mutedForeground.swiftUI)
          }
        }
        .tint(meal)
        .padding(DS.Spacing.md)
        .todayCard(radius: DS.Radius.lg)

        foodList(book, cell: cell)
      }
    }
  }

  @ViewBuilder private func foodList(_ book: MealPlanBook, cell: Cell) -> some View {
    let here = MealPlans.alreadyHere(book.items, day: cell.day, mealType: cell.meal)
    let q = query.trimmingCharacters(in: .whitespaces)
    let foods: [FoodLibrary.Food]? = q.count >= MealLog.searchMinLength ? book.results : book.myFoods
    if q.count < MealLog.searchMinLength, !book.myFoods.isEmpty { label(String(localized: "plans.fromList")) }
    if let foods {
      if foods.isEmpty, q.count >= MealLog.searchMinLength {
        Text(String(localized: "plans.noMatch \(q)"))
          .font(DS.TextStyle.footnote)
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)
      } else {
        VStack(spacing: 0) {
          ForEach(Array(foods.enumerated()), id: \.element.id) { i, f in
            if i > 0 { Divider().padding(.leading, DS.Spacing.md).opacity(0.6) }
            foodRow(f, inMeal: here.contains(f.name.trimmingCharacters(in: .whitespaces).lowercased()), cell: cell)
          }
        }
        .clipShape(RoundedRectangle(cornerRadius: DS.Radius.xl, style: .continuous))
        .todayCard(radius: DS.Radius.xl)
      }
    } else {
      ProgressView().frame(maxWidth: .infinity)
    }
  }

  private func foodRow(_ f: FoodLibrary.Food, inMeal: Bool, cell: Cell) -> some View {
    Button { Task { await add(f, cell: cell) } } label: {
      HStack(spacing: DS.Spacing.sm) {
        VStack(alignment: .leading, spacing: 2) {
          Text(verbatim: f.name).font(DS.TextStyle.body).foregroundStyle(DS.Color.foreground.swiftUI).lineLimit(1)
          Text(verbatim: "\(DiaryView.whole(f.kcal)) kcal · " + DiaryView.macros(f.protein, f.carbs, f.fat))
            .font(DS.TextStyle.caption.monospacedDigit())
            .foregroundStyle(DS.Color.mutedForeground.swiftUI)
        }
        Spacer(minLength: 0)
        Image(systemName: inMeal ? "checkmark.circle.fill" : "plus.circle")
          .font(.title3)
          .foregroundStyle(inMeal ? meal : DS.Color.foreground.swiftUI)
          .accessibilityHidden(true)
      }
      .padding(.horizontal, DS.Spacing.md)
      .frame(minHeight: 56)
      .contentShape(Rectangle())
    }
    .buttonStyle(TodayPressStyle(scale: 0.98))
    .disabled(book?.busy ?? true)
    .accessibilityElement(children: .combine)
    .accessibilityValue(inMeal ? Text(String(localized: "plans.a11y.inMeal")) : Text(verbatim: ""))
  }

  private func add(_ f: FoodLibrary.Food, cell: Cell) async {
    guard let book else { return }
    let days = repeatWeek ? MealPlans.days : [cell.day]
    var added = 0
    for d in days {
      // Ngày đã có món này ở bữa ấy: không thêm lần hai.
      let here = MealPlans.alreadyHere(book.items, day: d, mealType: cell.meal)
      if here.contains(f.name.trimmingCharacters(in: .whitespaces).lowercased()) { continue }
      switch await book.add(f, day: d, meal: cell.meal, online: services.sync.online) {
      case .done: added += 1
      case .invalid, .nothingWritten: break
      case .onlineOnly:
        message = String(localized: "plans.error.onlineOnly")
        return
      case .failed:
        message = String(localized: "async.error.generic")
        return
      }
    }
    if added > 0 {
      query = ""
      AccessibilityNotification.Announcement(String(localized: "plans.doneAdded \(added)")).post()
    }
  }

  // MARK: - Mảnh chung

  private func close() {
    if step == 2, let planId {
      dismiss()
      onFinished(planId)
    } else {
      dismiss()
    }
  }

  private func title(_ s: String) -> some View {
    Text(verbatim: s)
      .font(DS.TextStyle.title)
      .foregroundStyle(DS.Color.foreground.swiftUI)
      .accessibilityAddTraits(.isHeader)
  }

  private func label(_ s: String) -> some View {
    Text(verbatim: s)
      .font(DS.TextStyle.footnote.weight(.semibold))
      .foregroundStyle(DS.Color.mutedForeground.swiftUI)
  }

  private func chip(_ text: String, on: Bool, symbol: String? = nil, action: @escaping () -> Void) -> some View {
    Button(action: action) {
      HStack(spacing: 6) {
        if let symbol { Image(systemName: symbol).font(.footnote.weight(.semibold)) }
        Text(verbatim: text).font(DS.TextStyle.footnote.weight(.semibold))
      }
      .foregroundStyle(on ? Color.white : DS.Color.foreground.swiftUI)
      .padding(.horizontal, 12)
      .frame(minHeight: 36)
      .background(Capsule().fill(on ? meal : Color.clear))
      .overlay(Capsule().strokeBorder(on ? Color.clear : DS.Color.foreground.swiftUI.opacity(0.18), lineWidth: 1))
      .frame(minHeight: 44)
      .contentShape(Capsule())
    }
    .buttonStyle(TodayPressStyle())
    .accessibilityAddTraits(on ? .isSelected : [])
  }

  private func primary(_ text: String, enabled: Bool, busy: Bool = false, action: @escaping () -> Void) -> some View {
    Button(action: action) {
      ZStack {
        if busy { ProgressView().tint(DS.Color.background.swiftUI) } else { Text(verbatim: text) }
      }
      .font(DS.TextStyle.headline)
      .foregroundStyle(DS.Color.background.swiftUI)
      .frame(maxWidth: .infinity, minHeight: 50)
      .background(Capsule().fill(DS.Color.foreground.swiftUI))
      .opacity(enabled ? 1 : 0.4)
    }
    .buttonStyle(TodayPressStyle())
    .disabled(!enabled)
    .padding(.top, DS.Spacing.sm)
  }
}
