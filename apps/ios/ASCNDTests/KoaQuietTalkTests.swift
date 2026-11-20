import ASCNDCore
import Foundation
import Testing

@testable import ASCND

/// Giảm chuyển động (#799): đồng hồ dựng hình của phòng dừng, nhưng Koa vẫn nói theo lịch.
/// Trước đây lời nói chỉ chạy trong `step` của đồng hồ dựng hình nên Koa im hẳn.
@MainActor
@Suite struct KoaQuietTalkTests {
  private static let user = "ascnd-test-quiet-talk"

  private func driver() -> KoaDirectorDriver {
    UserDefaults.standard.removeObject(forKey: "koa.talk.\(Self.user)")
    let d = KoaDirectorDriver()
    d.lineOf = { _ in "Koa says hi" }
    d.sync(KoaCompanion.Facts(day: "2026-11-03"), userId: Self.user)
    d.openTalk(greeting: true, userId: Self.user, day: "2026-11-03")
    return d
  }

  /// Lời nói đặt qua `Task` của MainActor: nhường lượt cho nó chạy.
  private func settle(_ d: KoaDirectorDriver, until done: (KoaDirectorDriver) -> Bool) async {
    for _ in 0..<50 where !done(d) { await Task.yield() }
  }

  @Test func koaSpeaksAndStopsWithoutTheRenderClock() async throws {
    let d = driver()
    let opened = Date()
    d.quietTick(opened)
    await settle(d) { $0.speech != nil }
    #expect(d.speech == nil, "chưa tới lượt nói đầu")

    d.quietTick(opened.addingTimeInterval(KoaTalk.Schedule.first + 0.5))
    await settle(d) { $0.speech != nil }
    let beat = try #require(d.speech, "tới lượt thì Koa nói, không cần đồng hồ dựng hình")

    d.quietTick(opened.addingTimeInterval(KoaTalk.Schedule.first + 0.5 + beat.seconds + 1))
    #expect(d.speech == nil, "hết câu thì bong bóng tắt")
  }

  @Test func noSpeechAtBedtime() async {
    let d = driver()
    d.context.bedtime = true
    d.quietTick(Date().addingTimeInterval(KoaTalk.Schedule.first + 0.5))
    await settle(d) { $0.speech != nil }
    #expect(d.speech == nil, "giờ ngủ thì Koa không nói, như khi đồng hồ chạy")
  }

  /// KOA-T50: chủ đề thiếu số liệu (câu `nil`) không bị ghi "đã nói" — Koa nói chủ đề khác, chủ đề kia
  /// còn nguyên cho lúc có số.
  @Test func missingNumbersDoNotBurnTheTopic() async throws {
    let d = driver()
    var refused: KoaTalk.Topic?
    d.lineOf = { beat in
      if refused == nil { refused = beat.topic }
      return beat.topic == refused ? nil : "Koa says hi"
    }
    d.quietTick(Date().addingTimeInterval(KoaTalk.Schedule.first + 0.5))
    await settle(d) { $0.speech != nil }
    let beat = try #require(d.speech, "vẫn nói, bằng chủ đề khác")
    #expect(beat.topic != refused)
    let saved = UserDefaults.standard.data(forKey: "koa.talk.\(Self.user)")
      .flatMap { try? JSONDecoder().decode(KoaTalk.Log.self, from: $0) }
    #expect(saved?.said.contains(where: { $0 == refused }) == false, "chủ đề thiếu số không bị đốt")
  }
}
