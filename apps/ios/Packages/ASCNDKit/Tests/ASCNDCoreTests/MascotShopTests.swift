@testable import ASCNDCore
import Foundation
import Testing

/// Cửa hàng Koa = `lib/mascot-room.ts` + phần lọc / chặn của `shop.tsx` @ fac9ac2
/// (`Fixtures/shop-golden.json`, `gen-shop.mjs` chạy chính mã RN biên dịch).
struct MascotShopGoldenTests {
  static func root() throws -> JSONValue {
    let url = try #require(Bundle.module.url(forResource: "shop-golden", withExtension: "json", subdirectory: "Fixtures"))
    return try JSONDecoder().decode(JSONValue.self, from: Data(contentsOf: url))
  }

  static func array(_ v: JSONValue?) -> [JSONValue] {
    if case .array(let a)? = v { return a }
    return []
  }

  static func strings(_ v: JSONValue?) -> [String] { array(v).compactMap(\.stringValue) }

  static func int(_ v: JSONValue?) -> Int? {
    if case .number(let n)? = v { return Int(n) }
    return nil
  }

  static func check(_ it: MascotShop.Item, _ w: JSONValue) {
    #expect(it.key == w["key"]?.stringValue)
    #expect(it.kind.rawValue == w["type"]?.stringValue)
    #expect(it.slot == w["slot"]?.stringValue, "\(it.key)")
    #expect(it.koaId == w["koaId"]?.stringValue)
    #expect(it.category?.rawValue == w["category"]?.stringValue)
    #expect(it.special == (w["special"] == .bool(true)), "\(it.key)")
    #expect(it.rarity.rawValue == w["rarity"]?.stringValue)
    #expect(it.price == int(w["price"]), "\(it.key)")
    #expect(it.collection == w["collection"]?.stringValue, "\(it.key)")
    #expect(it.unlockLevel == int(w["unlockLevel"]), "\(it.key)")
    #expect(it.name.vi == w["name"]?["vi"]?.stringValue)
    #expect(it.name.en == w["name"]?["en"]?.stringValue)
    #expect(it.name.es == w["name"]?["es"]?.stringValue, "\(it.key)")
  }

  @Test func catalogIsRNs() throws {
    let g = try Self.root()
    let items = Self.array(g["items"])
    #expect(MascotShop.items.count == items.count)
    #expect(items.count == 39)
    for (it, w) in zip(MascotShop.items, items) { Self.check(it, w) }
    for (it, w) in zip(MascotShop.consumables, Self.array(g["consumables"])) { Self.check(it, w) }
    #expect(MascotShop.consumables.count == Self.array(g["consumables"]).count)
    for r in MascotShop.Rarity.allCases {
      let w = g["rarity"]?[r.rawValue]
      #expect(Self.int(w?["order"]) == r.order)
      #expect(r.name.vi == w?["name"]?["vi"]?.stringValue)
      #expect(r.name.en == w?["name"]?["en"]?.stringValue)
      #expect(r.name.es == w?["name"]?["es"]?.stringValue)
    }
    let cats = Self.array(g["categories"])
    #expect(MascotShop.Category.allCases.map(\.rawValue) == cats.compactMap { $0["id"]?.stringValue })
    for (c, w) in zip(MascotShop.Category.allCases, cats) {
      #expect(c.name.vi == w["name"]?["vi"]?.stringValue)
      #expect(c.name.es == w["name"]?["es"]?.stringValue)
    }
    let sets = Self.array(g["collections"])
    #expect(MascotShop.collections.count == sets.count)
    for (c, w) in zip(MascotShop.collections, sets) {
      #expect(c.id == w["id"]?.stringValue)
      #expect(c.itemKeys == Self.strings(w["itemKeys"]))
      #expect(c.rewardCoins == Self.int(w["rewardCoins"]))
      #expect(c.rewardXp == Self.int(w["rewardXp"]))
      #expect(MascotRules.xpForRefKey(c.refKey) == c.rewardXp)  // XP của sổ khớp catalog
      #expect(c.name.en == w["name"]?["en"]?.stringValue)
    }
  }

  @Test func conflictsAndWearGroupsAreRNs() throws {
    let g = try Self.root()
    guard case .object(let conflicts)? = g["conflicts"], case .object(let groups)? = g["groups"] else {
      Issue.record("thiếu conflicts / groups")
      return
    }
    #expect(conflicts.count == 41)
    for (key, want) in conflicts {
      #expect(MascotShop.conflictingKeys(key) == Self.strings(want), "\(key)")
      #expect(MascotShop.wearGroup(key) == groups[key]?.stringValue, "\(key)")
    }
  }

  @Test func gridsGatesStagesAndSetsAreRNs() throws {
    let states = Self.array(try Self.root()["states"])
    #expect(states.count == 120)
    var locked = 0
    for s in states {
      let owned = Set(Self.strings(s["owned"]))
      let equipped = Set(Self.strings(s["equipped"]))
      #expect(MascotShop.activeStageKey(equipped) == s["activeStage"]?.stringValue)
      #expect(MascotRules.level(xp: Self.int(s["xp"]) ?? -1) == Self.int(s["level"]))
      guard case .object(let grids)? = s["grids"] else { continue }
      #expect(grids.count == 1 + 6 + 6)
      for (k, want) in grids {
        let parts = k.split(separator: "/").map(String.init)
        let tab = try #require(MascotShop.Tab(rawValue: parts[0]))
        let cat = parts[1] == "all" ? nil : MascotShop.Category(rawValue: parts[1])
        #expect(MascotShop.grid(tab, category: cat, owned: owned).map(\.key) == Self.strings(want), "\(k)")
      }
      for (c, w) in zip(MascotShop.collections, Self.array(s["collections"])) {
        let p = MascotShop.progress(c, owned: owned)
        #expect(p.have == Self.int(w["have"]))
        #expect(p.total == Self.int(w["total"]))
        #expect(p.complete == (w["complete"] == .bool(true)))
      }
      let level = Self.int(s["level"]) ?? 0, balance = Self.int(s["balance"]) ?? 0
      for it in MascotShop.items {
        let want = s["gates"]?[it.key]?.stringValue
        switch MascotShop.gate(it, level: level, balance: balance) {
        case .ok: #expect(want == "ok", "\(it.key)")
        case .poor: #expect(want == "poor", "\(it.key)")
        case .locked(let need):
          locked += 1
          #expect(want == "locked", "\(it.key)")
          #expect(need == it.unlockLevel)
        }
      }
    }
    #expect(locked > 0)
  }
}

// MARK: - Sổ cửa hàng

@MainActor
struct MascotShopBookTests {
  final class Source: MascotSource, @unchecked Sendable {
    var entries: [LedgerRow] = []
    var fail = false
    func ledger(userId: String) async throws -> [LedgerRow] {
      if fail { throw MascotFailure.offline }
      return entries
    }
    func loggedDates(userId: String, limit: Int) async throws -> [LocalDate] { [] }
    func freezes(userId: String) async throws -> [FreezeRow] { [] }
    func weeklyChallenges(userId: String, weekStart: LocalDate) async throws -> [WeeklyChallenge] { [] }
    func awardCount(userId: String) async throws -> Int { 0 }
    func dailySignals(userId: String, date: LocalDate) async throws -> DailySignals {
      throw MascotFailure.offline
    }
  }

  /// Server giả: định giá theo catalog, chặn mua trùng, trừ xu vào sổ của `Source`.
  final class Wardrobe: MascotWardrobe, @unchecked Sendable {
    let source: Source
    var rows: [InventoryRow] = []
    var buyError: MascotFailure?
    var wearError: MascotFailure?
    var buys = 0
    var gate: CheckedContinuation<Void, Never>?
    var holdBuy = false
    init(_ s: Source) { source = s }

    func inventory(userId: String) async throws -> [InventoryRow] {
      if source.fail { throw MascotFailure.offline }
      return rows
    }

    func buy(itemKey: String) async throws -> Int {
      buys += 1
      if holdBuy { await withCheckedContinuation { gate = $0 } }
      if let buyError { throw buyError }
      guard let it = MascotShop.item(itemKey) else { throw MascotFailure.unknownItem }
      if rows.contains(where: { $0.itemKey == itemKey }) { throw MascotFailure.alreadyOwned }
      let balance = source.entries.reduce(0) { $0 + $1.amount }
      if balance < it.price { throw MascotFailure.insufficientCoins }
      source.entries.append(LedgerRow(amount: -it.price, refKey: "buy:\(itemKey)"))
      rows.append(InventoryRow(itemKey: itemKey, equipped: true))
      return balance - it.price
    }

    func setWorn(userId: String, on: String?, off: [String]) async throws -> Bool {
      if let wearError { throw wearError }
      let found = on.map { k in rows.contains { $0.itemKey == k } } ?? true
      rows = rows.map { r in
        if r.itemKey == on { return InventoryRow(itemKey: r.itemKey, equipped: true) }
        if off.contains(r.itemKey) { return InventoryRow(itemKey: r.itemKey, equipped: false) }
        return r
      }
      return found
    }
  }

  final class Economy: MascotEconomy, @unchecked Sendable {
    let source: Source
    var claims: [String] = []
    var error: MascotFailure?
    init(_ s: Source) { source = s }
    func claimReward(refKey: String, reason: String) async throws -> Int {
      if let error { throw error }
      claims.append(refKey)
      let amount = MascotShop.collections.first { $0.refKey == refKey }?.rewardCoins ?? 0
      source.entries.append(LedgerRow(amount: amount, refKey: refKey))
      return amount
    }
    func buyStreakFreeze(requestId: UUID) async throws -> Int { 0 }
  }

  static func make(coins: Int, xp: Int = 0) -> (MascotShopBook, Source, Wardrobe, Economy) {
    let s = Source()
    s.entries = [LedgerRow(amount: coins, refKey: "seed")]
    // XP theo khoá thật: mỗi `w:<n>` = thưởng tuần.
    for n in 0..<(xp / MascotRules.weeklyBonusXp) { s.entries.append(LedgerRow(amount: 0, refKey: "w:\(n)")) }
    let w = Wardrobe(s)
    let e = Economy(s)
    return (MascotShopBook(userId: "u", source: s, wardrobe: w, economy: e), s, w, e)
  }

  @Test func buyingDebitsWearsAndSwitchesOffTheSlotRival() async {
    let (book, _, w, _) = Self.make(coins: 300)
    w.rows = [InventoryRow(itemKey: "head_band", equipped: true)]
    await book.load()
    #expect(book.balance == 300)
    let cap = MascotShop.item("head_cap")!
    #expect(await book.buy(cap) == .bought)
    #expect(book.balance == 200)
    #expect(book.equipped == ["head_cap"])  // băng đô cùng ô bị tắt
    #expect(book.owned == ["head_band", "head_cap"])
  }

  @Test func refusesBeforeCallingWhenPoorOrLocked() async {
    let (book, _, w, _) = Self.make(coins: 50)
    await book.load()
    #expect(await book.buy(MascotShop.item("head_cap")!) == .poor)
    let (rich, _, w2, _) = Self.make(coins: 5000)
    await rich.load()
    #expect(rich.level == 1)
    #expect(await rich.buy(MascotShop.item("shoes_wing")!) == .locked(level: 15))
    #expect(w.buys == 0)
    #expect(w2.buys == 0)
  }

  @Test func serverRefusalsSurfaceAndAlreadyOwnedRefreshes() async {
    let (book, s, w, _) = Self.make(coins: 300)
    await book.load()
    // Máy khác vừa mua: tủ đồ máy này cũ.
    w.rows = [InventoryRow(itemKey: "head_cap", equipped: true)]
    #expect(await book.buy(MascotShop.item("head_cap")!) == .failed(.alreadyOwned))
    #expect(book.owned == ["head_cap"])
    // Mất mạng: không treo, không trừ.
    w.buyError = .offline
    #expect(await book.buy(MascotShop.item("face_shades")!) == .failed(.offline))
    #expect(book.buying == nil)
    #expect(s.entries.count == 1)
  }

  @Test func aSecondBuyWhileOneIsInFlightIsRefused() async {
    let (book, _, w, _) = Self.make(coins: 1000)
    await book.load()
    w.holdBuy = true
    let first = Task { await book.buy(MascotShop.item("head_cap")!) }
    while w.gate == nil { await Task.yield() }
    #expect(book.buying == "head_cap")
    #expect(await book.buy(MascotShop.item("face_shades")!) == .busy)
    w.holdBuy = false
    w.gate?.resume()
    #expect(await first.value == .bought)
    #expect(w.buys == 1)
  }

  @Test func wearingIsAbsoluteAndRevertsWhenOffline() async {
    let (book, _, w, _) = Self.make(coins: 0)
    w.rows = [
      InventoryRow(itemKey: "head_band", equipped: true), InventoryRow(itemKey: "head_cap", equipped: false),
      InventoryRow(itemKey: "stage_night", equipped: true), InventoryRow(itemKey: "stage_sunset", equipped: true),
    ]
    await book.load()
    #expect(MascotShop.activeStageKey(book.equipped) == "stage_sunset")  // hai sân khấu từ bản cũ
    #expect(await book.setWorn("stage_night", on: true) == .done)
    #expect(MascotShop.activeStageKey(book.equipped) == "stage_night")
    #expect(w.rows.filter(\.equipped).map(\.itemKey).sorted() == ["head_band", "stage_night"])
    w.wearError = .offline
    #expect(await book.setWorn("head_cap", on: true) == .failed(.offline))
    #expect(book.equipped.contains("head_band"))  // trả lại như trước
    #expect(!book.equipped.contains("head_cap"))
    w.wearError = nil
    #expect(await book.setWorn("head_band", on: false) == .done)
    #expect(!book.equipped.contains("head_band"))
    #expect(await book.setWorn("face_vr", on: true) == .busy)  // chưa có món
  }

  @Test func aCompletedSetPaysOnce() async {
    let (book, _, w, e) = Self.make(coins: 0)
    w.rows = [InventoryRow(itemKey: "head_santa", equipped: false)]
    await book.load()
    let xmas = MascotShop.collections.first { $0.id == "xmas" }!
    #expect(await book.claim(xmas) == .notReady)
    w.rows.append(InventoryRow(itemKey: "top_xmas", equipped: false))
    await book.load()
    #expect(book.setsReady == 1)
    #expect(await book.claim(xmas) == .claimed(coins: 120))
    #expect(book.balance == 120)
    #expect(book.isClaimed(xmas))
    #expect(book.setsReady == 0)
    #expect(await book.claim(xmas) == .notReady)
    #expect(e.claims == ["set:xmas"])
  }

  @Test func firstReadFailingIsAnErrorReloadKeepsNumbers() async {
    let (book, s, _, _) = Self.make(coins: 100)
    s.fail = true
    await book.load()
    #expect(book.phase == .failed)
    s.fail = false
    await book.load()
    #expect(book.phase == .ready)
    s.fail = true
    await book.load()
    #expect(book.phase == .ready)
    #expect(book.balance == 100)
  }
}
