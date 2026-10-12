import ASCNDCore
import ASCNDDesignSystem
import SwiftUI

/// Khối "Thực phẩm" của phân đoạn Hôm nay trên tab Dinh dưỡng (#527) —
/// `(tabs)/nutrition.tsx:750-880` @ fac9ac2 trên `FoodLibraryBook` +
/// `FoodSearchBook`.
///
/// RN behavior (giữ nguyên):
/// - MỘT thẻ cho cả khu: tiêu đề "Thực phẩm" với "+ Thêm thực phẩm" trên hàng
///   tiêu đề (tạo món là việc vài tuần một lần, tìm là việc mỗi lần mở);
/// - ô tìm: từ 2 ký tự thì danh sách kết quả thay chỗ hai danh sách bên dưới;
/// - "Thực phẩm của tôi": một danh sách, yêu thích trước, 5 món + "Xem thêm N
///   món" → màn Thực phẩm đoạn Của tôi; rỗng → "bấm Thêm để tạo";
/// - "Gần đây" (món ĐÃ GHI, không phải đã lưu): 4 món, "+" giữ lại món chưa có
///   trong thư viện, "Xem thêm" → đúng đoạn Gần đây.
///
/// Khác RN:
/// - chỉ món CỦA MÌNH chạm được để sửa — RN mở trình sửa cả cho món mẫu chung,
///   thứ người dùng không lưu được;
/// - tìm không ra nói "Không tìm thấy thực phẩm" (RN dùng nhầm câu "Không tìm
///   thấy bài tập"); tìm hỏng nói ra thay vì không hiện gì;
/// - chưa có nút quét mã vạch trong ô tìm (`scan-barcode` chưa port).
///
/// Ngôi sao (#527 N2, `FoodCard` của RN): trên mọi hàng món — của tôi lẫn kết
/// quả tìm (món mẫu chung: yêu thích là chép vào thư viện, xem `FoodFavorite`).
struct FoodsSection: View {
  let userId: String
  let library: FoodLibraryBook
  let search: FoodSearchBook
  @Environment(AppServices.self) private var services
  @State private var query = ""
  @State private var editing: FoodListView.EditorRequest?
  @State private var message: String?
  /// Lời báo chung của lớp Trạng thái không mang khoá — chỉ màn đang hiện nói.
  @State private var visible = false

  static let mineShown = 5
  static let recentShown = 4

  var body: some View {
    VStack(alignment: .leading, spacing: DS.Spacing.sm) {
      HStack(alignment: .firstTextBaseline) {
        Text(String(localized: "foods.title"))
          .font(DS.TextStyle.headline)
          .accessibilityAddTraits(.isHeader)
        Spacer()
        Button { editing = FoodListView.EditorRequest(food: nil) } label: {
          Label(String(localized: "foods.add"), systemImage: "plus")
            .font(DS.TextStyle.footnote.weight(.semibold))
            .foregroundStyle(DS.Color.primary.swiftUI)
            .frame(minHeight: 44)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
      }
      HStack {
        Image(systemName: "magnifyingglass")
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)
          .accessibilityHidden(true)
        TextField(text: $query, prompt: Text(String(localized: "nc.searchFood"))) {
          Text(String(localized: "nc.searchFood"))
        }
        .autocorrectionDisabled()
        .submitLabel(.search)
      }
      .padding(DS.Spacing.sm)
      .frame(minHeight: 44)
      .background(DS.Color.foreground.swiftUI.opacity(0.05), in: RoundedRectangle(cornerRadius: DS.Radius.sm, style: .continuous))
      if search.phase == .idle {
        lists
      } else {
        results
      }
      if let message {
        Text(verbatim: message)
          .font(DS.TextStyle.footnote)
          .foregroundStyle(DS.Color.destructive.swiftUI)
      }
    }
    .padding(DS.Spacing.md)
    .todayCard(radius: DS.Radius.lg)
    .onAppear { visible = true }
    .onDisappear { visible = false }
    .onChange(of: services.stateWriter.notice) { _, notice in
      guard visible, let notice else { return }
      say(notice == .gone ? String(localized: "state.gone") : String(localized: "async.error.generic"))
      services.stateWriter.clearNotice()
    }
    // Trễ 250 ms sau phím cuối; đổi chữ huỷ lượt chờ trước. Thư viện đọc lại
    // (vd. sau ngôi sao) thì kết quả tìm đọc lại theo.
    .task(id: SearchKey(query: query, revision: library.revision)) {
      if !query.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
        try? await Task.sleep(for: FoodSearch.debounce)
        if Task.isCancelled { return }
      }
      await search.search(query)
    }
    .sheet(item: $editing) { req in
      FoodEditorView(book: library, food: req.food)
    }
  }

  // MARK: - Kết quả tìm

  @ViewBuilder private var results: some View {
    switch search.phase {
    case .idle, .searching:
      ProgressView().frame(maxWidth: .infinity, minHeight: 44)
    case .failed:
      note(String(localized: "async.error.generic"))
    case .results(let foods) where foods.isEmpty:
      note(String(localized: "nc.noFoods"))
    case .results(let foods):
      VStack(spacing: DS.Spacing.xs) {
        ForEach(foods) { f in food(f) }
      }
    }
  }

  private struct SearchKey: Hashable {
    let query: String
    let revision: Int
  }

  /// Hàng món: ngôi sao khi sổ có nguồn ghi, không thì sao tĩnh như trước.
  @ViewBuilder private func food(_ f: FoodLibrary.Food) -> some View {
    if library.canFavorite {
      let writer = services.stateWriter
      StarredFoodRow(
        on: library.shownFavorite(f, writer: writer), pending: library.favoritePending(f, writer: writer),
        toggle: { star(f) }
      ) { foodBody(f, chrome: false) }
    } else {
      foodBody(f, chrome: true)
    }
  }

  private func star(_ f: FoodLibrary.Food) {
    let writer = services.stateWriter
    let wasEmpty = writer.size == 0
    let outcome = library.setFavorite(f, value: !library.shownFavorite(f, writer: writer), writer: writer)
    if outcome == .queued, !services.sync.online, wasEmpty { say(String(localized: "state.queued")) }
  }

  /// Món của mình chạm để sửa; món mẫu chung chỉ để xem.
  @ViewBuilder private func foodBody(_ f: FoodLibrary.Food, chrome: Bool) -> some View {
    let mine = f.userId == userId
    let row = FoodRow(
      name: f.name, brand: f.brand, kcal: f.kcal, p: f.protein, c: f.carbs, fat: f.fat, favorite: f.isFavorite,
      chrome: chrome
    ) {
      // Có ngôi sao thì cột phải là sao (như `FoodCard`), không thêm mũi tên.
      if mine, chrome {
        Image(systemName: "chevron.right")
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)
          .accessibilityHidden(true)
      }
    }
    if mine {
      Button { editing = FoodListView.EditorRequest(food: f) } label: { row }
        .buttonStyle(.plain)
        .accessibilityHint(Text(String(localized: "foods.a11y.edit")))
    } else {
      row
    }
  }

  // MARK: - Của tôi / Gần đây

  @ViewBuilder private var lists: some View {
    switch library.phase {
    case .loading:
      ProgressView().frame(maxWidth: .infinity, minHeight: 44)
    case .failed:
      HStack {
        note(String(localized: "async.error.generic"))
        Spacer()
        Button(String(localized: "nc.retry")) { Task { await library.load() } }
          .font(DS.TextStyle.footnote.weight(.semibold))
          .frame(minHeight: 44)
      }
    case .ready:
      let mine = library.mine
      label(String(localized: "foods.mine"))
      if mine.isEmpty {
        note(String(localized: "nc.foods.empty"))
      } else {
        VStack(spacing: DS.Spacing.xs) {
          ForEach(mine.prefix(Self.mineShown)) { f in food(f) }
        }
        if mine.count > Self.mineShown {
          seeMore(mine.count - Self.mineShown, recent: false)
        }
      }
      let recents = library.recents
      if !recents.isEmpty {
        let saved = FoodLibrary.savedNames(mine)
        label(String(localized: "foods.recent")).padding(.top, DS.Spacing.xs)
        VStack(spacing: DS.Spacing.xs) {
          ForEach(recents.prefix(Self.recentShown)) { r in
            FoodRow(name: r.name, brand: nil, kcal: r.kcal, p: r.protein, c: r.carbs, fat: r.fat, favorite: false) {
              Group {
                if !saved.contains(r.name.lowercased()) {
                  Button { Task { await keep(r) } } label: {
                    Image(systemName: "plus")
                      .font(.body.weight(.bold))
                      .foregroundStyle(DS.Color.primary.swiftUI)
                      .frame(width: 44, height: 44)
                      .contentShape(Rectangle())
                  }
                  .buttonStyle(.plain)
                  .disabled(library.busy)
                  .accessibilityLabel(Text(String(localized: "foods.a11y.save \(r.name)")))
                } else {
                  Color.clear
                }
              }
              .frame(width: 44, height: 44)
            }
          }
        }
        if recents.count > Self.recentShown {
          seeMore(recents.count - Self.recentShown, recent: true)
        }
      }
    }
  }

  private func label(_ text: String) -> some View {
    Text(verbatim: text)
      .font(DS.TextStyle.caption.weight(.semibold))
      .textCase(.uppercase)
      .foregroundStyle(DS.Color.mutedForeground.swiftUI)
  }

  private func note(_ text: String) -> some View {
    Text(verbatim: text)
      .font(DS.TextStyle.footnote)
      .foregroundStyle(DS.Color.mutedForeground.swiftUI)
      .frame(maxWidth: .infinity, alignment: .leading)
      .padding(.vertical, DS.Spacing.xs)
  }

  /// "Xem thêm N món" → đúng đoạn nó nằm dưới.
  private func seeMore(_ rest: Int, recent: Bool) -> some View {
    NavigationLink(value: FoodsRoute(userId: userId, recent: recent)) {
      HStack(spacing: 2) {
        Text(String(localized: "nc.seeMore \(rest)"))
        Image(systemName: "chevron.right").font(.caption).accessibilityHidden(true)
      }
      .font(DS.TextStyle.footnote.weight(.semibold))
      .foregroundStyle(DS.Color.primary.swiftUI)
      .frame(minHeight: 44)
      .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
  }

  private func keep(_ r: MealLog.Food) async {
    message = nil
    switch await library.save(recent: r, online: services.sync.online) {
    case .done:
      AccessibilityNotification.Announcement(String(localized: "foods.added")).post()
    case .onlineOnly: say(String(localized: "foods.error.onlineOnly"))
    case .invalid: break
    case .nothingWritten, .failed: say(String(localized: "async.error.generic"))
    }
  }

  private func say(_ text: String) {
    message = text
    AccessibilityNotification.Announcement(text).post()
  }
}
