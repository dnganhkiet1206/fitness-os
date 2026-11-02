import ASCNDCore
import ASCNDDesignSystem
import SwiftUI

/// Tủ đồ của Koa (#527) trên `MascotShopBook` — thiết kế lại 29/10 (Kiệt duyệt mock
/// "Phòng của Koa", phần 1).
///
/// - Sân khấu GHIM ở trên, lưới đồ cuộn bên dưới: đổi món nào cũng thấy trên Koa
///   (bản cũ: chọn đồ là Koa cuộn mất khỏi màn).
/// - Hai tab thay bốn: Trang phục (7 ô của bộ vẽ) và Đồ phòng — chủ đề phòng (sân khấu
///   cũ) + 6 chỗ đổi được (phần 3, 29/10); xem trước trên chính căn phòng của Koa, máy
///   quay trượt tới chỗ đang chọn. "Tủ đồ"
///   cũ thành bộ lọc "Của tôi".
/// - Thẻ có hình (Koa mặc đúng món ấy, cắt theo ô) thay danh sách chữ.
/// - Thử nhiều món một lúc (mỗi ô một món), rồi một nút: Mặc (đồ đã có) hay Mua · tổng
///   (bảng xác nhận, mua lần lượt, hỏng thì dừng và nói rõ — server định giá, trừ xu).
struct ShopView: View {
  let book: MascotShopBook
  let lang: AppPreferences.Lang
  /// Sổ xu đổi (mua / nhận thưởng) — phòng linh vật đọc lại.
  var onWalletChange: () -> Void = {}

  enum Tab: Hashable { case outfits, room }
  enum Filter: Hashable { case all, mine, buyable }

  @State private var tab: Tab = .outfits
  @State private var slot: KoaFlags.Slot?
  /// Chỗ đang chọn ở tab Đồ phòng: `theme` (chủ đề) hay một chỗ của `StudioScene.decorSpots`.
  @State private var spot = "theme"
  @State private var filter: Filter = .all
  /// Đang thử: nhóm mặc (`MascotShop.wearGroup`) → món, `nil` = cởi món đang mặc ở nhóm ấy.
  @State private var trying: [String: String?] = [:]
  /// Bộ đếm lượt mặc thử — Koa cúi nhìn đồ mỗi lần một món lên người.
  @State private var wearTick = 0
  @State private var dressing = false
  @State private var notice: Notice?
  @State private var collectionsOpen = false
  @State private var confirming = false
  @State private var applying = false
  @State private var bought = 0
  /// Đã cuộn lưới: tiêu đề + số xu lên hàng nút back, sân khấu giữ nguyên (Kiệt 29/10:
  /// "thay vì crop phòng thay đồ… đẩy chữ và xu lên cùng vị trí với nút back").
  @State private var compact = false
  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  /// `DRESS_HOLD` = 4,2 giây.
  private static let dressHold = Duration.milliseconds(4200)
  static let stageHeight: CGFloat = 260

  struct Notice: Equatable {
    let text: String
    let good: Bool
  }

  var body: some View {
    VStack(spacing: 0) {
      VStack(spacing: DS.Spacing.sm) {
        if !compact { header.transition(.move(edge: .top).combined(with: .opacity)) }
        if case .ready = book.phase {
          stage
          // dưới sân khấu, không đè lên Koa
          if !changes.isEmpty { tryBar.transition(.move(edge: .top).combined(with: .opacity)) }
        }
      }
      .padding(.horizontal, DS.Spacing.md)
      .padding(.bottom, DS.Spacing.sm)
      ScrollView {
        VStack(alignment: .leading, spacing: DS.Spacing.md) {
          switch book.phase {
          case .loading:
            ProgressView().frame(maxWidth: .infinity).padding(.vertical, DS.Spacing.xl)
          case .failed:
            Text("shop.loadfailed")
              .font(DS.TextStyle.body)
              .foregroundStyle(DS.Color.mutedForeground.swiftUI)
          case .ready:
            shelf
          }
        }
        .padding(.horizontal, DS.Spacing.md)
        // thanh Ghi nhanh + thanh tab nổi trên trang
        .padding(.bottom, 150)
      }
      .refreshable { await book.load() }
      .onScrollGeometryChange(for: CGFloat.self) { $0.contentOffset.y + $0.contentInsets.top } action: { _, y in
        // trễ hai ngưỡng: tiêu đề rời đi làm khung cuộn cao thêm, không nhảy qua lại
        let next = compact ? y > 4 : y > 24
        if next != compact { withAnimation(reduceMotion ? nil : .snappy) { compact = next } }
      }
    }
    .background { TodayAmbient(accent: nil) }
    .navigationTitle(Text(verbatim: ""))
    .navigationBarTitleDisplayMode(.inline)
    .toolbar {
      if compact {
        ToolbarItem(placement: .principal) {
          Text("shop.title")
            .font(DS.TextStyle.headline)
            .foregroundStyle(DS.Color.foreground.swiftUI)
        }
        ToolbarItem(placement: .topBarTrailing) { coins }
      }
    }
    .task { if case .loading = book.phase { await book.load() } }
    .sensoryFeedback(.success, trigger: bought)
    .sheet(isPresented: $collectionsOpen) { collections }
    .sheet(isPresented: $confirming) { confirmSheet }
  }

  private var header: some View {
    HStack(alignment: .center) {
      Text("shop.title")
        .font(.title2.bold())
        .foregroundStyle(DS.Color.foreground.swiftUI)
        .accessibilityAddTraits(.isHeader)
      Spacer(minLength: DS.Spacing.sm)
      coins
        .padding(.horizontal, 14)
        .frame(height: 40)
        .dsCard(radius: 20)
    }
  }

  private var coins: some View {
    Label {
      Text(verbatim: book.balance.formatted(.number.locale(.app)))
    } icon: {
      Image(systemName: "circle.circle.fill").foregroundStyle(DS.Color.readinessYellowGraphic.swiftUI)
    }
    .labelStyle(.titleAndIcon)
    .font(DS.TextStyle.footnote.weight(.semibold).monospacedDigit())
    .foregroundStyle(DS.Color.foreground.swiftUI)
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(Text("shop.balance \(book.balance.formatted(.number.locale(.app)))"))
  }

  // MARK: - Sân khấu

  /// Đồ trên người Koa: đang mặc, rồi các món đang thử đè lên từng nhóm.
  private var worn: [String] {
    var on = book.inventory.filter(\.equipped).map(\.itemKey)
    for (group, key) in trying where group != "stage" {
      on.removeAll { MascotShop.wearGroup($0) == group }
      if let key { on.append(key) }
    }
    return on
  }

  private var roomSkin: String {
    if let tried = trying["stage"] {
      return tried.map { StudioScene.skinKey(stage: $0) } ?? "default"
    }
    return StudioScene.skinKey(equipped: book.equipped)
  }

  @ViewBuilder private var stage: some View {
    if tab == .room {
      roomPreview
    } else {
      outfitStage
    }
  }

  private var outfitStage: some View {
    ShopSceneView(shot: .stage, equipped: worn, skin: roomSkin, dress: dressing, height: Self.stageHeight)
    .task(id: wearTick) {
      guard wearTick > 0 else { return }
      dressing = true
      try? await Task.sleep(for: Self.dressHold)
      if !Task.isCancelled { dressing = false }
    }
  }

  /// Đồ đang dùng + đang thử, kể cả chủ đề phòng (nhóm `stage`).
  private var wornWithTheme: [String] {
    var on = worn.filter { MascotShop.item($0)?.kind != .stage }
    if let tried = trying["stage"] {
      if let tried { on.append(tried) }
    } else if let current = MascotShop.activeStageKey(book.equipped) {
      on.append(current)
    }
    return on
  }

  /// Căn phòng thật của Koa với đồ đang thử, phủ kín bề ngang khung (Kiệt 29/10: bản
  /// thu theo chiều cao thành một dải hẹp giữa hai mép mờ "nhìn kỳ"). Khung chỉ cao 260
  /// nên máy quay trượt dọc tới chỗ đang chọn (kệ / đèn / bục có viền vàng). Chạm vào đồ vật
  /// trong phòng để chọn chỗ của nó.
  private var roomPreview: some View {
    let eq = wornWithTheme
    return GeometryReader { g in
      let k = g.size.width / StudioScene.width
      let top = Self.roomTop(spot: spot, visible: g.size.height / k)
      ZStack(alignment: .topLeading) {
        MascotStage(level: 1, build: book.gains.rank, energy: 0.8, celebrateSignal: 0, equipped: eq)
          .frame(width: g.size.width, height: StudioScene.sceneBottom * k)
        // khung vàng chỉ ở kệ / đèn / bục — cây, bảng số, cửa sổ đã có khung riêng (Kiệt 29/10)
        if !Self.unframed.contains(spot), let r = RoomThumb.outlines[spot] {
          RoundedRectangle(cornerRadius: 10 * k, style: .continuous)
            .strokeBorder(Color(hex: "#FFC24D").opacity(0.85), lineWidth: 2)
            .frame(width: r.width * k, height: r.height * k)
            .offset(x: r.minX * k, y: r.minY * k)
            .allowsHitTesting(false)
            .accessibilityHidden(true)
        }
        ForEach(StudioScene.decorSpots, id: \.self) { s in
          if let r = RoomThumb.outlines[s] { spotHit(s, r, k: k) }
        }
      }
      .offset(y: -top * k)
      .animation(reduceMotion ? nil : .smooth(duration: 0.45), value: spot)
    }
    .frame(height: Self.stageHeight)
    .clipShape(RoundedRectangle(cornerRadius: 28, style: .continuous))
    .overlay {
      RoundedRectangle(cornerRadius: 28, style: .continuous)
        .strokeBorder(DS.Color.foreground.swiftUI.opacity(0.08), lineWidth: 0.75)
    }
  }

  /// Chỗ không vẽ khung vàng khi chọn (Kiệt 29/10: bỏ khung ở cây, bảng số, cửa sổ).
  static let unframed: Set<String> = ["plants", "board", "window"]

  /// Đỉnh của khung nhìn (toạ độ phòng): giữa chỗ đang chọn, kẹp trong phòng. Chủ đề
  /// nhìn phần dưới — Koa, bục, kệ và bảng, nơi màu phòng đổi rõ nhất.
  static func roomTop(spot: String, visible: CGFloat) -> CGFloat {
    let bottom = CGFloat(StudioScene.sceneBottom)
    let focus = RoomThumb.outlines[spot]?.midY ?? bottom
    return min(max(focus - visible / 2, 0), max(0, bottom - visible))
  }

  /// Vùng chạm vô hình trên một chỗ của phòng.
  private func spotHit(_ s: String, _ r: CGRect, k: CGFloat) -> some View {
    Button {
      withAnimation(reduceMotion ? nil : .snappy) { spot = s }
    } label: {
      Color.clear.contentShape(Rectangle())
    }
    .buttonStyle(.plain)
    .frame(width: r.width * k, height: max(r.height * k, 44))
    .offset(x: r.minX * k, y: r.minY * k)
    .accessibilityLabel(Text(verbatim: Self.spotName(s)))
    .accessibilityAddTraits(spot == s ? .isSelected : [])
  }

  /// Món đổi so với đang mặc: (nhóm, món mới hay `nil` = cởi).
  private var changes: [(group: String, key: String?)] {
    trying.compactMap { group, key in
      let current = book.inventory.first { $0.equipped && MascotShop.wearGroup($0.itemKey) == group }?.itemKey
      return key == current ? nil : (group, key)
    }
    .sorted { $0.group < $1.group }
  }

  /// Món đang thử mà chưa có.
  private var toBuy: [MascotShop.Item] {
    changes.compactMap { $0.key.flatMap(MascotShop.item) }.filter { !book.owned.contains($0.key) }
  }

  private var lockedTry: MascotShop.Item? {
    toBuy.first { ($0.unlockRank ?? 0) > book.gains.rank }
  }

  private var tryBar: some View {
    let total = toBuy.reduce(0) { $0 + $1.price }
    return HStack(spacing: DS.Spacing.sm) {
      VStack(alignment: .leading, spacing: 1) {
        Text(String(localized: "wd.try.count \(changes.count)"))
          .font(DS.TextStyle.caption)
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)
        Text(verbatim: changes.map { $0.key.flatMap(MascotShop.item)?.name(lang) ?? String(localized: "shop.takeoff") }
          .joined(separator: " · "))
          .font(DS.TextStyle.footnote.weight(.semibold))
          .foregroundStyle(DS.Color.foreground.swiftUI)
          .lineLimit(1)
      }
      Spacer(minLength: 4)
      Button {
        withAnimation(reduceMotion ? nil : .default) { trying = [:] }
      } label: {
        Text("wd.try.clear")
      }
      .buttonStyle(.dsPillSecondary)
      if let locked = lockedTry {
        let need = locked.unlockRank ?? 0
        Label(MascotRules.ranks[min(need, MascotRules.ranks.count - 1)].name(lang), systemImage: "lock.fill")
          .font(DS.TextStyle.footnote.weight(.semibold))
          .foregroundStyle(DS.Color.foreground.swiftUI)
          .padding(.horizontal, 12)
          .frame(minHeight: 44)
          .background(DS.Color.secondary.swiftUI, in: Capsule())
      } else {
        Button {
          if toBuy.isEmpty { Task { await apply() } } else { confirming = true }
        } label: {
          HStack(spacing: 4) {
            if applying { ProgressView().controlSize(.small) }
            Text(
              toBuy.isEmpty
                ? String(localized: "shop.wear")
                : String(localized: "wd.try.buy \(total.formatted(.number.locale(.app)))"))
          }
        }
        .buttonStyle(DSPillButtonStyle(.primary))
        .disabled(applying)
      }
    }
    .padding(.leading, DS.Spacing.md)
    .padding(.trailing, 6)
    .padding(.vertical, 6)
    .dsCard(radius: 22)
  }

  // MARK: - Kệ

  @ViewBuilder private var shelf: some View {
    Picker(selection: $tab) {
      Text("shop.tab.outfit").tag(Tab.outfits)
      Text("wd.tab.room").tag(Tab.room)
    } label: {
      Text("shop.title")
    }
    .pickerStyle(.segmented)
    .onChange(of: tab) { _, _ in notice = nil }

    if tab == .outfits {
      slots
      filters
    } else {
      spots
    }
    if let notice {
      Text(verbatim: notice.text)
        .font(DS.TextStyle.footnote)
        .foregroundStyle(notice.good ? DS.Color.readinessGreen.swiftUI : DS.Color.destructive.swiftUI)
        .fixedSize(horizontal: false, vertical: true)
    }
    let shown = items
    if tab == .room {
      LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: DS.Spacing.sm), count: 3), spacing: DS.Spacing.sm) {
        defaultTile
        ForEach(shown) { tile($0) }
      }
    } else if shown.isEmpty {
      Text(filter == .mine ? "shop.empty.closet" : "shop.empty.category")
        .font(DS.TextStyle.footnote)
        .foregroundStyle(DS.Color.mutedForeground.swiftUI)
        .multilineTextAlignment(.center)
        .frame(maxWidth: .infinity)
        .padding(.vertical, DS.Spacing.lg)
    } else {
      LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: DS.Spacing.sm), count: 3), spacing: DS.Spacing.sm) {
        ForEach(shown) { tile($0) }
      }
    }
  }

  /// Món theo tab / ô / bộ lọc, độ hiếm rồi giá (như lưới cũ). Tab Đồ phòng: chủ đề
  /// (sân khấu) hay món của chỗ đang chọn, không lọc.
  private var items: [MascotShop.Item] {
    if tab == .room {
      let list = spot == "theme" ? MascotShop.items.filter { $0.kind == .stage } : MascotShop.decor.filter { $0.slot == spot }
      return list.sorted { $0.price < $1.price }
    }
    return MascotShop.items
      .filter { $0.kind == .outfit }
      .filter { slot == nil || $0.slot == slot?.rawValue }
      .filter {
        switch filter {
        case .all: true
        case .mine: book.owned.contains($0.key)
        case .buyable:
          !book.owned.contains($0.key) && ($0.unlockRank ?? 0) <= book.gains.rank && $0.price <= book.balance
        }
      }
      .sorted { ($0.rarity.order, $0.price) < ($1.rarity.order, $1.price) }
  }

  private static let slotIcon: [KoaFlags.Slot: String] = [
    .head: "graduationcap", .face: "eyeglasses", .top: "tshirt", .bottom: "figure.walk", .shoes: "shoe",
    .back: "backpack", .hand: "dumbbell",
  ]

  static func slotName(_ s: KoaFlags.Slot) -> String {
    switch s {
    case .head: String(localized: "wd.slot.head")
    case .face: String(localized: "wd.slot.face")
    case .top: String(localized: "wd.slot.top")
    case .bottom: String(localized: "wd.slot.bottom")
    case .shoes: String(localized: "wd.slot.shoes")
    case .back: String(localized: "wd.slot.back")
    case .hand: String(localized: "wd.slot.hand")
    }
  }

  private var slots: some View {
    HStack(spacing: 0) {
      ForEach(KoaFlags.Slot.allCases, id: \.self) { s in
        let on = slot == s
        Button {
          slot = on ? nil : s
        } label: {
          VStack(spacing: 4) {
            Image(systemName: Self.slotIcon[s] ?? "circle")
              .font(.system(size: 17, weight: .medium))
              .frame(width: 42, height: 42)
              .background(
                on ? DS.Color.foreground.swiftUI.opacity(0.18) : DS.Color.foreground.swiftUI.opacity(0.06),
                in: RoundedRectangle(cornerRadius: 13, style: .continuous))
            Text(verbatim: Self.slotName(s))
              .font(.system(size: 11, weight: on ? .semibold : .regular))
              .lineLimit(1)
              .minimumScaleFactor(0.8)
          }
          .foregroundStyle(on ? DS.Color.foreground.swiftUI : DS.Color.mutedForeground.swiftUI)
          .frame(maxWidth: .infinity)
          .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(on ? .isSelected : [])
      }
    }
  }

  private static let spotIcon: [String: String] = [
    "theme": "paintpalette", "shelf": "dumbbell", "board": "number.square", "window": "window.casement",
    "plants": "leaf", "lamp": "lamp.ceiling", "podium": "circle.bottomhalf.filled",
  ]

  static func spotName(_ s: String) -> String {
    switch s {
    case "shelf": String(localized: "wd.spot.shelf")
    case "board": String(localized: "wd.spot.board")
    case "window": String(localized: "wd.spot.window")
    case "plants": String(localized: "wd.spot.plants")
    case "lamp": String(localized: "wd.spot.lamp")
    case "podium": String(localized: "wd.spot.podium")
    default: String(localized: "wd.spot.theme")
    }
  }

  /// Chủ đề + 6 chỗ, cùng kiểu với 7 ô trang phục.
  private var spots: some View {
    HStack(spacing: 0) {
      ForEach(["theme"] + StudioScene.decorSpots, id: \.self) { s in
        let on = spot == s
        Button {
          withAnimation(reduceMotion ? nil : .snappy) { spot = s }
        } label: {
          VStack(spacing: 4) {
            Image(systemName: Self.spotIcon[s] ?? "circle")
              .font(.system(size: 17, weight: .medium))
              .frame(width: 42, height: 42)
              .background(
                on ? DS.Color.foreground.swiftUI.opacity(0.18) : DS.Color.foreground.swiftUI.opacity(0.06),
                in: RoundedRectangle(cornerRadius: 13, style: .continuous))
            Text(verbatim: Self.spotName(s))
              .font(.system(size: 11, weight: on ? .semibold : .regular))
              .lineLimit(1)
              .minimumScaleFactor(0.7)
          }
          .foregroundStyle(on ? DS.Color.foreground.swiftUI : DS.Color.mutedForeground.swiftUI)
          .frame(maxWidth: .infinity)
          .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(on ? .isSelected : [])
      }
    }
  }

  private var filters: some View {
    ScrollView(.horizontal, showsIndicators: false) {
      HStack(spacing: DS.Spacing.xs) {
        chip(.all, title: String(localized: "shop.cat.all"))
        chip(.mine, title: String(localized: "wd.filter.mine \(book.owned.count)"))
        chip(.buyable, title: String(localized: "wd.filter.buyable"))
        Button {
          collectionsOpen = true
        } label: {
          HStack(spacing: 4) {
            Image(systemName: "sparkles").foregroundStyle(DS.Color.readinessYellow.swiftUI)
            Text("shop.collections")
            if book.setsReady > 0 {
              Text(verbatim: book.setsReady.formatted(.number.locale(.app)))
                .font(DS.TextStyle.caption.weight(.bold).monospacedDigit())
                .padding(.horizontal, 6)
                .background(DS.Color.readinessYellow.swiftUI, in: Capsule())
                .foregroundStyle(DS.Color.background.swiftUI)
            }
          }
          .font(DS.TextStyle.footnote.weight(.semibold))
          .padding(.horizontal, DS.Spacing.md)
          .frame(minHeight: 36)
          .background(DS.Color.secondary.swiftUI, in: Capsule())
          .foregroundStyle(DS.Color.foreground.swiftUI)
        }
        .buttonStyle(.plain)
      }
    }
  }

  private func chip(_ f: Filter, title: String) -> some View {
    let on = filter == f
    return Button {
      filter = f
    } label: {
      Text(verbatim: title)
        .font(DS.TextStyle.footnote.weight(.semibold))
        .padding(.horizontal, DS.Spacing.md)
        .frame(minHeight: 36)
        .background(on ? DS.Color.primary.swiftUI : DS.Color.secondary.swiftUI, in: Capsule())
        .foregroundStyle(on ? DS.Color.primaryForeground.swiftUI : DS.Color.foreground.swiftUI)
    }
    .buttonStyle(.plain)
    .accessibilityAddTraits(on ? .isSelected : [])
  }

  // MARK: - Thẻ món

  /// Món đang hiện trên Koa (đang mặc hoặc đang thử) ở nhóm của nó.
  private func shown(_ it: MascotShop.Item) -> Bool {
    let group = MascotShop.wearGroup(it.key)
    if let tried = trying[group] { return tried == it.key }
    return book.equipped.contains(it.key)
  }

  private func tap(_ it: MascotShop.Item) {
    let group = MascotShop.wearGroup(it.key)
    notice = nil
    withAnimation(reduceMotion ? nil : .snappy) {
      if let tried = trying[group], tried == it.key {
        // chạm lại món đang thử → bỏ thử, về đồ đang mặc
        trying[group] = nil
      } else if trying[group] == nil, book.equipped.contains(it.key) {
        // chạm món đang mặc → thử cởi
        trying[group] = .some(nil)
      } else {
        trying[group] = .some(it.key)
        if it.kind == .outfit { wearTick += 1 }
      }
    }
  }

  /// Nhóm mặc của chỗ đang chọn ở tab Đồ phòng.
  private var spotGroup: String { spot == "theme" ? "stage" : "decor:\(spot)" }

  /// Món gốc của chỗ (miễn phí, luôn có): đang hiện khi nhóm không có món nào.
  private var defaultTile: some View {
    let group = spotGroup
    let current = book.inventory.first { $0.equipped && MascotShop.wearGroup($0.itemKey) == group }?.itemKey
    let on: Bool = {
      if let tried = trying[group] { return tried == nil }
      return current == nil
    }()
    return Button {
      notice = nil
      withAnimation(reduceMotion ? nil : .snappy) {
        // về gốc = cởi món đang dùng; đang thử gốc mà chạm lại thì bỏ thử
        if trying[group] != nil { trying[group] = nil }
        if current != nil, !on { trying[group] = .some(nil) }
      }
    } label: {
      VStack(alignment: .leading, spacing: 4) {
        RoomThumb(equipped: [], crop: spot == "theme" ? nil : spot)
          .frame(height: 96)
          .frame(maxWidth: .infinity)
          .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        Text("wd.default")
          .font(DS.TextStyle.caption.weight(.semibold))
          .foregroundStyle(DS.Color.foreground.swiftUI)
          .lineLimit(1)
        Text(on ? (current == nil ? "shop.using" : "wd.state.trying") : "wd.state.free")
          .font(DS.TextStyle.caption)
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)
          .lineLimit(1)
      }
      .padding(6)
      .dsCard(radius: 16)
      .overlay {
        if on {
          RoundedRectangle(cornerRadius: 16, style: .continuous)
            .strokeBorder(DS.Color.foreground.swiftUI.opacity(0.85), lineWidth: 1.5)
        }
      }
      .contentShape(RoundedRectangle(cornerRadius: 16))
    }
    .buttonStyle(.plain)
    .accessibilityElement(children: .combine)
    .accessibilityAddTraits(on ? .isSelected : [])
    .accessibilityHint(Text("shop.preview"))
  }

  private func tile(_ it: MascotShop.Item) -> some View {
    let on = shown(it)
    let owned = book.owned.contains(it.key)
    let equipped = book.equipped.contains(it.key)
    let need = it.unlockRank ?? 0
    let locked = !owned && need > book.gains.rank
    return Button {
      tap(it)
    } label: {
      VStack(alignment: .leading, spacing: 4) {
        ZStack(alignment: .topTrailing) {
          Group {
            if it.kind == .stage {
              RoomThumb(equipped: [it.key], crop: nil)
            } else if it.kind == .decor {
              RoomThumb(equipped: [it.key], crop: it.slot)
            } else {
              WardrobeThumb(item: it)
            }
          }
          .frame(height: 96)
          .frame(maxWidth: .infinity)
          .background(DS.Color.foreground.swiftUI.opacity(0.05))
          .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
          .saturation(locked ? 0.2 : 1)
          .opacity(locked ? 0.6 : 1)
          if equipped && on {
            Image(systemName: "checkmark.circle.fill")
              .font(.system(size: 18))
              .symbolRenderingMode(.palette)
              .foregroundStyle(DS.Color.background.swiftUI, DS.Color.foreground.swiftUI)
              .padding(5)
          }
        }
        Text(verbatim: it.name(lang))
          .font(DS.TextStyle.caption.weight(.semibold))
          .foregroundStyle(DS.Color.foreground.swiftUI)
          .lineLimit(1)
        status(it, owned: owned, equipped: equipped, on: on, locked: locked)
      }
      .padding(6)
      .dsCard(radius: 16)
      .overlay {
        if on {
          RoundedRectangle(cornerRadius: 16, style: .continuous)
            .strokeBorder(DS.Color.foreground.swiftUI.opacity(0.85), lineWidth: 1.5)
        }
      }
      .contentShape(RoundedRectangle(cornerRadius: 16))
    }
    .buttonStyle(.plain)
    .accessibilityElement(children: .combine)
    .accessibilityAddTraits(on ? .isSelected : [])
    .accessibilityHint(Text("shop.preview"))
  }

  @ViewBuilder private func status(
    _ it: MascotShop.Item, owned: Bool, equipped: Bool, on: Bool, locked: Bool
  ) -> some View {
    Group {
      if equipped && on {
        Text(it.kind == .stage || it.kind == .decor ? "shop.using" : "wd.state.wearing")
      } else if on {
        Text("wd.state.trying")
      } else if owned {
        Text("wd.state.owned")
      } else if locked {
        let need = it.unlockRank ?? 0
        Label(MascotRules.ranks[min(need, MascotRules.ranks.count - 1)].name(lang), systemImage: "lock.fill")
      } else {
        HStack(spacing: 3) {
          Image(systemName: "circle.circle.fill")
            .foregroundStyle(DS.Color.readinessYellowGraphic.swiftUI)
            .accessibilityHidden(true)
          Text(verbatim: it.price.formatted(.number.locale(.app))).monospacedDigit()
        }
        .opacity(book.balance < it.price ? 0.5 : 1)
      }
    }
    .font(DS.TextStyle.caption)
    .foregroundStyle(DS.Color.mutedForeground.swiftUI)
    .lineLimit(1)
  }

  // MARK: - Mua / mặc

  private var confirmSheet: some View {
    let list = toBuy
    let total = list.reduce(0) { $0 + $1.price }
    return VStack(alignment: .leading, spacing: DS.Spacing.md) {
      Text(String(localized: "wd.confirm.title \(list.count)"))
        .font(DS.TextStyle.title)
        .foregroundStyle(DS.Color.foreground.swiftUI)
      VStack(spacing: 0) {
        ForEach(list) { it in
          HStack {
            Text(verbatim: it.name(lang))
            Spacer()
            Text(verbatim: it.price.formatted(.number.locale(.app))).monospacedDigit()
          }
          .font(DS.TextStyle.body)
          .frame(minHeight: 40)
          Divider().opacity(0.4)
        }
        HStack {
          Text("wd.confirm.total").font(DS.TextStyle.headline)
          Spacer()
          Text(verbatim: total.formatted(.number.locale(.app))).font(DS.TextStyle.headline).monospacedDigit()
        }
        .frame(minHeight: 44)
      }
      .foregroundStyle(DS.Color.foreground.swiftUI)
      if book.balance < total {
        Text("shop.notenough")
          .font(DS.TextStyle.footnote)
          .foregroundStyle(DS.Color.destructive.swiftUI)
      } else {
        Text(String(localized: "wd.confirm.left \((book.balance - total).formatted(.number.locale(.app)))"))
          .font(DS.TextStyle.footnote)
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)
      }
      // đồ phòng / chủ đề thì "dùng", có đồ mặc thì "mặc"
      let wearing = list.contains { $0.kind == .outfit }
      DSButton(wearing ? String(localized: "wd.confirm.buy") : String(localized: "wd.confirm.buyUse"), style: .primary) {
        confirming = false
        Task { await apply() }
      }
      .disabled(book.balance < total || applying)
    }
    .padding(DS.Spacing.lg)
    .presentationDetents([.medium])
    .presentationBackground(DS.Color.background.swiftUI)
  }

  /// Mua món chưa có (lần lượt, hỏng thì dừng), rồi mặc / cởi đúng như đang thử.
  private func apply() async {
    guard !applying else { return }
    applying = true
    defer { applying = false }
    let buying = toBuy
    var got = 0
    for it in buying {
      switch await book.buy(it) {
      case .bought:
        got += 1
      case .locked(let need):
        let name = MascotRules.ranks[min(need, MascotRules.ranks.count - 1)].name(lang)
        return stop(got, of: buying.count, String(localized: "shop.lockedRank \(name)"))
      case .poor, .failed(.insufficientCoins):
        return stop(got, of: buying.count, String(localized: "shop.notenough"))
      case .failed(.unknownItem):
        // server chưa có giá của món (đồ phòng trước khi migration `koa_room_decor` chạy)
        return stop(got, of: buying.count, String(localized: "wd.notForSale"))
      case .busy:
        return
      case .failed(let f):
        return stop(got, of: buying.count, Self.message(f))
      }
    }
    noteBought(got)
    for change in changes {
      let result: MascotShopBook.WearOutcome
      if let key = change.key {
        result = await book.setWorn(key, on: true)
      } else if let current = book.inventory.first(where: {
        $0.equipped && MascotShop.wearGroup($0.itemKey) == change.group
      })?.itemKey {
        result = await book.setWorn(current, on: false)
      } else {
        continue
      }
      switch result {
      case .done, .busy: break
      case .gone: notice = Notice(text: String(localized: "shop.error.gone"), good: false)
      case .failed(let f): notice = Notice(text: Self.message(f), good: false)
      }
    }
    withAnimation(reduceMotion ? nil : .default) { trying = [:] }
    if notice == nil, got > 0 { notice = Notice(text: String(localized: "shop.bought"), good: true) }
  }

  private func noteBought(_ got: Int) {
    guard got > 0 else { return }
    bought += 1
    onWalletChange()
    Telemetry.capture(.koaItemBought, ["items": String(got)])
  }

  private func stop(_ got: Int, of total: Int, _ why: String) {
    noteBought(got)
    notice = Notice(
      text: got > 0 ? String(localized: "wd.partial \(got) \(total) \(why)") : why, good: false)
  }

  static func message(_ f: MascotFailure) -> String {
    f == .offline ? String(localized: "shop.offline") : MascotRoomView.message(f)
  }

  // MARK: - Bộ sưu tập

  private var collections: some View {
    NavigationStack {
      List(MascotShop.collections) { c in
        let p = MascotShop.progress(c, owned: book.owned)
        HStack {
          VStack(alignment: .leading, spacing: 2) {
            Text(verbatim: c.name(lang)).font(DS.TextStyle.headline)
            Text(
              "shop.set.progress \(p.have.formatted(.number.locale(.app))) \(p.total.formatted(.number.locale(.app)))"
            )
            .font(DS.TextStyle.caption)
            .foregroundStyle(DS.Color.mutedForeground.swiftUI)
          }
          Spacer()
          if book.isClaimed(c) {
            Text("shop.set.claimed")
              .font(DS.TextStyle.footnote)
              .foregroundStyle(DS.Color.mutedForeground.swiftUI)
          } else {
            Button {
              Task { await claim(c) }
            } label: {
              Text("shop.claim \(c.rewardCoins.formatted(.number.locale(.app)))")
                .frame(minHeight: 44)
            }
            .buttonStyle(.dsPill)
            .disabled(!p.complete || book.claiming)
          }
        }
      }
      .navigationTitle(Text("shop.collections"))
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button("shop.close") { collectionsOpen = false }
        }
      }
    }
    .presentationDetents([.medium, .large])
    // Nền đặc màu trang (16/10, chủ dự án: thẻ trên bảng kính khó nhìn — như Ghi nhanh).
    .presentationBackground(DS.Color.background.swiftUI)
  }

  private func claim(_ c: MascotShop.Collection) async {
    switch await book.claim(c) {
    case .claimed:
      bought += 1
      onWalletChange()
    case .notReady, .busy: break
    case .failed(let f): notice = Notice(text: Self.message(f), good: false)
    }
  }
}

/// Ảnh thu nhỏ của một món: Koa mặc ĐÚNG món ấy, cắt theo ô (đầu → nửa trên, giày →
/// chân…) — cùng bộ vẽ với sân khấu, không có ảnh rời nào để lệch.
struct WardrobeThumb: View {
  let item: MascotShop.Item

  /// Khung cắt theo phần cao của Koa: (đỉnh, cao, lệch ngang theo bề rộng ô).
  static func window(_ slot: String?) -> (top: CGFloat, height: CGFloat, dx: CGFloat) {
    switch slot {
    case "head": (0.0, 0.56, 0)
    case "face": (0.08, 0.48, 0)
    case "top": (0.34, 0.56, 0)
    case "bottom": (0.60, 0.40, 0)
    case "shoes": (0.64, 0.36, 0)
    case "back": (0.04, 0.92, 0)
    case "hand": (0.36, 0.62, -0.14)
    default: (0, 1, 0)
    }
  }

  var body: some View {
    GeometryReader { g in
      let w = Self.window(item.slot)
      let figH = g.size.height / w.height
      let figW = figH / KoaMath.aspect
      MascotFigureView(mascotId: "koa", emotion: .idle, equipped: [item.key], size: figW, animated: false)
        .frame(width: figW, height: figH)
        .offset(x: (g.size.width - figW) / 2 + w.dx * g.size.width, y: -w.top * figH)
    }
    .clipped()
    .accessibilityHidden(true)
  }
}

/// Căn phòng của Koa thu nhỏ (thẻ đồ phòng, nền xem trước): cả phòng, hay cắt quanh một
/// chỗ để thấy rõ món. Cùng bộ vẽ với phòng thật.
struct RoomThumb: View {
  let equipped: [String]
  /// Chỗ cần cắt (`StudioScene.decorSpots`); `nil` = cả phòng.
  let crop: String?
  @Environment(\.colorScheme) private var scheme
  @Environment(\.locale) private var locale

  /// Khung cắt của từng chỗ, theo toạ độ phòng 390 × 476.
  static let frames: [String: CGRect] = [
    "shelf": CGRect(x: 0, y: 228, width: 150, height: 172),
    "board": CGRect(x: 258, y: 236, width: 126, height: 84),
    "window": CGRect(x: 258, y: 88, width: 126, height: 138),
    "plants": CGRect(x: 262, y: 300, width: 128, height: 140),
    "lamp": CGRect(x: 120, y: 0, width: 150, height: 130),
    "podium": CGRect(x: 40, y: 360, width: 310, height: 116),
  ]

  /// Khung ôm sát đồ vật của từng chỗ (viền chọn + vùng chạm trên phòng xem trước).
  static let outlines: [String: CGRect] = [
    "shelf": CGRect(x: 4, y: 232, width: 136, height: 166),
    "board": CGRect(x: 264, y: 240, width: 114, height: 74),
    "window": CGRect(x: 264, y: 90, width: 110, height: 130),
    "plants": CGRect(x: 278, y: 322, width: 106, height: 114),
    "lamp": CGRect(x: 150, y: 30, width: 90, height: 64),
    "podium": CGRect(x: 54, y: 380, width: 282, height: 66),
  ]

  private var options: StudioScene.Options {
    var o = StudioScene.Options()
    o.skin = StudioScene.skinKey(equipped: Set(equipped))
    o.decor = MascotShop.decorChoice(equipped: Set(equipped))
    o.energy = 0.8
    o.light = scheme == .light
    // ban ngày phòng không treo đèn; thẻ của chỗ Đèn vẫn bật để thấy món sẽ mua
    o.lamp = scheme == .dark || crop == "lamp"
    o.depth = true
    o.lang = String(locale.identifier.prefix(2))
    o.board = RoomBoard.rank(2, of: MascotRules.ranks.count, lang: o.lang)
    return o
  }

  var body: some View {
    GeometryReader { g in
      let r = crop.flatMap { Self.frames[$0] } ?? CGRect(x: 0, y: 0, width: StudioScene.width, height: StudioScene.sceneBottom)
      let k = max(g.size.width / r.width, g.size.height / r.height)
      StudioBackdrop(options: options)
        .frame(width: StudioScene.width * k, height: StudioScene.sceneBottom * k)
        .offset(x: -r.minX * k + (g.size.width - r.width * k) / 2, y: -r.minY * k + (g.size.height - r.height * k) / 2)
    }
    .clipped()
    .accessibilityHidden(true)
  }
}
