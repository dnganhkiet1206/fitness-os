import ASCNDCore
import ASCNDDesignSystem
import SwiftUI

/// Màn Thực phẩm (#527 Phase 3 · 3.3) — `app/food-list.tsx` + `food-cards.tsx`
/// trên `FoodLibraryBook`.
///
/// Như RN:
/// - hai đoạn "Của tôi" / "Gần đây", mỗi đoạn kèm số mục;
/// - ô "Lọc trong danh sách"; nút "+" (thêm thực phẩm) chỉ ở "Của tôi";
/// - chạm một món của tôi để sửa; món gần đây chưa có trong thư viện có "+"
///   lưu lại;
/// - đọc hỏng là lỗi có thử lại, không phải "chưa có gì";
/// - thêm / sửa / xoá / lưu chỉ khi có mạng.
///
/// Chưa có: nút sao (đánh / bỏ yêu thích) — lớp Trạng thái #161 chưa port.
struct FoodListView: View {
  let book: FoodLibraryBook
  @Environment(AppServices.self) private var services
  @State private var segment: Segment = .mine
  @State private var query = ""
  @State private var editing: EditorRequest?
  @State private var message: String?

  enum Segment: Hashable { case mine, recent }

  /// Mở form: `food == nil` là thêm mới.
  struct EditorRequest: Identifiable {
    let id = UUID()
    let food: FoodLibrary.Food?
  }

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: DS.Spacing.md) {
        Picker(selection: $segment) {
          Text(verbatim: "\(String(localized: "foods.mine")) \(book.mine.count)").tag(Segment.mine)
          Text(verbatim: "\(String(localized: "foods.recent")) \(book.recents.count)").tag(Segment.recent)
        } label: {
          Text(String(localized: "foods.title"))
        }
        .pickerStyle(.segmented)
        HStack(spacing: DS.Spacing.sm) {
          HStack {
            Image(systemName: "magnifyingglass")
              .foregroundStyle(DS.Color.mutedForeground.swiftUI)
              .accessibilityHidden(true)
            TextField(text: $query, prompt: Text(String(localized: "foods.filter"))) {
              Text(String(localized: "foods.filter"))
            }
            .autocorrectionDisabled()
          }
          .padding(DS.Spacing.sm)
          .frame(minHeight: 44)
          .background(DS.Color.input.swiftUI, in: RoundedRectangle(cornerRadius: DS.Radius.sm))
          if segment == .mine {
            Button { editing = EditorRequest(food: nil) } label: {
              Image(systemName: "plus")
                .font(.body.weight(.bold))
                .foregroundStyle(DS.Color.background.swiftUI)
                .frame(width: 44, height: 44)
                .background(DS.Color.foreground.swiftUI, in: RoundedRectangle(cornerRadius: DS.Radius.sm))
            }
            .buttonStyle(.plain)
            .accessibilityLabel(Text(String(localized: "foods.add")))
          }
        }
        content
      }
      .padding(DS.Spacing.md)
    }
    .navigationTitle(String(localized: "foods.title"))
    .navigationBarTitleDisplayMode(.inline)
    .refreshable { await book.load() }
    .task { await book.load() }
    .sheet(item: $editing) { req in
      FoodEditorView(book: book, food: req.food)
    }
    .alert(message ?? "", isPresented: Binding(get: { message != nil }, set: { if !$0 { message = nil } })) {
      Button(String(localized: "common.cancel"), role: .cancel) {}
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
    case .ready:
      if segment == .mine { mineList } else { recentList }
    }
  }

  private var emptyText: String {
    if !query.trimmingCharacters(in: .whitespaces).isEmpty { return String(localized: "foods.empty.noMatch") }
    return segment == .mine ? String(localized: "foods.empty.mine") : String(localized: "foods.empty.recent")
  }

  @ViewBuilder private var mineList: some View {
    let shown = FoodLibrary.filter(book.mine, query)
    if shown.isEmpty {
      empty
    } else {
      VStack(spacing: DS.Spacing.xs) {
        ForEach(shown) { f in
          Button { editing = EditorRequest(food: f) } label: {
            row(name: f.name, brand: f.brand, kcal: f.kcal, p: f.protein, c: f.carbs, fat: f.fat, favorite: f.isFavorite) {
              Image(systemName: "chevron.right")
                .foregroundStyle(DS.Color.mutedForeground.swiftUI)
                .accessibilityHidden(true)
            }
          }
          .buttonStyle(.plain)
          .accessibilityHint(Text(String(localized: "foods.a11y.edit")))
        }
      }
    }
  }

  @ViewBuilder private var recentList: some View {
    let shown = FoodLibrary.filter(book.recents, query)
    let saved = FoodLibrary.savedNames(book.mine)
    if shown.isEmpty {
      empty
    } else {
      VStack(spacing: DS.Spacing.xs) {
        ForEach(shown) { r in
          row(name: r.name, brand: nil, kcal: r.kcal, p: r.protein, c: r.carbs, fat: r.fat, favorite: false) {
            // Ô cố định dù có nút hay không — cột kcal không xô lệch.
            Group {
              if !saved.contains(r.name.lowercased()) {
                Button { Task { await saveRecent(r) } } label: {
                  Image(systemName: "plus")
                    .font(.body.weight(.bold))
                    .foregroundStyle(DS.Color.primary.swiftUI)
                    .frame(width: 44, height: 44)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .disabled(book.busy)
                .accessibilityLabel(Text(String(localized: "foods.a11y.save \(r.name)")))
              } else {
                Color.clear
              }
            }
            .frame(width: 44, height: 44)
          }
        }
      }
    }
  }

  private var empty: some View {
    Text(verbatim: emptyText)
      .font(DS.TextStyle.footnote)
      .foregroundStyle(DS.Color.mutedForeground.swiftUI)
      .frame(maxWidth: .infinity)
      .padding(.vertical, DS.Spacing.lg)
  }

  private func row<Trailing: View>(
    name: String, brand: String?, kcal: Double, p: Double, c: Double, fat: Double, favorite: Bool,
    @ViewBuilder trailing: () -> Trailing
  ) -> some View {
    HStack(spacing: DS.Spacing.sm) {
      VStack(alignment: .leading, spacing: 2) {
        HStack(spacing: 4) {
          if favorite {
            Image(systemName: "star.fill")
              .font(.caption)
              .foregroundStyle(DS.Color.primary.swiftUI)
              .accessibilityLabel(Text(String(localized: "logMeal.a11y.favorite")))
          }
          Text(verbatim: name).font(DS.TextStyle.body).lineLimit(1)
        }
        let sub = DiaryView.macros(p, c, fat)
        Text(verbatim: (brand?.isEmpty == false ? "\(brand!) · " : "") + sub)
          .font(DS.TextStyle.caption.monospacedDigit())
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)
          .lineLimit(1)
      }
      Spacer(minLength: 0)
      Text(verbatim: "\(DiaryView.whole(kcal)) kcal")
        .font(DS.TextStyle.footnote.monospacedDigit())
      trailing()
    }
    .padding(.horizontal, DS.Spacing.md)
    .frame(minHeight: 52)
    .background(DS.Color.card.swiftUI, in: RoundedRectangle(cornerRadius: DS.Radius.md))
    .accessibilityElement(children: .combine)
  }

  private func saveRecent(_ r: MealLog.Food) async {
    switch await book.save(recent: r, online: services.sync.online) {
    case .done:
      AccessibilityNotification.Announcement(String(localized: "foods.added")).post()
    case .onlineOnly: show(String(localized: "foods.error.onlineOnly"))
    case .invalid: break
    case .nothingWritten, .failed: show(String(localized: "async.error.generic"))
    }
  }

  private func show(_ text: String) {
    message = text
    AccessibilityNotification.Announcement(text).post()
  }
}

/// Form thêm / sửa một thực phẩm (`app/food-editor.tsx`).
struct FoodEditorView: View {
  let book: FoodLibraryBook
  let food: FoodLibrary.Food?
  @Environment(AppServices.self) private var services
  @Environment(\.dismiss) private var dismiss
  @State private var form: FoodLibrary.Form
  @State private var confirmDelete = false
  @State private var message: String?

  init(book: FoodLibraryBook, food: FoodLibrary.Food?) {
    self.book = book
    self.food = food
    _form = State(initialValue: food.map { FoodLibrary.Form($0) } ?? FoodLibrary.Form())
  }

  var body: some View {
    NavigationStack {
      ScrollView {
        VStack(alignment: .leading, spacing: DS.Spacing.md) {
          field(String(localized: "foods.name"), $form.name, prompt: String(localized: "foods.name.placeholder"))
          field(String(localized: "foods.brand"), $form.brand, prompt: String(localized: "foods.brand.placeholder"))
          number(String(localized: "foods.serving"), $form.serving, unit: "g", bounds: nil)
          DSCard {
            VStack(alignment: .leading, spacing: DS.Spacing.sm) {
              HStack(alignment: .bottom, spacing: DS.Spacing.sm) {
                number(String(localized: "foods.calories"), $form.kcal, unit: "kcal", bounds: MealLog.kcalBounds)
                Button {
                  form.kcal = String(Int(form.calcKcal))
                } label: {
                  Text(String(localized: "foods.autoCalc \(DiaryView.whole(form.calcKcal))"))
                    .font(DS.TextStyle.footnote.weight(.semibold))
                    .padding(.horizontal, DS.Spacing.sm)
                    .frame(minHeight: 44)
                    .background(DS.Color.muted.swiftUI, in: RoundedRectangle(cornerRadius: DS.Radius.sm))
                }
                .buttonStyle(.plain)
              }
              let pct = form.macroPercents
              number(String(localized: "logMeal.protein") + " · \(DiaryView.whole(pct.protein))%", $form.protein, unit: "g", bounds: MealLog.macroBounds)
              number(String(localized: "logMeal.carbs") + " · \(DiaryView.whole(pct.carbs))%", $form.carbs, unit: "g", bounds: MealLog.macroBounds)
              number(String(localized: "logMeal.fat") + " · \(DiaryView.whole(pct.fat))%", $form.fat, unit: "g", bounds: MealLog.macroBounds)
              number(String(localized: "foods.fiber"), $form.fiber, unit: "g", bounds: MealLog.macroBounds)
            }
          }
          if form.hasFieldErrors {
            Text(String(localized: "foods.outOfRange"))
              .font(DS.TextStyle.footnote)
              .foregroundStyle(DS.Color.destructive.swiftUI)
          }
          HStack(spacing: DS.Spacing.sm) {
            if food != nil {
              Button(role: .destructive) { confirmDelete = true } label: {
                Text(String(localized: "foods.delete"))
                  .font(DS.TextStyle.footnote.weight(.semibold))
                  .frame(maxWidth: .infinity, minHeight: 44)
              }
              .buttonStyle(.plain)
              .foregroundStyle(DS.Color.destructive.swiftUI)
              .disabled(book.busy)
            }
            DSButton(String(localized: "common.save")) { Task { await save() } }
              .disabled(!form.canSave || book.busy)
              .opacity(form.canSave && !book.busy ? 1 : 0.5)
          }
        }
        .padding(DS.Spacing.md)
      }
      .navigationTitle(food == nil ? String(localized: "foods.addTitle") : String(localized: "foods.editTitle"))
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button(String(localized: "common.cancel")) { dismiss() }
        }
      }
      .confirmationDialog(
        String(localized: "foods.delete.confirm \(form.name.trimmingCharacters(in: .whitespaces).isEmpty ? (food?.name ?? "") : form.name)"),
        isPresented: $confirmDelete, titleVisibility: .visible
      ) {
        Button(String(localized: "foods.delete"), role: .destructive) { Task { await delete() } }
        Button(String(localized: "common.cancel"), role: .cancel) {}
      }
      .alert(message ?? "", isPresented: Binding(get: { message != nil }, set: { if !$0 { message = nil } })) {
        Button(String(localized: "common.cancel"), role: .cancel) {}
      }
    }
  }

  private func field(_ label: String, _ text: Binding<String>, prompt: String) -> some View {
    VStack(alignment: .leading, spacing: 4) {
      Text(verbatim: label)
        .font(DS.TextStyle.caption)
        .foregroundStyle(DS.Color.mutedForeground.swiftUI)
        .accessibilityHidden(true)
      TextField(text: text, prompt: Text(verbatim: prompt)) { Text(verbatim: label) }
        .padding(DS.Spacing.sm)
        .frame(minHeight: 44)
        .background(DS.Color.input.swiftUI, in: RoundedRectangle(cornerRadius: DS.Radius.sm))
    }
  }

  /// Ô số: chỉ nhận chữ số (`digits`), tô đỏ khi ngoài dải.
  private func number(_ label: String, _ text: Binding<String>, unit: String, bounds: ClosedRange<Double>?) -> some View {
    let bad = bounds.map { MealLog.field(text.wrappedValue, $0) == .bad } ?? false
    let filtered = Binding(get: { text.wrappedValue }, set: { text.wrappedValue = FoodLibrary.digits($0) })
    return VStack(alignment: .leading, spacing: 4) {
      Text(verbatim: label)
        .font(DS.TextStyle.caption)
        .foregroundStyle(DS.Color.mutedForeground.swiftUI)
        .accessibilityHidden(true)
      HStack {
        TextField(text: filtered, prompt: Text(verbatim: "0")) { Text(verbatim: label) }
          .keyboardType(.numberPad)
        Text(verbatim: unit)
          .font(DS.TextStyle.caption)
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)
          .accessibilityHidden(true)
      }
      .padding(DS.Spacing.sm)
      .frame(minHeight: 44)
      .background(DS.Color.input.swiftUI, in: RoundedRectangle(cornerRadius: DS.Radius.sm))
      .overlay(
        RoundedRectangle(cornerRadius: DS.Radius.sm)
          .stroke(bad ? DS.Color.destructive.swiftUI : .clear, lineWidth: 1.5))
    }
  }

  private func save() async {
    let online = services.sync.online
    let outcome: FoodLibraryBook.WriteOutcome
    if let food {
      outcome = await book.update(id: food.id, form, online: online)
    } else {
      outcome = await book.create(form, online: online)
    }
    finish(outcome, done: food == nil ? String(localized: "foods.added") : String(localized: "foods.updated"))
  }

  private func delete() async {
    guard let food else { return }
    finish(await book.delete(id: food.id, online: services.sync.online), done: String(localized: "foods.deleted"))
  }

  private func finish(_ outcome: FoodLibraryBook.WriteOutcome, done: String) {
    let text: String
    switch outcome {
    case .done:
      AccessibilityNotification.Announcement(done).post()
      dismiss()
      return
    case .invalid: return
    case .onlineOnly: text = String(localized: "foods.error.onlineOnly")
    case .nothingWritten: text = String(localized: "foods.error.nothingWritten")
    case .failed: text = String(localized: "async.error.generic")
    }
    message = text
    AccessibilityNotification.Announcement(text).post()
  }
}
