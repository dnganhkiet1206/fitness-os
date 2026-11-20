import Testing

@testable import ASCNDCore

/// Bộ lọc đo lường (AUD-74): khoá lạ thì bỏ, giá trị lạ thì che — dựng từ các
/// chỗ gọi `Telemetry.capture` / `report*` ở tip, không tham chiếu RN.
@Suite struct TelemetryScrubberTests {
  /// Mọi thuộc tính các chỗ gọi hiện gửi đều qua nguyên vẹn: số đếm, cờ, mã
  /// enum, khoảng. Thêm một khoá mới thì thêm vào đây trước khi gửi.
  @Test func currentCallSitePropertiesPassThrough() {
    let props = [
      "quest": "workout", "source": "tell_koa", "key": "meal-usual", "logged": "1",
      "target": "tell_koa", "items": "3", "days": "7", "rank": "prime", "item": "meal",
      "sessions": "4_8", "place": "room", "days_since_first_open": "12",
      "delta": "40", "planned": "100", "pr": "1", "rank_up": "true", "tier_up": "false",
      "kind": "rankUp", "major": "true", "paused": "false", "days_used": "2", "days_left": "3",
      "duration": "30_120s", "pokes": "1_3", "walks": "4_plus",
    ]
    #expect(TelemetryScrubber.scrubbedProperties(props) == props)
  }

  /// Các dạng giá trị khác của cùng khoá: số đếm của "sessions", nơi tập,
  /// nguồn thưởng, khoá nhắc nhở.
  @Test func otherCurrentValueShapesPassThrough() {
    #expect(
      TelemetryScrubber.scrubbedProperties(["sessions": "3", "place": "gym"])
        == ["sessions": "3", "place": "gym"])
    #expect(
      TelemetryScrubber.scrubbedProperties(["quest": "streak"])
        == ["quest": "streak"])
    #expect(
      TelemetryScrubber.scrubbedProperties(["quest": "koa_week"])
        == ["quest": "koa_week"])
    #expect(
      TelemetryScrubber.scrubbedProperties(["key": "weighIn"])
        == ["key": "weighIn"])
    #expect(
      TelemetryScrubber.scrubbedProperties(["key": "unknown"])
        == ["key": "unknown"])
  }

  /// Khoá không có trong danh sách cho phép thì bỏ, kể cả khi giá trị trông
  /// vô hại — khoá lạ là đường rò rỉ của ngày mai.
  @Test func unknownKeysAreDropped() {
    let scrubbed = TelemetryScrubber.scrubbedProperties([
      "quest": "meal", "email": "k@x.com", "weight_kg": "82.5", "note": "mệt", "user_id": "u1",
    ])
    #expect(scrubbed == ["quest": "meal"])
  }

  /// Giá trị PII / chữ tự do dưới một khoá cho phép thì thành "redacted":
  /// email, URL có query, câu có khoảng trắng, đường dẫn.
  @Test func syntheticPIIValuesAreRedacted() {
    #expect(
      TelemetryScrubber.scrubbedProperties(["quest": "kiet@example.com"])
        == ["quest": "redacted"])
    #expect(
      TelemetryScrubber.scrubbedProperties(["source": "https://x.co/a?token=1"])
        == ["source": "redacted"])
    #expect(
      TelemetryScrubber.scrubbedProperties(["item": "buy milk tomorrow"])
        == ["item": "redacted"])
    #expect(
      TelemetryScrubber.scrubbedProperties(["key": "a/b"])
        == ["key": "redacted"])
  }

  /// Số đo sức khoẻ lọt vào khoá đếm thì bị chặn: "82.5" không phải số đếm.
  /// Số nguyên thì không phân biệt được với số đếm nên vẫn qua — đó là giới
  /// hạn đã biết của lọc theo dạng, khoá lạ vẫn là tuyến phòng thủ chính.
  @Test func healthValuesUnderCountKeysAreRedacted() {
    #expect(TelemetryScrubber.scrubbedProperties(["items": "82.5"]) == ["items": "redacted"])
    #expect(TelemetryScrubber.scrubbedProperties(["days": "82,5"]) == ["days": "redacted"])
    #expect(TelemetryScrubber.scrubbedProperties(["delta": "2500.5"]) == ["delta": "redacted"])
    #expect(TelemetryScrubber.scrubbedProperties(["pr": "72.5"]) == ["pr": "redacted"])
    #expect(TelemetryScrubber.scrubbedProperties(["items": "2500"]) == ["items": "2500"])
  }

  @Test func booleanKeysRejectNonBooleans() {
    #expect(TelemetryScrubber.scrubbedProperties(["major": "true"]) == ["major": "true"])
    #expect(TelemetryScrubber.scrubbedProperties(["major": "yes"]) == ["major": "redacted"])
    #expect(TelemetryScrubber.scrubbedProperties(["paused": "1"]) == ["paused": "redacted"])
  }

  /// Token: rỗng thì giữ (không mang gì), quá dài / toàn dấu / có khoảng
  /// trắng thì che.
  @Test func tokenEdges() {
    #expect(TelemetryScrubber.scrubbedProperties(["quest": ""]) == ["quest": ""])
    #expect(
      TelemetryScrubber.scrubbedProperties(["quest": String(repeating: "a", count: 65)])
        == ["quest": "redacted"])
    #expect(TelemetryScrubber.scrubbedProperties(["quest": "."]) == ["quest": "redacted"])
    #expect(TelemetryScrubber.scrubbedProperties(["quest": "-"]) == ["quest": "redacted"])
    #expect(TelemetryScrubber.scrubbedProperties(["quest": "under_10s"]) == ["quest": "under_10s"])
  }

  /// Tag Sentry: bốn khoá sync.* qua, khoá lạ bỏ, giá trị không đúng dạng
  /// token thì che. Mã server thật (SQLSTATE / PostgREST / "none") đều qua.
  @Test func sentryTagsAllowlist() {
    let tags = [
      "sync.kind": "weight_logs", "sync.reason": "refused", "sync.code": "PGRST116",
      "sync.stage": "persist", "user.email": "k@x.com",
    ]
    #expect(
      TelemetryScrubber.scrubbedTags(tags)
        == [
          "sync.kind": "weight_logs", "sync.reason": "refused", "sync.code": "PGRST116",
          "sync.stage": "persist",
        ])
    #expect(TelemetryScrubber.scrubbedTags(["sync.code": "23505"]) == ["sync.code": "23505"])
    #expect(TelemetryScrubber.scrubbedTags(["sync.code": "none"]) == ["sync.code": "none"])
    #expect(TelemetryScrubber.scrubbedTags(["sync.code": "CR001"]) == ["sync.code": "CR001"])
    #expect(TelemetryScrubber.scrubbedTags(["sync.code": "wrong-user"]) == ["sync.code": "wrong-user"])
    #expect(
      TelemetryScrubber.scrubbedTags(["sync.code": "oops failed badly"])
        == ["sync.code": "redacted"])
    #expect(TelemetryScrubber.scrubbedTags(nil) == nil)
  }

  /// Extra Sentry: chỉ "failed_days" dạng số nguyên qua.
  @Test func sentryExtraAllowlist() {
    #expect(TelemetryScrubber.scrubbedExtra(["failed_days": 3])?["failed_days"] as? Int == 3)
    let scrubbed = TelemetryScrubber.scrubbedExtra(["failed_days": "3", "payload": "x"])
    #expect(scrubbed?.isEmpty == true)
    #expect(TelemetryScrubber.scrubbedExtra(nil) == nil)
  }

  /// Người dùng chỉ gắn bằng mã tài khoản (UUID): email hay chuỗi lạ đều
  /// không phải mã tài khoản.
  @Test func accountIdIsUUIDOnly() {
    #expect(TelemetryScrubber.isAccountId("123E4567-E89B-12D3-A456-426614174000"))
    #expect(!TelemetryScrubber.isAccountId("kiet@example.com"))
    #expect(!TelemetryScrubber.isAccountId("user-123"))
    #expect(!TelemetryScrubber.isAccountId(""))
  }

  /// Chữ tự do: che email, bỏ query/fragment của URL, giữ nguyên phần còn
  /// lại. Chuỗi cố định ở tip không đổi.
  @Test func freeTextRedactsEmailsAndURLQueries() {
    #expect(
      TelemetryScrubber.scrubbedText("lỗi của kiet@example.com xem https://x.co/a?token=1#frag nhé")
        == "lỗi của [email] xem https://x.co/a nhé")
    #expect(TelemetryScrubber.scrubbedText("sync.dead") == "sync.dead")
    #expect(TelemetryScrubber.scrubbedText("xem https://x.co/a nhé") == "xem https://x.co/a nhé")
    #expect(TelemetryScrubber.scrubbedText("gặp a@b lúc 3h") == "gặp a@b lúc 3h")
    #expect(TelemetryScrubber.scrubbedText("sao? https://x.co/p?q=1") == "sao? https://x.co/p")
  }

  /// URL breadcrumb: chỉ giữ scheme + host + path.
  @Test func scrubbedURLStripsQueryAndFragment() {
    #expect(
      TelemetryScrubber.scrubbedURL("https://x.co/a?token=1#frag") == "https://x.co/a")
    #expect(TelemetryScrubber.scrubbedURL("https://x.co/a") == "https://x.co/a")
    #expect(TelemetryScrubber.scrubbedURL("not a url") == "not a url")
  }

  /// Dữ liệu breadcrumb: giữ mọi khoá, lọc giá trị chuỗi, số / cờ giữ nguyên.
  @Test func breadcrumbDataKeepsShapeButScrubsStrings() {
    let scrubbed = TelemetryScrubber.scrubbedBreadcrumbData([
      "url": "https://x.co/a?token=1", "method": "POST", "status_code": 500,
      "note": "gửi tới k@x.com",
    ])
    #expect(scrubbed["url"] as? String == "https://x.co/a")
    #expect(scrubbed["method"] as? String == "POST")
    #expect(scrubbed["status_code"] as? Int == 500)
    #expect(scrubbed["note"] as? String == "gửi tới [email]")
  }
}
