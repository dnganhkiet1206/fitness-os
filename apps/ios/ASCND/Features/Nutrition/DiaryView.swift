import ASCNDCore
import ASCNDDesignSystem
import SwiftUI

/// Màn Nhật ký bữa ăn (#527 Phase 3 · 3.10) — `app/diary.tsx` + `DayMeals` trên
/// `MealDiaryBook`.
///
/// Như RN:
/// - một ngày, tên ngày to nhất trên đầu ("Hôm nay" / "Hôm qua" kèm ngày đầy
///   đủ bên dưới; xa hơn thì đọc ngày ra); mũi tên "ngày sau" MỜ ở hôm nay chứ
///   không biến mất; nút "Hôm nay" chỉ khi đang ở ngày khác;
/// - đang tải / đọc hỏng / rỗng là ba câu khác nhau;
/// - "Tổng cả ngày" cộng từ chính danh sách; mỗi loại bữa một thẻ đóng sẵn,
///   chạm để mở ra từng món;
/// - mỗi món có nút Sửa khẩu phần và Xoá ngay trên hàng (không vuốt);
/// - xoá hỏi lại, câu hỏi nói tên món (hay số món của cả bữa) và đúng ngày;
///   xong thì "Đã xoá" kèm Hoàn tác khi chụp lại được hàng.
///
/// - ghi bữa CHO NGÀY ĐANG XEM: thẻ rỗng "nhấn để ghi", nút "Ghi một bữa cho
///   ngày này" khi ngày đã có bữa, và "Thêm" trên thẻ bữa (đúng bữa ấy) — mở
///   `LogMealView` mang ngày (và bữa) theo;
///
/// Khác RN / chưa có:
/// - "Thêm" vào một bữa là nút trong thẻ đã mở + hành động VoiceOver, không vuốt;
/// - bữa vừa lưu hiện ra khi hàng đợi gửi xong (sổ đọc lại mỗi lần hàng đợi
///   vơi đi), không vá lạc quan;
/// - chưa có "Chia sẻ lên Cộng đồng" (Cộng đồng chưa port);
/// - xoá cả bữa là nút trong thẻ đã mở + hành động VoiceOver, không phải vuốt.
struct DiaryView: View {
  let book: MealDiaryBook
  /// kcal 7 ngày gần nhất cho dải ngày (`NutritionInsightsBook`, cùng truy vấn
  /// với màn xu hướng). `nil` / hỏng: dải vẫn chuyển ngày, chỉ không tô đậm nhạt.
  var week: NutritionInsightsBook?
  @Environment(ProfileBook.self) private var profile: ProfileBook?

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: DS.Spacing.md) {
        dayBar
        weekStrip
        dayTotal
        DayMealsSection(book: book, slots: true)
      }
      .padding(DS.Spacing.md)
    }
    .navigationTitle(String(localized: "diary.title"))
    .ascndPage()
    .navigationBarTitleDisplayMode(.inline)
    .refreshable { await book.load() }
    .task(id: book.date) { await book.load() }
    // Đang xem hôm nay mà để app mở qua nửa đêm: sang hôm nay mới.
    .onNewDay { book.followToday() }
    .task { await week?.load() }
  }

  // MARK: - Ngày

  /// ‹ Hôm nay / Thứ Hai, 12 thg 10 › — không thẻ (thiết kế lại 13/10); nút
  /// "Hôm nay" chỉ khi đang ở ngày khác.
  private var dayBar: some View {
    HStack(spacing: DS.Spacing.sm) {
      arrow("chevron.left", label: String(localized: "diary.prevDay"), enabled: true) { _ = book.go(-1) }
      VStack(spacing: 1) {
        Text(verbatim: Self.dayLabel(book.date, today: book.today))
          .font(DS.TextStyle.headline)
          .lineLimit(1)
          .accessibilityAddTraits(.isHeader)
        if let sub = Self.daySub(book.date, today: book.today) {
          Text(verbatim: sub)
            .font(DS.TextStyle.caption)
            .foregroundStyle(DS.Color.mutedForeground.swiftUI)
            .lineLimit(1)
        } else {
          Button { book.goToday() } label: {
            Text(String(localized: "diary.today"))
              .font(DS.TextStyle.caption.weight(.semibold))
              .foregroundStyle(MascotRoomView.signalColor(.meal))
          }
          .buttonStyle(.plain)
          .frame(minHeight: 22)
        }
      }
      .frame(maxWidth: .infinity)
      // Không gộp: nút "Hôm nay" bên trong phải bấm được bằng VoiceOver.
      arrow("chevron.right", label: String(localized: "diary.nextDay"), enabled: !book.isToday) { _ = book.go(1) }
    }
  }

  /// Bảy ngày gần nhất: ô càng đậm càng gần mục tiêu calo; chạm để xem ngày ấy.
  private var weekStrip: some View {
    let today = book.today
    let days = (0..<7).map { today.adding(days: $0 - 6) }
    var kcal: [LocalDate: Double] = [:]
    if case .ready(let rows)? = week?.phase { for r in rows { kcal[r.date] = r.kcal } }
    let target = NutritionToday.calorieTarget(profile?.profile)
    let meal = MascotRoomView.signalColor(.meal)
    return HStack(spacing: 4) {
      ForEach(days, id: \.self) { d in
        let k = kcal[d] ?? 0
        let level = target > 0 ? min(1, k / target) : 0
        let on = d == book.date
        Button { _ = book.go(Self.distance(from: book.date, to: d)) } label: {
          VStack(spacing: 3) {
            Text(verbatim: d.calendarDate.formatted(Date.FormatStyle().weekday(.narrow).locale(.app)))
              .font(DS.TextStyle.caption)
              .foregroundStyle(DS.Color.mutedForeground.swiftUI)
            RoundedRectangle(cornerRadius: 8, style: .continuous)
              .fill(k > 0 ? meal.opacity(0.25 + 0.75 * level) : DS.Color.foreground.swiftUI.opacity(0.06))
              .frame(height: 30)
              .overlay(
                RoundedRectangle(cornerRadius: 8, style: .continuous)
                  .strokeBorder(on ? DS.Color.foreground.swiftUI : .clear, lineWidth: 2))
          }
          .frame(maxWidth: .infinity)
          .contentShape(Rectangle())
        }
        .buttonStyle(TodayPressStyle(scale: 0.94))
        .accessibilityLabel(Text(verbatim: Self.dayLabel(d, today: today)))
        .accessibilityValue(Text(verbatim: k > 0 ? "\(DiaryView.whole(k)) kcal" : String(localized: "nc.slot.empty")))
        .accessibilityAddTraits(on ? .isSelected : [])
      }
    }
  }

  static func distance(from a: LocalDate, to b: LocalDate) -> Int { b.daysSinceEpoch - a.daysSinceEpoch }

  /// "1.840 / 2.508 kcal" của ngày đang xem (cộng từ chính danh sách bữa).
  @ViewBuilder private var dayTotal: some View {
    if case .ready(let meals) = book.phase {
      let total = MealDiary.dayTotal(meals)
      let target = NutritionToday.calorieTarget(profile?.profile)
      HStack(alignment: .firstTextBaseline, spacing: 6) {
        Text(verbatim: DiaryView.whole(total.kcal))
          .font(DS.TextStyle.number(26, .title).weight(.bold))
        Text(verbatim: target > 0 ? "/ \(DiaryView.whole(target)) kcal" : "kcal")
          .font(DS.TextStyle.footnote)
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)
        Spacer(minLength: 0)
        if total.kcal > 0 {
          Text(verbatim: DiaryView.macros(total.protein, total.carbs, total.fat))
            .font(DS.TextStyle.caption.monospacedDigit())
            .foregroundStyle(DS.Color.mutedForeground.swiftUI)
        }
      }
      .padding(.horizontal, 4)
      .accessibilityElement(children: .combine)
    }
  }

  private func arrow(_ icon: String, label: String, enabled: Bool, action: @escaping () -> Void) -> some View {
    Button(action: action) {
      Image(systemName: icon)
        .font(.body.weight(.semibold))
        .foregroundStyle(DS.Color.foreground.swiftUI)
        .frame(width: 44, height: 44)
        .background(Circle().fill(.thinMaterial))
        .overlay(Circle().strokeBorder(DS.Color.foreground.swiftUI.opacity(0.1)))
    }
    .buttonStyle(TodayPressStyle())
    .disabled(!enabled)
    .opacity(enabled ? 1 : 0.35)
    .accessibilityLabel(Text(verbatim: label))
    .sensoryFeedback(.selection, trigger: book.date)
  }

  // MARK: - Chữ

  /// "Hôm nay" / "Hôm qua" gọi bằng tên; xa hơn thì đọc ngày ra.
  static func dayLabel(_ d: LocalDate, today: LocalDate) -> String {
    if d == today { return String(localized: "diary.today") }
    if d == today.adding(days: -1) { return String(localized: "diary.yesterday") }
    return d.calendarDate.formatted(Date.FormatStyle().weekday(.abbreviated).day().month(.abbreviated).locale(.app))
  }

  /// Dòng ngày đầy đủ khi dòng trên là một cái TÊN.
  static func daySub(_ d: LocalDate, today: LocalDate) -> String? {
    guard d == today || d == today.adding(days: -1) else { return nil }
    return d.calendarDate.formatted(Date.FormatStyle().day().month(.abbreviated).locale(.app))
  }

  /// Câu hỏi lại khi xoá cả bữa — số 1 là khoá riêng (catalog không dùng plural).
  static func deleteGroupMessage(count: Int, meal: String, today: Bool) -> String {
    switch (count == 1, today) {
    case (true, true): String(localized: "diary.meal.delete.today.one \(meal)")
    case (true, false): String(localized: "diary.meal.delete.day.one \(meal)")
    case (false, true): String(localized: "diary.meal.delete.today \(count) \(meal)")
    case (false, false): String(localized: "diary.meal.delete.day \(count) \(meal)")
    }
  }

  static func mealName(_ type: String) -> String {
    switch type {
    case "breakfast": String(localized: "diary.meal.breakfast")
    case "lunch": String(localized: "diary.meal.lunch")
    case "dinner": String(localized: "diary.meal.dinner")
    case "snack": String(localized: "diary.meal.snack")
    case "preworkout": String(localized: "diary.meal.preworkout")
    case "postworkout": String(localized: "diary.meal.postworkout")
    default: type
    }
  }

  static func whole(_ x: Double) -> String {
    Int((x + 0.5).rounded(.down)).formatted(.number.locale(.app))
  }

  static func macros(_ p: Double, _ c: Double, _ f: Double) -> String {
    // Theo ngôn ngữ (19/10): "P35 · C0 · F0" là chữ tắt tiếng Anh, người đọc
    // tiếng Việt không đoán được P / C / F.
    String(localized: "macros.short \(whole(p)) \(whole(c)) \(whole(f))")
  }
}

/// Các thẻ bữa của MỘT ngày (`DayMeals` của RN) — dùng ở màn Nhật ký và trên
/// tab Dinh dưỡng (ngày hôm nay). Giữ trạng thái sửa / xoá / hoàn tác / ghi
/// thêm của chính nó; ngày nào là việc của sổ.
struct DayMealsSection: View {
  let book: MealDiaryBook
  /// Tab Dinh dưỡng (thiết kế lại 13/10): một thẻ danh sách theo KHUNG bữa
  /// (sáng / trưa / tối / ăn vặt luôn có hàng; khung trống có nút "Ghi" vào
  /// đúng khung ấy), không có thẻ tổng ngày (thẻ ngân sách đã nói). Màn Nhật ký
  /// giữ kiểu thẻ từng bữa.
  var slots = false
  /// Sau mỗi lần ghi / sửa / xoá thành công — để thẻ khác trên cùng màn
  /// (thẻ calo của tab) đọc lại.
  var onChanged: () -> Void = {}
  @Environment(AppServices.self) private var services
  @State private var editing: MealDiary.Item?
  @State private var pendingItem: MealDiary.Item?
  @State private var pendingGroup: MealDiary.Group?
  @State private var undo: [DeletedMealItem] = []
  @State private var notice: String?
  @State private var error: String?
  @State private var logging: LogMealRequest?
  /// Bản ghi bữa đã đăng lên Cộng đồng; `nil` = chưa biết (chưa hiện lối chia sẻ).
  @State private var shared: Set<String>?
  @State private var sharing: ShareMealRequest?
  /// Kế hoạch ăn áp dụng hôm nay (19/10: bữa hôm nay ↔ kế hoạch ăn ↔ ghi).
  @State private var plan: TodayMealPlan?
  @State private var eatingPlan: String?
  @State private var planTick = 0

  var body: some View {
    VStack(spacing: DS.Spacing.md) {
      content
      if let notice { undoBar(notice) }
    }
    .task(id: "\(book.userId)|\(book.date)|\(planTick)") {
      plan = slots && book.isToday ? await TodayMealPlan.load(services, userId: book.userId) : nil
    }
    // Bữa hôm nay đổi (ghi ở đâu cũng vậy) → đọc lại kế hoạch: bữa vừa ghi theo
    // kế hoạch có nhãn, bữa dự kiến đã ăn thôi hiện.
    .onChange(of: book.phase) { _, _ in planTick += 1 }
    .task(id: book.userId) { shared = await services.sharedPostSourceIds(userId: book.userId) }
    .sheet(item: $sharing) { req in
      NavigationStack {
        CommunityShareRecipeScreen(mealId: req.mealId) {
          sharing = nil
          Task { shared = await services.sharedPostSourceIds(userId: book.userId) }
        }
        .toolbar {
          ToolbarItem(placement: .cancellationAction) {
            Button(String(localized: "common.cancel")) { sharing = nil }
          }
        }
      }
    }
    // Bữa vừa lưu đi qua hàng đợi: hàng đợi vơi đi thì đọc lại ngày.
    .onChange(of: services.sync.pendingCount) { old, new in
      if new < old {
        Task {
          await book.load()
          onChanged()
        }
      }
    }
    .sheet(item: $logging) { req in
      LogMealView(userId: book.userId, date: book.date, mealType: req.mealType) {
        Task {
          await book.load()
          onChanged()
        }
      }
    }
    .onChange(of: book.date) { _, _ in clearNotice() }
    .sheet(item: $editing) { item in
      ServingsSheet(item: item, busy: book.busy) { servings in
        Task { await save(item, servings) }
      }
      .presentationDetents([.medium])
      // Nền đặc màu trang (16/10, chủ dự án: thẻ trên bảng kính khó nhìn — như Ghi nhanh).
      .presentationBackground(DS.Color.background.swiftUI)
    }
    .alert(
      String(localized: "diary.item.delete"),
      isPresented: Binding(get: { pendingItem != nil }, set: { if !$0 { pendingItem = nil } }),
      presenting: pendingItem
    ) { item in
      Button(String(localized: "diary.delete"), role: .destructive) { Task { await delete([item]) } }
      Button(String(localized: "common.cancel"), role: .cancel) {}
    } message: { item in
      Text(book.isToday
        ? String(localized: "diary.item.delete.today \(item.foodName)")
        : String(localized: "diary.item.delete.day \(item.foodName)"))
    }
    .alert(
      pendingGroup.map { String(localized: "diary.meal.delete \(DiaryView.mealName($0.type))") } ?? "",
      isPresented: Binding(get: { pendingGroup != nil }, set: { if !$0 { pendingGroup = nil } }),
      presenting: pendingGroup
    ) { group in
      Button(String(localized: "diary.delete"), role: .destructive) { Task { await delete(group.items) } }
      Button(String(localized: "common.cancel"), role: .cancel) {}
    } message: { group in
      Text(DiaryView.deleteGroupMessage(count: group.items.count, meal: DiaryView.mealName(group.type), today: book.isToday))
    }
    .alert(
      error ?? "",
      isPresented: Binding(get: { error != nil }, set: { if !$0 { error = nil } })
    ) {
      Button(String(localized: "common.cancel"), role: .cancel) {}
    }
  }

  // MARK: - Nội dung

  @ViewBuilder private var content: some View {
    switch book.phase {
    case .loading:
      DSLoadingView()
    case .failed(.offline):
      DSOfflineView { Task { await book.load() } }
    case .failed:
      DSErrorView(message: String(localized: "async.error.generic")) { Task { await book.load() } }
    case .ready(let meals) where slots:
      slotList(MealDiary.groups(meals))
    case .ready(let meals):
      let total = MealDiary.dayTotal(meals)
      if total.kcal > 0 {
        DSCard {
          HStack(alignment: .firstTextBaseline) {
            Text(String(localized: "diary.dayTotal"))
              .font(DS.TextStyle.caption)
              .foregroundStyle(DS.Color.mutedForeground.swiftUI)
            Spacer()
            Text(verbatim: "\(DiaryView.whole(total.kcal)) kcal  "
              + DiaryView.macros(total.protein, total.carbs, total.fat))
              .font(DS.TextStyle.headline.monospacedDigit())
          }
          .accessibilityElement(children: .combine)
        }
      }
      let groups = MealDiary.groups(meals)
      if groups.isEmpty {
        // Thẻ rỗng là lối ghi — mang NGÀY theo (`/log-meal?date=`).
        Button { logging = LogMealRequest(mealType: nil) } label: {
          DSCard {
            HStack(spacing: DS.Spacing.sm) {
              Image(systemName: "fork.knife").accessibilityHidden(true)
              Text(book.isToday ? String(localized: "diary.empty.today") : String(localized: "diary.empty.day"))
                .font(DS.TextStyle.body)
                .multilineTextAlignment(.leading)
              Spacer(minLength: 0)
            }
            .frame(minHeight: 44)
          }
        }
        .buttonStyle(.plain)
      } else {
        ForEach(groups) { g in
          MealGroupCard(
            group: g, busy: book.busy,
            onEdit: { editing = $0 },
            onDelete: { pendingItem = $0 },
            onDeleteGroup: { pendingGroup = g },
            onAddTo: { logging = LogMealRequest(mealType: g.type) },
            onShare: shareAction(g))
        }
        Button { logging = LogMealRequest(mealType: nil) } label: {
          Label(String(localized: "diary.addMeal"), systemImage: "plus")
            .font(DS.TextStyle.footnote.weight(.semibold))
            .foregroundStyle(DS.Color.primary.swiftUI)
            .frame(maxWidth: .infinity, minHeight: 44)
            .overlay(RoundedRectangle(cornerRadius: DS.Radius.sm).stroke(DS.Color.border.swiftUI, lineWidth: 1))
        }
        .buttonStyle(.plain)
      }
    }
  }

  /// Khung bữa luôn có hàng, theo thứ tự trong ngày; trước / sau tập chỉ khi
  /// đã có món (không phải ai cũng tập).
  static let standardSlots = ["breakfast", "lunch", "dinner", "snack"]

  private func slotList(_ groups: [MealDiary.Group]) -> some View {
    let byType = Dictionary(groups.map { ($0.type, $0) }, uniquingKeysWith: { a, _ in a })
    let extra = groups.map(\.type).filter { !Self.standardSlots.contains($0) }
    let types = Self.standardSlots + extra
    return VStack(spacing: 0) {
      ForEach(Array(types.enumerated()), id: \.element) { i, type in
        if i > 0 { Divider().padding(.leading, 58).opacity(0.6) }
        if let g = byType[type] {
          MealGroupCard(
            group: g, busy: book.busy, plain: true,
            onEdit: { editing = $0 },
            onDelete: { pendingItem = $0 },
            onDeleteGroup: { pendingGroup = g },
            onAddTo: { logging = LogMealRequest(mealType: g.type) },
            onShare: shareAction(g),
            fromPlan: plan.map { !$0.planned(type).isEmpty && $0.book.isLoggedToday(type, day: $0.day) } ?? false)
        } else if let plan, !plan.planned(type).isEmpty {
          PlannedSlotRow(
            type: type, items: plan.planned(type), busy: eatingPlan == type,
            onEat: { Task { await eatPlanned(type) } },
            onLog: { logging = LogMealRequest(mealType: type) })
        } else {
          EmptySlotRow(type: type) { logging = LogMealRequest(mealType: type) }
        }
      }
    }
    .clipShape(RoundedRectangle(cornerRadius: DS.Radius.xl, style: .continuous))
    .todayCard()
  }

  /// "Ăn đúng kế hoạch": bữa dự kiến thành bữa hôm nay, một chạm.
  private func eatPlanned(_ meal: String) async {
    guard let plan, eatingPlan == nil else { return }
    eatingPlan = meal
    defer { eatingPlan = nil }
    if case .queued = await plan.book.eat(meal: meal, day: plan.day, online: services.sync.online) {
      Telemetry.capture(.mealLogged, ["source": "plan"])
      services.didLog()
      AccessibilityNotification.Announcement(String(localized: "plan.eaten \(DiaryView.mealName(meal))")).post()
      await book.load()
      onChanged()
    } else {
      error = String(localized: "async.error.generic")
    }
  }

  private func undoBar(_ text: String) -> some View {
    HStack {
      Text(verbatim: text).font(DS.TextStyle.footnote)
      Spacer()
      if !undo.isEmpty {
        Button(String(localized: "diary.undo")) { Task { await restore() } }
          .font(DS.TextStyle.footnote.weight(.semibold))
          .frame(minHeight: 44)
          .disabled(book.busy)
      }
    }
    .padding(.horizontal, DS.Spacing.md)
    .background(DS.Color.card.swiftUI, in: RoundedRectangle(cornerRadius: DS.Radius.md))
  }

  // MARK: - Lệnh

  private func delete(_ items: [MealDiary.Item]) async {
    clearNotice()
    let outcome = await book.delete(items, online: services.sync.online)
    if case .done(let snaps) = outcome {
      undo = snaps
      say(String(localized: "diary.deleted"))
      onChanged()
    } else {
      report(outcome)
    }
  }

  private func restore() async {
    let snaps = undo
    clearNotice()
    let outcome = await book.restore(snaps, online: services.sync.online)
    if case .done = outcome {
      say(String(localized: "diary.restored"))
      onChanged()
    } else {
      report(outcome)
    }
  }

  private func save(_ item: MealDiary.Item, _ servings: Double) async {
    let outcome = await book.setServings(item, to: servings, online: services.sync.online)
    editing = nil
    if case .done = outcome {
      if servings != item.servings {
        say(String(localized: "diary.updated"))
        onChanged()
      }
    } else {
      report(outcome)
    }
  }

  private func say(_ text: String) {
    notice = text
    AccessibilityNotification.Announcement(text).post()
  }

  /// Lối chia sẻ của một nhóm bữa (`shareTarget`), `nil` = không hiện.
  private func shareAction(_ g: MealDiary.Group) -> (() -> Void)? {
    let today = LocalDate(SystemWallClock().nowMillis(), in: .current)
    switch CommunityShareRecipe.target(group: g, shared: shared, viewed: book.date, today: today) {
    case .meal(let id)?: return { sharing = ShareMealRequest(mealId: id) }
    case .pick?: return { sharing = ShareMealRequest(mealId: nil) }
    case nil: return nil
    }
  }

  private func clearNotice() {
    notice = nil
    undo = []
  }

  private func report(_ outcome: MealDiaryBook.EditOutcome) {
    let text: String
    switch outcome {
    case .done: return
    case .onlineOnly: text = String(localized: "diary.error.onlineOnly")
    case .nothingWritten: text = String(localized: "diary.error.nothingWritten")
    case .rebuildFailed: text = String(localized: "diary.error.rebuild")
    case .pendingSync: text = String(localized: "diary.error.pendingSync")
    case .failed: text = String(localized: "async.error.generic")
    }
    error = text
    AccessibilityNotification.Announcement(text).post()
  }
}

/// Một loại bữa, đóng sẵn: đầu thẻ trả lời "bữa sáng tốn bao nhiêu"; mở ra
/// thì có từng món.
private struct MealGroupCard: View {
  let group: MealDiary.Group
  let busy: Bool
  /// Hàng trong thẻ danh sách khung bữa (tab Dinh dưỡng): không có `DSCard`
  /// riêng, có vòng màu bữa ở đầu, dòng phụ là tên món.
  var plain = false
  let onEdit: (MealDiary.Item) -> Void
  let onDelete: (MealDiary.Item) -> Void
  let onDeleteGroup: () -> Void
  let onAddTo: () -> Void
  /// "Chia sẻ lên Cộng đồng" (`onShare` của RN) — chỉ có khi còn bản ghi chưa đăng.
  var onShare: (() -> Void)?
  /// Bữa này đúng như kế hoạch ăn hôm nay (19/10) — nhãn nhỏ cạnh tên bữa.
  var fromPlan = false
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  @State private var open = false

  private var name: String { DiaryView.mealName(group.type) }

  private var sub: String {
    let n = group.items.count
    let count = n == 1 ? String(localized: "diary.items.one") : String(localized: "diary.items \(n)")
    let entries = group.entries > 1 ? String(localized: "diary.entries \(group.entries)") + " · " : ""
    return entries + count + " · " + DiaryView.macros(group.protein, group.carbs, group.fat)
  }

  /// Dòng phụ của hàng khung bữa: tên các món, ngắn.
  private var itemNames: String {
    group.items.map(\.foodName).formatted(.list(type: .and).locale(.app))
  }

  var body: some View {
    if plain {
      content.padding(.horizontal, DS.Spacing.md).padding(.vertical, 10)
    } else {
      DSCard { content }
    }
  }

  private var content: some View {
      VStack(alignment: .leading, spacing: DS.Spacing.sm) {
        Button {
          withAnimation(reduceMotion ? nil : .easeOut(duration: 0.26)) { open.toggle() }
        } label: {
          HStack(alignment: plain ? .center : .firstTextBaseline, spacing: plain ? 12 : 8) {
            if plain { MealSlotGlyph(type: group.type, filled: true) }
            VStack(alignment: .leading, spacing: 2) {
              HStack(spacing: 6) {
                Text(verbatim: name).font(plain ? .system(size: 17, weight: .semibold) : DS.TextStyle.headline)
                if fromPlan { PlanTag() }
              }
              Text(verbatim: plain ? itemNames : sub)
                .font(DS.TextStyle.caption.monospacedDigit())
                .foregroundStyle(DS.Color.mutedForeground.swiftUI)
                .lineLimit(plain ? 1 : nil)
            }
            Spacer()
            Text(verbatim: plain ? DiaryView.whole(group.kcal) : "\(DiaryView.whole(group.kcal)) kcal")
              .font(plain ? DS.TextStyle.number(15, .body) : DS.TextStyle.headline.monospacedDigit())
            Image(systemName: "chevron.down")
              .font(plain ? .caption.weight(.semibold) : .body)
              .rotationEffect(.degrees(open ? 180 : 0))
              .foregroundStyle(DS.Color.mutedForeground.swiftUI)
              .accessibilityHidden(true)
          }
          .frame(minHeight: 44)
          .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .sensoryFeedback(.selection, trigger: open)
        .accessibilityValue(Text(verbatim: (plain ? "\(DiaryView.whole(group.kcal)) kcal, " : "")
          + (open ? String(localized: "diary.a11y.expanded") : String(localized: "diary.a11y.collapsed"))))
        .accessibilityAction(named: Text(String(localized: "diary.meal.addAction"))) { onAddTo() }
        .accessibilityAction(named: Text(String(localized: "diary.meal.deleteAction"))) { onDeleteGroup() }
        .accessibilityActions {
          if let onShare { Button(String(localized: "diary.meal.share"), action: onShare) }
        }

        if open {
          ForEach(group.items) { it in row(it).padding(.leading, plain ? 46 : 0) }
          Button(action: onAddTo) {
            Label(String(localized: "diary.meal.addAction"), systemImage: "plus")
              .font(DS.TextStyle.footnote.weight(.semibold))
              .frame(maxWidth: .infinity, minHeight: 44)
          }
          .buttonStyle(.plain)
          .foregroundStyle(DS.Color.primary.swiftUI)
          Button(role: .destructive, action: onDeleteGroup) {
            Label(String(localized: "diary.meal.deleteAction"), systemImage: "trash")
              .font(DS.TextStyle.footnote.weight(.semibold))
              .frame(maxWidth: .infinity, minHeight: 44)
          }
          .buttonStyle(.plain)
          .foregroundStyle(DS.Color.destructive.swiftUI)
          .disabled(busy)
          // Mục cuối của thẻ đã mở, như một dòng menu (RN).
          if let onShare {
            Button(action: onShare) {
              Label(String(localized: "diary.meal.share"), systemImage: "square.and.arrow.up")
                .font(DS.TextStyle.footnote.weight(.semibold))
                .frame(maxWidth: .infinity, minHeight: 44)
            }
            .buttonStyle(.plain)
            .foregroundStyle(DS.Color.primary.swiftUI)
          }
        }
      }
  }

  private func row(_ it: MealDiary.Item) -> some View {
    HStack(spacing: DS.Spacing.sm) {
      VStack(alignment: .leading, spacing: 2) {
        HStack(spacing: 4) {
          Text(verbatim: it.foodName).font(DS.TextStyle.body).lineLimit(1)
          if let badge = MealDiary.servingsBadge(it.servings) {
            Text(verbatim: "×\(badge)")
              .font(DS.TextStyle.caption.monospacedDigit())
              .foregroundStyle(DS.Color.mutedForeground.swiftUI)
          }
        }
        Text(verbatim: DiaryView.macros(it.protein, it.carbs, it.fat))
          .font(DS.TextStyle.caption.monospacedDigit())
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)
      }
      .accessibilityElement(children: .combine)
      Spacer(minLength: 0)
      Text(verbatim: DiaryView.whole(it.kcal))
        .font(DS.TextStyle.body.monospacedDigit())
      if it.pending {
        // Còn trong outbox: server chưa có hàng này, sửa / xoá sẽ không chạm gì.
        Image(systemName: "arrow.triangle.2.circlepath")
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)
          .frame(width: 88, height: 44)
          .accessibilityLabel(Text(String(localized: "diary.item.pending")))
      } else {
        itemActions(it)
      }
    }
  }

  @ViewBuilder private func itemActions(_ it: MealDiary.Item) -> some View {
      Button { onEdit(it) } label: {
        Image(systemName: "pencil")
          .foregroundStyle(DS.Color.foreground.swiftUI)
          .frame(width: 44, height: 44)
          .contentShape(Rectangle())
      }
      .buttonStyle(.plain)
      .disabled(busy)
      .accessibilityLabel(Text(String(localized: "diary.item.edit \(it.foodName)")))
      Button { onDelete(it) } label: {
        Image(systemName: "trash")
          .foregroundStyle(DS.Color.foreground.swiftUI)
          .frame(width: 44, height: 44)
          .contentShape(Rectangle())
      }
      .buttonStyle(.plain)
      .disabled(busy)
      .accessibilityLabel(Text(String(localized: "diary.item.deleteNamed \(it.foodName)")))
  }
}

/// Sheet sửa khẩu phần: 0,5…20 bước 0,5, xem trước kcal / macro theo tỉ lệ.
private struct ServingsSheet: View {
  let item: MealDiary.Item
  let busy: Bool
  let onSave: (Double) -> Void
  @Environment(\.dismiss) private var dismiss
  @State private var servings: Double

  init(item: MealDiary.Item, busy: Bool, onSave: @escaping (Double) -> Void) {
    self.item = item
    self.busy = busy
    self.onSave = onSave
    _servings = State(initialValue: MealDiary.servingsRange.contains(item.servings) ? item.servings : 1)
  }

  var body: some View {
    let preview = MealDiary.scaled(item, to: servings)
    VStack(spacing: DS.Spacing.md) {
      Text(verbatim: item.foodName)
        .font(DS.TextStyle.headline)
        .lineLimit(2)
        .multilineTextAlignment(.center)
      Text(String(localized: "diary.servings"))
        .font(DS.TextStyle.caption)
        .foregroundStyle(DS.Color.mutedForeground.swiftUI)
      HStack(spacing: DS.Spacing.lg) {
        stepButton("minus", label: String(localized: "diary.servings.less"), by: -1)
        Text(verbatim: MealDiary.servingsText(servings))
          .font(DS.TextStyle.title.monospacedDigit())
          .frame(minWidth: 64)
        stepButton("plus", label: String(localized: "diary.servings.more"), by: 1)
      }
      .accessibilityElement(children: .ignore)
      .accessibilityLabel(Text(String(localized: "diary.servings")))
      .accessibilityValue(Text(verbatim: MealDiary.servingsText(servings)))
      .accessibilityAdjustableAction { dir in
        servings = MealDiary.step(servings, by: dir == .increment ? 1 : -1)
      }
      Text(verbatim: "\(DiaryView.whole(preview.kcal)) kcal · "
        + DiaryView.macros(preview.protein, preview.carbs, preview.fat))
        .font(DS.TextStyle.footnote.monospacedDigit())
        .foregroundStyle(DS.Color.mutedForeground.swiftUI)
      HStack(spacing: DS.Spacing.sm) {
        Button(String(localized: "common.cancel")) { dismiss() }
          .frame(maxWidth: .infinity, minHeight: 44)
        DSButton(String(localized: "common.save")) { onSave(servings) }
          .disabled(busy)
          .opacity(busy ? 0.5 : 1)
      }
    }
    .padding(DS.Spacing.lg)
  }

  private func stepButton(_ icon: String, label: String, by dir: Int) -> some View {
    let next = MealDiary.step(servings, by: dir)
    return Button {
      servings = next
    } label: {
      Image(systemName: icon)
        .font(.body.weight(.semibold))
        .frame(width: 44, height: 44)
        .background(DS.Color.muted.swiftUI, in: Circle())
    }
    .buttonStyle(.plain)
    .disabled(next == servings)
    .accessibilityLabel(Text(verbatim: label))
    .sensoryFeedback(.selection, trigger: servings)
  }
}

/// Mở màn ghi bữa từ nhật ký; `mealType` khi vào từ một thẻ bữa.
struct ShareMealRequest: Identifiable {
  let id = UUID()
  /// `nil` = mở danh sách chọn bữa.
  let mealId: String?
}

struct LogMealRequest: Identifiable {
  let id = UUID()
  let mealType: String?
}

/// Vòng biểu tượng của một khung bữa (32pt, như hàng "Your day" của Hôm nay):
/// màu bữa khi đã có món, xám khi trống.
struct MealSlotGlyph: View {
  let type: String
  let filled: Bool

  static func symbol(_ type: String) -> String {
    switch type {
    case "breakfast": "sunrise"
    case "lunch": "sun.max"
    case "dinner": "moon.stars"
    case "snack": "carrot"
    case "preworkout": "bolt"
    case "postworkout": "figure.cooldown"
    default: "fork.knife"
    }
  }

  /// Đã ăn: tròn đặc màu Bữa ăn, biểu tượng trắng; chưa: viền nét đứt
  /// (thiết kế lại 14/10) — liếc là biết bữa nào còn trống.
  var body: some View {
    let meal = MascotRoomView.signalColor(.meal)
    Image(systemName: Self.symbol(type))
      .font(.system(size: 14, weight: .semibold))
      .foregroundStyle(filled ? Color.white : DS.Color.mutedForeground.swiftUI)
      .frame(width: 34, height: 34)
      .background {
        if filled {
          Circle().fill(meal)
        } else {
          Circle().strokeBorder(DS.Color.mutedForeground.swiftUI.opacity(0.5), style: StrokeStyle(lineWidth: 1.2, dash: [3, 3]))
        }
      }
      .accessibilityHidden(true)
  }
}

/// Khung bữa chưa có món: tên, "Chưa ghi", nút "Ghi" mở màn ghi đúng khung này.
private struct EmptySlotRow: View {
  let type: String
  let onLog: () -> Void

  var body: some View {
    Button(action: onLog) {
      HStack(spacing: 12) {
        MealSlotGlyph(type: type, filled: false)
        VStack(alignment: .leading, spacing: 2) {
          Text(verbatim: DiaryView.mealName(type))
            .font(.system(size: 17, weight: .semibold))
            .foregroundStyle(DS.Color.foreground.swiftUI)
          Text(String(localized: "nc.slot.empty"))
            .font(DS.TextStyle.caption)
            .foregroundStyle(DS.Color.mutedForeground.swiftUI)
        }
        Spacer(minLength: 0)
        Image(systemName: "plus")
          .font(.system(size: 15, weight: .bold))
          .foregroundStyle(.white)
          .frame(width: 34, height: 34)
          .background(Circle().fill(MascotRoomView.signalColor(.meal)))
      }
      .padding(.horizontal, DS.Spacing.md)
      .padding(.vertical, 10)
      .frame(minHeight: 56)
      .contentShape(Rectangle())
    }
    .buttonStyle(TodayPressStyle(scale: 0.98))
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(Text(verbatim: DiaryView.mealName(type)))
    .accessibilityValue(Text(String(localized: "nc.slot.empty")))
    .accessibilityHint(Text(String(localized: "nc.slot.hint")))
    .accessibilityAddTraits(.isButton)
  }
}

/// Khung bữa còn trống mà kế hoạch ăn hôm nay có món (19/10): hiện món dự kiến;
/// ✓ ghi đúng kế hoạch một chạm, + để ghi bữa khác.
private struct PlannedSlotRow: View {
  let type: String
  let items: [MealPlans.Item]
  let busy: Bool
  let onEat: () -> Void
  let onLog: () -> Void

  private var names: String { items.map(\.name).formatted(.list(type: .and).locale(.app)) }
  private var kcal: Double { items.reduce(0) { $0 + $1.kcal } }

  var body: some View {
    HStack(spacing: 12) {
      MealSlotGlyph(type: type, filled: false)
      Button(action: onLog) {
        VStack(alignment: .leading, spacing: 2) {
          HStack(spacing: 6) {
            Text(verbatim: DiaryView.mealName(type)).font(.system(size: 17, weight: .semibold))
              .foregroundStyle(DS.Color.foreground.swiftUI)
            PlanTag()
          }
          Text(verbatim: "\(names) · \(DiaryView.whole(kcal)) kcal")
            .font(DS.TextStyle.caption)
            .foregroundStyle(DS.Color.mutedForeground.swiftUI)
            .lineLimit(2)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .contentShape(Rectangle())
      }
      .buttonStyle(.plain)
      .accessibilityHint(Text(String(localized: "nc.slot.hint")))
      Button(action: onEat) {
        Group {
          if busy { ProgressView().tint(.white) } else { Image(systemName: "checkmark").font(.system(size: 15, weight: .bold)) }
        }
        .foregroundStyle(.white)
        .frame(width: 34, height: 34)
        .background(Circle().fill(MascotRoomView.signalColor(.meal)))
        .frame(width: 44, height: 44)
      }
      .buttonStyle(TodayPressStyle())
      .disabled(busy)
      .accessibilityLabel(Text(String(localized: "plan.eat.a11y \(DiaryView.mealName(type))")))
    }
    .padding(.horizontal, DS.Spacing.md)
    .padding(.vertical, 10)
    .frame(minHeight: 56)
  }
}

/// Nhãn "Kế hoạch" nhỏ: bữa này đến từ / khớp kế hoạch ăn hôm nay.
private struct PlanTag: View {
  var body: some View {
    Text("plan.tag")
      .font(.system(size: 10, weight: .bold))
      .foregroundStyle(DS.Color.metricOrangeGraphic.swiftUI)
      .padding(.horizontal, 6).padding(.vertical, 2)
      .background(DS.Color.metricOrangeGraphic.swiftUI.opacity(0.12), in: Capsule())
  }
}
