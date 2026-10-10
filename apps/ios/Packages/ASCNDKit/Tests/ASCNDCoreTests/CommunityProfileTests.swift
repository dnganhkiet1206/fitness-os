@testable import ASCNDCore
import Foundation
import Testing

/// Form hồ sơ cộng đồng = `HANDLE` / `canSave` của `community-profile.tsx` và
/// hàng ghi của `useSaveCommunityProfile` @ fac9ac2 —
/// `Fixtures/community-profile-golden.json`.
struct CommunityProfileGoldenTests {
  static func root() throws -> JSONValue {
    let url = try #require(
      Bundle.module.url(forResource: "community-profile-golden", withExtension: "json", subdirectory: "Fixtures"))
    return try JSONDecoder().decode(JSONValue.self, from: Data(contentsOf: url))
  }

  static func array(_ v: JSONValue?) -> [JSONValue] {
    if case .array(let a)? = v { return a }
    return []
  }

  @Test func handleRuleIsRNs() throws {
    let root = try Self.root()
    #expect(root["pattern"]?.stringValue == "/^[a-z0-9_.]{3,24}$/")
    let cases = Self.array(root["handle"])
    #expect(cases.count == 32)
    for c in cases {
      let raw = c["raw"]?.stringValue ?? ""
      let h = CommunityProfileForm.normalized(raw)
      #expect(h == c["h"]?.stringValue, "\(c)")
      #expect(CommunityProfileForm.isValid(h) == (c["valid"] == .bool(true)), "\(c)")
      #expect(CommunityProfileForm.isBad(raw) == (c["bad"] == .bool(true)), "\(c)")
    }
  }

  @Test func canSaveIsRNs() throws {
    let cases = Self.array(try Self.root()["save"])
    #expect(cases.count == 27)
    for c in cases {
      let ok = CommunityProfileForm.canSave(handle: c["handle"]?.stringValue ?? "", name: c["name"]?.stringValue ?? "")
      #expect(ok == (c["canSave"] == .bool(true)), "\(c)")
    }
  }

  @Test func savedRowIsRNs() throws {
    let cases = Self.array(try Self.root()["rows"])
    #expect(cases.count == 16)
    for c in cases {
      let row = CommunityProfileForm.row(
        userId: "u", handle: c["handle"]?.stringValue ?? "", name: c["name"]?.stringValue ?? "",
        bio: c["bio"]?.stringValue ?? "", mascotId: "koa")
      let want = c["row"]
      #expect(row["handle"] == want?["handle"], "\(c)")
      #expect(row["display_name"] == want?["display_name"], "\(c)")
      #expect(row["bio"] == want?["bio"], "\(c)")
      #expect(row["user_id"] == .string("u"))
      #expect(row["mascot_id"] == .string("koa"))
    }
  }

  @Test func clampCountsUTF16LikeMaxLength() {
    #expect(CommunityProfileForm.clamp("abcdef", max: 4) == "abcd")
    #expect(CommunityProfileForm.clamp("ab😀c", max: 3) == "ab")  // không cắt đôi cặp surrogate
    #expect(CommunityProfileForm.clamp("ab😀c", max: 4) == "ab😀")
    #expect(CommunityProfileForm.clamp("Kiệt", max: 40) == "Kiệt")
  }

  /// Giai đoạn test (Kiệt, #527 6093754296): mọi linh vật mở, kể cả trả phí.
  /// Lật thành `false` trước release là một thay đổi có chủ đích — sửa cả test
  /// này (checklist `docs/APPLE_DEVELOPER_PROGRAM.md`).
  @Test func testModeIsOnUntilRelease() {
    #expect(CommunityMascots.testUnlockAll)
    let open = CommunityMascots.all.filter { CommunityMascots.isUnlocked($0, stats: .zero) }.map(\.id)
    #expect(open == ["koa", "blaze", "swift", "titan", "drago", "nova"])
  }

  /// Luật phát hành (cờ tắt) vẫn đúng `isUnlocked` của RN.
  @Test func mascotUnlockRule() {
    let s = CommunityMascots.Stats(workouts: 10, meals: 24)
    let ids = CommunityMascots.all.filter { CommunityMascots.isUnlocked($0, stats: s, unlockAll: false) }.map(\.id)
    #expect(ids == ["koa", "blaze"])
    #expect(CommunityMascots.all.filter { CommunityMascots.isUnlocked($0, stats: .zero, unlockAll: true) }.count == 6)
    #expect(
      !CommunityMascots.isUnlocked(CommunityMascots.mascot("drago"), stats: .init(workouts: 999, meals: 999), unlockAll: false))
    #expect(CommunityMascots.mascot("lạ").id == "koa")
  }
}

@MainActor
struct CommunityProfileBookTests {
  final class Remote: CommunityProfileRemote, @unchecked Sendable {
    var rows: [String: JSONValue] = [:]
    var stats = CommunityMascots.Stats.zero
    var failRead = false
    var failStats = false
    var failure: CommunityProfileFailure?
    var saved: [JSONValue] = []

    func myProfile(me: String) async throws -> JSONValue? {
      if failRead { throw CommunityProfileFailure.offline }
      return rows[me]
    }
    func unlockStats(me: String) async throws -> CommunityMascots.Stats {
      if failStats { throw CommunityProfileFailure.offline }
      return stats
    }
    func saveProfile(_ row: JSONValue) async throws {
      if let failure { throw failure }
      let handle = row["handle"]
      if rows.contains(where: { $0.key != row["user_id"]?.stringValue && $0.value["handle"] == handle }) {
        throw CommunityProfileFailure.handleTaken
      }
      saved.append(row)
      rows[row["user_id"]?.stringValue ?? ""] = row
    }
  }

  @Test func newProfileStartsFromTheAppMascotWhenUnlocked() async {
    let r = Remote()
    r.stats = .init(workouts: 12, meals: 0)
    let b = CommunityProfileBook(userId: "me", remote: r, unlockAll: false)
    await b.load()
    #expect(b.phase == .ready)
    #expect(b.existing == nil)
    #expect(b.initialMascot(selected: "blaze") == "blaze")
    #expect(b.initialMascot(selected: "titan") == "koa")  // chưa mở khoá
    #expect(b.choices.map(\.id) == ["koa", "blaze"])
  }

  @Test func failedReadIsAnErrorNotANewProfile() async {
    let r = Remote()
    r.failRead = true
    let b = CommunityProfileBook(userId: "me", remote: r, unlockAll: false)
    await b.load()
    #expect(b.phase == .failed)
    r.failRead = false
    r.failStats = true  // đếm hỏng = 0 / 0, vẫn sẵn sàng
    r.rows["me"] = .object(["handle": .string("kiet"), "display_name": .string("Kiệt"), "mascot_id": .string("nova")])
    await b.load()
    #expect(b.phase == .ready)
    #expect(b.existing?.handle == "kiet")
    #expect(b.initialMascot(selected: "koa") == "nova")
    #expect(b.choices.map(\.id) == ["koa", "nova"])  // giữ mặt đang dùng dù đã khoá
  }

  /// Chế độ test mặc định: bộ chọn có đủ sáu linh vật dù chưa tập / ăn gì,
  /// và linh vật app đang chọn (kể cả trả phí) được điền sẵn.
  @Test func testModeOffersEveryMascot() async {
    let r = Remote()
    let b = CommunityProfileBook(userId: "me", remote: r)
    await b.load()
    #expect(b.choices.map(\.id) == ["koa", "blaze", "swift", "titan", "drago", "nova"])
    #expect(b.initialMascot(selected: "nova") == "nova")
  }

  @Test func saveNormalizesAndReportsATakenHandle() async {
    let r = Remote()
    r.rows["other"] = .object(["user_id": .string("other"), "handle": .string("kiet")])
    let b = CommunityProfileBook(userId: "me", remote: r)
    await b.load()
    #expect(await b.save(handle: " KIET ", name: "Kiệt", bio: "", mascotId: "koa") == .handleTaken)
    #expect(r.saved.isEmpty)
    #expect(await b.save(handle: " Kiet.Dev ", name: "  Kiệt ", bio: " hi ", mascotId: "koa") == .saved)
    #expect(r.saved.last?["handle"] == .string("kiet.dev"))
    #expect(r.saved.last?["display_name"] == .string("Kiệt"))
    #expect(r.saved.last?["bio"] == .string("hi"))
    #expect(b.existing?.handle == "kiet.dev")
  }

  @Test func invalidFormAndOfflineNeverClaimSaved() async {
    let r = Remote()
    let b = CommunityProfileBook(userId: "me", remote: r)
    await b.load()
    #expect(await b.save(handle: "ab", name: "Kiệt", bio: "", mascotId: nil) != .saved)
    #expect(await b.save(handle: "abc", name: "  ", bio: "", mascotId: nil) != .saved)
    r.failure = .offline
    #expect(await b.save(handle: "abc", name: "A", bio: "", mascotId: nil) == .failed(.offline))
    #expect(r.saved.isEmpty)
    #expect(b.existing == nil)
  }

  /// Đổi tài khoản: book cũ đóng, không ghi đè gì nữa.
  @Test func closedBookIgnoresLateReads() async {
    let r = Remote()
    let b = CommunityProfileBook(userId: "me", remote: r)
    b.close()
    await b.load()
    #expect(b.phase == .loading)
    r.rows["you"] = .object(["handle": .string("you1")])
    let other = CommunityProfileBook(userId: "you", remote: r)
    await other.load()
    #expect(other.existing?.handle == "you1")
  }
}
