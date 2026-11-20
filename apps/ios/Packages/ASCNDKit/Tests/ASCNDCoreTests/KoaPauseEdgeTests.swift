@testable import ASCNDCore
import Testing

/// KOA-T54 (6): Tạm nghỉ — đợt tương lai chưa "đang nghỉ", đợt dài đọc từ server giữ nguyên độ dài, hàng lỗi bị loại.
struct KoaPauseEdgeTests {
  static let today = LocalDate("2026-11-20")!

  @Test func futureSpellIsNotActiveYet() {
    let p = KoaPause(start: Self.today.adding(days: 2), last: Self.today.adding(days: 5))
    #expect(!p.active(on: Self.today))
    #expect(p.active(on: Self.today.adding(days: 2)))
    #expect(!p.active(on: Self.today.adding(days: 6)))
  }

  @Test func storedLongSpellKeepsItsLength() throws {
    let row: JSONValue = .object(["starts_on": .string("2026-11-01"), "ends_on": .string("2026-11-20")])
    let p = try #require(KoaPauseSync.decode(row))
    #expect(p.last == LocalDate("2026-11-20")!, "20 ngày, không kẹp về 14")
    let log = KoaPauseLogSync.decode([row], today: Self.today)
    #expect(log.contains(LocalDate("2026-11-18")!))
    // Đợt người dùng tạo mới vẫn có trần.
    #expect(KoaPause(from: Self.today, days: 30).last == Self.today.adding(days: KoaPause.maxDays - 1))
  }

  @Test func endBeforeStartIsRejectedByBothDecoders() {
    let bad: JSONValue = .object(["starts_on": .string("2026-11-10"), "ends_on": .string("2026-11-09")])
    #expect(KoaPauseSync.decode(bad) == nil)
    #expect(KoaPauseLogSync.decode([bad], today: Self.today).spells.isEmpty)
  }
}
