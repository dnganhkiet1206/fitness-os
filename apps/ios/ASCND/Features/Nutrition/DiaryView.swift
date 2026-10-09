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
  @Environment(AppServices.self) private var services
  @State private var editing: MealDiary.Item?
  @State private var pendingItem: MealDiary.Item?
  @State private var pendingGroup: MealDiary.Group?
  @State private var undo: [DeletedMealItem] = []
  @State private var notice: String?
  @State private var error: String?
  @State private var logging: LogMealRequest?

  var body: some View {
    ScrollView {
      VStack(spacing: DS.Spacing.md) {
        dayBar
        if !book.isToday {
          Button {
            book.goToday()
          } label: {
            Text(String(localized: "diary.today"))
              .font(DS.TextStyle.footnote.weight(.semibold))
              .foregroundStyle(DS.Color.primary.swiftUI)
              .padding(.horizontal, DS.Spacing.lg)
              .frame(minHeight: 44)
              .background(DS.Color.muted.swiftUI, in: Capsule())
          }
          .buttonStyle(.plain)
          .sensoryFeedback(.selection, trigger: book.date)
        }
        content
        if let notice { undoBar(notice) }
      }
      .padding(DS.Spacing.md)
    }
    .navigationTitle(String(localized: "diary.title"))
    .navigationBarTitleDisplayMode(.inline)
    .refreshable { await book.load() }
    .task(id: book.date) { await book.load() }
    // Bữa vừa lưu đi qua hàng đợi: hàng đợi vơi đi thì đọc lại ngày.
    .onChange(of: services.sync.pendingCount) { old, new in
      if new < old { Task { await book.load() } }
    }
    .sheet(item: $logging) { req in
      LogMealView(userId: book.userId, date: book.date, mealType: req.mealType) {
        Task { await book.load() }
      }
    }
    .onChange(of: book.date) { _, _ in clearNotice() }
    .sheet(item: $editing) { item in
      ServingsSheet(item: item, busy: book.busy) { servings in
        Task { await save(item, servings) }
      }
      .presentationDetents([.medium])
    }
    .confirmationDialog(
      String(localized: "diary.item.delete"),
      isPresented: Binding(get: { pendingItem != nil }, set: { if !$0 { pendingItem = nil } }),
      titleVisibility: .visible,
      presenting: pendingItem
    ) { item in
      Button(String(localized: "diary.delete"), role: .destructive) { Task { await delete([item]) } }
      Button(String(localized: "common.cancel"), role: .cancel) {}
    } message: { item in
      Text(book.isToday
        ? String(localized: "diary.item.delete.today \(item.foodName)")
        : String(localized: "diary.item.delete.day \(item.foodName)"))
    }
    .confirmationDialog(
      pendingGroup.map { String(localized: "diary.meal.delete \(Self.mealName($0.type))") } ?? "",
      isPresented: Binding(get: { pendingGroup != nil }, set: { if !$0 { pendingGroup = nil } }),
      titleVisibility: .visible,
      presenting: pendingGroup
    ) { group in
      Button(String(localized: "diary.delete"), role: .destructive) { Task { await delete(group.items) } }
      Button(String(localized: "common.cancel"), role: .cancel) {}
    } message: { group in
      Text(Self.deleteGroupMessage(count: group.items.count, meal: Self.mealName(group.type), today: book.isToday))
    }
    .alert(
      error ?? "",
      isPresented: Binding(get: { error != nil }, set: { if !$0 { error = nil } })
    ) {
      Button(String(localized: "common.cancel"), role: .cancel) {}
    }
  }

  // MARK: - Ngày

  private var dayBar: some View {
    DSCard {
      HStack(spacing: DS.Spacing.sm) {
        arrow("chevron.left", label: String(localized: "diary.prevDay"), enabled: true) { _ = book.go(-1) }
        VStack(spacing: 1) {
          Text(verbatim: Self.dayLabel(book.date, today: book.today))
            .font(DS.TextStyle.headline)
            .lineLimit(1)
          if let sub = Self.daySub(book.date, today: book.today) {
            Text(verbatim: sub)
              .font(DS.TextStyle.caption)
              .foregroundStyle(DS.Color.mutedForeground.swiftUI)
              .lineLimit(1)
          }
        }
        .frame(maxWidth: .infinity)
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.isHeader)
        arrow("chevron.right", label: String(localized: "diary.nextDay"), enabled: !book.isToday) { _ = book.go(1) }
      }
    }
  }

  private func arrow(_ icon: String, label: String, enabled: Bool, action: @escaping () -> Void) -> some View {
    Button(action: action) {
      Image(systemName: icon)
        .font(.body.weight(.semibold))
        .foregroundStyle(DS.Color.foreground.swiftUI)
        .frame(width: 44, height: 44)
        .background(DS.Color.muted.swiftUI, in: Circle())
    }
    .buttonStyle(.plain)
    .disabled(!enabled)
    .opacity(enabled ? 1 : 0.35)
    .accessibilityLabel(Text(verbatim: label))
    .sensoryFeedback(.selection, trigger: book.date)
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
    case .ready(let meals):
      let total = MealDiary.dayTotal(meals)
      if total.kcal > 0 {
        DSCard {
          HStack(alignment: .firstTextBaseline) {
            Text(String(localized: "diary.dayTotal"))
              .font(DS.TextStyle.caption)
              .foregroundStyle(DS.Color.mutedForeground.swiftUI)
            Spacer()
            Text(verbatim: "\(Self.whole(total.kcal)) kcal  "
              + Self.macros(total.protein, total.carbs, total.fat))
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
            onAddTo: { logging = LogMealRequest(mealType: g.type) })
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
    } else {
      report(outcome)
    }
  }

  private func save(_ item: MealDiary.Item, _ servings: Double) async {
    let outcome = await book.setServings(item, to: servings, online: services.sync.online)
    editing = nil
    if case .done = outcome {
      if servings != item.servings { say(String(localized: "diary.updated")) }
    } else {
      report(outcome)
    }
  }

  private func say(_ text: String) {
    notice = text
    AccessibilityNotification.Announcement(text).post()
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
    case .failed: text = String(localized: "async.error.generic")
    }
    error = text
    AccessibilityNotification.Announcement(text).post()
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
    "P\(whole(p)) · C\(whole(c)) · F\(whole(f))"
  }
}

/// Một loại bữa, đóng sẵn: đầu thẻ trả lời "bữa sáng tốn bao nhiêu"; mở ra
/// thì có từng món.
private struct MealGroupCard: View {
  let group: MealDiary.Group
  let busy: Bool
  let onEdit: (MealDiary.Item) -> Void
  let onDelete: (MealDiary.Item) -> Void
  let onDeleteGroup: () -> Void
  let onAddTo: () -> Void
  @State private var open = false

  private var name: String { DiaryView.mealName(group.type) }

  private var sub: String {
    let n = group.items.count
    let count = n == 1 ? String(localized: "diary.items.one") : String(localized: "diary.items \(n)")
    let entries = group.entries > 1 ? String(localized: "diary.entries \(group.entries)") + " · " : ""
    return entries + count + " · " + DiaryView.macros(group.protein, group.carbs, group.fat)
  }

  var body: some View {
    DSCard {
      VStack(alignment: .leading, spacing: DS.Spacing.sm) {
        Button {
          withAnimation(.easeOut(duration: 0.26)) { open.toggle() }
        } label: {
          HStack(alignment: .firstTextBaseline) {
            VStack(alignment: .leading, spacing: 2) {
              Text(verbatim: name).font(DS.TextStyle.headline)
              Text(verbatim: sub)
                .font(DS.TextStyle.caption.monospacedDigit())
                .foregroundStyle(DS.Color.mutedForeground.swiftUI)
            }
            Spacer()
            Text(verbatim: "\(DiaryView.whole(group.kcal)) kcal")
              .font(DS.TextStyle.headline.monospacedDigit())
            Image(systemName: "chevron.down")
              .rotationEffect(.degrees(open ? 180 : 0))
              .foregroundStyle(DS.Color.mutedForeground.swiftUI)
              .accessibilityHidden(true)
          }
          .frame(minHeight: 44)
          .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .sensoryFeedback(.selection, trigger: open)
        .accessibilityValue(Text(open ? String(localized: "diary.a11y.expanded") : String(localized: "diary.a11y.collapsed")))
        .accessibilityAction(named: Text(String(localized: "diary.meal.addAction"))) { onAddTo() }
        .accessibilityAction(named: Text(String(localized: "diary.meal.deleteAction"))) { onDeleteGroup() }

        if open {
          ForEach(group.items) { it in row(it) }
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
struct LogMealRequest: Identifiable {
  let id = UUID()
  let mealType: String?
}
