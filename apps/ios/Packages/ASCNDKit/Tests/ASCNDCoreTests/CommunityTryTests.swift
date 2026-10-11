@testable import ASCNDCore
import Foundation
import Testing

/// "Thử workout" (#527 lát 15) — `tryIt` của `workout-post-card.tsx` @ fac9ac2
/// trên lõi chép `TemplateCopy` của A (#430).
@MainActor
struct CommunityTryBookTests {
  final class Remote: CommunityTryRemote, @unchecked Sendable {
    var calls: [String] = []
    var fail = false
    func recordTry(postId: String, userId: String) async throws {
      calls.append("\(userId):\(postId)")
      if fail { throw CommunityModerationFailure.nothingWritten }
    }
  }

  static func post(_ id: String, mine: Bool = false, lines: [JSONValue]) -> CommunityFeed.Post? {
    let row: JSONValue = .object([
      "id": .string(id), "kind": .string("workout"), "author_id": .string(mine ? "me" : "u2"),
      "caption": .string(""), "created_at": .string("2026-10-01T10:00:00Z"),
      "payload": .object(["title": .string("Push A"), "exercises": .array(lines), "exerciseCount": .number(Double(lines.count))]),
    ])
    return CommunityFeed.hydrate([row], me: "me", authors: [], liked: [], saved: [], arts: []).first
  }

  static func line(_ id: String?, library: Bool, sets: Double = 3, reps: Double = 8) -> JSONValue {
    var o: [String: JSONValue] = [
      "exerciseName": .string(id ?? "Mine"), "library": .bool(library), "sets": .number(sets), "reps": .number(reps),
      "weight": .number(80),
    ]
    if let id { o["exerciseId"] = .string(id) }
    return .object(o)
  }

  @Test func copiesStructureThenRecordsAndKeepsOneIdPerPost() async throws {
    let r = Remote()
    var ids = 0
    let b = CommunityTryBook(userId: "me", remote: r) {
      ids += 1
      return "tpl-\(ids)"
    }
    let p = try #require(Self.post("p1", lines: [Self.line("ex-bench", library: true), Self.line(nil, library: false)]))
    #expect(CommunityTry.offered(p))
    var copies: [String] = []
    let copy: CommunityTryBook.Copy = { id, title, lines, fallback in
      copies.append(id)
      return TemplateCopy.fromShared(title: title, lines: lines, fallbackName: fallback).skipped
    }
    #expect(await b.tryWorkout(p, fallbackName: "Buổi tập", copy: copy) == .tried(skipped: 1))
    #expect(await b.tryWorkout(p, fallbackName: "Buổi tập", copy: copy) == .tried(skipped: 1))
    #expect(copies == ["tpl-1", "tpl-1"], "bấm lại: cùng một id → lõi chép idempotent")
    #expect(r.calls == ["me:p1", "me:p1"])
  }

  @Test func onlyCustomExercisesWritesNothing() async throws {
    let r = Remote()
    let b = CommunityTryBook(userId: "me", remote: r) { "tpl" }
    let p = try #require(Self.post("p2", lines: [Self.line(nil, library: false), Self.line("x", library: false)]))
    var copied = false
    let out = await b.tryWorkout(p, fallbackName: "x") { _, _, _, _ in
      copied = true
      return 0
    }
    #expect(out == .nothingToCopy)
    #expect(!copied && r.calls.isEmpty)
  }

  @Test func refusedCopyRecordsNoTryAndAFailedRecordStillTried() async throws {
    let r = Remote()
    let b = CommunityTryBook(userId: "me", remote: r) { "tpl" }
    let p = try #require(Self.post("p3", lines: [Self.line("ex-row", library: true)]))
    let refused = await b.tryWorkout(p, fallbackName: "x") { _, _, _, _ in throw PlanEditor.Refusal.noExercises }
    #expect(refused == .refused)
    #expect(r.calls.isEmpty, "không có template thì không báo tác giả")
    r.fail = true
    let tried = await b.tryWorkout(p, fallbackName: "x") { _, _, _, _ in 0 }
    #expect(tried == .tried(skipped: 0), "lượt thử ghi hỏng không biến template đã lưu thành thất bại")
  }

  @Test func ownPostsHaveNoTry() throws {
    let p = try #require(Self.post("p4", mine: true, lines: [Self.line("ex", library: true)]))
    #expect(!CommunityTry.offered(p))
  }

  @Test func payloadNumbersBecomeLines() {
    let w = CommunityPayloads.workout(.object(["exercises": .array([Self.line("ex", library: true, sets: 0, reps: 12.9)])]))
    #expect(CommunityTry.lines(w) == [SharedWorkoutLine(exerciseId: "ex", exerciseName: "ex", library: true, sets: 0, reps: 12)])
  }
}
