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
/// - ngôi sao trên món của tôi (#527 N2) qua lớp Trạng thái #161.
struct FoodListView: View {
  let book: FoodLibraryBook
  @Environment(AppServices.self) private var services
  @State private var segment: Segment
  @State private var query = ""
  @State private var editing: EditorRequest?
  @State private var message: String?
  /// Lời báo chung của lớp Trạng thái không mang khoá — chỉ màn đang hiện nói.
  @State private var visible = false

  enum Segment: Hashable { case mine, recent }

  /// - Parameter segment: đoạn mở đầu — "Xem thêm" dưới "Gần đây" của tab Dinh
  ///   dưỡng mở thẳng "Gần đây" (`food-list?tab=recent`).
  init(book: FoodLibraryBook, segment: Segment = .mine) {
    self.book = book
    _segment = State(initialValue: segment)
  }

  /// Mở form: `food == nil` là thêm mới.
  struct EditorRequest: Identifiable {
    let id = UUID()
    let food: FoodLibrary.Food?
  }

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: DS.Spacing.md) {
        // Ô lọc + nút thêm gộp một viên (thiết kế lại 13/10), như ô ghi bữa.
        HStack(spacing: 10) {
          Image(systemName: "magnifyingglass")
            .font(.system(size: 16, weight: .semibold))
            .foregroundStyle(MascotRoomView.signalColor(.meal))
            .accessibilityHidden(true)
          TextField(text: $query, prompt: Text(String(localized: "foods.filter"))) {
            Text(String(localized: "foods.filter"))
          }
          .autocorrectionDisabled()
          if segment == .mine {
            Divider().frame(height: 24).opacity(0.6)
            Button { editing = EditorRequest(food: nil) } label: {
              Image(systemName: "plus")
                .font(.system(size: 17, weight: .semibold))
                .foregroundStyle(DS.Color.foreground.swiftUI)
                .frame(width: 48, height: 52)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel(Text(String(localized: "foods.add")))
          }
        }
        .padding(.leading, 18)
        .padding(.trailing, segment == .mine ? 4 : 18)
        .frame(minHeight: 52)
        .background(Capsule().fill(.regularMaterial))
        .overlay(Capsule().strokeBorder(MascotRoomView.signalColor(.meal).opacity(0.55), lineWidth: 1.5))
        Picker(selection: $segment) {
          Text(verbatim: "\(String(localized: "foods.mine")) \(book.mine.count)").tag(Segment.mine)
          Text(verbatim: "\(String(localized: "foods.recent")) \(book.recents.count)").tag(Segment.recent)
        } label: {
          Text(String(localized: "foods.title"))
        }
        .pickerStyle(.segmented)
        content
      }
      .padding(DS.Spacing.md)
    }
    .ascndPage()
    .navigationTitle(String(localized: "foods.title"))
    .navigationBarTitleDisplayMode(.inline)
    .refreshable { await book.load() }
    .task { await book.load() }
    .sheet(item: $editing) { req in
      FoodEditorView(book: book, food: req.food)
    }
    .onAppear { visible = true }
    .onDisappear { visible = false }
    .onChange(of: services.stateWriter.notice) { _, notice in
      guard visible, let notice else { return }
      message = notice == .gone ? String(localized: "state.gone") : String(localized: "async.error.generic")
      services.stateWriter.clearNotice()
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
      listCard {
        ForEach(Array(shown.enumerated()), id: \.element.id) { i, f in
          if i > 0 { Divider().padding(.leading, DS.Spacing.md).opacity(0.6) }
          if book.canFavorite {
            let writer = services.stateWriter
            StarredFoodRow(
              on: book.shownFavorite(f, writer: writer), pending: book.favoritePending(f, writer: writer),
              toggle: { star(f) }
            ) { mineRow(f, chrome: false) }
          } else {
            mineRow(f, chrome: false)
          }
        }
      }
    }
  }

  private func mineRow(_ f: FoodLibrary.Food, chrome: Bool) -> some View {
    Button { editing = EditorRequest(food: f) } label: {
      FoodRow(
        name: f.name, brand: f.brand, kcal: f.kcal, p: f.protein, c: f.carbs, fat: f.fat, favorite: f.isFavorite,
        chrome: chrome
      ) {
        if !book.canFavorite {
          Image(systemName: "chevron.right")
            .foregroundStyle(DS.Color.mutedForeground.swiftUI)
            .accessibilityHidden(true)
        }
      }
    }
    .buttonStyle(.plain)
    .accessibilityHint(Text(String(localized: "foods.a11y.edit")))
  }

  private func star(_ f: FoodLibrary.Food) {
    let writer = services.stateWriter
    let wasEmpty = writer.size == 0
    let outcome = book.setFavorite(f, value: !book.shownFavorite(f, writer: writer), writer: writer)
    if outcome == .queued, !services.sync.online, wasEmpty { message = String(localized: "state.queued") }
  }

  @ViewBuilder private var recentList: some View {
    let shown = FoodLibrary.filter(book.recents, query)
    let saved = FoodLibrary.savedNames(book.mine)
    if shown.isEmpty {
      empty
    } else {
      listCard {
        ForEach(Array(shown.enumerated()), id: \.element.id) { i, r in
          if i > 0 { Divider().padding(.leading, DS.Spacing.md).opacity(0.6) }
          FoodRow(
            name: r.name, brand: nil, kcal: r.kcal, p: r.protein, c: r.carbs, fat: r.fat, favorite: false, chrome: false
          ) {
            // Ô cố định dù có nút hay không — cột kcal không xô lệch.
            Group {
              if !saved.contains(r.name.lowercased()) {
                Button { Task { await saveRecent(r) } } label: {
                  Image(systemName: "plus.circle")
                    .font(.title3)
                    .foregroundStyle(MascotRoomView.signalColor(.meal))
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

  /// Thẻ danh sách chung (cùng kiểu thẻ với tab Dinh dưỡng).
  private func listCard<Content: View>(@ViewBuilder _ content: () -> Content) -> some View {
    VStack(spacing: 0) { content() }
      .clipShape(RoundedRectangle(cornerRadius: DS.Radius.xl, style: .continuous))
      .todayCard(radius: DS.Radius.xl)
  }

  private var empty: some View {
    Text(verbatim: emptyText)
      .font(DS.TextStyle.footnote)
      .foregroundStyle(DS.Color.mutedForeground.swiftUI)
      .frame(maxWidth: .infinity)
      .padding(.vertical, DS.Spacing.lg)
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
      .ascndPage()
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

/// Một món trong danh sách: tên (sao khi yêu thích), thương hiệu · P/C/F, kcal,
/// ô bên phải tuỳ chỗ dùng. Dùng ở màn Thực phẩm và khối Thực phẩm của tab.
struct FoodRow<Trailing: View>: View {
  let name: String
  let brand: String?
  let kcal: Double
  let p: Double
  let c: Double
  let fat: Double
  let favorite: Bool
  /// `false`: không nền / đệm phải — hàng nằm trong `StarredFoodRow`.
  var chrome = true
  @ViewBuilder let trailing: () -> Trailing

  var body: some View {
    HStack(spacing: DS.Spacing.sm) {
      VStack(alignment: .leading, spacing: 2) {
        HStack(spacing: 4) {
          if favorite, chrome {
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
      Text(verbatim: DiaryView.whole(kcal))
        .font(.custom("Menlo", size: 14, relativeTo: .body))
        .accessibilityLabel(Text(verbatim: "\(DiaryView.whole(kcal)) kcal"))
      trailing()
    }
    .padding(.leading, DS.Spacing.md)
    .padding(.trailing, chrome ? DS.Spacing.md : 0)
    .frame(minHeight: 56)
    .contentShape(Rectangle())
    .background(chrome ? DS.Color.card.swiftUI : .clear, in: RoundedRectangle(cornerRadius: DS.Radius.md))
    .accessibilityElement(children: .combine)
  }
}

/// Hàng món CÓ ngôi sao (`FoodCard` của RN, #527 N2): thân hàng và ngôi sao là
/// HAI nút cạnh nhau — VoiceOver thấy cả "mở món" lẫn "Yêu thích".
struct StarredFoodRow<Content: View>: View {
  let on: Bool
  let pending: Bool
  let toggle: () -> Void
  @ViewBuilder let content: () -> Content

  var body: some View {
    HStack(spacing: 0) {
      content()
      Button(action: toggle) {
        Image(systemName: on ? "star.fill" : "star")
          .font(.system(size: 17, weight: on ? .semibold : .regular))
          .foregroundStyle(on ? DS.Color.metricOrange.swiftUI : DS.Color.mutedForeground.swiftUI)
          .overlay(alignment: .topTrailing) {
            if pending {
              Circle().fill(DS.Color.mutedForeground.swiftUI).frame(width: 6, height: 6).offset(x: 4, y: -2)
            }
          }
          .frame(width: 44, height: 52)
          .contentShape(Rectangle())
      }
      .buttonStyle(.plain)
      .sensoryFeedback(.selection, trigger: on)
      .accessibilityLabel(Text(verbatim: [String(localized: "logMeal.a11y.favorite"), pending ? String(localized: "state.pending") : nil]
        .compactMap { $0 }.joined(separator: ", ")))
      .accessibilityAddTraits(on ? [.isButton, .isSelected] : .isButton)
    }
    .padding(.trailing, 4)
  }
}
