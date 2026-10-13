import ASCNDCore
import ASCNDDesignSystem
import SwiftUI

/// Kế hoạch ăn (#527 Phase 3 · 3.4) — `app/meal-plans.tsx`, `app/meal-plan.tsx`,
/// `meal-plan-wizard.tsx` trên `MealPlansBook` / `MealPlanBook`.
///
/// Như RN: danh sách (tên, mục tiêu · số bữa, bảy chấm ngày có món); rỗng →
/// giải thích + "Tạo kế hoạch ăn"; chi tiết: dải 7 ngày, kcal ngày + % mục tiêu
/// + tổng tuần, các bữa có món, "Ghi vào hôm nay" (hỏi lại khi hôm nay đã có
/// đúng bữa ấy), xoá món, xoá kế hoạch; thêm món: ngày → bữa → tìm / "Từ danh
/// sách của bạn", bảng không đóng sau mỗi món.
///
/// Khác RN: không có câu "kế hoạch không lưu chất xơ" — đã sai từ migration
/// `meal_plan_items_fiber` (món mang `fiber_g`, ghi vào nhật ký có chất xơ).
/// Trình tạo là form một trang (tên, mục tiêu, số bữa, xem trước) rồi
/// mở thẳng kế hoạch vừa tạo; thêm món là sheet riêng từ màn chi tiết.
struct MealPlansView: View {
  let book: MealPlansBook
  @Environment(AppServices.self) private var services
  @State private var creating = false
  @State private var opened: MealPlanRoute?

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: DS.Spacing.md) {
        content
      }
      .padding(DS.Spacing.md)
    }
    .ascndPage()
    .navigationTitle(String(localized: "plans.title"))
    .navigationBarTitleDisplayMode(.inline)
    .toolbar {
      ToolbarItem(placement: .primaryAction) {
        Button { creating = true } label: {
          Image(systemName: "plus").frame(minWidth: 44, minHeight: 44)
        }
        .accessibilityLabel(Text(String(localized: "plans.create")))
      }
    }
    .refreshable { await book.load() }
    .task { await book.load() }
    .sheet(isPresented: $creating) {
      PlanWizardView(plans: book) { id in
        opened = MealPlanRoute(userId: book.userId, planId: id, plan: book.plans.first { $0.id == id })
      }
    }
    .navigationDestination(item: $opened) { route in MealPlanScreen(route: route) }
    .navigationDestination(for: MealPlanRoute.self) { route in MealPlanScreen(route: route) }
  }

  @ViewBuilder private var content: some View {
    switch book.phase {
    case .loading:
      DSLoadingView()
    case .failed(.offline):
      DSOfflineView { Task { await book.load() } }
    case .failed:
      DSErrorView(message: String(localized: "async.error.generic")) { Task { await book.load() } }
    case .ready(let plans) where plans.isEmpty:
      DSEmptyState(
        systemImage: "fork.knife", title: String(localized: "plans.empty"),
        message: String(localized: "plans.what"), actionTitle: String(localized: "plans.create")
      ) { creating = true }
    case .ready(let plans):
      VStack(spacing: DS.Spacing.xs) {
        ForEach(plans) { p in
          NavigationLink(value: MealPlanRoute(userId: book.userId, planId: p.id, plan: p)) {
            PlanRowView(plan: p, fill: book.fill[p.id] ?? [:])
          }
          .buttonStyle(.plain)
        }
      }
    }
  }

  static func goalLabel(_ g: String?) -> String? {
    switch g {
    case "bulk": String(localized: "plans.goal.bulk")
    case "cut": String(localized: "plans.goal.cut")
    case "maintain": String(localized: "plans.goal.maintain")
    default: nil
    }
  }
}

/// Đích điều hướng tới một kế hoạch.
struct MealPlanRoute: Hashable {
  let userId: String
  let planId: String
  /// Tên / số bữa để dựng màn ngay; `nil` thì dùng mặc định (3 bữa).
  let plan: MealPlans.Plan?
}

/// Một hàng kế hoạch: tên, "mục tiêu · n bữa/ngày", bảy chấm ngày có món.
struct PlanRowView: View {
  let plan: MealPlans.Plan
  let fill: [Int: Int]
  /// Hàng trong thẻ danh sách (phân đoạn Kế hoạch ăn, thiết kế lại 13/10):
  /// không nền riêng, chấm ngày màu bữa.
  var plain = false

  var body: some View {
    let meta = [
      MealPlansView.goalLabel(plan.goal),
      plan.mealsPerDay.map { String(localized: "plans.mealsPerDay \($0)") },
    ].compactMap { $0 }.joined(separator: "  ·  ")
    HStack(spacing: DS.Spacing.sm) {
      VStack(alignment: .leading, spacing: 4) {
        Text(verbatim: plan.name).font(DS.TextStyle.body.weight(.semibold)).lineLimit(1)
        if !meta.isEmpty {
          Text(verbatim: meta)
            .font(DS.TextStyle.footnote)
            .foregroundStyle(DS.Color.mutedForeground.swiftUI)
        }
        HStack(spacing: 4) {
          ForEach(MealPlans.days, id: \.self) { d in
            Circle()
              .fill((fill[d] ?? 0) > 0
                ? (plain ? MascotRoomView.signalColor(.meal) : DS.Color.primary.swiftUI)
                : (plain ? DS.Color.foreground.swiftUI.opacity(0.1) : DS.Color.muted.swiftUI))
              .frame(width: 6, height: 6)
          }
        }
        .accessibilityHidden(true)
      }
      Spacer(minLength: 0)
      Image(systemName: "chevron.right")
        .foregroundStyle(DS.Color.mutedForeground.swiftUI)
        .accessibilityHidden(true)
    }
    .padding(DS.Spacing.md)
    .frame(minHeight: 62)
    .background(plain ? Color.clear : DS.Color.card.swiftUI, in: RoundedRectangle(cornerRadius: DS.Radius.md))
    .contentShape(Rectangle())
    .accessibilityElement(children: .combine)
    .accessibilityValue(Text(String(localized: "plans.a11y.filled \(fill.values.filter { $0 > 0 }.count)")))
  }
}

/// Tạo kế hoạch: tên, mục tiêu, số bữa, xem trước.
struct CreatePlanSheet: View {
  let book: MealPlansBook
  let onCreated: (String) -> Void
  @Environment(AppServices.self) private var services
  @Environment(\.dismiss) private var dismiss
  @State private var name = ""
  @State private var goal = "maintain"
  @State private var mealsPerDay = 3
  @State private var message: String?

  var body: some View {
    NavigationStack {
      ScrollView {
        VStack(alignment: .leading, spacing: DS.Spacing.md) {
          VStack(alignment: .leading, spacing: 4) {
            Text(String(localized: "plans.name"))
              .font(DS.TextStyle.caption)
              .foregroundStyle(DS.Color.mutedForeground.swiftUI)
              .accessibilityHidden(true)
            TextField(text: $name, prompt: Text(String(localized: "plans.name.placeholder"))) {
              Text(String(localized: "plans.name"))
            }
            .padding(DS.Spacing.sm)
            .frame(minHeight: 44)
            .background(DS.Color.input.swiftUI, in: RoundedRectangle(cornerRadius: DS.Radius.sm))
            Text(String(localized: "plans.name.hint"))
              .font(DS.TextStyle.caption)
              .foregroundStyle(DS.Color.mutedForeground.swiftUI)
          }
          Text(String(localized: "plans.goal")).font(DS.TextStyle.caption).foregroundStyle(DS.Color.mutedForeground.swiftUI)
          Picker(selection: $goal) {
            ForEach(MealPlans.goals, id: \.self) { g in Text(verbatim: MealPlansView.goalLabel(g) ?? g).tag(g) }
          } label: {
            Text(String(localized: "plans.goal"))
          }
          .pickerStyle(.segmented)
          Text(String(localized: "plans.mealsPerDayLabel")).font(DS.TextStyle.caption).foregroundStyle(DS.Color.mutedForeground.swiftUI)
          Picker(selection: $mealsPerDay) {
            ForEach(MealPlans.mealsPerDayChoices, id: \.self) { n in Text(verbatim: "\(n)").tag(n) }
          } label: {
            Text(String(localized: "plans.mealsPerDayLabel"))
          }
          .pickerStyle(.segmented)
          DSCard {
            VStack(alignment: .leading, spacing: DS.Spacing.xs) {
              Text(String(localized: "plans.preview")).font(DS.TextStyle.headline)
              Text(String(localized: "plans.previewSum \(MealPlans.days.count) \(mealsPerDay) \(MealPlans.days.count * mealsPerDay)"))
                .font(DS.TextStyle.footnote)
                .foregroundStyle(DS.Color.mutedForeground.swiftUI)
              Text(verbatim: MealPlans.slots(mealsPerDay).map(DiaryView.mealName).joined(separator: " · "))
                .font(DS.TextStyle.footnote)
            }
          }
          let ok = !name.trimmingCharacters(in: .whitespaces).isEmpty
          DSButton(String(localized: "plans.create")) { Task { await create() } }
            .disabled(!ok || book.busy)
            .opacity(ok && !book.busy ? 1 : 0.5)
        }
        .padding(DS.Spacing.md)
      }
      .ascndPage()
      .navigationTitle(String(localized: "plans.new"))
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button(String(localized: "common.cancel")) { dismiss() }
        }
      }
      .alert(message ?? "", isPresented: Binding(get: { message != nil }, set: { if !$0 { message = nil } })) {
        Button(String(localized: "plans.ok"), role: .cancel) {}
      }
    }
  }

  private func create() async {
    let (outcome, id) = await book.create(name: name, goal: goal, mealsPerDay: mealsPerDay, online: services.sync.online)
    switch outcome {
    case .done:
      dismiss()
      if let id { onCreated(id) }
    case .invalid: break
    case .onlineOnly: message = String(localized: "plans.error.onlineOnly")
    case .nothingWritten, .failed: message = String(localized: "async.error.generic")
    }
    if let message { AccessibilityNotification.Announcement(message).post() }
  }
}

/// Sổ của MỘT kế hoạch thuộc MÀN.
struct MealPlanScreen: View {
  let route: MealPlanRoute
  @Environment(AppServices.self) private var services
  @State private var book: MealPlanBook?

  var body: some View {
    Group {
      if let book {
        MealPlanView(book: book, plan: route.plan)
      } else {
        DSLoadingView()
      }
    }
    .task {
      if book == nil { book = services.makeMealPlan(userId: route.userId, planId: route.planId) }
    }
    .onDisappear { book?.close() }
  }
}

/// Chi tiết một kế hoạch: bảy ngày, các bữa, ghi vào hôm nay, thêm / xoá món.
struct MealPlanView: View {
  let book: MealPlanBook
  let plan: MealPlans.Plan?
  @Environment(AppServices.self) private var services
  @Environment(ProfileBook.self) private var profile: ProfileBook?
  @Environment(\.dismiss) private var dismiss
  @State private var day = 0
  @State private var adding = false
  /// Bữa mà sheet thêm món mở sẵn (chạm "+" của một bữa).
  @State private var addMeal: String?
  @State private var expanded: Set<String> = []
  @State private var confirmDelete = false
  @State private var again: String?
  @State private var message: String?

  private var target: Double {
    let k = profile?.profile?.tdeeTargetKcal ?? 0
    return (k > 0 && k.isFinite ? k : MacroTargets.defaultKcal).rounded()
  }

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: DS.Spacing.md) {
        content
      }
      .padding(DS.Spacing.md)
    }
    .ascndPage()
    .navigationTitle(plan?.name ?? String(localized: "plans.title"))
    .navigationBarTitleDisplayMode(.inline)
    .toolbar {
      ToolbarItem(placement: .primaryAction) {
        Button { confirmDelete = true } label: {
          Image(systemName: "trash").frame(minWidth: 44, minHeight: 44)
        }
        .accessibilityLabel(Text(String(localized: "plans.delete")))
        .disabled(book.busy)
      }
    }
    .refreshable { await book.load() }
    .task { await book.load() }
    .sheet(isPresented: $adding) {
      AddPlanFoodSheet(
        book: book, slots: MealPlans.rows(mealsPerDay: plan?.mealsPerDay, items: book.items), startDay: day,
        startMeal: addMeal)
    }
    .confirmationDialog(
      String(localized: "plans.delete.confirm \(plan?.name ?? "")"), isPresented: $confirmDelete,
      titleVisibility: .visible
    ) {
      Button(String(localized: "plans.delete"), role: .destructive) { Task { await deletePlan() } }
      Button(String(localized: "common.cancel"), role: .cancel) {}
    }
    .confirmationDialog(
      String(localized: "plans.again.title"),
      isPresented: Binding(get: { again != nil }, set: { if !$0 { again = nil } }), titleVisibility: .visible,
      presenting: again
    ) { meal in
      Button(String(localized: "plans.again.yes")) { Task { await eat(meal) } }
      Button(String(localized: "common.cancel"), role: .cancel) {}
    } message: { meal in
      Text(String(localized: "plans.again.body \(DiaryView.mealName(meal).lowercased())"))
    }
    .alert(message ?? "", isPresented: Binding(get: { message != nil }, set: { if !$0 { message = nil } })) {
      Button(String(localized: "plans.ok"), role: .cancel) {}
    }
  }

  @ViewBuilder private var content: some View {
    switch book.phase {
    case .loading:
      DSLoadingView()
    case .failed(.offline):
      DSOfflineView { Task { await book.load() } }
    case .failed:
      DSErrorView(message: String(localized: "async.error.generic")) { Task { await book.load() } }
    case .ready(let items):
      dayStrip(items)
      summary(items)
      mealList(items)
    }
  }

  /// Bảy ô ngày, mỗi ô ghi kcal của ngày ấy (thiết kế lại 13/10): nhìn là biết
  /// ngày nào còn trống, không phải mở từng ngày.
  private func dayStrip(_ items: [MealPlans.Item]) -> some View {
    HStack(spacing: 4) {
      ForEach(MealPlans.days, id: \.self) { d in
        let on = d == day
        let kcal = MealPlans.dayKcal(items, day: d)
        Button { day = d } label: {
          VStack(spacing: 2) {
            Text(verbatim: "\(d + 1)")
              .font(.system(size: 15, weight: .semibold).monospacedDigit())
            Text(verbatim: kcal > 0 ? DiaryView.whole(kcal) : "—")
              .font(.custom("Menlo", size: 10, relativeTo: .caption2))
              .lineLimit(1)
              .minimumScaleFactor(0.6)
              .opacity(on ? 0.75 : 1)
              .foregroundStyle(on ? DS.Color.background.swiftUI : DS.Color.mutedForeground.swiftUI)
          }
          .foregroundStyle(on ? DS.Color.background.swiftUI : DS.Color.foreground.swiftUI)
          .frame(maxWidth: .infinity, minHeight: 52)
          .background(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
              .fill(on ? DS.Color.foreground.swiftUI : DS.Color.foreground.swiftUI.opacity(0.06)))
          .contentShape(Rectangle())
        }
        .buttonStyle(TodayPressStyle(scale: 0.94))
        .accessibilityLabel(Text(String(localized: "plans.day \(d + 1)")))
        .accessibilityValue(Text(verbatim: kcal > 0 ? "\(DiaryView.whole(kcal)) kcal" : String(localized: "nc.slot.empty")))
        .accessibilityAddTraits(on ? [.isSelected] : [])
      }
    }
    .sensoryFeedback(.selection, trigger: day)
  }

  /// kcal của ngày (Menlo), % mục tiêu và một thanh; tổng cả tuần ở dòng phụ.
  private func summary(_ items: [MealPlans.Item]) -> some View {
    let kcal = MealPlans.dayKcal(items, day: day)
    let week = MealPlans.weekKcal(items)
    let pct = target > 0 ? MealPlans.percent(kcal, target: target) : 0
    let fraction = target > 0 ? min(1, kcal / target) : 0
    let meal = MascotRoomView.signalColor(.meal)
    return VStack(alignment: .leading, spacing: 8) {
      HStack(alignment: .firstTextBaseline) {
        Text(verbatim: DiaryView.whole(kcal))
          .font(.custom("Menlo", size: 26, relativeTo: .title).weight(.bold))
        Text(String(localized: "nc.kcal")).font(DS.TextStyle.footnote).foregroundStyle(DS.Color.mutedForeground.swiftUI)
        Spacer(minLength: 0)
        if target > 0 {
          Text(String(localized: "plans.pctTarget \(pct)"))
            .font(DS.TextStyle.footnote)
            .foregroundStyle(DS.Color.mutedForeground.swiftUI)
        }
      }
      GeometryReader { g in
        ZStack(alignment: .leading) {
          Capsule().fill(meal.opacity(0.16))
          Capsule().fill(meal).frame(width: g.size.width * fraction)
        }
      }
      .frame(height: 5)
      .accessibilityHidden(true)
      if week > 0 {
        Text(String(localized: "plans.weekTotal \(DiaryView.whole(week))"))
          .font(DS.TextStyle.caption)
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)
      }
    }
    .padding(DS.Spacing.md)
    .todayCard(radius: DS.Radius.xl)
    .accessibilityElement(children: .combine)
  }

  /// Các bữa của ngày như khung bữa của tab: bữa có món → tên món + "Ăn"
  /// (ghi vào hôm nay), chạm để mở danh sách món; bữa trống → "+" thêm món
  /// đúng bữa ấy.
  private func mealList(_ items: [MealPlans.Item]) -> some View {
    let rows = MealPlans.rows(mealsPerDay: plan?.mealsPerDay, items: items)
    return VStack(spacing: 0) {
      ForEach(Array(rows.enumerated()), id: \.element) { i, meal in
        if i > 0 { Divider().padding(.leading, 58).opacity(0.6) }
        mealRow(meal, items.filter { $0.day == day && $0.mealType == meal })
      }
    }
    .clipShape(RoundedRectangle(cornerRadius: DS.Radius.xl, style: .continuous))
    .todayCard(radius: DS.Radius.xl)
  }

  @ViewBuilder private func mealRow(_ meal: String, _ foods: [MealPlans.Item]) -> some View {
    let open = expanded.contains(meal)
    VStack(alignment: .leading, spacing: 0) {
      HStack(spacing: 12) {
        Button {
          if foods.isEmpty {
            addMeal = meal
            adding = true
          } else {
            withAnimation(.smooth(duration: 0.25)) {
              if open { expanded.remove(meal) } else { expanded.insert(meal) }
            }
          }
        } label: {
          HStack(spacing: 12) {
            MealSlotGlyph(type: meal, filled: !foods.isEmpty)
            VStack(alignment: .leading, spacing: 2) {
              Text(verbatim: DiaryView.mealName(meal))
                .font(.system(size: 17, weight: .semibold))
                .foregroundStyle(DS.Color.foreground.swiftUI)
              Text(verbatim: foods.isEmpty
                ? String(localized: "plans.slot.empty")
                : foods.map(\.name).formatted(.list(type: .and).locale(.app)))
                .font(DS.TextStyle.caption)
                .foregroundStyle(DS.Color.mutedForeground.swiftUI)
                .lineLimit(1)
            }
            Spacer(minLength: 0)
            if !foods.isEmpty {
              Text(verbatim: DiaryView.whole(foods.reduce(0.0) { $0 + $1.kcal.rounded() }))
                .font(.custom("Menlo", size: 14, relativeTo: .body))
                .foregroundStyle(DS.Color.foreground.swiftUI)
            }
          }
          .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityHint(Text(foods.isEmpty ? String(localized: "plans.a11y.addFood \(day + 1)") : ""))
        if foods.isEmpty {
          Image(systemName: "plus")
            .font(.system(size: 15, weight: .semibold))
            .foregroundStyle(DS.Color.mutedForeground.swiftUI)
            .frame(width: 44, height: 44)
            .accessibilityHidden(true)
        } else {
          let already = book.isLoggedToday(meal, day: day)
          Button {
            if already { again = meal } else { Task { await eat(meal) } }
          } label: {
            Label(
              already ? String(localized: "plans.eaten") : String(localized: "plans.eat.short"),
              systemImage: already ? "checkmark" : "fork.knife"
            )
            .labelStyle(.titleAndIcon)
            .font(.system(size: 14, weight: .semibold))
            .foregroundStyle(already ? MascotRoomView.signalColor(.meal) : DS.Color.foreground.swiftUI)
            .padding(.horizontal, 12)
            .frame(minHeight: 34)
            .background(Capsule().strokeBorder(DS.Color.foreground.swiftUI.opacity(0.18), lineWidth: 1))
            .frame(minHeight: 44)
            .contentShape(Capsule())
          }
          .buttonStyle(TodayPressStyle())
          .accessibilityLabel(Text(already ? String(localized: "plans.eaten") : String(localized: "plans.eatIt")))
        }
      }
      .padding(.horizontal, DS.Spacing.md)
      .padding(.vertical, 8)
      .frame(minHeight: 60)

      if open {
        ForEach(foods) { it in
          HStack {
            Text(verbatim: it.name).font(DS.TextStyle.body).lineLimit(1)
            Spacer()
            Text(verbatim: DiaryView.whole(it.kcal))
              .font(.custom("Menlo", size: 13, relativeTo: .footnote))
              .foregroundStyle(DS.Color.mutedForeground.swiftUI)
            Button { Task { await deleteItem(it) } } label: {
              Image(systemName: "xmark")
                .font(.caption)
                .foregroundStyle(DS.Color.mutedForeground.swiftUI)
                .frame(width: 44, height: 44)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .disabled(book.busy)
            .accessibilityLabel(Text(String(localized: "plans.a11y.remove \(it.name)")))
          }
          .padding(.leading, 58)
          .padding(.trailing, DS.Spacing.sm)
        }
        Button {
          addMeal = meal
          adding = true
        } label: {
          Label(String(localized: "diary.meal.addAction"), systemImage: "plus")
            .font(DS.TextStyle.footnote.weight(.semibold))
            .foregroundStyle(MascotRoomView.signalColor(.meal))
            .frame(minHeight: 44)
        }
        .buttonStyle(.plain)
        .padding(.leading, 58)
        .padding(.bottom, 4)
      }
    }
  }

  private func eat(_ meal: String) async {
    switch await book.eat(meal: meal, day: day, online: services.sync.online) {
    case .queued(let online):
      let name = DiaryView.mealName(meal)
      let text = online
        ? String(localized: "plans.eatDone \(name)") : String(localized: "plans.eatQueued \(name)")
      AccessibilityNotification.Announcement(text).post()
      message = text
    case .nothing: break
    case .failed: show(String(localized: "async.error.generic"))
    }
  }

  private func deleteItem(_ it: MealPlans.Item) async {
    report(await book.deleteItem(it.id, online: services.sync.online), nothing: String(localized: "plans.error.itemGone"))
  }

  private func deletePlan() async {
    let outcome = await book.deletePlan(online: services.sync.online)
    if outcome == .done { dismiss() } else { report(outcome, nothing: String(localized: "plans.error.planGone")) }
  }

  private func report(_ outcome: MealPlanWrite, nothing: String) {
    switch outcome {
    case .done, .invalid: return
    case .onlineOnly: show(String(localized: "plans.error.onlineOnly"))
    case .nothingWritten: show(nothing)
    case .failed: show(String(localized: "async.error.generic"))
    }
  }

  private func show(_ text: String) {
    message = text
    AccessibilityNotification.Announcement(text).post()
  }
}

/// Thêm món: ngày → bữa → tìm / "Từ danh sách của bạn"; bảng không đóng sau mỗi món.
private struct AddPlanFoodSheet: View {
  let book: MealPlanBook
  let slots: [String]
  let startDay: Int
  var startMeal: String?
  @Environment(AppServices.self) private var services
  @Environment(\.dismiss) private var dismiss
  @State private var day = 0
  @State private var meal = "breakfast"
  @State private var query = ""
  @State private var added = 0
  @State private var message: String?

  var body: some View {
    NavigationStack {
      ScrollView {
        VStack(alignment: .leading, spacing: DS.Spacing.md) {
          step(String(localized: "plans.step.day"), String(localized: "plans.step.dayHint"))
          Picker(selection: $day) {
            ForEach(MealPlans.days, id: \.self) { d in Text(verbatim: "\(d + 1)").tag(d) }
          } label: {
            Text(String(localized: "plans.step.day"))
          }
          .pickerStyle(.segmented)
          step(String(localized: "plans.step.meal"), String(localized: "plans.step.mealHint"))
          Picker(selection: $meal) {
            ForEach(slots, id: \.self) { m in Text(verbatim: DiaryView.mealName(m)).tag(m) }
          } label: {
            Text(String(localized: "plans.step.meal"))
          }
          .pickerStyle(.menu)
          .frame(minHeight: 44)
          step(String(localized: "plans.step.food"), String(localized: "plans.step.foodHint"))
          TextField(text: $query, prompt: Text(String(localized: "logMeal.search"))) {
            Text(String(localized: "logMeal.search"))
          }
          .autocorrectionDisabled()
          .padding(DS.Spacing.sm)
          .frame(minHeight: 44)
          .background(DS.Color.input.swiftUI, in: RoundedRectangle(cornerRadius: DS.Radius.sm))
          foods
        }
        .padding(DS.Spacing.md)
      }
      .ascndPage()
      .navigationTitle(String(localized: "plans.addFood"))
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .confirmationAction) {
          Button(added > 0 ? String(localized: "plans.doneAdded \(added)") : String(localized: "plans.done")) {
            dismiss()
          }
        }
      }
      .task {
        day = startDay
        meal = startMeal.flatMap { slots.contains($0) ? $0 : nil } ?? slots.first ?? "breakfast"
        await book.loadMyFoods()
      }
      .task(id: query) {
        try? await Task.sleep(for: .milliseconds(250))
        guard !Task.isCancelled else { return }
        await book.search(query)
      }
      .alert(message ?? "", isPresented: Binding(get: { message != nil }, set: { if !$0 { message = nil } })) {
        Button(String(localized: "plans.ok"), role: .cancel) {}
      }
    }
  }

  private func step(_ title: String, _ hint: String) -> some View {
    VStack(alignment: .leading, spacing: 2) {
      Text(verbatim: title).font(DS.TextStyle.headline).accessibilityAddTraits(.isHeader)
      Text(verbatim: hint).font(DS.TextStyle.caption).foregroundStyle(DS.Color.mutedForeground.swiftUI)
    }
  }

  @ViewBuilder private var foods: some View {
    let here = MealPlans.alreadyHere(book.items, day: day, mealType: meal)
    let q = query.trimmingCharacters(in: .whitespaces)
    if q.count >= MealLog.searchMinLength {
      if let results = book.results {
        if results.isEmpty {
          Text(String(localized: "plans.noMatch \(q)"))
            .font(DS.TextStyle.footnote)
            .foregroundStyle(DS.Color.mutedForeground.swiftUI)
        } else {
          ForEach(results) { f in row(f, here: here) }
        }
      } else {
        ProgressView()
      }
    } else if !book.myFoods.isEmpty {
      Text(String(localized: "plans.fromList"))
        .font(DS.TextStyle.caption.weight(.semibold))
        .foregroundStyle(DS.Color.mutedForeground.swiftUI)
      ForEach(book.myFoods) { f in row(f, here: here) }
    }
  }

  private func row(_ f: FoodLibrary.Food, here: Set<String>) -> some View {
    let inMeal = here.contains(f.name.trimmingCharacters(in: .whitespaces).lowercased())
    return Button { Task { await add(f) } } label: {
      HStack {
        VStack(alignment: .leading, spacing: 2) {
          Text(verbatim: f.name).font(DS.TextStyle.body).lineLimit(1)
          Text(verbatim: "\(DiaryView.whole(f.kcal)) kcal · " + DiaryView.macros(f.protein, f.carbs, f.fat))
            .font(DS.TextStyle.caption.monospacedDigit())
            .foregroundStyle(DS.Color.mutedForeground.swiftUI)
        }
        Spacer()
        Image(systemName: inMeal ? "checkmark.circle.fill" : "plus.circle.fill")
          .foregroundStyle(inMeal ? DS.Color.readinessGreen.swiftUI : DS.Color.primary.swiftUI)
          .accessibilityHidden(true)
      }
      .padding(.horizontal, DS.Spacing.md)
      .frame(minHeight: 52)
      .background(DS.Color.card.swiftUI, in: RoundedRectangle(cornerRadius: DS.Radius.md))
      .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
    .disabled(book.busy)
    .accessibilityElement(children: .combine)
    .accessibilityValue(inMeal ? Text(String(localized: "plans.a11y.inMeal")) : Text(verbatim: ""))
  }

  private func add(_ f: FoodLibrary.Food) async {
    switch await book.add(f, day: day, meal: meal, online: services.sync.online) {
    case .done:
      added += 1
      query = ""
      AccessibilityNotification.Announcement(String(localized: "plans.doneAdded \(added)")).post()
    case .invalid, .nothingWritten: break
    case .onlineOnly: message = String(localized: "plans.error.onlineOnly")
    case .failed: message = String(localized: "async.error.generic")
    }
  }
}

/// Hàng "Kế hoạch ăn" ở tab Dinh dưỡng.
struct MealPlansRoute: Hashable {
  let userId: String
}

struct MealPlansScreen: View {
  let userId: String
  @Environment(AppServices.self) private var services
  @State private var book: MealPlansBook?

  var body: some View {
    Group {
      if let book {
        MealPlansView(book: book)
      } else {
        DSLoadingView()
      }
    }
    .task {
      if book == nil { book = services.makeMealPlans(userId: userId) }
    }
    // Không đóng sổ khi mở một kế hoạch (đẩy màn cũng gọi `onDisappear`): quay
    // lại thì `.task` đọc lại cho chấm ngày mới. Sổ chỉ đọc; tạo đi qua sheet.
  }
}
