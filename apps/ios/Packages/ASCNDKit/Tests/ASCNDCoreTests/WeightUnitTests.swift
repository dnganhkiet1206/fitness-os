@testable import ASCNDCore
import Foundation
import Testing

/// Đơn vị cân nặng (#527 1.9-A) so với CHÍNH `lib/units.ts` @ fac9ac2
/// (`Fixtures/weight-golden.json`, sinh bằng `tools/insights-golden/gen-weight.mjs`).
struct WeightUnitGoldenTests {
  static func golden() throws -> JSONValue {
    let url = try #require(Bundle.module.url(forResource: "weight-golden", withExtension: "json", subdirectory: "Fixtures"))
    return try JSONDecoder().decode(JSONValue.self, from: Data(contentsOf: url))
  }

  static func unit(_ v: JSONValue?) -> WeightUnit { v?.stringValue == "lbs" ? .lbs : .kg }

  /// Hằng số đổi đúng của RN — một chữ số khác là mọi số lb lệch.
  @Test func constantMatchesRN() throws {
    #expect(try Self.golden()["lbPerKg"]?.doubleValue == Units.lbPerKg)
  }

  /// `useUnits`: chỉ đúng `"lbs"` là lb; `"LBS"`, `"lb"`, rỗng, null, thiếu → kg.
  @Test func onlyExactLbsIsPounds() throws {
    guard case .array(let cases)? = try Self.golden()["profiles"] else { throw CocoaError(.fileReadCorruptFile) }
    #expect(cases.count == 10)
    for c in cases {
      let stored = c["stored"]?.stringValue
      let raw: String? = stored == "<missing>" ? nil : stored
      #expect(WeightUnit(stored: raw) == Self.unit(c["unit"]), "units_weight = \(String(describing: raw))")
    }
    #expect(WeightUnit(profile: nil) == .kg, "hồ sơ chưa nạp → kg")
  }

  /// `convertWeight` / `displayWeight` / `weightLabel`, chữ ô tạ hạt giống,
  /// khối lượng nguyên — từng số khớp RN.
  @Test func displayMatchesRN() throws {
    guard case .array(let cases)? = try Self.golden()["weights"] else { throw CocoaError(.fileReadCorruptFile) }
    #expect(cases.count == 50)
    for c in cases {
      let u = Self.unit(c["unit"])
      let kg = try #require(c["kg"]?.doubleValue)
      let tag = "\(u.rawValue) \(kg)"
      #expect(u.convert(kg) == c["convert"]?.doubleValue, "convert \(tag)")
      #expect(u.display(kg) == c["display"]?.doubleValue, "display \(tag)")
      #expect(u.label == c["label"]?.stringValue, "label \(tag)")
      #expect(u.text(kg) == c["text"]?.stringValue, "text \(tag)")
      #expect(u.seed(kg) == c["seed"]?.stringValue, "seed \(tag)")
      #expect(u.load(kg) == "\(c["text"]?.stringValue ?? "?") \(c["label"]?.stringValue ?? "?")", "load \(tag)")
      #expect(u.volume(kg) == c["volume"]?.intValue, "volume \(tag)")
      #expect(u.toKg(u.display(kg)) == c["backToKg"]?.doubleValue, "backToKg \(tag)")
    }
  }

  /// Số gõ theo lb → kg lưu, KHÔNG làm tròn (`weightToKg`).
  @Test func typedValueStoresUnroundedKg() throws {
    guard case .array(let cases)? = try Self.golden()["typed"] else { throw CocoaError(.fileReadCorruptFile) }
    #expect(cases.count == 26)
    for c in cases {
      let u = Self.unit(c["unit"])
      let v = try #require(c["value"]?.doubleValue)
      #expect(u.toKg(v) == c["kg"]?.doubleValue, "\(u.rawValue) \(v)")
    }
    #expect(WeightUnit.lbs.toKg(135) == 135 / 2.2046226218, "61.23496…, không phải 61.2")
  }
}

/// Đơn vị là của TÀI KHOẢN đang đăng nhập: đọc từ `ProfileBook` của đúng
/// `userId`, đổi tài khoản thì đổi theo, không bao giờ mượn đơn vị người khác.
@MainActor
struct WeightUnitAccountTests {
  private actor Source: ProfileSource {
    var rows: [String: JSONValue]
    var down = false
    private(set) var calls = 0
    init(_ rows: [String: JSONValue]) { self.rows = rows }
    func setDown(_ d: Bool) { down = d }
    func set(_ userId: String, _ row: JSONValue?) { rows[userId] = row }
    func profile(userId: String) async throws -> JSONValue? {
      calls += 1
      if down { throw URLError(.notConnectedToInternet) }
      return rows[userId]
    }
  }
  private actor Writer: ProfileWriter {
    func update(userId: String, row: JSONValue) async throws {}
  }
  private actor Cache: ProfileCache {
    var store: [String: Profile] = [:]
    func load(userId: String) async throws -> Profile? { store[userId] }
    func save(userId: String, _ profile: Profile) async throws { store[userId] = profile }
  }

  private static func row(_ userId: String, _ units: String?) -> JSONValue {
    .object(["user_id": .string(userId), "units_weight": units.map(JSONValue.string) ?? .null])
  }

  private func unit(_ userId: String, _ source: Source, _ cache: Cache) async -> WeightUnit {
    let book = ProfileBook(userId: userId, source: source, writer: Writer(), cache: cache)
    await book.load()
    return WeightUnit(profile: book.profile)
  }

  /// A (lbs) → đăng xuất → B (kg) → A lại: mỗi người đúng đơn vị của mình,
  /// kể cả khi offline (bản nhớ trên máy theo `userId`).
  @Test func switchingAccountsSwitchesUnit() async {
    let source = Source(["a": Self.row("a", "lbs"), "b": Self.row("b", "kg")])
    let cache = Cache()
    #expect(await unit("a", source, cache) == .lbs)
    #expect(await unit("b", source, cache) == .kg)
    await source.setDown(true)
    #expect(await unit("a", source, cache) == .lbs, "offline: bản nhớ của chính A")
    #expect(await unit("b", source, cache) == .kg, "offline: B không mượn lb của A")
    #expect(await unit("c", source, cache) == .kg, "người mới, chưa có gì → kg")
  }

  /// Mở lại app (#527 1.9-D): đơn vị đến từ bản nhớ trên máy, KHÔNG chờ mạng —
  /// có trước khi màn tập dựng (`SignedInScope`: `loadCached` rồi
  /// `setWeightUnit` rồi mới `flow.start`). Bản nhớ chỉ của đúng người.
  @Test func cachedUnitIsReadyBeforeAnyNetwork() async {
    let source = Source(["a": Self.row("a", "lbs")])
    let cache = Cache()
    #expect(await unit("a", source, cache) == .lbs)
    let before = await source.calls
    let reopened = ProfileBook(userId: "a", source: source, writer: Writer(), cache: cache)
    await reopened.loadCached()
    #expect(WeightUnit(profile: reopened.profile) == .lbs)
    #expect(await source.calls == before, "không gọi server")
    let other = ProfileBook(userId: "b", source: source, writer: Writer(), cache: cache)
    await other.loadCached()
    #expect(WeightUnit(profile: other.profile) == .kg, "B không đọc bản nhớ của A")
  }

  /// Hàng của người KHÁC (RLS hỏng) không bao giờ thành đơn vị của mình.
  @Test func foreignRowNeverBecomesMyUnit() async {
    let source = Source(["b": Self.row("a", "lbs")])
    #expect(await unit("b", source, Cache()) == .kg)
  }

  /// Đổi đơn vị trên máy khác: lần làm mới sau đọc đơn vị mới.
  @Test func refreshPicksUpUnitChange() async {
    let source = Source(["a": Self.row("a", "kg")])
    let book = ProfileBook(userId: "a", source: source, writer: Writer(), cache: Cache())
    await book.load()
    #expect(WeightUnit(profile: book.profile) == .kg)
    await source.set("a", Self.row("a", "lbs"))
    await book.refresh()
    #expect(WeightUnit(profile: book.profile) == .lbs)
  }
}
