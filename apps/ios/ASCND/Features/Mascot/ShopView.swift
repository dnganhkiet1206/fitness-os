import ASCNDCore
import ASCNDDesignSystem
import SwiftUI

/// Phòng thay đồ / cửa hàng của Koa (#527) — `app/shop.tsx` @ fac9ac2 trên
/// `MascotShopBook`.
///
/// Như RN: ba tab có hàng (Sân khấu · Trang phục · Tủ đồ), hàng nhóm cho
/// Trang phục / Tủ đồ, lưới theo độ hiếm rồi giá; thẻ món có độ hiếm, giá, khoá
/// cấp ("Lv.N"); chưa có → Mua (chặn cấp, chặn xu, mất mạng báo "cửa hàng cần
/// mạng", một lượt mua một lúc — vòng quay trên đúng thẻ ấy); đã có → Mặc /
/// Cởi (sân khấu: Dùng / Đang dùng); tủ trống mời sang Trang phục; bộ sưu tập
/// là một tấm riêng, đủ món thì Nhận.
///
/// S2: phòng thử đồ ở đầu màn (`ShopSceneView`, VẼ LẠI theo `ShopScene` của RN),
/// tab Toàn cảnh, máy quay theo tab; món đang xem mặc thử lên Koa (sân khấu thì
/// đổi skin căn phòng), Koa cúi nhìn đồ vài giây khi một món lên người.
///
/// Khác RN: danh sách thẻ thay cho trang lật (`ShopPager`) — chạm thẻ để xem
/// thử; mặc / cởi chỉ khi có mạng (chưa có lớp Trạng thái #165).
struct ShopView: View {
  let book: MascotShopBook
  let lang: AppPreferences.Lang
  /// Sổ xu đổi (mua / nhận thưởng) — phòng linh vật đọc lại.
  var onWalletChange: () -> Void = {}

  /// Tab = khung hình của máy quay; mở ở Toàn cảnh như RN.
  @State private var shot: ShopScene.ShotName = .overview
  /// Món đang xem thử (`browsing`), `nil` = không xem gì.
  @State private var preview: String?
  /// Bộ đếm lượt mặc (`wearTick`) — mặc lại cùng món vẫn có phản ứng.
  @State private var wearTick = 0
  @State private var dressing = false
  @State private var category: MascotShop.Category?
  @State private var notice: Notice?
  @State private var collectionsOpen = false
  @State private var bought = 0

  /// `DRESS_HOLD` = 4,2 giây.
  private static let dressHold = Duration.milliseconds(4200)

  /// Tab có hàng; Toàn cảnh thì không.
  private var tab: MascotShop.Tab? { MascotShop.Tab(rawValue: shot.rawValue) }

  struct Notice: Equatable {
    let text: String
    let good: Bool
  }

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: DS.Spacing.md) {
        switch book.phase {
        case .loading:
          DSLoadingView()
        case .failed:
          DSErrorView(message: String(localized: "shop.loadfailed")) { Task { await book.load() } }
        case .ready:
          ready
        }
      }
      .padding(DS.Spacing.md)
    }
    .navigationTitle(Text("shop.title"))
    .navigationBarTitleDisplayMode(.inline)
    .toolbar {
      ToolbarItem(placement: .primaryAction) {
        Label {
          Text(verbatim: book.balance.formatted(.number.locale(.app)))
        } icon: {
          Image(systemName: "dollarsign.circle.fill")
        }
        .labelStyle(.titleAndIcon)
        .font(DS.TextStyle.headline.monospacedDigit())
        .foregroundStyle(DS.Color.readinessYellow.swiftUI)
        .accessibilityLabel(Text("shop.balance \(book.balance.formatted(.number.locale(.app)))"))
      }
    }
    .task { if case .loading = book.phase { await book.load() } }
    .refreshable { await book.load() }
    .sensoryFeedback(.success, trigger: bought)
    .sheet(isPresented: $collectionsOpen) { collections }
  }

  @ViewBuilder private var ready: some View {
    scene
    Picker(selection: $shot) {
      Text("shop.tab.overview").tag(ShopScene.ShotName.overview)
      Text("shop.tab.stage").tag(ShopScene.ShotName.stage)
      Text("shop.tab.outfit").tag(ShopScene.ShotName.outfit)
      Text("shop.tab.closet").tag(ShopScene.ShotName.closet)
    } label: {
      Text("shop.title")
    }
    .pickerStyle(.segmented)
    .onChange(of: shot) { _, _ in
      notice = nil
      preview = nil
    }

    if let tab {
      shelf(tab)
    } else {
      Text("shop.overview.hint")
        .font(DS.TextStyle.footnote)
        .foregroundStyle(DS.Color.mutedForeground.swiftUI)
        .frame(maxWidth: .infinity)
        .padding(.vertical, DS.Spacing.lg)
    }
  }

  // MARK: - Phòng thử đồ

  /// Món đang xem, nếu nó còn trong catalog.
  private var browsing: MascotShop.Item? { preview.flatMap { k in MascotShop.items.first { $0.key == k } } }

  /// Đồ trên người Koa: đang mặc + món trang phục đang xem (`preview`).
  private var worn: [String] {
    let on = book.inventory.filter(\.equipped).map(\.itemKey)
    guard let it = browsing, it.kind == .outfit, !on.contains(it.key) else { return on }
    return on + [it.key]
  }

  /// Skin căn phòng: sân khấu đang xem, không thì sân khấu đang dùng.
  private var roomSkin: String {
    if let it = browsing, it.kind == .stage { return StudioScene.skinKey(stage: it.key) }
    return StudioScene.skinKey(equipped: book.equipped)
  }

  private var scene: some View {
    ShopSceneView(shot: shot, equipped: worn, skin: roomSkin, dress: dressing)
      // căn phòng phủ ngang cả màn như RN, không theo lề trang
      .padding(.horizontal, -DS.Spacing.md)
      .task(id: DressCue(key: browsing?.kind == .outfit ? browsing?.key : nil, tick: wearTick)) {
        // Koa phản ứng khi một món LÊN NGƯỜI (xem thử hay bấm mặc), rồi về đứng yên
        guard browsing?.kind == .outfit else {
          dressing = false
          return
        }
        dressing = true
        try? await Task.sleep(for: Self.dressHold)
        if !Task.isCancelled { dressing = false }
      }
  }

  private struct DressCue: Equatable {
    let key: String?
    let tick: Int
  }

  @ViewBuilder private func shelf(_ tab: MascotShop.Tab) -> some View {
    if tab != .stage { categories }

    if let notice {
      Text(verbatim: notice.text)
        .font(DS.TextStyle.footnote)
        .foregroundStyle(notice.good ? DS.Color.readinessGreen.swiftUI : DS.Color.destructive.swiftUI)
        .fixedSize(horizontal: false, vertical: true)
    }

    let items = MascotShop.grid(tab, category: tab == .stage ? nil : category, owned: book.owned)
    if items.isEmpty {
      empty
    } else {
      LazyVStack(spacing: DS.Spacing.sm) {
        ForEach(items) { card($0) }
      }
    }

    if tab == .outfit { collectionsBanner }
  }

  // MARK: - Nhóm

  private var categories: some View {
    ScrollView(.horizontal, showsIndicators: false) {
      HStack(spacing: DS.Spacing.xs) {
        chip(nil, title: String(localized: "shop.cat.all"))
        ForEach(MascotShop.Category.allCases, id: \.self) { c in
          chip(c, title: c.name(lang))
        }
      }
    }
  }

  private func chip(_ c: MascotShop.Category?, title: String) -> some View {
    let on = category == c
    return Button {
      category = c
    } label: {
      Text(verbatim: title)
        .font(DS.TextStyle.footnote.weight(.semibold))
        .padding(.horizontal, DS.Spacing.md)
        .frame(minHeight: 44)
        .background(on ? DS.Color.primary.swiftUI : DS.Color.secondary.swiftUI, in: Capsule())
        .foregroundStyle(on ? DS.Color.primaryForeground.swiftUI : DS.Color.foreground.swiftUI)
    }
    .buttonStyle(.plain)
    .accessibilityAddTraits(on ? .isSelected : [])
  }

  // MARK: - Trống

  @ViewBuilder private var empty: some View {
    if tab == .closet {
      VStack(spacing: DS.Spacing.sm) {
        Text("shop.empty.closet")
          .font(DS.TextStyle.footnote)
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)
          .multilineTextAlignment(.center)
        Button {
          shot = .outfit
        } label: {
          Text("shop.gotooutfits")
        }
        .buttonStyle(.bordered)
      }
      .frame(maxWidth: .infinity)
      .padding(.vertical, DS.Spacing.lg)
    } else {
      Text("shop.empty.category")
        .font(DS.TextStyle.footnote)
        .foregroundStyle(DS.Color.mutedForeground.swiftUI)
        .frame(maxWidth: .infinity)
        .padding(.vertical, DS.Spacing.lg)
    }
  }

  // MARK: - Thẻ món

  private static func tint(_ r: MascotShop.Rarity) -> Color {
    switch r {
    case .common: DS.Color.readinessGreen.swiftUI
    case .rare: DS.Color.metricBlue.swiftUI
    case .epic: DS.Color.metricPurple.swiftUI
    case .legendary: DS.Color.readinessYellow.swiftUI
    }
  }

  private func card(_ it: MascotShop.Item) -> some View {
    let tint = Self.tint(it.rarity)
    return HStack(spacing: DS.Spacing.md) {
      RoundedRectangle(cornerRadius: 2)
        .fill(tint)
        .frame(width: 4)
        .accessibilityHidden(true)
      VStack(alignment: .leading, spacing: 2) {
        Text(verbatim: it.name(lang))
          .font(DS.TextStyle.headline)
          .foregroundStyle(DS.Color.foreground.swiftUI)
        Text(verbatim: it.rarity.name(lang))
          .font(DS.TextStyle.caption.weight(.semibold))
          .foregroundStyle(tint)
      }
      Spacer(minLength: DS.Spacing.sm)
      action(it)
    }
    .padding(DS.Spacing.md)
    .frame(minHeight: 64)
    .background(DS.Color.card.swiftUI, in: RoundedRectangle(cornerRadius: DS.Radius.md))
    .overlay {
      if preview == it.key {
        RoundedRectangle(cornerRadius: DS.Radius.md).strokeBorder(tint, lineWidth: 2)
      }
    }
    // chạm thẻ = xem thử trên Koa / trong căn phòng (trang lật của RN)
    .contentShape(RoundedRectangle(cornerRadius: DS.Radius.md))
    .onTapGesture { preview = it.key }
    .accessibilityAction(named: Text("shop.preview")) { preview = it.key }
    .accessibilityAddTraits(preview == it.key ? .isSelected : [])
  }

  @ViewBuilder private func action(_ it: MascotShop.Item) -> some View {
    if book.owned.contains(it.key) {
      let on = book.equipped.contains(it.key)
      let busy = book.wearing.contains(MascotShop.wearGroup(it.key))
      Button {
        Task { await wear(it, on: !on) }
      } label: {
        Text(wearLabel(it, on: on))
          .font(DS.TextStyle.footnote.weight(.semibold))
          .frame(minWidth: 72, minHeight: 44)
      }
      .buttonStyle(.bordered)
      .tint(on ? DS.Color.mutedForeground.swiftUI : DS.Color.primary.swiftUI)
      .disabled(busy)
    } else if let need = it.unlockLevel, book.level < need {
      Label {
        Text(verbatim: "Lv.\(need)")
      } icon: {
        Image(systemName: "lock.fill")
      }
      .font(DS.TextStyle.footnote.weight(.semibold).monospacedDigit())
      .foregroundStyle(DS.Color.mutedForeground.swiftUI)
      .frame(minHeight: 44)
      .accessibilityLabel(Text("shop.locked \(need.formatted(.number.locale(.app)))"))
    } else {
      let poor = book.balance < it.price
      Button {
        Task { await buy(it) }
      } label: {
        HStack(spacing: 4) {
          if book.buying == it.key {
            ProgressView().controlSize(.small)
          } else {
            Image(systemName: "dollarsign.circle.fill").accessibilityHidden(true)
          }
          Text(verbatim: it.price.formatted(.number.locale(.app))).monospacedDigit()
        }
        .font(DS.TextStyle.footnote.weight(.semibold))
        .frame(minWidth: 72, minHeight: 44)
      }
      .buttonStyle(.borderedProminent)
      .tint(poor ? DS.Color.mutedForeground.swiftUI : DS.Color.primary.swiftUI)
      // RN: một lượt mua đang chạy khoá mọi nút mua.
      .disabled(book.buying != nil)
      .accessibilityLabel(Text("shop.buy \(it.name(lang)) \(it.price.formatted(.number.locale(.app)))"))
    }
  }

  private func wearLabel(_ it: MascotShop.Item, on: Bool) -> LocalizedStringKey {
    switch (it.kind, on) {
    case (.stage, false): "shop.use"
    case (.stage, true): "shop.using"
    case (_, false): "shop.wear"
    case (_, true): "shop.takeoff"
    }
  }

  // MARK: - Việc

  private func buy(_ it: MascotShop.Item) async {
    switch await book.buy(it) {
    case .bought:
      bought += 1
      notice = Notice(text: String(localized: "shop.bought"), good: true)
      onWalletChange()
    case .locked(let need):
      notice = Notice(text: String(localized: "shop.locked \(need.formatted(.number.locale(.app)))"), good: false)
    case .poor, .failed(.insufficientCoins):
      notice = Notice(text: String(localized: "shop.notenough"), good: false)
    case .busy:
      break
    case .failed(let f):
      notice = Notice(text: Self.message(f), good: false)
    }
  }

  private func wear(_ it: MascotShop.Item, on: Bool) async {
    // món vừa bấm thành món đang xem (RN: nút mặc nằm trên trang đang lật tới);
    // mặc vào là sự kiện Koa phản ứng, cởi ra thì không
    preview = it.key
    if on { wearTick += 1 }
    switch await book.setWorn(it.key, on: on) {
    case .done, .busy: notice = nil
    case .gone: notice = Notice(text: String(localized: "shop.error.gone"), good: false)
    case .failed(let f): notice = Notice(text: Self.message(f), good: false)
    }
  }

  static func message(_ f: MascotFailure) -> String {
    f == .offline ? String(localized: "shop.offline") : MascotRoomView.message(f)
  }

  // MARK: - Bộ sưu tập

  private var collectionsBanner: some View {
    Button {
      collectionsOpen = true
    } label: {
      HStack(spacing: DS.Spacing.md) {
        Image(systemName: "sparkles")
          .font(.title3)
          .foregroundStyle(DS.Color.readinessYellow.swiftUI)
          .accessibilityHidden(true)
        VStack(alignment: .leading, spacing: 2) {
          Text("shop.collections").font(DS.TextStyle.headline)
          Text("shop.collections.hint")
            .font(DS.TextStyle.caption)
            .foregroundStyle(DS.Color.mutedForeground.swiftUI)
            .lineLimit(1)
        }
        Spacer()
        if book.setsReady > 0 {
          Text(verbatim: book.setsReady.formatted(.number.locale(.app)))
            .font(DS.TextStyle.caption.weight(.bold).monospacedDigit())
            .padding(.horizontal, 8)
            .padding(.vertical, 2)
            .background(DS.Color.readinessYellow.swiftUI, in: Capsule())
            .foregroundStyle(DS.Color.background.swiftUI)
        } else {
          Image(systemName: "chevron.right")
            .foregroundStyle(DS.Color.mutedForeground.swiftUI)
            .accessibilityHidden(true)
        }
      }
      .padding(DS.Spacing.md)
      .background(DS.Color.card.swiftUI, in: RoundedRectangle(cornerRadius: DS.Radius.md))
      .foregroundStyle(DS.Color.foreground.swiftUI)
    }
    .buttonStyle(.plain)
    .accessibilityElement(children: .combine)
  }

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
            .buttonStyle(.borderedProminent)
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
