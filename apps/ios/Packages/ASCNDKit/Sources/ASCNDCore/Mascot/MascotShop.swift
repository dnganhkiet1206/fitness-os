public import Foundation
public import Observation

/// Cửa hàng của Koa (#527) — catalog + luật của `lib/mascot-room.ts` và phần
/// lọc / chặn của `app/shop.tsx` @ fac9ac2.
///
/// Như RN: 36 trang phục (7 ô) + 3 sân khấu; độ hiếm sắp lưới rồi giá; tab
/// Trang phục / Tủ đồ lọc theo nhóm (Đặc biệt là kệ thứ hai của món theo mùa,
/// không phải nhà của nó); một ô chỉ mặc một món, một lúc chỉ một sân khấu
/// (`conflictingKeys`, `wearGroup`); sân khấu đang dùng là món đắt nhất trong
/// các sân khấu đang bật (`activeStageKey` — người mua nhiều sân khấu dưới bản
/// cũ); năm bộ sưu tập, đủ món thì nhận thưởng một lần (`set:<id>`). Mua: chặn
/// cấp rồi chặn xu ở máy, server định giá và kiểm lại.
///
/// Golden: `Fixtures/shop-golden.json` — chính mã RN biên dịch (`gen-shop.mjs`).
public enum MascotShop {
  public typealias Text3 = AssistantSuggestions.Text3

  public enum Kind: String, Sendable, Hashable { case outfit, stage, consumable }

  public enum Rarity: String, Sendable, Hashable, CaseIterable {
    case common, rare, epic, legendary

    /// Thứ tự trên lưới (`RARITY[r].order`).
    public var order: Int {
      switch self {
      case .common: 0
      case .rare: 1
      case .epic: 2
      case .legendary: 3
      }
    }

    public var name: Text3 {
      switch self {
      case .common: Text3(vi: "Phổ thông", en: "Common", es: "Común")
      case .rare: Text3(vi: "Hiếm", en: "Rare", es: "Raro")
      case .epic: Text3(vi: "Sử thi", en: "Epic", es: "Épico")
      case .legendary: Text3(vi: "Huyền thoại", en: "Legendary", es: "Legendario")
      }
    }
  }

  /// Nhóm của hàng biểu tượng dưới "Trang phục".
  public enum Category: String, Sendable, Hashable, CaseIterable {
    case head, face, body, gear, special

    public var name: Text3 {
      switch self {
      case .head: Text3(vi: "Đầu", en: "Head", es: "Cabeza")
      case .face: Text3(vi: "Mặt", en: "Face", es: "Cara")
      case .body: Text3(vi: "Thân", en: "Body", es: "Cuerpo")
      case .gear: Text3(vi: "Phụ kiện", en: "Gear", es: "Accesorios")
      case .special: Text3(vi: "Đặc biệt", en: "Special", es: "Especial")
      }
    }
  }

  public struct Item: Sendable, Hashable, Identifiable {
    public let key: String
    public let kind: Kind
    /// Ô của trang phục (`head` / `face` / `top` / `bottom` / `shoes` / `back` / `hand`).
    public let slot: String?
    public let koaId: String?
    public let category: Category?
    /// Cũng nằm trên kệ Đặc biệt.
    public let special: Bool
    public let rarity: Rarity
    public let price: Int
    public let collection: String?
    public let unlockLevel: Int?
    public let name: Text3
    public var id: String { key }
  }

  public struct Collection: Sendable, Hashable, Identifiable {
    public let id: String
    public let name: Text3
    public let itemKeys: [String]
    public let rewardCoins: Int
    public let rewardXp: Int

    public var refKey: String { "set:\(id)" }
  }

  // MARK: - Catalog

  private static func o(
    _ slot: String, _ koaId: String, _ category: Category, _ rarity: Rarity, _ price: Int, _ vi: String,
    _ en: String, _ es: String, collection: String? = nil, unlockLevel: Int? = nil, special: Bool = false
  ) -> Item {
    Item(
      key: "\(slot)_\(koaId)", kind: .outfit, slot: slot, koaId: koaId, category: category, special: special,
      rarity: rarity, price: price, collection: collection, unlockLevel: unlockLevel,
      name: Text3(vi: vi, en: en, es: es))
  }

  private static func stage(_ key: String, _ rarity: Rarity, _ price: Int, _ vi: String, _ en: String, _ es: String)
    -> Item
  {
    Item(
      key: key, kind: .stage, slot: nil, koaId: nil, category: nil, special: false, rarity: rarity, price: price,
      collection: nil, unlockLevel: nil, name: Text3(vi: vi, en: en, es: es))
  }

  /// `SHOP_ITEMS`, cùng thứ tự.
  public static let items: [Item] = [
    // Đầu
    o("head", "band", .head, .common, 80, "Băng đô thể thao", "Sport Headband", "Cinta deportiva"),
    o("head", "cap", .head, .common, 100, "Nón lưỡi trai", "Baseball Cap", "Gorra de béisbol"),
    o("head", "beanie", .head, .rare, 150, "Nón len", "Knit Beanie", "Gorro de lana"),
    o("head", "phones", .head, .rare, 200, "Tai nghe", "Headphones", "Auriculares", collection: "runner"),
    // Mặt
    o("face", "shades", .face, .common, 60, "Kính đen", "Sunglasses", "Gafas de sol"),
    o("face", "goggles", .face, .common, 80, "Kính bơi", "Swim Goggles", "Gafas de natación"),
    o("face", "mask", .face, .common, 60, "Khẩu trang", "Face Mask", "Mascarilla"),
    o("face", "heart", .face, .rare, 150, "Kính trái tim", "Heart Glasses", "Gafas de corazón"),
    o("face", "vr", .face, .epic, 350, "Kính VR", "VR Headset", "Casco VR"),
    // Thân
    o("top", "tank", .body, .common, 100, "Áo tank top", "Tank Top", "Camiseta de tirantes", collection: "gym"),
    o("top", "tee", .body, .common, 80, "Áo thun", "T-Shirt", "Camiseta"),
    o("top", "hoodie", .body, .rare, 180, "Áo hoodie", "Hoodie", "Sudadera"),
    o("top", "jersey", .body, .rare, 160, "Áo bóng đá", "Jersey", "Camiseta de fútbol", collection: "runner"),
    o("bottom", "short", .body, .common, 80, "Quần short", "Shorts", "Pantalones cortos", collection: "gym"),
    o("bottom", "jogger", .body, .common, 100, "Quần jogger", "Joggers", "Pantalones jogger"),
    o("bottom", "legging", .body, .rare, 150, "Quần legging", "Leggings", "Mallas", collection: "runner"),
    o("bottom", "camo", .body, .rare, 160, "Quần rằn ri", "Camo Pants", "Pantalones de camuflaje"),
    o("shoes", "sneaker", .body, .common, 100, "Giày sneaker", "Sneakers", "Zapatillas", collection: "gym"),
    o(
      "shoes", "runner", .body, .rare, 200, "Giày chạy bộ", "Running Shoes", "Zapatillas de running",
      collection: "runner"),
    o("shoes", "glow", .body, .epic, 350, "Giày phát sáng", "Glow Kicks", "Zapatillas luminosas"),
    o("shoes", "wing", .body, .legendary, 650, "Giày có cánh", "Winged Boots", "Botas aladas", unlockLevel: 15),
    // Phụ kiện
    o("back", "backpack", .gear, .common, 100, "Ba lô", "Backpack", "Mochila"),
    o(
      "back", "hydro", .gear, .rare, 180, "Túi nước", "Hydration Pack", "Mochila de hidratación",
      collection: "runner"),
    o("back", "cape", .gear, .epic, 400, "Áo choàng", "Hero Cape", "Capa de héroe"),
    o("hand", "bottle", .gear, .common, 60, "Bình nước", "Water Bottle", "Botella de agua"),
    o("hand", "dumbbell", .gear, .common, 80, "Tạ tay", "Dumbbell", "Mancuerna", collection: "gym"),
    o("hand", "towel", .gear, .common, 60, "Khăn tập", "Gym Towel", "Toalla de gimnasio"),
    o("hand", "rope", .gear, .rare, 140, "Dây nhảy", "Jump Rope", "Cuerda para saltar"),
    o("hand", "trophy", .gear, .epic, 400, "Cúp vàng", "Gold Trophy", "Trofeo de oro", unlockLevel: 10),
    // Đặc biệt — giữ nhà theo ô VÀ kệ Đặc biệt
    o("head", "santa", .head, .rare, 150, "Nón Noel", "Santa Hat", "Gorro de Santa", collection: "xmas", special: true),
    o(
      "top", "xmas", .body, .rare, 180, "Áo len Noel", "Xmas Sweater", "Jersey de Navidad", collection: "xmas",
      special: true),
    o("head", "khanxep", .head, .rare, 150, "Khăn xếp", "Tet Turban", "Turbante Tet", collection: "tet", special: true),
    o("top", "aodai", .body, .epic, 350, "Áo dài", "Ao Dai", "Ao Dai", collection: "tet", special: true),
    o(
      "head", "witch", .head, .rare, 160, "Nón phù thuỷ", "Witch Hat", "Sombrero de bruja", collection: "halloween",
      special: true),
    o(
      "top", "ghost", .body, .rare, 180, "Áo choàng ma", "Ghost Cloak", "Capa de fantasma", collection: "halloween",
      special: true),
    o(
      "back", "dragonwing", .gear, .legendary, 800, "Cánh Rồng", "Dragon Wings", "Alas de dragón", unlockLevel: 20,
      special: true),
    // Sân khấu
    stage("stage_night", .rare, 300, "Sân khấu Đêm", "Night Stage", "Escenario nocturno"),
    stage("stage_sunset", .epic, 500, "Sân khấu Hoàng hôn", "Sunset Stage", "Escenario al atardecer"),
    stage("stage_champion", .legendary, 800, "Sân khấu Vô địch", "Champion Stage", "Escenario del campeón"),
  ]

  /// `CONSUMABLES` — tiêu chứ không mặc; giá băng chuỗi ở `MascotRules.freezePrice`.
  public static let consumables: [Item] = [
    Item(
      key: "streak_freeze", kind: .consumable, slot: nil, koaId: nil, category: nil, special: false, rarity: .rare,
      price: MascotRules.freezePrice, collection: nil, unlockLevel: nil,
      name: Text3(vi: "Bảo hiểm chuỗi", en: "Streak Freeze", es: "Protector de racha"))
  ]

  public static let collections: [Collection] = [
    Collection(
      id: "gym", name: Text3(vi: "Bộ Gym", en: "Gym Set", es: "Conjunto gym"),
      itemKeys: ["head_band", "top_tank", "bottom_short", "shoes_sneaker", "hand_dumbbell"], rewardCoins: 120,
      rewardXp: 60),
    Collection(
      id: "runner", name: Text3(vi: "Bộ Chạy Bộ", en: "Runner Set", es: "Conjunto runner"),
      itemKeys: ["head_phones", "top_jersey", "bottom_legging", "shoes_runner", "back_hydro"], rewardCoins: 180,
      rewardXp: 90),
    Collection(
      id: "tet", name: Text3(vi: "Bộ Tết", en: "Tet Set", es: "Conjunto Tet"),
      itemKeys: ["head_khanxep", "top_aodai"], rewardCoins: 120, rewardXp: 60),
    Collection(
      id: "xmas", name: Text3(vi: "Bộ Giáng Sinh", en: "Christmas Set", es: "Conjunto de Navidad"),
      itemKeys: ["head_santa", "top_xmas"], rewardCoins: 120, rewardXp: 60),
    Collection(
      id: "halloween", name: Text3(vi: "Bộ Halloween", en: "Halloween Set", es: "Conjunto de Halloween"),
      itemKeys: ["head_witch", "top_ghost"], rewardCoins: 120, rewardXp: 60),
  ]

  private static let byKey = Dictionary(uniqueKeysWithValues: items.map { ($0.key, $0) })

  public static func item(_ key: String) -> Item? { byKey[key] }

  // MARK: - Luật

  /// Món phải tắt khi bật `key`: cùng ô (trang phục) hay mọi sân khấu khác.
  public static func conflictingKeys(_ key: String) -> [String] {
    guard let it = item(key) else { return [] }
    switch it.kind {
    case .stage: return items.filter { $0.kind == .stage && $0.key != key }.map(\.key)
    case .outfit:
      guard let slot = it.slot else { return [] }
      return items.filter { $0.kind == .outfit && $0.slot == slot && $0.key != key }.map(\.key)
    case .consumable: return []
    }
  }

  /// Nhóm "mặc một món một lúc": `stage`, `outfit:<slot>`, hay `item:<key>`.
  public static func wearGroup(_ key: String) -> String {
    let it = item(key)
    if it?.kind == .stage { return "stage" }
    if it?.kind == .outfit, let slot = it?.slot { return "outfit:\(slot)" }
    return "item:\(key)"
  }

  /// Sân khấu đang dùng: đắt nhất trong các sân khấu đang bật; `nil` = mặc định.
  /// Cùng giá thì món đứng trước giữ chỗ (`reduce` với `>`).
  public static func activeStageKey(_ equipped: Set<String>) -> String? {
    let stages = items.filter { $0.kind == .stage && equipped.contains($0.key) }
    guard var best = stages.first else { return nil }
    for s in stages.dropFirst() where s.price > best.price { best = s }
    return best.key
  }

  public struct Progress: Sendable, Hashable {
    public let have: Int
    public let total: Int
    public var complete: Bool { have == total }
  }

  public static func progress(_ c: Collection, owned: Set<String>) -> Progress {
    Progress(have: c.itemKeys.filter(owned.contains).count, total: c.itemKeys.count)
  }

  /// Ba tab có lưới (Toàn cảnh của RN chỉ là cảnh, chưa có bản native).
  public enum Tab: String, Sendable, Hashable, CaseIterable { case stage, outfit, closet }

  /// Lưới của một tab: `category == nil` là "Tất cả". Tủ đồ = trang phục đã
  /// mua. Sắp theo độ hiếm rồi giá; bằng nhau giữ thứ tự catalog (`sort` của JS
  /// ổn định).
  public static func grid(_ tab: Tab, category: Category?, owned: Set<String>) -> [Item] {
    let inCategory = { (it: Item) -> Bool in
      guard let category else { return true }
      return category == .special ? it.special : it.category == category
    }
    let picked = items.filter { it in
      switch tab {
      case .closet: it.kind == .outfit && owned.contains(it.key) && inCategory(it)
      case .stage: it.kind == .stage
      case .outfit: it.kind == .outfit && inCategory(it)
      }
    }
    return picked.enumerated()
      .sorted { a, b in
        (a.element.rarity.order, a.element.price, a.offset) < (b.element.rarity.order, b.element.price, b.offset)
      }
      .map(\.element)
  }

  public enum Gate: Sendable, Hashable {
    case ok
    /// Chưa đủ cấp (`nRoomLockLevel`).
    case locked(level: Int)
    /// Không đủ xu (`nRoomNotEnough`).
    case poor
  }

  /// Hai lần chặn ở máy trước khi gọi server (`shop.tsx:213-226`).
  public static func gate(_ item: Item, level: Int, balance: Int) -> Gate {
    if let need = item.unlockLevel, need > 0, level < need { return .locked(level: need) }
    if balance < item.price { return .poor }
    return .ok
  }
}

/// Một hàng `mascot_inventory`.
public struct InventoryRow: Sendable, Hashable {
  public let itemKey: String
  public let equipped: Bool

  public init(itemKey: String, equipped: Bool) {
    self.itemKey = itemKey
    self.equipped = equipped
  }
}

/// Tủ đồ trên server. Ném `MascotFailure` (adapter dịch thông điệp Postgres).
public protocol MascotWardrobe: Sendable {
  /// `mascot_inventory` (`item_key`, `equipped`) của tài khoản.
  func inventory(userId: String) async throws -> [InventoryRow]
  /// `buy_mascot_item(p_item_key)` → số dư sau khi mua. Server định giá.
  func buy(itemKey: String) async throws -> Int
  /// Đặt TUYỆT ĐỐI một nhóm: `on` (nếu có) `equipped = true`, mọi khoá ở `off`
  /// `false`. Trả `false` khi `on` không còn trong kho (0 hàng).
  func setWorn(userId: String, on: String?, off: [String]) async throws -> Bool
}

/// Cửa hàng của MỘT tài khoản. Dựng theo phiên; đóng khi phiên đổi.
@MainActor @Observable
public final class MascotShopBook {
  public enum Phase: Sendable, Hashable {
    case loading
    case failed
    case ready
  }

  public enum BuyOutcome: Sendable, Hashable {
    case bought
    case locked(level: Int)
    case poor
    /// Đang có một lượt mua khác.
    case busy
    case failed(MascotFailure)
  }

  public enum WearOutcome: Sendable, Hashable {
    case done
    /// Món không còn trong kho.
    case gone
    case busy
    case failed(MascotFailure)
  }

  public enum ClaimOutcome: Sendable, Hashable {
    case claimed(coins: Int)
    /// Chưa đủ món, hoặc đã nhận.
    case notReady
    case busy
    case failed(MascotFailure)
  }

  public let userId: String
  public private(set) var phase: Phase = .loading
  public private(set) var wallet: MascotWallet?
  public private(set) var inventory: [InventoryRow] = []
  /// Món đang mua — vòng quay chỉ trên thẻ ấy.
  public private(set) var buying: String?
  /// Nhóm mặc đang gửi.
  public private(set) var wearing: Set<String> = []
  public private(set) var claiming = false

  @ObservationIgnored private let source: any MascotSource
  @ObservationIgnored private let wardrobe: any MascotWardrobe
  @ObservationIgnored private let economy: any MascotEconomy
  @ObservationIgnored private var closed = false

  public init(userId: String, source: any MascotSource, wardrobe: any MascotWardrobe, economy: any MascotEconomy) {
    self.userId = userId
    self.source = source
    self.wardrobe = wardrobe
    self.economy = economy
  }

  public func close() { closed = true }

  public var balance: Int { wallet?.balance ?? 0 }
  public var level: Int { MascotRules.level(xp: wallet?.xp ?? 0) }
  public var owned: Set<String> { Set(inventory.map(\.itemKey)) }
  public var equipped: Set<String> { Set(inventory.filter(\.equipped).map(\.itemKey)) }
  public func isClaimed(_ c: MascotShop.Collection) -> Bool { wallet?.claimed.contains(c.refKey) ?? false }

  /// Bộ sưu tập đủ món mà chưa nhận — số trên huy hiệu.
  public var setsReady: Int {
    MascotShop.collections.filter { MascotShop.progress($0, owned: owned).complete && !isClaimed($0) }.count
  }

  /// Sổ xu + tủ đồ song song. Lần đầu hỏng → lỗi; đọc lại hỏng giữ số cũ.
  public func load() async {
    let source = self.source, wardrobe = self.wardrobe, uid = userId
    async let ledger = capture { try await source.ledger(userId: uid) }
    async let inv = capture { try await wardrobe.inventory(userId: uid) }
    let (l, i) = await (ledger, inv)
    guard !closed else { return }
    switch (l, i) {
    case (.success(let rows), .success(let items)):
      wallet = MascotWallet(rows: rows)
      inventory = items
      phase = .ready
    default:
      if case .success(let rows) = l, wallet != nil { wallet = MascotWallet(rows: rows) }
      if case .success(let items) = i, phase == .ready { inventory = items }
      if phase != .ready { phase = .failed }
    }
  }

  /// Mua: chặn cấp, chặn xu, một lượt một lúc; server định giá và kiểm lại. Món
  /// mới được mặc ngay nên các món xung đột tắt đi (lỗi bước này không làm hỏng
  /// lượt mua — như RN).
  public func buy(_ item: MascotShop.Item) async -> BuyOutcome {
    guard buying == nil, !closed else { return .busy }
    switch MascotShop.gate(item, level: level, balance: balance) {
    case .locked(let need): return .locked(level: need)
    case .poor: return .poor
    case .ok: break
    }
    buying = item.key
    defer { buying = nil }
    do {
      _ = try await wardrobe.buy(itemKey: item.key)
    } catch {
      guard !closed else { return .busy }
      let f = MascotRoomController.failure(error)
      // Server nói đã có: tủ đồ máy đang cũ — đọc lại để thẻ thành "Mặc".
      if f == .alreadyOwned || f == .insufficientCoins { await load() }
      return .failed(f)
    }
    let off = MascotShop.conflictingKeys(item.key)
    if !off.isEmpty { _ = try? await wardrobe.setWorn(userId: userId, on: nil, off: off) }
    await load()
    return .bought
  }

  /// Mặc / cởi một món đã có. Áp ngay trên máy (Koa thay đồ tức thì), gửi đặt
  /// tuyệt đối cả nhóm; hỏng thì trả lại như trước. Chỉ khi có mạng — native
  /// chưa có lớp Trạng thái (#165) để giữ ý chờ.
  public func setWorn(_ key: String, on: Bool) async -> WearOutcome {
    let group = MascotShop.wearGroup(key)
    guard !wearing.contains(group), !closed, owned.contains(key) else { return .busy }
    let members = [key] + MascotShop.conflictingKeys(key)
    let value: String? = on ? key : nil
    let before = inventory
    inventory = inventory.map { r in
      members.contains(r.itemKey) ? InventoryRow(itemKey: r.itemKey, equipped: r.itemKey == value) : r
    }
    wearing.insert(group)
    defer { wearing.remove(group) }
    do {
      let found = try await wardrobe.setWorn(userId: userId, on: value, off: members.filter { $0 != value })
      guard !closed else { return .busy }
      if !found {
        await load()
        return .gone
      }
      return .done
    } catch {
      guard !closed else { return .busy }
      inventory = before
      return .failed(MascotRoomController.failure(error))
    }
  }

  /// Nhận thưởng một bộ đã đủ (`claim_quest_reward('set:<id>')`; trùng là
  /// không làm gì ở server).
  public func claim(_ c: MascotShop.Collection) async -> ClaimOutcome {
    guard !claiming, !closed else { return .busy }
    guard MascotShop.progress(c, owned: owned).complete, !isClaimed(c) else { return .notReady }
    claiming = true
    defer { claiming = false }
    do {
      let coins = try await economy.claimReward(refKey: c.refKey, reason: c.refKey)
      guard !closed else { return .busy }
      await load()
      return .claimed(coins: coins)
    } catch {
      guard !closed else { return .busy }
      return .failed(MascotRoomController.failure(error))
    }
  }
}
