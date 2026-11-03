import ASCNDCore
import Foundation
import Testing

@testable import ASCND

/// Đăng xuất quên Koa trong bộ nhớ của người vừa rời đi (audit 03/11): lịch sử Gains, đồ đang
/// mặc, vóc dáng, giờ buổi gần nhất không gắn người, nên người đăng nhập sau từng thấy Nhịp 30
/// ngày / Hành trình của người trước cho tới khi Hôm nay đọc xong lượt của họ.
@MainActor
@Suite struct KoaSessionResetTests {
  @Test func signOutForgetsThePreviousPersonsKoa() {
    let s = AppServices()
    s.koaGainsHistory = .init(
      days: [KoaGains.Day(date: LocalDate("2026-11-02")!, personalRecord: true)],
      week: KoaGains.Week(planned: [0, 2, 4], rest: [5, 6]))
    s.koaEquipped = ["hat_cap"]
    s.koaBuild = 3
    s.koaLastSessionAt = EpochMillis(1_793_721_600_000)

    s.forgetKoaSession()

    #expect(s.koaGainsHistory == nil, "Hành trình / Nhịp của người trước không còn")
    #expect(s.koaEquipped.isEmpty)
    #expect(s.koaBuild == 0)
    #expect(s.koaLastSessionAt == nil)
  }
}
