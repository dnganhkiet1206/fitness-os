@testable import ASCNDCore
import Foundation
import Testing

/// Chia sẻ buổi tập = CHÍNH RN @ fac9ac2 — `Fixtures/community-share-golden.json`
/// (`gen-community-share.mjs`: `community-art.ts` biên dịch + `payloadFromSession`
/// chép nguyên văn).
struct CommunityShareGoldenTests {
  static func golden() throws -> JSONValue {
    let url = try #require(
      Bundle.module.url(forResource: "community-share-golden", withExtension: "json", subdirectory: "Fixtures"))
    return try JSONDecoder().decode(JSONValue.self, from: Data(contentsOf: url))
  }

  static func array(_ v: JSONValue?) -> [JSONValue] { CommunityUserGoldenTests.array(v) }
  static func strings(_ v: JSONValue?) -> [String] { array(v).compactMap { $0.stringValue } }

  @Test func artPickIsRNs() throws {
    let cases = Self.array(try Self.golden()["art"])
    #expect(cases.count == 160)
    for c in cases {
      let library = Self.array(c["library"]).compactMap(CommunityArtLibrary.item)
      let kind = c["kind"]?.stringValue ?? ""
      let got = CommunityArtLibrary.pick(library, kind: kind, tags: Self.strings(c["tags"]), style: c["style"]?.stringValue)
      #expect(got.map { "\($0.id)|\($0.path)" } == c["pick"]?.stringValue, "\(c)")
      #expect(CommunityArtLibrary.styles(library, kind: kind) == Self.strings(c["styles"]), "\(c)")
    }
  }

  @Test func workoutTagsAreRNs() throws {
    let g = try Self.golden()
    let cases = Self.array(g["tags"])
    #expect(cases.count == 120)
    for c in cases {
      #expect(CommunityArtLibrary.workoutTags(Self.strings(c["names"])) == Self.strings(c["out"]), "\(c)")
    }
    // Phong cách có tên dịch sẵn nằm ở xcstrings; ở đây là khoá lạ.
    for c in Self.array(g["labels"]) {
      let style = c["style"]?.stringValue ?? ""
      guard !CommunityArtLibrary.knownStyles.contains(style) else { continue }
      #expect(CommunityArtLibrary.styleLabel(style) == c["out"]?.stringValue, "\(c)")
    }
  }

  @Test func payloadIsRNs() throws {
    let cases = Self.array(try Self.golden()["payload"])
    #expect(cases.count == 160)
    for c in cases {
      let minutes = c["minutes"]?.doubleValue.map { Int($0) }
      let got = CommunityShare.workoutPayload(c["session"] ?? .null, minutes: minutes)
      #expect(got == c["out"], "\(c)")
    }
  }
}

@MainActor
struct CommunityShareWorkoutBookTests {
  final class Remote: CommunityShareRemote, @unchecked Sendable {
    var profile: JSONValue? = .object(["user_id": .string("me"), "handle": .string("me"), "display_name": .string("Me")])
    var settings: JSONValue?
    var failure: CommunityShareFailure?
    var shares: [(String, CommunityShare.Visibility, Int?, String?)] = []

    func myProfile(me: String) async throws -> JSONValue? { profile }
    func privacySettings(me: String) async throws -> JSONValue? { settings }
    func artLibrary() async throws -> [JSONValue] {
      [
        .object([
          "id": .string("a1"), "kind": .string("workout"), "style": .string("mono"), "tags": .array([.string("legs")]),
          "path": .string("a1.webp"), "active": .bool(true), "sort": .number(1),
        ]),
        .object([
          "id": .string("a2"), "kind": .string("workout"), "style": .string("neon"), "tags": .array([]),
          "path": .string("a2.webp"), "active": .bool(true), "sort": .number(0),
        ]),
      ]
    }
    func sharedSessionIds(me: String) async throws -> [String] { ["s1"] }
    func shareWorkout(
      sessionId: String, caption: String, visibility: CommunityShare.Visibility, minutes: Int?, artId: String?
    ) async throws {
      if let failure { throw failure }
      shares.append((sessionId, visibility, minutes, artId))
    }
    func artURL(path: String) -> URL? { nil }
  }

  struct History: HistorySource {
    func sessions(userId: String, since: EpochMillis) async throws -> [JSONValue] {
      [
        .object(["id": .string("s1"), "date_time": .string("2026-10-08T07:00:00Z"), "sets": .array([])]),
        .object([
          "id": .string("s2"), "date_time": .string("2026-10-10T07:00:00Z"), "template_name": .string("Leg day"),
          "volume_load": .number(1000),
          "sets": .array([
            .object(["exerciseName": .string("Back Squat"), "weight": .number(100), "reps": .number(5)])
          ]),
        ]),
      ]
    }
  }

  @Test func picksPreviewsAndPostsWithTheDefaultAudience() async {
    let r = Remote()
    r.settings = .object(["default_visibility": .string("followers")])
    let b = CommunityShareWorkoutBook(userId: "me", remote: r, history: History())
    await b.load()
    #expect(b.phase == .ready)
    #expect(b.sessions.compactMap { $0["id"]?.stringValue } == ["s2", "s1"])  // mới trước
    #expect(b.shared == ["s1"])
    #expect(b.preview == nil)
    b.picked = "s2"
    #expect(b.visibility == .followers)
    #expect(b.art?.id == "a1")  // ảnh chân cho buổi squat
    #expect(b.preview?.workout.exercises.first?.exerciseName == "Back Squat")
    #expect(b.preview?.author?.handle == "me")
    b.stylePick = "neon"
    #expect(b.art?.id == "a2")
    b.visibilityPick = .public
    #expect(await b.post() == .posted)
    #expect(r.shares.first?.0 == "s2")
    #expect(r.shares.first?.1 == .public)
    #expect(r.shares.first?.3 == "a2")
    #expect(b.shared.contains("s2"))
  }

  @Test func noProfileAndNamedFailures() async {
    let r = Remote()
    r.profile = nil
    let b = CommunityShareWorkoutBook(userId: "me", picked: "s2", remote: r, history: History())
    await b.load()
    #expect(b.phase == .noProfile)
    r.failure = .alreadyShared
    #expect(await b.post() == .failed(.alreadyShared))
  }
}
