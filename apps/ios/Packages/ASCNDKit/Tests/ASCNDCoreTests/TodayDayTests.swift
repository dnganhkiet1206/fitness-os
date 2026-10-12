@testable import ASCNDCore
import Testing

/// Khối "ngày" của tab Hôm nay (#527): ống và việc kế tiếp đọc từ cùng tín hiệu.
struct TodayDayTests {
  /// Tài khoản mới: năm ống rỗng, đúng thứ tự thiết kế.
  @Test func emptyDay() {
    let t = TodayDay.tubes(DailySignals(), stepsGoal: 10_000)
    #expect(t.map(\.quest) == [.sleep, .meal, .water, .workout, .steps])
    #expect(t.allSatisfy { $0.fill == 0 && !$0.done })
    #expect(TodayDay.tubes(nil, stepsGoal: 10_000).allSatisfy { $0.fill == 0 })
  }

  /// Ngủ xong (7h40), 0,8 / 2,5 L nước, 4.120 bước: ống ngủ đầy, nước 32 %, bước 41 %.
  @Test func partialFills() {
    let s = DailySignals(sleepMinutes: 460, steps: 4120, hasSleepRow: true, waterMl: 800, waterTargetMl: 2500)
    let t = TodayDay.tubes(s, stepsGoal: 10_000)
    #expect(t[0].fill == 1 && t[0].done && t[0].amount == 460)
    #expect(t[1].fill == 0)
    #expect(abs(t[2].fill - 0.32) < 1e-9 && !t[2].done && t[2].amount == 800)
    #expect(t[3].fill == 0)
    #expect(abs(t[4].fill - 0.412) < 1e-9)
  }

  /// Vượt mục tiêu thì ống đầy, không tràn; mục tiêu nước trống → 2.500.
  @Test func cappedAndDefaultTarget() {
    let s = DailySignals(steps: 25_000, waterMl: 3000)
    let t = TodayDay.tubes(s, stepsGoal: 10_000)
    #expect(t[2].fill == 1 && t[2].done)
    #expect(t[4].fill == 1 && t[4].done)
    #expect(TodayDay.waterTarget(s) == 2500)
  }

  /// Ngày cho Koa dùng luật "xong" của nhiệm vụ: có hàng ngủ mà 0 phút vẫn là đã ngủ;
  /// bữa = có kcal.
  @Test func mascotDayFollowsQuestRules() {
    let s = DailySignals(kcal: 640, workoutCount: 0, sleepMinutes: 0, hasSleepRow: true, waterMl: 1250, waterTargetMl: 2500)
    let d = TodayDay.mascotDay(s, hour: 12)
    #expect(d.sleepMin == 1)
    #expect(d.meals == 1)
    #expect(d.waterPct == 50)
    #expect(d.workouts == 0)
    #expect(d.hour == 12)
    #expect(TodayDay.mascotDay(nil, hour: 9).sleepMin == nil)
    #expect(MascotLine.line(TodayDay.mascotDay(nil, hour: 9)) == .silent)
  }

  /// 12:00, đã ngủ, chưa ăn: Koa ghi nhận giấc ngủ rồi hỏi bữa — ống "Next" là bữa.
  @Test func nextIsMealAtNoon() {
    let s = DailySignals(sleepMinutes: 460, hasSleepRow: true)
    let line = MascotLine.line(TodayDay.mascotDay(s, hour: 12))
    #expect(line == .notice(win: .sleep, gap: .meal))
    #expect(line.gap.map(TodayDay.quest) == .meal)
  }

  @Test func coinsPerSignal() {
    #expect(TodayDay.order.map(TodayDay.coins) == [15, 10, 15, 25, 10])
  }

  /// Lần uống còn trong outbox: ống nước và việc "xong" đọc tổng cục bộ; số
  /// server lớn hơn (máy khác vừa ghi) thì giữ số server; chưa có ngày → nil.
  @Test func localWaterCountsBeforeSync() {
    let server = DailySignals(waterMl: 500)
    let merged = TodayDay.merging(server, localWaterMl: 2_750)
    #expect(merged?.waterMl == 2_750)
    #expect(TodayDay.tubes(merged, stepsGoal: 10_000).first { $0.quest == .water }?.done == true)
    #expect(TodayDay.merging(server, localWaterMl: 250)?.waterMl == 500)
    #expect(TodayDay.merging(server, localWaterMl: nil)?.waterMl == 500)
    #expect(TodayDay.merging(nil, localWaterMl: 250) == nil)
  }
}
