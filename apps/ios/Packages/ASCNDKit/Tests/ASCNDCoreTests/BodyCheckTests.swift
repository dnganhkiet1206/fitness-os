@testable import ASCNDCore
import Foundation
import Testing

/// Đo cơ thể bằng AI trong Ảnh tiến trình (Kiệt duyệt 04/11).
struct BodyCheckTests {
  static func row(_ photo: String, _ date: String, _ pct: Double) -> JSONValue {
    .object([
      "photo_id": .string(photo), "date": .string(date), "body_fat_pct": .string(String(pct)),
      "body_fat_low": .number(pct - 2), "body_fat_high": .number(pct + 2), "confidence": .string("medium"),
      "note": .string("Chụp cùng chỗ, cùng ánh sáng để so sánh."),
    ])
  }

  @Test func readsRowsAndLabelsAsEstimates() throws {
    let r = try #require(BodyCheck.result(Self.row("ABC", "2026-11-01", 18.4)))
    #expect(r.photoId == "abc" && r.pct == 18.4 && r.confidence == .medium)
    #expect(BodyCheck.label(r) == "~18%" && BodyCheck.range(r) == "16–20%")
    #expect(BodyCheck.result(.object(["photo_id": .string("x")])) == nil)
  }

  @Test func trendNeedsTwoDaysAndAveragesADay() throws {
    let a = try #require(BodyCheck.result(Self.row("a", "2026-10-01", 22)))
    #expect(BodyCheck.trend([a]) == nil)
    let b = try #require(BodyCheck.result(Self.row("b", "2026-11-01", 19)))
    let c = try #require(BodyCheck.result(Self.row("c", "2026-11-01", 20)))
    let t = try #require(BodyCheck.trend([b, a, c]))
    #expect(t.points.count == 2 && t.points.last?.pct == 19.5)
    #expect(t.change == -2.5)
  }
}
