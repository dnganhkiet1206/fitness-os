@testable import ASCNDCore
import Foundation
import Testing

/// Chia sẻ tiến trình = CHÍNH RN @ fac9ac2 —
/// `Fixtures/community-share-progress-golden.json`
/// (`gen-community-share-progress.mjs`: `lifts` của màn, chép nguyên văn).
struct CommunityShareProgressGoldenTests {
  @Test func liftChoicesAreRNs() throws {
    let url = try #require(
      Bundle.module.url(forResource: "community-share-progress-golden", withExtension: "json", subdirectory: "Fixtures"))
    let g = try JSONDecoder().decode(JSONValue.self, from: Data(contentsOf: url))
    let cases = CommunityUserGoldenTests.array(g["cases"])
    #expect(cases.count == 150)
    for c in cases {
      let got = CommunityShareProgress.lifts(CommunityUserGoldenTests.array(c["sessions"]))
      let want = CommunityUserGoldenTests.array(c["out"])
      #expect(got.map { $0.id } == want.compactMap { $0["id"]?.stringValue }, "\(c)")
      #expect(got.map { $0.name } == want.compactMap { $0["name"]?.stringValue }, "\(c)")
      #expect(got.map { Double($0.count) } == want.compactMap { $0["n"]?.doubleValue }, "\(c)")
    }
  }
}

@MainActor
struct CommunityShareProgressBookTests {
  struct Boom: Error {}

  final class Remote: CommunityShareProgressRemote, @unchecked Sendable {
    var previews: [CommunityShareProgress.Options] = []
    var shares: [(CommunityShareProgress.Options, CommunityShare.Visibility, String?)] = []
    var refuse = false

    func myProfile(me: String) async throws -> JSONValue? {
      .object(["user_id": .string("me"), "handle": .string("me"), "display_name": .string("Me")])
    }
    func privacySettings(me: String) async throws -> JSONValue? { nil }
    func artLibrary() async throws -> [JSONValue] { [] }
    func progressPreview(_ o: CommunityShareProgress.Options) async throws -> JSONValue {
      previews.append(o)
      if refuse { throw Boom() }
      return .object(["weeks": .number(Double(o.weeks)), "weight": .object(["start": .number(80), "end": .number(76)])])
    }
    func shareProgress(
      _ o: CommunityShareProgress.Options, caption: String, visibility: CommunityShare.Visibility, artId: String?
    ) async throws {
      shares.append((o, visibility, artId))
    }
    func artURL(path: String) -> URL? { nil }
  }

  struct History: HistorySource {
    func sessions(userId: String, since: EpochMillis) async throws -> [JSONValue] { [] }
  }

  @Test func previewIsTheServersAndPostingNeedsIt() async {
    let r = Remote()
    let b = CommunityShareProgressBook(userId: "me", remote: r, history: History())
    await b.load()
    #expect(b.options.weeks == 12 && b.options.weight && !b.options.waist && b.options.liftId == nil)
    await b.refreshPreview()
    #expect(b.previewPhase == .ready)
    #expect(b.preview?.kind == .progress)
    await b.refreshPreview()
    #expect(r.previews.count == 1)  // cùng lựa chọn: không hỏi lại
    b.options.weeks = 4
    r.refuse = true
    await b.refreshPreview()
    #expect(b.previewPhase == .nothing)
    #expect(b.preview == nil)
    #expect(await b.post() == .ignored)  // không có thẻ thì không đăng
    r.refuse = false
    b.options.weeks = 8
    await b.refreshPreview()
    #expect(await b.post() == .posted)
    #expect(r.shares.first?.0.weeks == 8)
    #expect(r.shares.first?.1 == .public)
  }
}
