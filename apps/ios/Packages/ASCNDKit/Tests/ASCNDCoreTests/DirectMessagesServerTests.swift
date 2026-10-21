import ASCNDCore
import Foundation
import Testing

struct DirectMessagesServerTests {
  @Test func inboxRowsJoinProfilesAndDropOrphans() {
    let inbox: [JSONValue] = [
      .object([
        "thread_id": .string("t1"), "other_id": .string("u2"), "last_text": .string("Chào"),
        "last_at": .string("2026-10-20T10:00:00Z"), "last_from_me": .bool(false), "unread": .bool(true),
        "is_request": .bool(true),
      ]),
      .object(["thread_id": .string("t2"), "other_id": .string("gone"), "last_text": .string("x")]),
    ]
    let profiles: [JSONValue] = [
      .object(["user_id": .string("u2"), "handle": .string("minh"), "display_name": .string("Minh Anh")])
    ]
    let t = DirectMessages.threads(inbox: inbox, profiles: profiles)
    #expect(t.count == 1)
    #expect(t[0].other.displayName == "Minh Anh")
    #expect(t[0].unread && t[0].isRequest && !t[0].lastFromMe)
    #expect(t[0].lastAt == EpochMillis(iso8601: "2026-10-20T10:00:00Z"))
  }

  @Test func textAndWorkoutMessagesParse() throws {
    let text = try #require(DirectMessages.message(.object([
      "id": .string("m1"), "sender_id": .string("u1"), "body": .string("Hi"),
      "created_at": .string("2026-10-20T10:00:00Z"), "read_at": .null, "workout": .null,
    ])))
    #expect(text.body == .text("Hi"))
    #expect(text.readAt == nil)
    let w = DirectMessages.SharedWorkout(title: "Chest day", volumeKg: 5200, exerciseCount: 5, minutes: 48, pr: true)
    let back = try #require(DirectMessages.message(.object([
      "id": .string("m2"), "sender_id": .string("u1"), "body": .string(""),
      "created_at": .string("2026-10-20T10:05:00Z"), "read_at": .string("2026-10-20T10:06:00Z"),
      "workout": DirectMessages.workoutJSON(w),
    ])))
    #expect(back.body == .workout(w))
    #expect(back.readAt != nil)
  }

  @Test func rowsWithoutIdOrTimeAreSkipped() {
    #expect(DirectMessages.message(.object(["id": .string("m"), "sender_id": .string("u")])) == nil)
  }
}
